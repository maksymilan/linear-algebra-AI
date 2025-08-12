// web_service/chat/handlers.go

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
	Title           string      `json:"title"`
	TextExplanation string      `json:"text_explanation"`
	Response        string      `json:"response"`
	Visualizations  interface{} `json:"visualizations,omitempty"`
	Error           string      `json:"error,omitempty"`
}

// SendMessageHandler 处理发送新消息
func (h *ChatHandler) SendMessageHandler(c *gin.Context) {
	userIDRaw, _ := c.Get("userID")
	userID := uint(userIDRaw.(float64))
	isFirstMessage, _ := strconv.ParseBool(c.PostForm("is_first_message"))
	prompt := c.PostForm("prompt")

	// 1. 转发请求给AI服务
	targetURL := "http://localhost:8000/api/v1/chat"
	body := &bytes.Buffer{}
	writer := multipart.NewWriter(body)
	_ = writer.WriteField("prompt", prompt)
	_ = writer.WriteField("is_first_message", c.PostForm("is_first_message"))

	form, err := c.MultipartForm()
	if err == nil {
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

	// 2. 数据库操作
	var session ChatSession
	tx := h.DB.Begin()
	defer func() {
		if r := recover(); r != nil {
			tx.Rollback()
		}
	}()

	if isFirstMessage {
		title := aiResp.Title
		if title == "" {
			title = "新的聊天"
		}
		session = ChatSession{UserID: userID, Title: title, CreatedAt: time.Now()}
		if err := tx.Create(&session).Error; err != nil {
			tx.Rollback()
			c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to create session"})
			return
		}
	} else {
		sessionID, _ := strconv.Atoi(c.PostForm("chat_session_id"))
		if err := tx.First(&session, sessionID).Error; err != nil {
			tx.Rollback()
			c.JSON(http.StatusNotFound, gin.H{"error": "Session not found"})
			return
		}
	}

	userMessage := ChatMessage{ChatSessionID: session.ID, Sender: "user", Content: prompt, CreatedAt: time.Now()}
	aiMessage := ChatMessage{ChatSessionID: session.ID, Sender: "ai", Content: aiMessageContent, CreatedAt: time.Now()}
	if err := tx.Create(&[]ChatMessage{userMessage, aiMessage}).Error; err != nil {
		tx.Rollback()
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to save messages"})
		return
	}
	tx.Commit()

	// 3. 返回最新会话数据
	h.DB.Preload("Messages").First(&session, session.ID)
	c.JSON(http.StatusOK, gin.H{"session": session, "ai_response": aiResp})
	fmt.Print(aiMessageContent)
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
	sessionIDStr := c.Param("id")
	sessionID, err := strconv.Atoi(sessionIDStr)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid session ID"})
		return
	}

	var messages []ChatMessage
	err = h.DB.Joins("JOIN chat_sessions ON chat_sessions.id = chat_messages.chat_session_id").
		Where("chat_sessions.user_id = ? AND chat_messages.chat_session_id = ?", userID, sessionID).
		Order("chat_messages.created_at asc").
		Find(&messages).Error

	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to retrieve messages"})
		return
	}
	c.JSON(http.StatusOK, messages)
}
