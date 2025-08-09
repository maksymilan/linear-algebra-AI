package chat

import (
	"bytes"
	"encoding/json"
	"fmt"
	"io"
	"mime/multipart"
	"net/http"
	"net/textproto"
	"strconv"
	"time"

	"github.com/gin-gonic/gin"
	"gorm.io/gorm"
)

type ChatHandler struct {
	DB *gorm.DB
}

// AI服务的响应结构体
type AIChatResponse struct {
	Title           string      `json:"title,omitempty"`
	Response        string      `json:"response,omitempty"`
	TextExplanation string      `json:"text_explanation,omitempty"`
	Visualizations  interface{} `json:"visualizations,omitempty"`
	Error           string      `json:"error,omitempty"`
}

// SendMessageHandler 处理发送新消息
func (h *ChatHandler) SendMessageHandler(c *gin.Context) {
	userIDRaw, _ := c.Get("userID")
	userID := uint(userIDRaw.(float64))

	// 解析 multipart form
	form, err := c.MultipartForm()
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid form data"})
		return
	}

	promptValues := form.Value["prompt"]
	prompt := ""
	if len(promptValues) > 0 {
		prompt = promptValues[0]
	}

	isFirstMessage, _ := strconv.ParseBool(form.Value["is_first_message"][0])
	sessionIDStr := form.Value["chat_session_id"][0]

	// 1. 保存用户消息到数据库
	userMessage := ChatMessage{
		Sender:    "user",
		Content:   prompt,
		CreatedAt: time.Now(),
	}

	var session ChatSession
	var dbErr error

	if isFirstMessage {
		// 如果是第一条消息，创建一个新的会话
		session = ChatSession{
			UserID:    userID,
			Title:     "新的聊天", // 临时标题
			CreatedAt: time.Now(),
			Messages:  []ChatMessage{userMessage},
		}
		dbErr = h.DB.Create(&session).Error
	} else {
		// 否则，为现有会话添加消息
		sessionID, _ := strconv.Atoi(sessionIDStr)
		userMessage.ChatSessionID = uint(sessionID)
		dbErr = h.DB.Create(&userMessage).Error
	}

	if dbErr != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to save user message"})
		return
	}

	// 2. 转发请求给AI服务
	targetURL := "http://localhost:8000/api/v1/chat"
	body := &bytes.Buffer{}
	writer := multipart.NewWriter(body)

	writer.WriteField("prompt", prompt)
	writer.WriteField("is_first_message", strconv.FormatBool(isFirstMessage))

	files := form.File["files"]
	for _, fileHeader := range files {
		h := make(textproto.MIMEHeader)
		h.Set("Content-Disposition", fmt.Sprintf(`form-data; name="files"; filename="%s"`, fileHeader.Filename))
		h.Set("Content-Type", fileHeader.Header.Get("Content-Type"))
		part, _ := writer.CreatePart(h)
		file, _ := fileHeader.Open()
		io.Copy(part, file)
		file.Close()
	}
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

	responseBody, _ := io.ReadAll(resp.Body)
	var aiResp AIChatResponse
	if err := json.Unmarshal(responseBody, &aiResp); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to decode AI response"})
		return
	}

	aiMessageContent := aiResp.TextExplanation
	if aiMessageContent == "" {
		aiMessageContent = aiResp.Response
	}

	// 3. 保存AI消息到数据库
	aiMessage := ChatMessage{
		ChatSessionID: session.ID,
		Sender:        "ai",
		Content:       aiMessageContent,
		CreatedAt:     time.Now(),
	}
	h.DB.Create(&aiMessage)

	// 如果是第一条消息且AI返回了标题，更新会话标题
	if isFirstMessage && aiResp.Title != "" {
		h.DB.Model(&session).Update("title", aiResp.Title)
		session.Title = aiResp.Title // 更新内存中的session对象以便返回
	}

	// 4. 返回完整、最新的会话信息给前端
	c.JSON(http.StatusOK, gin.H{
		"session":     session,
		"ai_response": aiResp, // 包含可视化等信息的原始AI响应
	})
}

// GetSessionsHandler 获取用户的所有聊天会话 (不含消息)
func (h *ChatHandler) GetSessionsHandler(c *gin.Context) {
	userIDRaw, _ := c.Get("userID")
	userID := uint(userIDRaw.(float64))

	var sessions []ChatSession
	if err := h.DB.Where("user_id = ?", userID).Order("created_at desc").Find(&sessions).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to retrieve chat sessions"})
		return
	}
	c.JSON(http.StatusOK, sessions)
}

// GetMessagesHandler 获取单个会话的所有消息
func (h *ChatHandler) GetMessagesHandler(c *gin.Context) {
	userIDRaw, _ := c.Get("userID")
	userID := uint(userIDRaw.(float64))
	sessionID, _ := strconv.Atoi(c.Param("id"))

	var messages []ChatMessage
	// 验证用户权限并获取消息
	err := h.DB.Joins("JOIN chat_sessions ON chat_sessions.id = chat_messages.chat_session_id").
		Where("chat_sessions.user_id = ? AND chat_messages.chat_session_id = ?", userID, sessionID).
		Order("chat_messages.created_at asc").
		Find(&messages).Error

	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to retrieve messages"})
		return
	}
	c.JSON(http.StatusOK, messages)
}

// DeleteSessionHandler 删除一个会话及其所有消息
func (h *ChatHandler) DeleteSessionHandler(c *gin.Context) {
	userIDRaw, _ := c.Get("userID")
	userID := uint(userIDRaw.(float64))
	sessionID, _ := strconv.Atoi(c.Param("id"))

	// GORM的级联删除会自动删除关联的ChatMessage
	result := h.DB.Where("id = ? AND user_id = ?", sessionID, userID).Delete(&ChatSession{})
	if result.Error != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to delete session"})
		return
	}
	if result.RowsAffected == 0 {
		c.JSON(http.StatusNotFound, gin.H{"error": "Session not found or permission denied"})
		return
	}
	c.JSON(http.StatusOK, gin.H{"message": "Session deleted successfully"})
}
