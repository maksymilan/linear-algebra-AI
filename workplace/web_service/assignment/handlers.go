// web_service/assignment/handlers.go

package assignment

import (
	"fmt"
	"log"
	"net/http"
	"os"
	"path/filepath"
	"strconv"
	"time"
	"workplace/web_service/auth"

	"github.com/gin-gonic/gin"
	"gorm.io/gorm"
)

type AssignmentHandler struct {
	DB *gorm.DB
}

// CreateAssignmentHandler (老师) 创建新作业，支持文件上传
func (h *AssignmentHandler) CreateAssignmentHandler(c *gin.Context) {
	// 从multipart form获取数据
	title := c.PostForm("title")
	problemText := c.PostForm("problemText")

	if title == "" || problemText == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Title and problem text are required"})
		return
	}

	userIDRaw, _ := c.Get("userID")

	assignment := Assignment{
		TeacherID:   uint(userIDRaw.(float64)),
		Title:       title,
		ProblemText: problemText,
		CreatedAt:   time.Now(),
	}

	// 处理可选的文件上传
	file, err := c.FormFile("problemFile")
	// 如果 err == nil，说明有文件上传
	if err == nil {
		uploadDir := "./uploads/assignments"
		if err := os.MkdirAll(uploadDir, os.ModePerm); err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to create upload directory"})
			return
		}

		// 创建一个唯一的文件名以避免冲突
		newFileName := fmt.Sprintf("assignment-%d-%d-%s", assignment.TeacherID, time.Now().Unix(), filepath.Base(file.Filename))
		filePath := filepath.Join(uploadDir, newFileName)

		if err := c.SaveUploadedFile(file, filePath); err != nil {
			log.Printf("Error saving assignment file: %v", err)
			c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to save file"})
			return
		}

		// 将文件信息保存到assignment对象中
		assignment.ProblemFilePath = filePath
		assignment.ProblemFileName = file.Filename
	}

	// 将assignment对象存入数据库
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

// GetAssignmentHandler (学生/老师) 获取单个作业详情及其提交情况
func (h *AssignmentHandler) GetAssignmentHandler(c *gin.Context) {
	id := c.Param("id")
	var assignment Assignment
	// 预加载Submissions
	if err := h.DB.Preload("Submissions").First(&assignment, id).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "Assignment not found"})
		return
	}

	// 如果存在提交，则查询并附加提交者的用户名
	if len(assignment.Submissions) > 0 {
		studentIDs := []uint{}
		for _, sub := range assignment.Submissions {
			studentIDs = append(studentIDs, sub.StudentID)
		}

		var users []auth.User
		userMap := make(map[uint]string)
		if len(studentIDs) > 0 {
			h.DB.Model(&auth.User{}).Where("id IN ?", studentIDs).Find(&users)
			for _, user := range users {
				userMap[user.ID] = user.Username // 你也可以使用DisplayName等其他字段
			}
		}

		// 将用户名附加到每个提交记录上
		for i := range assignment.Submissions {
			assignment.Submissions[i].StudentName = userMap[assignment.Submissions[i].StudentID]
		}
	}

	c.JSON(http.StatusOK, assignment)
}

// SubmitAssignmentHandler (学生) 提交作业文件
func (h *AssignmentHandler) SubmitAssignmentHandler(c *gin.Context) {
	assignmentIDStr := c.PostForm("assignmentId")
	assignmentID, err := strconv.Atoi(assignmentIDStr)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid assignment ID"})
		return
	}

	file, err := c.FormFile("solutionFile")
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "No file is received"})
		return
	}

	userIDRaw, _ := c.Get("userID")
	userID := uint(userIDRaw.(float64))

	uploadDir := "./uploads/submissions"
	if err := os.MkdirAll(uploadDir, os.ModePerm); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to create upload directory"})
		return
	}

	newFileName := fmt.Sprintf("%d-%d-%d-%s", assignmentID, userID, time.Now().Unix(), filepath.Base(file.Filename))
	filePath := filepath.Join(uploadDir, newFileName)

	if err := c.SaveUploadedFile(file, filePath); err != nil {
		log.Printf("Error saving file: %v", err)
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to save file"})
		return
	}

	submission := Submission{
		AssignmentID:     uint(assignmentID),
		StudentID:        userID,
		SolutionFilePath: filePath,
		SolutionFileName: file.Filename,
		Status:           "submitted",
		CreatedAt:        time.Now(),
	}

	if err := h.DB.Create(&submission).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to save submission record"})
		return
	}

	c.JSON(http.StatusOK, submission)
}

// ServeSubmissionFileHandler 提供文件给前端下载或查看
func (h *AssignmentHandler) ServeSubmissionFileHandler(c *gin.Context) {
	submissionID := c.Param("id")
	var submission Submission
	if err := h.DB.First(&submission, submissionID).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "Submission not found"})
		return
	}
	// Content-Disposition: inline 表示浏览器会尝试直接显示文件（如PDF,图片），而不是强制下载
	c.Header("Content-Disposition", fmt.Sprintf("inline; filename=%s", submission.SolutionFileName))
	// 动态设置Content-Type可以改善体验，但为简单起见，此处假设都为PDF
	c.Header("Content-Type", "application/pdf")
	c.File(submission.SolutionFilePath)
}

// AddCommentHandler (老师) 为提交添加评语
func (h *AssignmentHandler) AddCommentHandler(c *gin.Context) {
	submissionID := c.Param("id")

	var input struct {
		Comment string `json:"comment" binding:"required"`
	}

	if err := c.ShouldBindJSON(&input); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Comment text is required"})
		return
	}

	var submission Submission
	if err := h.DB.First(&submission, submissionID).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "Submission not found"})
		return
	}

	submission.Comment = input.Comment
	submission.Status = "graded" // 添加评语后，状态变为“已批改”
	submission.GradedAt = time.Now()

	if err := h.DB.Save(&submission).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to save comment"})
		return
	}

	c.JSON(http.StatusOK, submission)
}
