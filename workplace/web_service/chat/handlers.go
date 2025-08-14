// web_service/chat/handlers.go

package chat

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

type ChatHandler struct {
	DB *gorm.DB
}

type AIChatResponse struct {
	Title           string      `json:"title"`
	TextExplanation string      `json:"text_explanation"`
	Response        string      `json:"response"`
	Visualizations  interface{} `json:"visualizations,omitempty"`
	Error           string      `json:"error,omitempty"`
}

// MessageForAI 结构体用于将我们的ChatMessage转换为AI服务所需的格式
type MessageForAI struct {
	Role    string `json:"role"`
	Content string `json:"content"`
}

func (h *ChatHandler) SendMessageHandler(c *gin.Context) {
	// --- 1. 解析通用表单数据 ---
	userIDRaw, _ := c.Get("userID")
	userID := uint(userIDRaw.(float64))
	isFirstMessage, _ := strconv.ParseBool(c.PostForm("is_first_message"))
	prompt := c.PostForm("prompt")
	sessionIDStr := c.PostForm("chat_session_id")

	var session ChatSession
	var historyForAI []MessageForAI
	tx := h.DB.Begin()

	defer func() {
		if r := recover(); r != nil {
			tx.Rollback()
			log.Printf("Recovered from panic in SendMessageHandler: %v", r)
			c.JSON(http.StatusInternalServerError, gin.H{"error": "An internal server error occurred"})
		}
	}()

	// --- 2. 数据库操作 & 构建历史记录 ---
	if isFirstMessage {
		// 仅在创建全新会话时执行
		session = ChatSession{UserID: userID, Title: "新会话...", CreatedAt: time.Now()}
		if err := tx.Create(&session).Error; err != nil {
			tx.Rollback()
			c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to create session"})
			return
		}
	} else {
		// **↓↓↓ 核心修正逻辑 ↓↓↓**
		// 对于任何非首次消息（包括答疑会话的第一条用户提问）
		// 我们必须从数据库加载完整的历史记录
		sessionID, err := strconv.Atoi(sessionIDStr)
		if err != nil {
			tx.Rollback()
			c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid session ID"})
			return
		}

		// Preload("Messages") 会加载该会话下的所有消息
		if err := tx.Preload("Messages", func(db *gorm.DB) *gorm.DB {
			return db.Order("chat_messages.created_at ASC") // 确保历史记录顺序正确
		}).First(&session, sessionID).Error; err != nil {
			tx.Rollback()
			c.JSON(http.StatusNotFound, gin.H{"error": "Session not found"})
			return
		}

		// 将从数据库加载的消息转换为AI服务需要的格式
		for _, msg := range session.Messages {
			historyForAI = append(historyForAI, MessageForAI{Role: msg.Sender, Content: msg.Content})
		}
	}

	// --- 3. 准备并发送请求到AI服务 ---
	historyJSON, err := json.Marshal(historyForAI)
	if err != nil {
		tx.Rollback()
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to serialize history"})
		return
	}

	targetURL := "http://localhost:8000/api/v1/chat"
	body := &bytes.Buffer{}
	writer := multipart.NewWriter(body)
	_ = writer.WriteField("prompt", prompt)
	_ = writer.WriteField("is_first_message", c.PostForm("is_first_message"))
	_ = writer.WriteField("history", string(historyJSON)) // 发送完整的历史记录

	// ... (文件处理部分保持不变)
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
		tx.Rollback()
		c.JSON(http.StatusServiceUnavailable, gin.H{"error": "AI service is unreachable"})
		return
	}
	defer resp.Body.Close()

	responseBody, _ := io.ReadAll(resp.Body)
	var aiResp AIChatResponse
	if err := json.Unmarshal(responseBody, &aiResp); err != nil {
		tx.Rollback()
		log.Printf("Failed to decode AI response. Raw body: %s", string(responseBody))
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to decode AI response"})
		return
	}

	// --- 4. 存储新消息 ---
	aiMessageContent := aiResp.TextExplanation
	if aiMessageContent == "" {
		aiMessageContent = aiResp.Response
	}

	userMessage := ChatMessage{ChatSessionID: session.ID, Sender: "user", Content: prompt, CreatedAt: time.Now()}
	aiMessage := ChatMessage{ChatSessionID: session.ID, Sender: "ai", Content: aiMessageContent, CreatedAt: time.Now()}

	if err := tx.Create(&[]ChatMessage{userMessage, aiMessage}).Error; err != nil {
		tx.Rollback()
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to save messages"})
		return
	}

	// 更新会话标题（如果需要）
	if isFirstMessage && aiResp.Title != "" {
		session.Title = aiResp.Title
		if err := tx.Save(&session).Error; err != nil {
			tx.Rollback()
			c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to update session title"})
			return
		}
	}

	tx.Commit()

	// --- 5. 返回最新会话数据给前端 ---
	h.DB.Preload("Messages").First(&session, session.ID)
	c.JSON(http.StatusOK, gin.H{"session": session, "ai_response": aiResp})
}

// GetSessionsHandler 和 GetMessagesHandler 保持不变
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
