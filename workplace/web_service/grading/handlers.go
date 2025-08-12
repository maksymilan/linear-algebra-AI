// web_service/grading/handlers.go

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
	"workplace/web_service/chat" // 导入chat模型

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

// GradeHomeworkHandler 现在只负责调用AI获取批改结果，并将其返回给前端
func (h *GradingHandler) GradeHomeworkHandler(c *gin.Context) {
	problemText := c.PostForm("problemText")
	solutionText := c.PostForm("solutionText")

	if solutionText == "" || problemText == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Problem and solution text are required"})
		return
	}

	// 调用AI服务进行批改
	targetURL := "http://localhost:8000/api/v1/grade"
	body := &bytes.Buffer{}
	writer := multipart.NewWriter(body)
	_ = writer.WriteField("problem_text", problemText)
	_ = writer.WriteField("solution_text", solutionText)
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
	// 我们需要先读取响应体，然后再重新封装一个io.ReadCloser给JSON解码器
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

	// 将所有需要的信息直接返回给前端，用于开启后续的答疑会话
	c.JSON(http.StatusOK, gin.H{
		"problemText":  problemText,
		"solutionText": solutionText,
		"correction":   aiResp.Correction,
	})
}

// StartFollowUpChatHandler 创建一个与特定作业批改相关联的聊天会话
func (h *GradingHandler) StartFollowUpChatHandler(c *gin.Context) {
	userIDRaw, _ := c.Get("userID")
	userID := uint(userIDRaw.(float64))

	problemText := c.PostForm("problemText")
	solutionText := c.PostForm("solutionText")
	correction := c.PostForm("correction")

	// 1. 调用AI服务获取带上下文的系统Prompt
	targetURL := "http://localhost:8000/api/v1/start_grading_chat"
	body := &bytes.Buffer{}
	writer := multipart.NewWriter(body)
	_ = writer.WriteField("problem_text", problemText)
	_ = writer.WriteField("solution_text", solutionText)
	_ = writer.WriteField("correction_text", correction)
	writer.Close()

	proxyReq, _ := http.NewRequest("POST", targetURL, body)
	proxyReq.Header.Set("Content-Type", writer.FormDataContentType())
	client := &http.Client{}
	resp, err := client.Do(proxyReq)
	if err != nil {
		c.JSON(http.StatusServiceUnavailable, gin.H{"error": "AI service is unreachable"})
		return
	}
	defer resp.Body.Close()

	var aiContextResp struct {
		SystemPrompt string `json:"system_prompt"`
	}
	if err := json.NewDecoder(resp.Body).Decode(&aiContextResp); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to decode AI context response"})
		return
	}

	// 2. 在数据库中创建一个新的聊天会话
	newChatSession := chat.ChatSession{
		UserID:    userID,
		Title:     "作业批改后答疑", // 也可以基于题目生成一个更具体的标题
		CreatedAt: time.Now(),
	}
	if err := h.DB.Create(&newChatSession).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to create chat session"})
		return
	}

	// 3. 将带有作业上下文的Prompt作为第一条系统消息存入数据库
	systemMessage := chat.ChatMessage{
		ChatSessionID: newChatSession.ID,
		Sender:        "system", // 特殊的发送者
		Content:       aiContextResp.SystemPrompt,
		CreatedAt:     time.Now(),
	}
	if err := h.DB.Create(&systemMessage).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to save system message"})
		return
	}

	// 4. 返回新创建的聊天会话ID给前端
	c.JSON(http.StatusOK, gin.H{"chatSessionId": newChatSession.ID})
}

// GetHistoryHandler 获取当前用户的批改历史 (此功能在新流程中可以被弱化或移除)
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
