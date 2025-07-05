package main

import (
	"context"
	"io"
	"log"
	"net/http"

	"workplace/web_service/auth"
	"workplace/web_service/config"

	"github.com/gin-contrib/cors"
	"github.com/gin-gonic/gin"
)

func main() {
	// --- 1. 使用 GORM 连接到数据库 ---
	db := config.ConnectDB()

	// --- 2. 设置 Gin 路由器 ---
	r := gin.Default()

	corsConfig := cors.DefaultConfig()
	corsConfig.AllowOrigins = []string{"http://localhost:3000", "http://localhost:5173"}
	r.Use(cors.New(corsConfig))

	authHandler := &auth.AuthHandler{DB: db}

	// --- 3. 定义API路由 ---
	api := r.Group("/api")
	{
		api.GET("/ping", func(c *gin.Context) {
			resp, err := http.Get("http://localhost:8000/api/v1/greet")
			if err != nil {
				c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to call Python service"})
				return
			}
			defer resp.Body.Close()
			body, err := io.ReadAll(resp.Body)
			if err != nil {
				c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to read response from Python service"})
				return
			}
			c.Data(http.StatusOK, "application/json", body)
		})

		// 数据库健康检查路由
		api.GET("/health/db", func(c *gin.Context) {
			sqlDB, err := db.DB()
			if err != nil {
				log.Printf("Failed to get generic database object from GORM: %v", err)
				c.JSON(http.StatusInternalServerError, gin.H{
					"status":  "error",
					"message": "Failed to get database object",
				})
				return
			}

			err = sqlDB.PingContext(context.Background())
			if err != nil {
				log.Printf("Database connection error: %v", err)
				c.JSON(http.StatusInternalServerError, gin.H{
					"status":  "error",
					"message": "Database connection failed",
				})
				return
			}

			c.JSON(http.StatusOK, gin.H{
				"status":  "ok",
				"message": "Database connection is healthy",
			})
		})

		// 用户名/密码认证路由
		authRoutes := api.Group("/auth")
		{
			authRoutes.POST("/register", authHandler.Register)
			authRoutes.POST("/login", authHandler.Login)
		}
	}

	// --- 4. 启动服务器 ---
	log.Println("Starting server on port :8080")
	r.Run(":8080")
}
