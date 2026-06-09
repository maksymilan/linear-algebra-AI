// web_service/main.go

package main

import (
	"log"
	"net/http"
	"os"
	"strings"
	"workplace/web_service/assignment"
	"workplace/web_service/auth"
	"workplace/web_service/chat"
	"workplace/web_service/config"
	"workplace/web_service/favorite"
	"workplace/web_service/grading"
	"workplace/web_service/questionbank"
	"workplace/web_service/textbook"

	"github.com/gin-contrib/cors"
	"github.com/gin-gonic/gin"
)

// 上线安全检查：JWT 密钥若为空或仍是已知弱值，则任何人都能伪造任意用户/教师 token。
var weakJWTSecrets = map[string]bool{
	"":                    true,
	"a_default_secret_key": true,
	"dev-secret-change-me": true,
	"CHANGE_ME_RANDOM_64_HEX": true,
}

func main() {
	if weakJWTSecrets[os.Getenv("JWT_SECRET")] {
		log.Println("⚠️⚠️ 严重安全风险：JWT_SECRET 为空或为弱默认值，任何人可伪造登录 token！上线前务必在 .env 设置强随机值（openssl rand -hex 32）")
	}
	db := config.ConnectDB()
	r := gin.Default()
	// CORS：本应用用 Bearer token（非 cookie），故关闭 AllowCredentials。
	// 默认放开所有源（生产为 nginx 同源部署、不依赖 CORS）；可用 CORS_ALLOWED_ORIGINS=https://a.com,https://b.com 收紧。
	corsCfg := cors.Config{
		AllowMethods:     []string{"GET", "POST", "PUT", "PATCH", "DELETE", "HEAD", "OPTIONS"},
		AllowHeaders:     []string{"Origin", "Content-Length", "Content-Type", "Authorization"},
		AllowCredentials: false,
	}
	if origins := strings.TrimSpace(os.Getenv("CORS_ALLOWED_ORIGINS")); origins != "" && origins != "*" {
		corsCfg.AllowOrigins = strings.Split(origins, ",")
	} else {
		corsCfg.AllowAllOrigins = true
	}
	r.Use(cors.New(corsCfg))
	authHandler := &auth.AuthHandler{DB: db, Mailer: auth.NewSMTPMailerFromEnv()}
	classHandler := &auth.ClassHandler{DB: db}
	gradingHandler := &grading.GradingHandler{DB: db}
	chatHandler := &chat.ChatHandler{DB: db}
	assignmentHandler := &assignment.AssignmentHandler{DB: db}
	textbookHandler := &textbook.TextbookHandler{DB: db}
	questionBankHandler := &questionbank.QuestionBankHandler{DB: db}
	favoriteHandler := &favorite.FavoriteHandler{DB: db}
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
			authed.GET("/chat/models", chatHandler.GetModelOptionsHandler)
			authed.GET("/chat/sessions", chatHandler.GetSessionsHandler)
			authed.GET("/chat/messages/:id", chatHandler.GetMessagesHandler)
			authed.POST("/chat/messages/:id/feedback", chatHandler.SubmitFeedbackHandler) // 新增点赞路由
			authed.POST("/grading/upload", gradingHandler.GradeHomeworkHandler)
			authed.POST("/grading/ocr", gradingHandler.OcrHandler)
			// **↓↓↓ 新增的答疑路由 ↓↓↓**
			authed.POST("/grading/followup", gradingHandler.StartFollowUpChatHandler)
			authed.GET("/assignments/:id/problem-file", assignmentHandler.ServeAssignmentProblemFileHandler)
			// 题库检索（转发 ai_service 混合检索）
			authed.POST("/questions/search", questionBankHandler.Search)
			// 题库章节统计（老师分章浏览选题）
			authed.POST("/questions/chapters", questionBankHandler.Chapters)
			// 学生端：把题目作为上下文请 AI 讲解（落成新会话）
			authed.POST("/questions/:id/explain", questionBankHandler.Explain)
			// 题目收藏
			authed.POST("/favorites", favoriteHandler.Add)
			authed.DELETE("/favorites/:exerciseId", favoriteHandler.Remove)
			authed.GET("/favorites", favoriteHandler.List)
		}
		// ... (下方路由保持不变) ...
		teacherRoutes := api.Group("/teacher")
		teacherRoutes.Use(auth.AuthMiddleware(), auth.TeacherMiddleware())
		{
			teacherRoutes.POST("/classes", classHandler.CreateClass)                             // 创建班级
			teacherRoutes.GET("/classes", classHandler.ListMyClasses)                            // 查看我管理的班级
			teacherRoutes.GET("/classes/:id", classHandler.GetClassDetail)                       // 查看某个班级详情 + 学生学习情况
			teacherRoutes.PATCH("/classes/:id/week", classHandler.UpdateClassWeek)               // 更新班级当前教学周
			teacherRoutes.POST("/classes/:id/weekly_content", classHandler.UploadWeeklyMaterial) // 上传每周课件总结
			teacherRoutes.PUT("/classes/:id/textbooks", textbookHandler.SetClassTextbooks)       // 设置班级可访问教材
			teacherRoutes.POST("/assignments", assignmentHandler.CreateAssignmentHandler)
			teacherRoutes.GET("/assignments", assignmentHandler.ListAssignmentsHandler)
			teacherRoutes.GET("/assignments/:id", assignmentHandler.GetAssignmentHandler)
			teacherRoutes.GET("/submission/file/:id", assignmentHandler.ServeSubmissionFileHandler)
			teacherRoutes.POST("/submission/:id/comment", assignmentHandler.AddCommentHandler)

			// 题库：老师录入题目答案/解析
			teacherRoutes.PUT("/questions/:id/answer", questionBankHandler.SetAnswer)

			// 教材管理
			teacherRoutes.GET("/textbooks", textbookHandler.GetTextbooks)
			teacherRoutes.POST("/textbooks", textbookHandler.UploadTextbook)
			teacherRoutes.POST("/textbooks/:id/cancel", textbookHandler.CancelTextbook)
			teacherRoutes.DELETE("/textbooks/:id", textbookHandler.DeleteTextbook)
		}
		studentRoutes := api.Group("/student")
		studentRoutes.Use(auth.AuthMiddleware(), auth.StudentMiddleware())
		{
			studentRoutes.POST("/class/join", classHandler.JoinClass)   // 加入班级
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
