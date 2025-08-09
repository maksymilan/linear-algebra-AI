package grading

import (
	"bytes"
	"encoding/json"
	"io"
	"log"
	"mime/multipart"
	"net/http"
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
	// 1. 获取表单数据
	problemText := c.PostForm("problemText")
	solutionText := c.PostForm("solutionText")         // 获取solutionText
	solutionFilename := c.PostForm("solutionFilename") // 获取文件名

	if solutionText == "" || problemText == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Problem and solution text are required"})
		return
	}

	// 2. 将数据转发给AI服务
	targetURL := "http://localhost:8000/api/v1/grade"
	body := &bytes.Buffer{}
	writer := multipart.NewWriter(body)

	writer.WriteField("problem_text", problemText)
	writer.WriteField("solution_text", solutionText) // 修改：发送solution_text
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

	// 3. 解析AI服务的响应
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

	// 4. 将批改结果存入数据库
	userID, _ := c.Get("userID")
	newResult := GradeResult{
		UserID:     userID.(uint),
		Filename:   solutionFilename,
		Problem:    problemText,
		Content:    solutionText, // 保存确认后的解答文本
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
	userID, _ := c.Get("userID")
	var results []GradeResult
	if err := h.DB.Where("user_id = ?", userID).Order("created_at desc").Find(&results).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to retrieve history"})
		return
	}
	c.JSON(http.StatusOK, results)
}

// DeleteResultHandler 删除一条批改记录
func (h *GradingHandler) DeleteResultHandler(c *gin.Context) {
	userID, _ := c.Get("userID")
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
	part, err := writer.CreateFormFile("file", file.Filename)
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
