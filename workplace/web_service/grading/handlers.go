package grading

import (
	"bytes"
	"encoding/json"
	"fmt"
	"io"
	"log"
	"mime/multipart"
	"net/http"
	"net/textproto"
	"strconv"
	"time"

	"github.com/gin-gonic/gin"
	"gorm.io/gorm"
)

type GradingHandler struct {
	DB *gorm.DB
}

type AIGradeResponse struct {
	Correction string `json:"correction"`
	Error      string `json:"error,omitempty"`
}

// GradeHomeworkHandler 处理作业上传和批改
func (h *GradingHandler) GradeHomeworkHandler(c *gin.Context) {
	problemText := c.PostForm("problemText")
	solutionText := c.PostForm("solutionText")
	solutionFilename := c.PostForm("solutionFilename")

	if solutionText == "" || problemText == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Problem and solution text are required"})
		return
	}

	targetURL := "http://localhost:8000/api/v1/grade"
	body := &bytes.Buffer{}
	writer := multipart.NewWriter(body)

	writer.WriteField("problem_text", problemText)
	writer.WriteField("solution_text", solutionText)
	writer.Close()

	proxyReq, _ := http.NewRequest("POST", targetURL, body)
	proxyReq.Header.Set("Content-Type", writer.FormDataContentType())

	client := &http.Client{Timeout: time.Second * 180}
	resp, err := client.Do(proxyReq)
	if err != nil {
		c.JSON(http.StatusServiceUnavailable, gin.H{"error": "AI service is unreachable"})
		return
	}
	defer resp.Body.Close()

	var aiResp AIGradeResponse
	responseBody, _ := io.ReadAll(resp.Body)
	log.Printf("AI Service Response: %s", string(responseBody))
	resp.Body = io.NopCloser(bytes.NewBuffer(responseBody))

	if err := json.NewDecoder(resp.Body).Decode(&aiResp); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to decode AI response"})
		return
	}
	if aiResp.Error != "" {
		c.JSON(http.StatusInternalServerError, gin.H{"error": aiResp.Error})
		return
	}

	userIDRaw, _ := c.Get("userID")

	// --- 核心修正点：安全的类型转换 ---
	userIDFloat, ok := userIDRaw.(float64)
	if !ok {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Invalid user ID type in token"})
		return
	}
	userID := uint(userIDFloat)
	// --- 修正结束 ---

	newResult := GradeResult{
		UserID:     userID, // 使用转换后的userID
		Filename:   solutionFilename,
		Problem:    problemText,
		Content:    solutionText,
		Correction: aiResp.Correction,
	}

	if result := h.DB.Create(&newResult); result.Error != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to save grading result"})
		return
	}

	c.JSON(http.StatusOK, newResult)
}

// GetHistoryHandler 获取当前用户的批改历史
func (h *GradingHandler) GetHistoryHandler(c *gin.Context) {
	userIDRaw, _ := c.Get("userID")
	userIDFloat, ok := userIDRaw.(float64)
	if !ok {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Invalid user ID type in token"})
		return
	}
	userID := uint(userIDFloat)

	var results []GradeResult
	if err := h.DB.Where("user_id = ?", userID).Order("created_at desc").Find(&results).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to retrieve history"})
		return
	}
	c.JSON(http.StatusOK, results)
}

// DeleteResultHandler 删除一条批改记录
func (h *GradingHandler) DeleteResultHandler(c *gin.Context) {
	userIDRaw, _ := c.Get("userID")
	userIDFloat, ok := userIDRaw.(float64)
	if !ok {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Invalid user ID type in token"})
		return
	}
	userID := uint(userIDFloat)

	resultID, err := strconv.Atoi(c.Param("id"))
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid result ID"})
		return
	}

	result := h.DB.Where("id = ? AND user_id = ?", resultID, userID).Delete(&GradeResult{})
	if result.Error != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to delete result"})
		return
	}
	if result.RowsAffected == 0 {
		c.JSON(http.StatusNotFound, gin.H{"error": "Result not found or you don't have permission to delete it"})
		return
	}

	c.JSON(http.StatusOK, gin.H{"message": "Result deleted successfully"})
}

// OcrHandler 用于识别内容的处理器
func (h *GradingHandler) OcrHandler(c *gin.Context) {
	file, err := c.FormFile("file")
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "No file for OCR"})
		return
	}

	targetURL := "http://localhost:8000/api/v1/ocr"
	body := &bytes.Buffer{}
	writer := multipart.NewWriter(body)

	originalContentType := file.Header.Get("Content-Type")
	header := make(textproto.MIMEHeader)
	header.Set("Content-Disposition", fmt.Sprintf(`form-data; name="file"; filename="%s"`, file.Filename))
	if originalContentType != "" {
		header.Set("Content-Type", originalContentType)
	}
	part, err := writer.CreatePart(header)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to create form file for OCR"})
		return
	}

	src, err := file.Open()
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to open OCR file"})
		return
	}
	defer src.Close()
	_, err = io.Copy(part, src)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to copy OCR file content"})
		return
	}
	writer.Close()

	proxyReq, _ := http.NewRequest("POST", targetURL, body)
	proxyReq.Header.Set("Content-Type", writer.FormDataContentType())

	client := &http.Client{Timeout: time.Second * 60}
	resp, err := client.Do(proxyReq)
	if err != nil {
		c.JSON(http.StatusServiceUnavailable, gin.H{"error": "AI service is unreachable"})
		return
	}
	defer resp.Body.Close()

	responseBody, _ := io.ReadAll(resp.Body)
	c.Data(resp.StatusCode, "application/json", responseBody)
}
