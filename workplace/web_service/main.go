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
	gradingHandler := &grading.GradingHandler{DB: db}
	chatHandler := &chat.ChatHandler{DB: db}
	assignmentHandler := &assignment.AssignmentHandler{DB: db}
	api := r.Group("/api")
	{
		api.POST("/auth/register", authHandler.Register)
		api.POST("/auth/login", authHandler.Login)
		authed := api.Group("/")
		authed.Use(auth.AuthMiddleware())
		{
			authed.POST("/chat/send", chatHandler.SendMessageHandler)
			authed.GET("/chat/sessions", chatHandler.GetSessionsHandler)
			authed.GET("/chat/messages/:id", chatHandler.GetMessagesHandler)
			authed.POST("/grading/upload", gradingHandler.GradeHomeworkHandler)
			authed.POST("/grading/ocr", gradingHandler.OcrHandler)
			// **↓↓↓ 新增的答疑路由 ↓↓↓**
			authed.POST("/grading/followup", gradingHandler.StartFollowUpChatHandler)
		}
		// ... (下方路由保持不变) ...
		teacherRoutes := api.Group("/teacher")
		teacherRoutes.Use(auth.AuthMiddleware(), auth.TeacherMiddleware())
		{
			teacherRoutes.POST("/assignments", assignmentHandler.CreateAssignmentHandler)
			teacherRoutes.GET("/assignments", assignmentHandler.ListAssignmentsHandler)
			teacherRoutes.GET("/assignments/:id", assignmentHandler.GetAssignmentHandler)
			teacherRoutes.GET("/submission/file/:id", assignmentHandler.ServeSubmissionFileHandler)
			teacherRoutes.POST("/submission/:id/comment", assignmentHandler.AddCommentHandler)
		}
		studentRoutes := api.Group("/student")
		studentRoutes.Use(auth.AuthMiddleware(), auth.StudentMiddleware())
		{
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
