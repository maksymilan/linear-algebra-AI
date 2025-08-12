// web_service/main.go

package main

import (
	"context"
	"log"
	"net/http"
	"time"

	"workplace/web_service/assignment" // 导入新包
	"workplace/web_service/auth"
	"workplace/web_service/chat"
	"workplace/web_service/config"
	"workplace/web_service/grading"

	"github.com/gin-contrib/cors"
	"github.com/gin-gonic/gin"
)

func main() {
	db := config.ConnectDB()
	r := gin.Default()
	r.MaxMultipartMemory = 8 << 24 // 8 MiB
	r.Use(cors.New(cors.Config{
		AllowOrigins:     []string{"http://localhost:5173", "http://localhost:5174"}, // 允许的前端地址
		AllowMethods:     []string{"GET", "POST", "PUT", "PATCH", "DELETE", "HEAD", "OPTIONS"},
		AllowHeaders:     []string{"Origin", "Content-Length", "Content-Type", "Authorization"},
		ExposeHeaders:    []string{"Content-Length"},
		AllowCredentials: true,
		MaxAge:           12 * time.Hour,
	}))

	authHandler := &auth.AuthHandler{DB: db}
	gradingHandler := &grading.GradingHandler{DB: db}
	chatHandler := &chat.ChatHandler{DB: db}
	assignmentHandler := &assignment.AssignmentHandler{DB: db} // 初始化新Handler

	api := r.Group("/api")
	{
		// 认证路由
		authRoutes := api.Group("/auth")
		{
			authRoutes.POST("/register", authHandler.Register)
			authRoutes.POST("/login", authHandler.Login)
		}

		// 聊天路由
		chatRoutes := api.Group("/chat")
		chatRoutes.Use(auth.AuthMiddleware())
		{
			chatRoutes.POST("/send", chatHandler.SendMessageHandler)
			chatRoutes.GET("/sessions", chatHandler.GetSessionsHandler)
			chatRoutes.GET("/messages/:id", chatHandler.GetMessagesHandler)
		}

		// 自主批改练习路由 (与作业分离)
		gradingRoutes := api.Group("/grading")
		gradingRoutes.Use(auth.AuthMiddleware())
		{
			gradingRoutes.POST("/upload", gradingHandler.GradeHomeworkHandler)
			gradingRoutes.POST("/start_follow_up_chat", gradingHandler.StartFollowUpChatHandler)
			gradingRoutes.POST("/ocr", gradingHandler.OcrHandler)
		}

		// 作业系统路由 (新)
		assignmentRoutes := api.Group("/assignments")
		assignmentRoutes.Use(auth.AuthMiddleware())
		{
			assignmentRoutes.POST("/", assignmentHandler.CreateAssignmentHandler)       // 老师创建
			assignmentRoutes.GET("/", assignmentHandler.ListAssignmentsHandler)         // 学生/老师查看列表
			assignmentRoutes.GET("/:id", assignmentHandler.GetAssignmentHandler)        // 学生/老师查看详情
			assignmentRoutes.POST("/submit", assignmentHandler.SubmitAssignmentHandler) // 学生提交
		}

		// 数据库健康检查
		api.GET("/health/db", func(c *gin.Context) {
			sqlDB, err := db.DB()
			if err != nil {
				c.JSON(http.StatusInternalServerError, gin.H{"status": "error", "message": "Failed to get database object"})
				return
			}
			ctx, cancel := context.WithTimeout(context.Background(), 2*time.Second)
			defer cancel()
			if err = sqlDB.PingContext(ctx); err != nil {
				c.JSON(http.StatusInternalServerError, gin.H{"status": "error", "message": "Database connection failed"})
				return
			}
			c.JSON(http.StatusOK, gin.H{"status": "ok", "message": "Database connection is healthy"})
		})
	}

	log.Println("Starting server on port :8080")
	r.Run(":8080")
}
