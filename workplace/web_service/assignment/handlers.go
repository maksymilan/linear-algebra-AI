// web_service/assignment/handlers.go

package assignment

import (
	"bytes"
	"encoding/json"
	"mime/multipart"
	"net/http"
	"time"

	"workplace/web_service/auth" // 导入auth包以获取User模型

	"github.com/gin-gonic/gin"
	"gorm.io/gorm"
)

type AssignmentHandler struct {
	DB *gorm.DB
}

// CreateAssignmentHandler (老师) 创建新作业
func (h *AssignmentHandler) CreateAssignmentHandler(c *gin.Context) {
	var assignment Assignment
	if err := c.ShouldBindJSON(&assignment); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid input"})
		return
	}

	userIDRaw, _ := c.Get("userID")
	assignment.TeacherID = uint(userIDRaw.(float64))

	if err := h.DB.Create(&assignment).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to create assignment"})
		return
	}
	c.JSON(http.StatusOK, assignment)
}

// ListAssignmentsHandler (学生/老师) 获取所有作业列表
func (h *AssignmentHandler) ListAssignmentsHandler(c *gin.Context) {
	var assignments []Assignment
	if err := h.DB.Order("created_at desc").Find(&assignments).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to retrieve assignments"})
		return
	}
	c.JSON(http.StatusOK, assignments)
}

// GetAssignmentHandler (学生/老师) 获取单个作业详情
func (h *AssignmentHandler) GetAssignmentHandler(c *gin.Context) {
	id := c.Param("id")
	var assignment Assignment
	if err := h.DB.Preload("Submissions").First(&assignment, id).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "Assignment not found"})
		return
	}

	// 为每个提交填充学生姓名
	for i := range assignment.Submissions {
		var user auth.User
		h.DB.First(&user, assignment.Submissions[i].StudentID)
		assignment.Submissions[i].StudentName = user.Username
	}

	c.JSON(http.StatusOK, assignment)
}

// SubmitAssignmentHandler (学生) 提交作业
func (h *AssignmentHandler) SubmitAssignmentHandler(c *gin.Context) {
	var submission Submission
	if err := c.ShouldBindJSON(&submission); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid input"})
		return
	}
	userIDRaw, _ := c.Get("userID")
	submission.StudentID = uint(userIDRaw.(float64))
	submission.CreatedAt = time.Now()

	// 1. 获取题目原文
	var assignment Assignment
	if err := h.DB.First(&assignment, submission.AssignmentID).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "Assignment not found"})
		return
	}

	// 2. 调用AI服务进行批改
	targetURL := "http://localhost:8000/api/v1/grade"
	formBody := new(bytes.Buffer)
	writer := multipart.NewWriter(formBody)
	_ = writer.WriteField("problem_text", assignment.ProblemText)
	_ = writer.WriteField("solution_text", submission.SolutionText)
	writer.Close()
	req, _ := http.NewRequest("POST", targetURL, formBody)
	req.Header.Set("Content-Type", writer.FormDataContentType())
	client := &http.Client{Timeout: time.Second * 180}
	resp, err := client.Do(req)
	if err != nil {
		c.JSON(http.StatusServiceUnavailable, gin.H{"error": "AI service is unreachable"})
		return
	}
	defer resp.Body.Close()

	var aiResp struct {
		Correction string `json:"correction"`
	}
	if err := json.NewDecoder(resp.Body).Decode(&aiResp); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to decode AI response"})
		return
	}

	// 3. 将批改结果存入 submission
	submission.Correction = aiResp.Correction
	submission.Status = "graded"
	submission.GradedAt = time.Now()

	// 4. 保存到数据库
	if err := h.DB.Create(&submission).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to save submission"})
		return
	}

	c.JSON(http.StatusOK, submission)
}
