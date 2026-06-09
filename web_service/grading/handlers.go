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
	"os"
	"path/filepath"
	"strconv"
	"strings"
	"time"
	"workplace/web_service/accesscontrol"
	"workplace/web_service/aiclient"
	"workplace/web_service/assignment"
	"workplace/web_service/auth"
	"workplace/web_service/chat"

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

func extractAssignmentFileText(path string, name string) (string, error) {
	src, err := os.Open(path)
	if err != nil {
		return "", err
	}
	defer src.Close()

	body := &bytes.Buffer{}
	writer := multipart.NewWriter(body)
	part, err := writer.CreateFormFile("file", filepath.Base(name))
	if err != nil {
		return "", err
	}
	if _, err := io.Copy(part, src); err != nil {
		return "", err
	}
	writer.Close()

	req, err := http.NewRequest("POST", aiclient.URL("/api/v1/ocr"), body)
	if err != nil {
		return "", err
	}
	req.Header.Set("Content-Type", writer.FormDataContentType())
	client := &http.Client{Timeout: 180 * time.Second}
	resp, err := client.Do(req)
	if err != nil {
		return "", err
	}
	defer resp.Body.Close()
	responseBody, _ := io.ReadAll(resp.Body)
	if resp.StatusCode >= http.StatusBadRequest {
		return "", fmt.Errorf("题目附件识别失败: %s", string(responseBody))
	}
	var result struct {
		Text string `json:"text"`
	}
	if err := json.Unmarshal(responseBody, &result); err != nil {
		return "", err
	}
	return strings.TrimSpace(result.Text), nil
}

func (h *GradingHandler) resolveAssignmentProblem(c *gin.Context, assignmentID uint) (string, error) {
	user, ok, err := accesscontrol.CurrentUser(h.DB, c)
	if err != nil || !ok || user.Role != "student" {
		return "", fmt.Errorf("只有学生可以使用已有作业进行自主批改")
	}

	var item assignment.Assignment
	if err := h.DB.First(&item, assignmentID).Error; err != nil {
		return "", fmt.Errorf("作业不存在")
	}
	allowed := false
	if user.ClassID != nil {
		if item.ClassID != nil {
			allowed = *item.ClassID == *user.ClassID
		} else {
			var cls auth.Class
			if err := h.DB.First(&cls, *user.ClassID).Error; err == nil {
				allowed = cls.TeacherID == item.TeacherID
			}
		}
	}
	if !allowed {
		return "", fmt.Errorf("无权使用该作业")
	}

	parts := []string{}
	if strings.TrimSpace(item.ProblemText) != "" {
		parts = append(parts, item.ProblemText)
	}

	var exercises []struct {
		ExerciseNumber string
		Stem           string
	}
	h.DB.Table("assignment_exercises ae").
		Select("e.exercise_number, e.stem").
		Joins("JOIN textbook_exercises e ON e.id = ae.exercise_id").
		Where("ae.assignment_id = ?", item.ID).
		Order("ae.position asc, ae.id asc").
		Scan(&exercises)
	for i, exercise := range exercises {
		label := strings.TrimSpace(exercise.ExerciseNumber)
		if label == "" {
			label = fmt.Sprintf("题目 %d", i+1)
		}
		parts = append(parts, fmt.Sprintf("### %s\n%s", label, exercise.Stem))
	}

	if item.ProblemFilePath != "" {
		fileText, fileErr := extractAssignmentFileText(item.ProblemFilePath, item.ProblemFileName)
		if fileErr != nil && len(parts) == 0 {
			return "", fileErr
		}
		if fileText != "" {
			parts = append(parts, "### 教师附件题目\n"+fileText)
		}
	}

	problemText := strings.TrimSpace(strings.Join(parts, "\n\n"))
	if problemText == "" {
		return "", fmt.Errorf("该作业没有可用于批改的题目内容")
	}
	return problemText, nil
}

// GradeHomeworkHandler 调用 AI 获取批改结果；可选 assignmentId 使用老师发布的题目作为可信来源。
func (h *GradingHandler) GradeHomeworkHandler(c *gin.Context) {
	problemText := c.PostForm("problemText")
	solutionText := c.PostForm("solutionText")
	assignmentIDRaw := strings.TrimSpace(c.PostForm("assignmentId"))
	var assignmentID uint
	if assignmentIDRaw != "" {
		parsedID, err := strconv.Atoi(assignmentIDRaw)
		if err != nil || parsedID <= 0 {
			c.JSON(http.StatusBadRequest, gin.H{"error": "作业 ID 不合法"})
			return
		}
		assignmentID = uint(parsedID)
		resolvedProblem, err := h.resolveAssignmentProblem(c, assignmentID)
		if err != nil {
			c.JSON(http.StatusForbidden, gin.H{"error": err.Error()})
			return
		}
		problemText = resolvedProblem
	}

	if solutionText == "" || problemText == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Problem and solution text are required"})
		return
	}

	// 调用AI服务进行批改
	targetURL := aiclient.URL("/api/v1/grade")
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

	responseBody, _ := io.ReadAll(resp.Body)
	log.Printf("AI Service Response: %s", string(responseBody))
	if resp.StatusCode >= http.StatusBadRequest {
		c.JSON(resp.StatusCode, gin.H{"error": string(responseBody)})
		return
	}

	var aiResp AIGradeResponse
	if err := json.Unmarshal(responseBody, &aiResp); err != nil {
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
		"assignmentId": assignmentID,
	})
}

// StartFollowUpChatHandler (已重构)
// 接收作业上下文和用户的第一条问题，创建会话，保存所有消息，然后返回会话ID
func (h *GradingHandler) StartFollowUpChatHandler(c *gin.Context) {
	userIDRaw, _ := c.Get("userID")
	userID := uint(userIDRaw.(float64))

	var req struct {
		ProblemText    string `form:"problemText"`
		SolutionText   string `form:"solutionText"`
		CorrectionText string `form:"correctionText"`
		NewQuestion    string `form:"newQuestion"`
	}

	if err := c.ShouldBind(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid request data: " + err.Error()})
		return
	}

	tx := h.DB.Begin()

	// 1. 创建新的聊天会话
	newSession := chat.ChatSession{
		UserID:    userID,
		Title:     "作业批改答疑",
		CreatedAt: time.Now(),
	}
	if err := tx.Create(&newSession).Error; err != nil {
		tx.Rollback()
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to create chat session"})
		return
	}

	// 2. 将完整的对话历史（包括批改上下文）发送给AI
	targetURL := aiclient.URL("/api/v1/grading/chat")
	aiBody := &bytes.Buffer{}
	writer := multipart.NewWriter(aiBody)
	_ = writer.WriteField("problem_text", req.ProblemText)
	_ = writer.WriteField("solution_text", req.SolutionText)
	_ = writer.WriteField("correction_text", req.CorrectionText)
	_ = writer.WriteField("new_question", req.NewQuestion)
	// 在这种模式下，我们不需要发送 chat_history，因为这是会话的开始
	_ = writer.WriteField("chat_history", "[]")
	writer.Close()

	proxyReq, _ := http.NewRequest("POST", targetURL, aiBody)
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
	var aiResp struct {
		Response string `json:"response"`
	}
	if err := json.Unmarshal(responseBody, &aiResp); err != nil {
		tx.Rollback()
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to decode AI response"})
		return
	}

	// 3. 将上下文、用户问题和AI回答作为消息存入数据库
	// 注意：为了保持对话的流畅性，我们将上下文合并为一条对用户不可见的 "system" 消息
	contextMessage := fmt.Sprintf("### 原始题目\n%s\n\n### 学生的解答\n%s\n\n### 你给出的批改意见\n%s", req.ProblemText, req.SolutionText, req.CorrectionText)

	messagesToSave := []chat.ChatMessage{
		{SessionID: newSession.ID, Role: "system", Content: contextMessage, CreatedAt: time.Now()},
		{SessionID: newSession.ID, Role: "user", Content: req.NewQuestion, CreatedAt: time.Now().Add(time.Second)},
		{SessionID: newSession.ID, Role: "ai", Content: aiResp.Response, CreatedAt: time.Now().Add(2 * time.Second)},
	}

	if err := tx.Create(&messagesToSave).Error; err != nil {
		tx.Rollback()
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to save messages"})
		return
	}

	tx.Commit()

	// 4. 返回新会话的ID，前端将用此ID跳转
	c.JSON(http.StatusOK, gin.H{"chatSessionId": newSession.ID})
}

// OcrHandler 保持不变
func (h *GradingHandler) OcrHandler(c *gin.Context) {
	file, err := c.FormFile("file")
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "No file for OCR"})
		return
	}

	targetURL := aiclient.URL("/api/v1/ocr")
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
	// 透传是否用视觉模型识别 PDF（扫描件/手写选 true，默认走 PyMuPDF 文字层）
	_ = writer.WriteField("use_vision", c.PostForm("use_vision"))
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
