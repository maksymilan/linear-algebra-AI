// web_service/main.go

package main

import (
	"log"
	"net/http"
	"workplace/web_service/assignment"
	"workplace/web_service/auth"
	"workplace/web_service/chat"
	"workplace/web_service/config"
	"workplace/web_service/grading"
	"workplace/web_service/textbook"

	"github.com/gin-contrib/cors"
	"github.com/gin-gonic/gin"
)

func main() {
	// ... (上方代码保持不变) ...
	db := config.ConnectDB()
	r := gin.Default()
	r.Use(cors.New(cors.Config{
		AllowAllOrigins:  true,
		AllowMethods:     []string{"GET", "POST", "PUT", "PATCH", "DELETE", "HEAD", "OPTIONS"},
		AllowHeaders:     []string{"Origin", "Content-Length", "Content-Type", "Authorization"},
		AllowCredentials: true,
	}))
	authHandler := &auth.AuthHandler{DB: db}
	classHandler := &auth.ClassHandler{DB: db}
	gradingHandler := &grading.GradingHandler{DB: db}
	chatHandler := &chat.ChatHandler{DB: db}
	assignmentHandler := &assignment.AssignmentHandler{DB: db}
	textbookHandler := &textbook.TextbookHandler{DB: db}
	api := r.Group("/api")
	{
		api.POST("/auth/register", authHandler.Register)
		api.POST("/auth/login", authHandler.Login)
		api.POST("/auth/request-code", authHandler.RequestVerificationCode) // 申请验证码（忘记密码 / 未来注册邮箱验证）
		api.POST("/auth/reset-password", authHandler.ResetPasswordWithCode) // 基于验证码重置密码
		authed := api.Group("/")
		authed.Use(auth.AuthMiddleware())
		{
			authed.POST("/chat/send", chatHandler.SendMessageHandler)
			authed.GET("/chat/sessions", chatHandler.GetSessionsHandler)
			authed.GET("/chat/messages/:id", chatHandler.GetMessagesHandler)
			authed.POST("/chat/messages/:id/feedback", chatHandler.SubmitFeedbackHandler) // 新增点赞路由
			authed.POST("/grading/upload", gradingHandler.GradeHomeworkHandler)
			authed.POST("/grading/ocr", gradingHandler.OcrHandler)
			// **↓↓↓ 新增的答疑路由 ↓↓↓**
			authed.POST("/grading/followup", gradingHandler.StartFollowUpChatHandler)
		}
		// ... (下方路由保持不变) ...
		teacherRoutes := api.Group("/teacher")
		teacherRoutes.Use(auth.AuthMiddleware(), auth.TeacherMiddleware())
		{
			teacherRoutes.POST("/classes", classHandler.CreateClass) // 创建班级
			teacherRoutes.GET("/classes", classHandler.ListMyClasses) // 查看我管理的班级
			teacherRoutes.GET("/classes/:id", classHandler.GetClassDetail) // 查看某个班级详情 + 学生学习情况
			teacherRoutes.PATCH("/classes/:id/week", classHandler.UpdateClassWeek) // 更新班级当前教学周
			teacherRoutes.POST("/classes/:id/weekly_content", classHandler.UploadWeeklyMaterial) // 上传每周课件总结
			teacherRoutes.POST("/assignments", assignmentHandler.CreateAssignmentHandler)
			teacherRoutes.GET("/assignments", assignmentHandler.ListAssignmentsHandler)
			teacherRoutes.GET("/assignments/:id", assignmentHandler.GetAssignmentHandler)
			teacherRoutes.GET("/submission/file/:id", assignmentHandler.ServeSubmissionFileHandler)
			teacherRoutes.POST("/submission/:id/comment", assignmentHandler.AddCommentHandler)
			
			// 教材管理
			teacherRoutes.GET("/textbooks", textbookHandler.GetTextbooks)
			teacherRoutes.POST("/textbooks", textbookHandler.UploadTextbook)
			teacherRoutes.POST("/textbooks/:id/cancel", textbookHandler.CancelTextbook)
			teacherRoutes.DELETE("/textbooks/:id", textbookHandler.DeleteTextbook)
		}
		studentRoutes := api.Group("/student")
		studentRoutes.Use(auth.AuthMiddleware(), auth.StudentMiddleware())
		{
			studentRoutes.POST("/class/join", classHandler.JoinClass) // 加入班级
			studentRoutes.GET("/class", classHandler.GetMyStudentClass) // 查看我所在班级（未加入时 joined=false）
			studentRoutes.GET("/assignments", assignmentHandler.ListAssignmentsHandler)
			studentRoutes.GET("/assignments/:id", assignmentHandler.GetAssignmentHandler)
			studentRoutes.POST("/assignments/submit", assignmentHandler.SubmitAssignmentHandler)
		}
		api.GET("/health/db", func(c *gin.Context) {
			sqlDB, err := db.DB()
			if err != nil {
				c.JSON(http.StatusInternalServerError, gin.H{"status": "unhealthy", "error": "failed to get db instance"})
				return
			}
			err = sqlDB.Ping()
			if err != nil {
				c.JSON(http.StatusServiceUnavailable, gin.H{"status": "unhealthy", "error": err.Error()})
				return
			}
			c.JSON(http.StatusOK, gin.H{"status": "healthy"})
		})
	}
	log.Println("Starting server on port :8080")
	r.Run(":8080")
}
