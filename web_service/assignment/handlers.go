package assignment

import (
	"encoding/json"
	"fmt"
	"log"
	"mime"
	"net/http"
	"os"
	"path/filepath"
	"strconv"
	"strings"
	"time"
	"workplace/web_service/accesscontrol"
	"workplace/web_service/auth"

	"github.com/gin-gonic/gin"
	"gorm.io/gorm"
	"gorm.io/gorm/clause"
)

type AssignmentHandler struct {
	DB *gorm.DB
}

func parseExerciseIDs(raw string) ([]uint, error) {
	raw = strings.TrimSpace(raw)
	if raw == "" {
		return nil, nil
	}
	var ids []uint
	if strings.HasPrefix(raw, "[") {
		if err := json.Unmarshal([]byte(raw), &ids); err != nil {
			return nil, err
		}
	} else {
		for _, part := range strings.Split(raw, ",") {
			n, err := strconv.Atoi(strings.TrimSpace(part))
			if err != nil {
				return nil, err
			}
			ids = append(ids, uint(n))
		}
	}
	seen := map[uint]bool{}
	unique := make([]uint, 0, len(ids))
	for _, id := range ids {
		if id == 0 || seen[id] {
			continue
		}
		seen[id] = true
		unique = append(unique, id)
	}
	return unique, nil
}

func (h *AssignmentHandler) currentUser(c *gin.Context) (auth.User, bool) {
	user, ok, err := accesscontrol.CurrentUser(h.DB, c)
	if err != nil || !ok {
		return auth.User{}, false
	}
	return user, true
}

func (h *AssignmentHandler) studentCanAccess(user auth.User, assignment Assignment) bool {
	if user.Role != "student" || user.ClassID == nil {
		return false
	}
	if assignment.ClassID != nil {
		return *assignment.ClassID == *user.ClassID
	}

	var cls auth.Class
	if err := h.DB.First(&cls, *user.ClassID).Error; err != nil {
		return false
	}
	return cls.TeacherID == assignment.TeacherID
}

func (h *AssignmentHandler) canAccessAssignment(user auth.User, assignment Assignment) bool {
	if user.Role == "teacher" {
		return assignment.TeacherID == user.ID
	}
	return h.studentCanAccess(user, assignment)
}

func addProblemFileURL(assignment *Assignment) {
	if assignment.ProblemFileName != "" {
		assignment.ProblemFileURL = fmt.Sprintf("/api/assignments/%d/problem-file", assignment.ID)
	}
}

func (h *AssignmentHandler) loadExerciseContents(ids []uint) ([]AssignmentExerciseContent, error) {
	if len(ids) == 0 {
		return nil, nil
	}
	var rows []AssignmentExerciseContent
	err := h.DB.Raw(`
		SELECT id, textbook_id, textbook_name, page_num, exercise_number, stem,
		       COALESCE(array_to_string(concept_tags, ','), '') AS concept_tags,
		       exercise_type, question_type, has_answer
		FROM textbook_exercises
		WHERE id IN ?
	`, ids).Scan(&rows).Error
	if err != nil {
		return nil, err
	}
	byID := map[uint]AssignmentExerciseContent{}
	for _, row := range rows {
		byID[row.ID] = row
	}
	ordered := make([]AssignmentExerciseContent, 0, len(rows))
	for _, id := range ids {
		if row, ok := byID[id]; ok {
			ordered = append(ordered, row)
		}
	}
	return ordered, nil
}

func (h *AssignmentHandler) enrichAssignment(assignment *Assignment) {
	addProblemFileURL(assignment)
	var links []AssignmentExercise
	if err := h.DB.Where("assignment_id = ?", assignment.ID).
		Order("position asc, id asc").
		Find(&links).Error; err != nil || len(links) == 0 {
		return
	}
	ids := make([]uint, 0, len(links))
	for _, link := range links {
		ids = append(ids, link.ExerciseID)
	}
	assignment.ExerciseIDs = ids
	if exercises, err := h.loadExerciseContents(ids); err == nil {
		assignment.Exercises = exercises
	}
}

func (h *AssignmentHandler) attachStudentNames(assignment *Assignment) {
	if len(assignment.Submissions) == 0 {
		return
	}
	studentIDs := []uint{}
	for _, sub := range assignment.Submissions {
		studentIDs = append(studentIDs, sub.StudentID)
	}

	var users []auth.User
	userMap := map[uint]string{}
	if len(studentIDs) > 0 {
		h.DB.Model(&auth.User{}).Where("id IN ?", studentIDs).Find(&users)
		for _, user := range users {
			name := user.DisplayName
			if name == "" {
				name = user.Username
			}
			userMap[user.ID] = name
		}
	}

	for i := range assignment.Submissions {
		assignment.Submissions[i].StudentName = userMap[assignment.Submissions[i].StudentID]
	}
}

func (h *AssignmentHandler) validateExercisesExist(ids []uint) error {
	if len(ids) == 0 {
		return nil
	}
	var count int64
	if err := h.DB.Table("textbook_exercises").Where("id IN ?", ids).Count(&count).Error; err != nil {
		return err
	}
	if count != int64(len(ids)) {
		return fmt.Errorf("包含不存在的题库题目")
	}
	return nil
}

func (h *AssignmentHandler) linkExerciseTextbooksToClass(tx *gorm.DB, classID uint, exerciseIDs []uint) error {
	if classID == 0 || len(exerciseIDs) == 0 {
		return nil
	}
	var textbookIDs []uint
	if err := tx.Table("textbook_exercises").
		Where("id IN ? AND textbook_id IS NOT NULL", exerciseIDs).
		Distinct("textbook_id").
		Pluck("textbook_id", &textbookIDs).Error; err != nil {
		return err
	}
	if len(textbookIDs) == 0 {
		return nil
	}
	links := make([]auth.ClassTextbook, 0, len(textbookIDs))
	for _, textbookID := range textbookIDs {
		if textbookID == 0 {
			continue
		}
		links = append(links, auth.ClassTextbook{ClassID: classID, TextbookID: textbookID})
	}
	if len(links) == 0 {
		return nil
	}
	return tx.Clauses(clause.OnConflict{DoNothing: true}).Create(&links).Error
}

// CreateAssignmentHandler (老师) 创建新作业：支持手写题目、PDF 附件和题库选题。
func (h *AssignmentHandler) CreateAssignmentHandler(c *gin.Context) {
	title := strings.TrimSpace(c.PostForm("title"))
	problemText := strings.TrimSpace(c.PostForm("problemText"))
	classIDRaw := strings.TrimSpace(c.PostForm("classId"))
	exerciseIDs, err := parseExerciseIDs(c.PostForm("exerciseIds"))
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "题库题目 ID 格式错误"})
		return
	}

	if title == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "请输入作业标题"})
		return
	}
	file, fileErr := c.FormFile("problemFile")
	hasFile := fileErr == nil
	if problemText == "" && !hasFile && len(exerciseIDs) == 0 {
		c.JSON(http.StatusBadRequest, gin.H{"error": "请至少提供题目文本、附件或题库题目"})
		return
	}

	user, ok := h.currentUser(c)
	if !ok || user.Role != "teacher" {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "未登录"})
		return
	}

	var classID *uint
	if classIDRaw != "" {
		classIDNum, err := strconv.Atoi(classIDRaw)
		if err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": "班级 ID 不合法"})
			return
		}
		var cls auth.Class
		if err := h.DB.Where("id = ? AND teacher_id = ?", classIDNum, user.ID).First(&cls).Error; err != nil {
			c.JSON(http.StatusForbidden, gin.H{"error": "无权向该班级发布作业"})
			return
		}
		id := cls.ID
		classID = &id
	}

	if err := h.validateExercisesExist(exerciseIDs); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	assignment := Assignment{
		TeacherID:   user.ID,
		ClassID:     classID,
		Title:       title,
		ProblemText: problemText,
		CreatedAt:   time.Now(),
	}

	if hasFile {
		uploadDir := "./uploads/assignments"
		if err := os.MkdirAll(uploadDir, os.ModePerm); err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to create upload directory"})
			return
		}
		newFileName := fmt.Sprintf("assignment-%d-%d-%s", user.ID, time.Now().UnixNano(), filepath.Base(file.Filename))
		filePath := filepath.Join(uploadDir, newFileName)
		if err := c.SaveUploadedFile(file, filePath); err != nil {
			log.Printf("Error saving assignment file: %v", err)
			c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to save file"})
			return
		}
		assignment.ProblemFilePath = filePath
		assignment.ProblemFileName = file.Filename
	}

	tx := h.DB.Begin()
	if err := tx.Create(&assignment).Error; err != nil {
		tx.Rollback()
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to create assignment"})
		return
	}
	if len(exerciseIDs) > 0 {
		links := make([]AssignmentExercise, 0, len(exerciseIDs))
		for i, exerciseID := range exerciseIDs {
			links = append(links, AssignmentExercise{
				AssignmentID: assignment.ID,
				ExerciseID:   exerciseID,
				Position:     i + 1,
			})
		}
		if err := tx.Create(&links).Error; err != nil {
			tx.Rollback()
			c.JSON(http.StatusInternalServerError, gin.H{"error": "保存题库选题失败"})
			return
		}
		if classID != nil {
			if err := h.linkExerciseTextbooksToClass(tx, *classID, exerciseIDs); err != nil {
				tx.Rollback()
				c.JSON(http.StatusInternalServerError, gin.H{"error": "保存班级教材范围失败"})
				return
			}
		}
	}
	tx.Commit()

	h.enrichAssignment(&assignment)
	c.JSON(http.StatusOK, assignment)
}

// ListAssignmentsHandler (学生/老师) 获取当前用户可见作业列表。
func (h *AssignmentHandler) ListAssignmentsHandler(c *gin.Context) {
	user, ok := h.currentUser(c)
	if !ok {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "未登录"})
		return
	}

	var assignments []Assignment
	query := h.DB.Order("created_at desc")
	if user.Role == "teacher" {
		query = query.Where("teacher_id = ?", user.ID)
	} else {
		if user.ClassID == nil {
			c.JSON(http.StatusOK, []Assignment{})
			return
		}
		var cls auth.Class
		if err := h.DB.First(&cls, *user.ClassID).Error; err != nil {
			c.JSON(http.StatusOK, []Assignment{})
			return
		}
		query = query.Where("(class_id = ?) OR (class_id IS NULL AND teacher_id = ?)", cls.ID, cls.TeacherID)
	}

	if err := query.Find(&assignments).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to retrieve assignments"})
		return
	}
	for i := range assignments {
		h.enrichAssignment(&assignments[i])
	}
	c.JSON(http.StatusOK, assignments)
}

// GetAssignmentHandler (学生/老师) 获取单个作业详情及可见提交情况。
func (h *AssignmentHandler) GetAssignmentHandler(c *gin.Context) {
	id := c.Param("id")
	user, ok := h.currentUser(c)
	if !ok {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "未登录"})
		return
	}

	var assignment Assignment
	if err := h.DB.First(&assignment, id).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "Assignment not found"})
		return
	}
	if !h.canAccessAssignment(user, assignment) {
		c.JSON(http.StatusForbidden, gin.H{"error": "无权查看该作业"})
		return
	}

	if user.Role == "teacher" {
		h.DB.Where("assignment_id = ?", assignment.ID).Order("created_at desc").Find(&assignment.Submissions)
		h.attachStudentNames(&assignment)
	} else {
		h.DB.Where("assignment_id = ? AND student_id = ?", assignment.ID, user.ID).
			Order("created_at desc").Find(&assignment.Submissions)
	}
	h.enrichAssignment(&assignment)
	c.JSON(http.StatusOK, assignment)
}

// SubmitAssignmentHandler (学生) 提交作业文件。
func (h *AssignmentHandler) SubmitAssignmentHandler(c *gin.Context) {
	assignmentID, err := strconv.Atoi(c.PostForm("assignmentId"))
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid assignment ID"})
		return
	}

	file, err := c.FormFile("solutionFile")
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "No file is received"})
		return
	}

	user, ok := h.currentUser(c)
	if !ok || user.Role != "student" {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "未登录"})
		return
	}
	var assignment Assignment
	if err := h.DB.First(&assignment, assignmentID).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "Assignment not found"})
		return
	}
	if !h.studentCanAccess(user, assignment) {
		c.JSON(http.StatusForbidden, gin.H{"error": "无权提交该作业"})
		return
	}

	uploadDir := "./uploads/submissions"
	if err := os.MkdirAll(uploadDir, os.ModePerm); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to create upload directory"})
		return
	}

	newFileName := fmt.Sprintf("%d-%d-%d-%s", assignmentID, user.ID, time.Now().UnixNano(), filepath.Base(file.Filename))
	filePath := filepath.Join(uploadDir, newFileName)

	if err := c.SaveUploadedFile(file, filePath); err != nil {
		log.Printf("Error saving file: %v", err)
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to save file"})
		return
	}

	submission := Submission{
		AssignmentID:     uint(assignmentID),
		StudentID:        user.ID,
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

// ServeAssignmentProblemFileHandler 提供老师上传的题目附件，学生只能访问自己班级作业。
func (h *AssignmentHandler) ServeAssignmentProblemFileHandler(c *gin.Context) {
	user, ok := h.currentUser(c)
	if !ok {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "未登录"})
		return
	}

	var assignment Assignment
	if err := h.DB.First(&assignment, c.Param("id")).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "Assignment not found"})
		return
	}
	if !h.canAccessAssignment(user, assignment) {
		c.JSON(http.StatusForbidden, gin.H{"error": "无权访问该附件"})
		return
	}
	if assignment.ProblemFilePath == "" {
		c.JSON(http.StatusNotFound, gin.H{"error": "该作业没有题目附件"})
		return
	}
	contentType := mime.TypeByExtension(strings.ToLower(filepath.Ext(assignment.ProblemFileName)))
	if contentType == "" {
		contentType = "application/octet-stream"
	}
	c.Header("Content-Disposition", fmt.Sprintf("inline; filename=%s", filepath.Base(assignment.ProblemFileName)))
	c.Header("Content-Type", contentType)
	c.File(assignment.ProblemFilePath)
}

// ServeSubmissionFileHandler 提供学生解答文件给教师查看。
func (h *AssignmentHandler) ServeSubmissionFileHandler(c *gin.Context) {
	user, ok := h.currentUser(c)
	if !ok {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "未登录"})
		return
	}
	submissionID := c.Param("id")
	var submission Submission
	if err := h.DB.First(&submission, submissionID).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "Submission not found"})
		return
	}
	var assignment Assignment
	if err := h.DB.First(&assignment, submission.AssignmentID).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "Assignment not found"})
		return
	}
	if user.Role != "teacher" || assignment.TeacherID != user.ID {
		c.JSON(http.StatusForbidden, gin.H{"error": "无权查看该提交"})
		return
	}

	c.Header("Content-Disposition", fmt.Sprintf("inline; filename=%s", filepath.Base(submission.SolutionFileName)))
	c.Header("Content-Type", "application/pdf")
	c.File(submission.SolutionFilePath)
}

// AddCommentHandler (老师) 为提交添加评语。
func (h *AssignmentHandler) AddCommentHandler(c *gin.Context) {
	user, ok := h.currentUser(c)
	if !ok || user.Role != "teacher" {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "未登录"})
		return
	}
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
	var assignment Assignment
	if err := h.DB.First(&assignment, submission.AssignmentID).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "Assignment not found"})
		return
	}
	if assignment.TeacherID != user.ID {
		c.JSON(http.StatusForbidden, gin.H{"error": "无权批阅该提交"})
		return
	}

	submission.Comment = input.Comment
	submission.Status = "graded"
	submission.GradedAt = time.Now()

	if err := h.DB.Save(&submission).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to save comment"})
		return
	}

	c.JSON(http.StatusOK, submission)
}
