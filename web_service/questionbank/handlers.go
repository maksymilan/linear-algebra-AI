// web_service/questionbank/handlers.go
package questionbank

import (
	"bytes"
	"encoding/json"
	"io"
	"mime/multipart"
	"net/http"
	"strconv"
	"strings"
	"time"
	"workplace/web_service/accesscontrol"
	"workplace/web_service/aiclient"
	"workplace/web_service/chat"

	"github.com/gin-gonic/gin"
	"gorm.io/gorm"
)

type QuestionBankHandler struct {
	DB *gorm.DB
}

// SearchRequest 题库检索入参（透传给 ai_service）
type SearchRequest struct {
	Query        string   `json:"query"`
	QuestionType string   `json:"question_type,omitempty"`
	ExerciseType string   `json:"exercise_type,omitempty"`
	HasAnswer    *bool    `json:"has_answer,omitempty"`
	ConceptTags  []string `json:"concept_tags,omitempty"`
	TextbookIDs  []uint   `json:"textbook_ids,omitempty"`
	Chapter      string   `json:"chapter,omitempty"`
	Limit        int      `json:"limit,omitempty"`
	Offset       int      `json:"offset,omitempty"`
}

// Search 把题库混合检索请求转发给 ai_service，并原样回传结果。
func (h *QuestionBankHandler) Search(c *gin.Context) {
	var req SearchRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "请求体格式错误"})
		return
	}

	allowedIDs, restricted, _, err := accesscontrol.AllowedTextbookIDsForContext(h.DB, c)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "读取班级教材范围失败"})
		return
	}
	if restricted {
		req.TextbookIDs = allowedIDs
		if len(allowedIDs) == 0 {
			c.JSON(http.StatusOK, gin.H{
				"count":    0,
				"results":  []interface{}{},
				"total":    0,
				"limit":    req.Limit,
				"offset":   req.Offset,
				"has_more": false,
			})
			return
		}
	} else {
		req.TextbookIDs = nil
	}

	body, _ := json.Marshal(req)
	resp, err := http.Post(
		aiclient.URL("/api/v1/questions/search"),
		"application/json",
		bytes.NewReader(body),
	)
	if err != nil {
		c.JSON(http.StatusBadGateway, gin.H{"error": "AI 服务不可用: " + err.Error()})
		return
	}
	defer resp.Body.Close()

	data, _ := io.ReadAll(resp.Body)
	c.Data(resp.StatusCode, "application/json", data)
}

// Chapters 按教材章节返回题量统计（供老师分章浏览选题），同样按班级教材范围隔离。
func (h *QuestionBankHandler) Chapters(c *gin.Context) {
	allowedIDs, restricted, _, err := accesscontrol.AllowedTextbookIDsForContext(h.DB, c)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "读取班级教材范围失败"})
		return
	}
	payload := map[string]interface{}{}
	if restricted {
		if len(allowedIDs) == 0 {
			c.JSON(http.StatusOK, gin.H{"chapters": []interface{}{}, "total": 0, "uncategorized": 0})
			return
		}
		payload["textbook_ids"] = allowedIDs
	}

	body, _ := json.Marshal(payload)
	resp, err := http.Post(
		aiclient.URL("/api/v1/questions/chapters"),
		"application/json",
		bytes.NewReader(body),
	)
	if err != nil {
		c.JSON(http.StatusBadGateway, gin.H{"error": "AI 服务不可用: " + err.Error()})
		return
	}
	defer resp.Body.Close()

	data, _ := io.ReadAll(resp.Body)
	c.Data(resp.StatusCode, "application/json", data)
}

// SetAnswerRequest 老师录入题目答案/解析
type SetAnswerRequest struct {
	Answer   string `json:"answer"`
	Solution string `json:"solution"`
}

// SetAnswer 老师为题库题目录入/更新答案与解析（学生端据此查看，不做 AI 生成）。
func (h *QuestionBankHandler) SetAnswer(c *gin.Context) {
	if accesscontrol.CurrentRole(c) != "teacher" {
		c.JSON(http.StatusForbidden, gin.H{"error": "仅老师可录入答案"})
		return
	}
	id, err := strconv.Atoi(c.Param("id"))
	if err != nil || id <= 0 {
		c.JSON(http.StatusBadRequest, gin.H{"error": "无效的题目 ID"})
		return
	}
	var req SetAnswerRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "请求体格式错误"})
		return
	}
	answer := strings.TrimSpace(req.Answer)
	solution := strings.TrimSpace(req.Solution)
	hasAnswer := answer != "" || solution != ""
	res := h.DB.Exec(
		"UPDATE textbook_exercises SET answer = ?, solution = ?, has_answer = ? WHERE id = ?",
		answer, solution, hasAnswer, id,
	)
	if res.Error != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "保存答案失败"})
		return
	}
	if res.RowsAffected == 0 {
		c.JSON(http.StatusNotFound, gin.H{"error": "题目不存在"})
		return
	}
	c.JSON(http.StatusOK, gin.H{"message": "答案已保存", "has_answer": hasAnswer})
}

// exerciseBrief 取题目内容用于讲解 prompt
type exerciseBrief struct {
	Stem           string
	Answer         string
	Solution       string
	ExerciseNumber string
	TextbookName   string
}

// Explain 学生端：把题目作为上下文请 AI 讲解，落成一个新会话，返回 chatSessionId 供前端跳转。
func (h *QuestionBankHandler) Explain(c *gin.Context) {
	uid, ok := accesscontrol.CurrentUserID(c)
	if !ok {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "未登录"})
		return
	}
	id, err := strconv.Atoi(c.Param("id"))
	if err != nil || id <= 0 {
		c.JSON(http.StatusBadRequest, gin.H{"error": "无效的题目 ID"})
		return
	}

	allowedIDs, restricted, _, err := accesscontrol.AllowedTextbookIDsForContext(h.DB, c)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "读取班级教材范围失败"})
		return
	}
	q := h.DB.Table("textbook_exercises").
		Select("stem, answer, solution, exercise_number, textbook_name").
		Where("id = ?", id)
	if restricted {
		if len(allowedIDs) == 0 {
			c.JSON(http.StatusForbidden, gin.H{"error": "该题目不在当前班级资料范围内"})
			return
		}
		q = q.Where("textbook_id IN ?", allowedIDs)
	}
	var ex exerciseBrief
	if err := q.Limit(1).Scan(&ex).Error; err != nil || strings.TrimSpace(ex.Stem) == "" {
		c.JSON(http.StatusNotFound, gin.H{"error": "题目不存在或无权访问"})
		return
	}

	// 构造讲解 prompt（老师录入的答案/解析作为参考，但要求 AI 讲清思路）
	var sb strings.Builder
	sb.WriteString("请作为线性代数老师，详细讲解下面这道题目的解题思路、用到的知识点和完整步骤，并指出常见易错点。\n\n")
	if ex.ExerciseNumber != "" {
		sb.WriteString("题号：" + ex.ExerciseNumber + "\n")
	}
	sb.WriteString("题目：\n" + ex.Stem + "\n")
	if strings.TrimSpace(ex.Answer) != "" {
		sb.WriteString("\n参考答案：" + ex.Answer + "\n")
	}
	if strings.TrimSpace(ex.Solution) != "" {
		sb.WriteString("\n参考解析：" + ex.Solution + "\n")
	}

	// 调 ai_service /api/v1/chat（带 textbook_ids 让 RAG 可参考教材）
	reqBody := &bytes.Buffer{}
	writer := multipart.NewWriter(reqBody)
	_ = writer.WriteField("prompt", sb.String())
	_ = writer.WriteField("is_first_message", "true")
	_ = writer.WriteField("user_id", strconv.Itoa(int(uid)))
	if restricted {
		if idsJSON, marshalErr := json.Marshal(allowedIDs); marshalErr == nil {
			_ = writer.WriteField("textbook_ids", string(idsJSON))
		}
	}
	writer.Close()

	proxyReq, _ := http.NewRequest("POST", aiclient.URL("/api/v1/chat"), reqBody)
	proxyReq.Header.Set("Content-Type", writer.FormDataContentType())
	client := &http.Client{Timeout: 180 * time.Second}
	resp, err := client.Do(proxyReq)
	if err != nil {
		c.JSON(http.StatusBadGateway, gin.H{"error": "AI 服务不可用"})
		return
	}
	defer resp.Body.Close()
	respBody, _ := io.ReadAll(resp.Body)
	if resp.StatusCode >= http.StatusBadRequest {
		c.JSON(resp.StatusCode, gin.H{"error": "AI 讲解失败"})
		return
	}
	var aiResp chat.AIChatResponse
	if err := json.Unmarshal(respBody, &aiResp); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "解析 AI 响应失败"})
		return
	}
	explanation := aiResp.TextExplanation
	if explanation == "" {
		explanation = aiResp.Response
	}
	citationsJSON := ""
	if len(aiResp.Citations) > 0 {
		if b, marshalErr := json.Marshal(aiResp.Citations); marshalErr == nil {
			citationsJSON = string(b)
		}
	}

	// 落库：新会话 + 用户问题(题目) + AI 讲解
	title := "题目讲解"
	if ex.ExerciseNumber != "" {
		title = "讲解 · " + ex.ExerciseNumber
	}
	session := chat.ChatSession{UserID: uid, Title: title, CreatedAt: time.Now()}
	if err := h.DB.Create(&session).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "创建会话失败"})
		return
	}
	now := time.Now()
	msgs := []chat.ChatMessage{
		{SessionID: session.ID, Role: "user", Content: "请讲解这道题目：\n\n" + ex.Stem, CreatedAt: now},
		{SessionID: session.ID, Role: "ai", Content: explanation, Citations: citationsJSON, CreatedAt: now.Add(time.Millisecond)},
	}
	if err := h.DB.Create(&msgs).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "保存讲解失败"})
		return
	}
	c.JSON(http.StatusOK, gin.H{"chatSessionId": session.ID, "title": title})
}
