package auth

import (
	"crypto/rand"
	"encoding/base32"
	"net/http"
	"strings"
	"strconv"
	"bytes"
	"io"
	"mime/multipart"
	"encoding/json"

	"github.com/gin-gonic/gin"
	"gorm.io/gorm"
)

type ClassHandler struct {
	DB *gorm.DB
}

type CreateClassRequest struct {
	Name string `json:"name" binding:"required"`
}

type JoinClassRequest struct {
	InviteCode string `json:"invite_code" binding:"required"`
}

func generateInviteCode() string {
	b := make([]byte, 4)
	rand.Read(b)
	code := base32.StdEncoding.EncodeToString(b)
	return strings.ToUpper(code[:6])
}

// 创建班级
func (h *ClassHandler) CreateClass(c *gin.Context) {
	var req CreateClassRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid input"})
		return
	}

	userID, exists := c.Get("userID")
	if !exists {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "Unauthorized"})
		return
	}

	uid := uint(userID.(float64))

	// 生成无冲突的邀请码
	var inviteCode string
	for {
		inviteCode = generateInviteCode()
		var count int64
		h.DB.Model(&Class{}).Where("invite_code = ?", inviteCode).Count(&count)
		if count == 0 {
			break
		}
	}

	newClass := Class{
		Name:       req.Name,
		InviteCode: inviteCode,
		TeacherID:  uid,
	}

	if err := h.DB.Create(&newClass).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to create class"})
		return
	}

	c.JSON(http.StatusCreated, gin.H{"message": "Class created successfully", "class": newClass})
}

// 加入班级
func (h *ClassHandler) JoinClass(c *gin.Context) {
	var req JoinClassRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid input"})
		return
	}

	userID, exists := c.Get("userID")
	if !exists {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "Unauthorized"})
		return
	}

	uid := uint(userID.(float64))

	var user User
	if err := h.DB.First(&user, uid).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "User not found"})
		return
	}

	if user.ClassID != nil {
		c.JSON(http.StatusConflict, gin.H{"error": "已加入班级"})
		return
	}

	inviteCode := strings.ToUpper(strings.TrimSpace(req.InviteCode))
	var class Class
	if err := h.DB.Where("invite_code = ?", inviteCode).First(&class).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "无效的邀请码"})
		return
	}

	user.ClassID = &class.ID
	if err := h.DB.Save(&user).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to join class"})
		return
	}

	c.JSON(http.StatusOK, gin.H{"message": "成功加入班级", "class": class})
}

// GetMyClass 学生端：查看自己所在班级 + 教师信息 + 教学进度；未加入时返回 joined=false
func (h *ClassHandler) GetMyStudentClass(c *gin.Context) {
	userIDRaw, exists := c.Get("userID")
	if !exists {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "Unauthorized"})
		return
	}
	uid := uint(userIDRaw.(float64))

	var user User
	if err := h.DB.First(&user, uid).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "用户不存在"})
		return
	}

	if user.ClassID == nil {
		c.JSON(http.StatusOK, gin.H{"joined": false})
		return
	}

	var class Class
	if err := h.DB.First(&class, *user.ClassID).Error; err != nil {
		c.JSON(http.StatusOK, gin.H{"joined": false})
		return
	}

	var teacher User
	teacherDisplay := ""
	if err := h.DB.Where("id = ?", class.TeacherID).First(&teacher).Error; err == nil {
		teacherDisplay = teacher.DisplayName
		if teacherDisplay == "" {
			teacherDisplay = teacher.Username
		}
	}

	var classmateCount int64
	h.DB.Model(&User{}).Where("class_id = ? AND role = ?", class.ID, "student").Count(&classmateCount)

	var materialsCount int64
	h.DB.Model(&ClassWeeklyMaterial{}).Where("class_id = ?", class.ID).Count(&materialsCount)

	c.JSON(http.StatusOK, gin.H{
		"joined": true,
		"class": gin.H{
			"id":              class.ID,
			"name":            class.Name,
			"invite_code":     class.InviteCode,
			"current_week":    class.CurrentWeek,
			"created_at":      class.CreatedAt,
			"teacher_name":    teacherDisplay,
			"classmate_count": classmateCount,
			"materials_count": materialsCount,
		},
	})
}

// 老师上传本周课件（PDF），调用 AI 服务总结并保存到数据库
func (h *ClassHandler) UploadWeeklyMaterial(c *gin.Context) {
	classIDStr := c.Param("id")
	classID, err := strconv.Atoi(classIDStr)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "无效的班级 ID"})
		return
	}

	// 权限校验：确认当前登录教师是该班级的 owner
	userIDRaw, exists := c.Get("userID")
	if !exists {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "Unauthorized"})
		return
	}
	teacherID := uint(userIDRaw.(float64))
	var ownCls Class
	if err := h.DB.Where("id = ? AND teacher_id = ?", classID, teacherID).First(&ownCls).Error; err != nil {
		c.JSON(http.StatusForbidden, gin.H{"error": "无权操作该班级"})
		return
	}

	weekNumStr := c.PostForm("week_num")
	weekNum, err := strconv.Atoi(weekNumStr)
	if err != nil || weekNum < 1 || weekNum > 16 {
		c.JSON(http.StatusBadRequest, gin.H{"error": "无效的周数 (要求 1-16)"})
		return
	}

	file, err := c.FormFile("file")
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "未提供课件文件"})
		return
	}

	// 打开上传的文件
	srcFile, err := file.Open()
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "无法读取文件"})
		return
	}
	defer srcFile.Close()

	// 构造要发送给 AI 服务的 multipart 请求
	body := &bytes.Buffer{}
	writer := multipart.NewWriter(body)
	part, err := writer.CreateFormFile("file", file.Filename)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "内部错误"})
		return
	}
	io.Copy(part, srcFile)
	writer.Close()

	// 请求 Python AI 服务
	req, err := http.NewRequest("POST", "http://localhost:8000/api/v1/summarize_ppt", body)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "内部错误"})
		return
	}
	req.Header.Set("Content-Type", writer.FormDataContentType())

	client := &http.Client{}
	resp, err := client.Do(req)
	if err != nil || resp.StatusCode != http.StatusOK {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "调用 AI 总结服务失败"})
		return
	}
	defer resp.Body.Close()

	var aiResult struct {
		Summary string `json:"summary"`
	}
	if err := json.NewDecoder(resp.Body).Decode(&aiResult); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "解析 AI 响应失败"})
		return
	}

	// 保存或更新到数据库
	var material ClassWeeklyMaterial
	result := h.DB.Where("class_id = ? AND week_num = ?", classID, weekNum).First(&material)
	if result.Error == gorm.ErrRecordNotFound {
		// 新建
		material = ClassWeeklyMaterial{
			ClassID: uint(classID),
			WeekNum: weekNum,
			Summary: aiResult.Summary,
		}
		h.DB.Create(&material)
	} else {
		// 更新
		material.Summary = aiResult.Summary
		h.DB.Save(&material)
	}

	// 顺便更新班级的当前进度
	h.DB.Model(&Class{}).Where("id = ?", classID).Update("current_week", weekNum)

	c.JSON(http.StatusOK, gin.H{"message": "课件总结生成并保存成功", "summary": material.Summary})
}

// ---------------- 教师班级管理（新增） ----------------

// ListMyClasses 教师端：列出当前老师创建的所有班级，附带学生人数 & 当前教学周
func (h *ClassHandler) ListMyClasses(c *gin.Context) {
	userIDRaw, exists := c.Get("userID")
	if !exists {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "Unauthorized"})
		return
	}
	teacherID := uint(userIDRaw.(float64))

	var classes []Class
	if err := h.DB.Where("teacher_id = ?", teacherID).Order("created_at desc").Find(&classes).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "获取班级列表失败"})
		return
	}

	type ClassOverview struct {
		ID             uint   `json:"id"`
		Name           string `json:"name"`
		InviteCode     string `json:"invite_code"`
		CurrentWeek    int    `json:"current_week"`
		StudentCount   int64  `json:"student_count"`
		MaterialsCount int64  `json:"materials_count"`
	}

	overviews := make([]ClassOverview, 0, len(classes))
	for _, cls := range classes {
		var studentCount int64
		h.DB.Model(&User{}).Where("class_id = ? AND role = ?", cls.ID, "student").Count(&studentCount)

		var matCount int64
		h.DB.Model(&ClassWeeklyMaterial{}).Where("class_id = ?", cls.ID).Count(&matCount)

		overviews = append(overviews, ClassOverview{
			ID:             cls.ID,
			Name:           cls.Name,
			InviteCode:     cls.InviteCode,
			CurrentWeek:    cls.CurrentWeek,
			StudentCount:   studentCount,
			MaterialsCount: matCount,
		})
	}

	c.JSON(http.StatusOK, gin.H{"classes": overviews})
}

// GetClassDetail 教师端：查看单个班级详情（含每个学生的学习情况概览）
func (h *ClassHandler) GetClassDetail(c *gin.Context) {
	userIDRaw, _ := c.Get("userID")
	teacherID := uint(userIDRaw.(float64))

	classIDStr := c.Param("id")
	classID, err := strconv.Atoi(classIDStr)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "无效的班级 ID"})
		return
	}

	// 1. 校验班级归属
	var cls Class
	if err := h.DB.Where("id = ? AND teacher_id = ?", classID, teacherID).First(&cls).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "班级不存在或无权查看"})
		return
	}

	// 2. 查班级学生
	var students []User
	h.DB.Where("class_id = ? AND role = ?", cls.ID, "student").Order("username asc").Find(&students)

	// 3. 查该老师发布的全部作业 id，用来限定统计范围
	type assignmentIDRow struct {
		ID uint
	}
	var aids []uint
	h.DB.Table("assignments").Where("teacher_id = ?", teacherID).Pluck("id", &aids)
	totalAssignments := len(aids)

	// 4. 汇总每个学生的：提交数 / 已批改数 / AI 对话次数
	type StudentStat struct {
		ID            uint   `json:"id"`
		Username      string `json:"username"`
		DisplayName   string `json:"display_name"`
		SubmitCount   int64  `json:"submit_count"`
		GradedCount   int64  `json:"graded_count"`
		ChatCount     int64  `json:"chat_count"`
		LastActive    string `json:"last_active"`
	}

	stats := make([]StudentStat, 0, len(students))
	for _, stu := range students {
		var submitCount, gradedCount, chatCount int64
		if totalAssignments > 0 {
			h.DB.Table("submissions").
				Where("student_id = ? AND assignment_id IN ?", stu.ID, aids).
				Count(&submitCount)
			h.DB.Table("submissions").
				Where("student_id = ? AND assignment_id IN ? AND status = ?", stu.ID, aids, "graded").
				Count(&gradedCount)
		}
		h.DB.Table("chat_sessions").Where("user_id = ?", stu.ID).Count(&chatCount)

		// 最近一次活动时间：优先看最近的提交，否则看对话会话
		var lastActive string
		type lastRow struct {
			CreatedAt string
		}
		var lr lastRow
		h.DB.Raw(`
			SELECT MAX(created_at) AS created_at FROM (
				SELECT created_at FROM submissions WHERE student_id = ?
				UNION ALL
				SELECT created_at FROM chat_sessions WHERE user_id = ?
			) AS t
		`, stu.ID, stu.ID).Scan(&lr)
		lastActive = lr.CreatedAt

		stats = append(stats, StudentStat{
			ID:          stu.ID,
			Username:    stu.Username,
			DisplayName: stu.DisplayName,
			SubmitCount: submitCount,
			GradedCount: gradedCount,
			ChatCount:   chatCount,
			LastActive:  lastActive,
		})
	}

	// 5. 班级汇总数据
	var totalSubmissions int64
	if totalAssignments > 0 {
		h.DB.Table("submissions").
			Where("assignment_id IN ? AND student_id IN (SELECT id FROM users WHERE class_id = ? AND role = 'student')", aids, cls.ID).
			Count(&totalSubmissions)
	}

	c.JSON(http.StatusOK, gin.H{
		"class": gin.H{
			"id":                cls.ID,
			"name":              cls.Name,
			"invite_code":       cls.InviteCode,
			"current_week":      cls.CurrentWeek,
			"created_at":        cls.CreatedAt,
			"total_assignments": totalAssignments,
			"total_students":    len(students),
			"total_submissions": totalSubmissions,
		},
		"students": stats,
	})
}

// UpdateClassWeek 教师端：单独调整班级当前教学周（不需要同时上传 PPT）
func (h *ClassHandler) UpdateClassWeek(c *gin.Context) {
	userIDRaw, exists := c.Get("userID")
	if !exists {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "Unauthorized"})
		return
	}
	teacherID := uint(userIDRaw.(float64))

	classIDStr := c.Param("id")
	classID, err := strconv.Atoi(classIDStr)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "无效的班级 ID"})
		return
	}

	var req struct {
		CurrentWeek int `json:"current_week" binding:"required"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "请求参数不合法"})
		return
	}
	if req.CurrentWeek < 1 || req.CurrentWeek > 16 {
		c.JSON(http.StatusBadRequest, gin.H{"error": "教学周必须在 1 - 16 之间"})
		return
	}

	var cls Class
	if err := h.DB.Where("id = ? AND teacher_id = ?", classID, teacherID).First(&cls).Error; err != nil {
		c.JSON(http.StatusForbidden, gin.H{"error": "无权操作该班级"})
		return
	}

	if err := h.DB.Model(&Class{}).Where("id = ?", classID).Update("current_week", req.CurrentWeek).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "更新失败"})
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"message":      "教学进度已更新",
		"current_week": req.CurrentWeek,
	})
}
