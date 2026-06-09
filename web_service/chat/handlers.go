// web_service/chat/handlers.go

package chat

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"log"
	"mime/multipart"
	"net/http"
	"net/textproto"
	"strconv"
	"strings"
	"time"
	"workplace/web_service/accesscontrol"

	"github.com/gin-gonic/gin"
	"gorm.io/gorm"
	"workplace/web_service/aiclient"
	"workplace/web_service/auth"
)

type ChatHandler struct {
	DB *gorm.DB
}

type AIChatResponse struct {
	Title           string            `json:"title"`
	TextExplanation string            `json:"text_explanation"`
	Response        string            `json:"response"`
	Visualizations  interface{}       `json:"visualizations,omitempty"`
	Citations       []json.RawMessage `json:"citations,omitempty"`
	Error           string            `json:"error,omitempty"`
}

func userIDFromContext(c *gin.Context) uint {
	userIDRaw, _ := c.Get("userID")
	switch v := userIDRaw.(type) {
	case float64:
		return uint(v)
	case uint:
		return v
	case int:
		return uint(v)
	default:
		return 0
	}
}

// MessageForAI 结构体用于将我们的ChatMessage转换为AI服务所需的格式
type MessageForAI struct {
	Role    string `json:"role"`
	Content string `json:"content"`
}

func trimRunes(s string, max int) string {
	runes := []rune(s)
	if len(runes) <= max {
		return s
	}
	return string(runes[:max])
}

func normalizeAITitle(title string) string {
	title = strings.Trim(title, " \t\r\n。！？!?，,：:；;、\"'`“”‘’（）()[]【】<>《》")
	if title == "" {
		return "未命名对话"
	}
	return trimRunes(title, 12)
}

func (h *ChatHandler) SendMessageHandler(c *gin.Context) {
	// --- 1. 解析通用表单数据 ---
	userID := userIDFromContext(c)
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
			// created_at 可能因同一轮 user/ai 几乎同时落库而相等，必须再用 id 兜底，保证顺序确定
			return db.Order("chat_messages.created_at ASC, chat_messages.id ASC")
		}).Where("user_id = ?", userID).First(&session, sessionID).Error; err != nil {
			tx.Rollback()
			c.JSON(http.StatusNotFound, gin.H{"error": "Session not found"})
			return
		}

		// 将从数据库加载的消息转换为AI服务需要的格式
		for _, msg := range session.Messages {
			historyForAI = append(historyForAI, MessageForAI{Role: msg.Role, Content: msg.Content})
		}
	}

	// --- 3. 获取班级进度并准备已学知识总结 ---
	var learnedSummaries string
	var currentWeek int
	var allowedTextbookIDs []uint
	var restrictTextbooks bool
	var user auth.User
	if err := h.DB.First(&user, userID).Error; err == nil && user.ClassID != nil {
		var class auth.Class
		if err := h.DB.First(&class, *user.ClassID).Error; err == nil {
			currentWeek = class.CurrentWeek
			var materials []auth.ClassWeeklyMaterial
			if err := h.DB.Where("class_id = ? AND week_num <= ?", class.ID, class.CurrentWeek).
				Order("week_num asc").Find(&materials).Error; err == nil && len(materials) > 0 {
				for _, mat := range materials {
					learnedSummaries += fmt.Sprintf("【第%d周】：\n%s\n\n", mat.WeekNum, mat.Summary)
				}
			}
		}
	}
	if ids, restricted, err := accesscontrol.AllowedTextbookIDsForUser(h.DB, user); err == nil {
		allowedTextbookIDs = ids
		restrictTextbooks = restricted
	} else {
		tx.Rollback()
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to load textbook access scope"})
		return
	}

	// --- 4. 准备并发送请求到AI服务 ---
	historyJSON, err := json.Marshal(historyForAI)
	if err != nil {
		tx.Rollback()
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to serialize history"})
		return
	}

	targetURL := aiclient.URL("/api/v1/chat")
	body := &bytes.Buffer{}
	writer := multipart.NewWriter(body)
	_ = writer.WriteField("prompt", prompt)
	_ = writer.WriteField("is_first_message", c.PostForm("is_first_message"))
	_ = writer.WriteField("history", string(historyJSON))            // 发送完整的历史记录
	_ = writer.WriteField("learned_summaries", learnedSummaries)     // 发送已学知识总结
	_ = writer.WriteField("current_week", strconv.Itoa(currentWeek)) // **新增：RAG 检索用的教学周约束**
	_ = writer.WriteField("user_id", strconv.Itoa(int(userID)))
	if restrictTextbooks {
		if textbookIDsJSON, err := json.Marshal(allowedTextbookIDs); err == nil {
			_ = writer.WriteField("textbook_ids", string(textbookIDsJSON))
		} else {
			_ = writer.WriteField("textbook_ids", "[]")
		}
	}
	if modelID := c.PostForm("model_id"); modelID != "" {
		_ = writer.WriteField("model_id", modelID)
	}

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

	proxyReq, _ := http.NewRequestWithContext(c.Request.Context(), "POST", targetURL, body)
	proxyReq.Header.Set("Content-Type", writer.FormDataContentType())
	client := &http.Client{Timeout: time.Second * 180}
	aiStartedAt := time.Now()
	resp, err := client.Do(proxyReq)
	if err != nil {
		tx.Rollback()
		if errors.Is(err, context.Canceled) || c.Request.Context().Err() != nil {
			return
		}
		c.JSON(http.StatusServiceUnavailable, gin.H{"error": "AI service is unreachable"})
		return
	}
	defer resp.Body.Close()

	responseBody, _ := io.ReadAll(resp.Body)
	responseDurationMs := time.Since(aiStartedAt).Milliseconds()
	if resp.StatusCode >= http.StatusBadRequest {
		tx.Rollback()
		var errResp struct {
			Detail interface{} `json:"detail"`
			Error  interface{} `json:"error"`
		}
		message := string(responseBody)
		if err := json.Unmarshal(responseBody, &errResp); err == nil {
			if errResp.Detail != nil {
				message = fmt.Sprint(errResp.Detail)
			} else if errResp.Error != nil {
				message = fmt.Sprint(errResp.Error)
			}
		}
		c.JSON(resp.StatusCode, gin.H{"error": message})
		return
	}

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

	// 将 citations（教材检索出处）序列化到 AI 消息里，方便前端在任何时候回显
	citationsJSON := ""
	if len(aiResp.Citations) > 0 {
		if b, err := json.Marshal(aiResp.Citations); err == nil {
			citationsJSON = string(b)
		}
	}

	userMessage := ChatMessage{SessionID: session.ID, Role: "user", Content: prompt, CreatedAt: time.Now()}
	aiMessage := ChatMessage{SessionID: session.ID, Role: "ai", Content: aiMessageContent, Citations: citationsJSON, ResponseDurationMs: &responseDurationMs, CreatedAt: time.Now()}

	if err := tx.Create(&[]ChatMessage{userMessage, aiMessage}).Error; err != nil {
		tx.Rollback()
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to save messages"})
		return
	}

	// 更新会话标题（如果需要）
	if isFirstMessage {
		session.Title = normalizeAITitle(aiResp.Title)
		aiResp.Title = session.Title
		if err := tx.Save(&session).Error; err != nil {
			tx.Rollback()
			c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to update session title"})
			return
		}
	}

	tx.Commit()

	// --- 5. 返回最新会话数据给前端 ---
	// 必须显式排序：未指定 order 时 Preload 走堆表顺序，多轮对话会错乱（user/ai 顺序乱跳）
	h.DB.Preload("Messages", func(db *gorm.DB) *gorm.DB {
		return db.Order("chat_messages.created_at ASC, chat_messages.id ASC")
	}).First(&session, session.ID)
	c.JSON(http.StatusOK, gin.H{"session": session, "ai_response": aiResp})
}

func (h *ChatHandler) GetModelOptionsHandler(c *gin.Context) {
	userID := userIDFromContext(c)
	targetURL := fmt.Sprintf("%s?user_id=%d", aiclient.URL("/api/v1/models"), userID)
	resp, err := http.Get(targetURL)
	if err != nil {
		c.JSON(http.StatusServiceUnavailable, gin.H{"error": "AI service is unreachable"})
		return
	}
	defer resp.Body.Close()

	responseBody, _ := io.ReadAll(resp.Body)
	c.Data(resp.StatusCode, resp.Header.Get("Content-Type"), responseBody)
}

// GetSessionsHandler 和 GetMessagesHandler 保持不变
func (h *ChatHandler) GetSessionsHandler(c *gin.Context) {
	userIDRaw, _ := c.Get("userID")
	// 注意类型断言，如果是从 JWT 解析来的数字通常是 float64
	var userID uint
	switch v := userIDRaw.(type) {
	case float64:
		userID = uint(v)
	case uint:
		userID = v
	case int:
		userID = uint(v)
	}

	var sessions []ChatSession
	if err := h.DB.Where("user_id = ?", userID).Order("created_at desc").Find(&sessions).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to retrieve chat sessions"})
		return
	}
	c.JSON(http.StatusOK, sessions)
}

func (h *ChatHandler) GetMessagesHandler(c *gin.Context) {
	userIDRaw, _ := c.Get("userID")
	var userID uint
	switch v := userIDRaw.(type) {
	case float64:
		userID = uint(v)
	case uint:
		userID = v
	case int:
		userID = uint(v)
	}

	sessionIDStr := c.Param("id")
	sessionID, err := strconv.Atoi(sessionIDStr)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid session ID"})
		return
	}

	var messages []ChatMessage
	err = h.DB.Joins("JOIN chat_sessions ON chat_sessions.id = chat_messages.session_id").
		Where("chat_sessions.user_id = ? AND chat_messages.session_id = ?", userID, sessionID).
		Order("chat_messages.created_at asc, chat_messages.id asc").
		Find(&messages).Error

	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to retrieve messages"})
		return
	}
	c.JSON(http.StatusOK, messages)
}

// FeedbackRequest 结构体
type FeedbackRequest struct {
	Score int `json:"score" binding:"required"` // 1 或 -1
}

// **新增: 记录用户反馈**
func (h *ChatHandler) SubmitFeedbackHandler(c *gin.Context) {
	userIDRaw, _ := c.Get("userID")
	var userID uint
	switch v := userIDRaw.(type) {
	case float64:
		userID = uint(v)
	case uint:
		userID = v
	case int:
		userID = uint(v)
	}

	messageIDStr := c.Param("id")
	messageID, err := strconv.Atoi(messageIDStr)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid message ID"})
		return
	}

	var req FeedbackRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid score"})
		return
	}

	if req.Score != 1 && req.Score != -1 {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Score must be 1 or -1"})
		return
	}

	// 鉴权：确认这个 message 属于当前登录用户
	var message ChatMessage
	if err := h.DB.First(&message, messageID).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "Message not found"})
		return
	}

	var session ChatSession
	if err := h.DB.First(&session, message.SessionID).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "Session not found"})
		return
	}
	if session.UserID != userID {
		c.JSON(http.StatusForbidden, gin.H{"error": "Access denied"})
		return
	}

	message.FeedbackScore = req.Score
	if err := h.DB.Save(&message).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to save feedback"})
		return
	}

	c.JSON(http.StatusOK, gin.H{"message": "Feedback submitted successfully"})
}
