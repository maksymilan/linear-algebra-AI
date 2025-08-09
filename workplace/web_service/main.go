package main

import (
	"bytes"
	"context"
	"fmt"
	"io"
	"log"
	"mime/multipart"
	"net/http"
	"net/textproto"
	"time"

	"workplace/web_service/auth"
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
		AllowOrigins:     []string{"http://localhost:5173"},
		AllowMethods:     []string{"GET", "POST", "PUT", "PATCH", "DELETE", "HEAD", "OPTIONS"},
		AllowHeaders:     []string{"Origin", "Content-Length", "Content-Type", "Authorization"},
		ExposeHeaders:    []string{"Content-Length"},
		AllowCredentials: true,
		MaxAge:           12 * time.Hour,
	}))

	authHandler := &auth.AuthHandler{DB: db}
	gradingHandler := &grading.GradingHandler{DB: db}

	api := r.Group("/api")
	{
		authRoutes := api.Group("/auth")
		{
			authRoutes.POST("/register", authHandler.Register)
			authRoutes.POST("/login", authHandler.Login)
		}

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
			ctx, cancel := context.WithTimeout(context.Background(), 2*time.Second)
			defer cancel()
			err = sqlDB.PingContext(ctx)
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

		chatRoutes := api.Group("/chat")
		chatRoutes.Use(auth.AuthMiddleware())
		{
			chatRoutes.POST("/send", func(c *gin.Context) {
				targetURL := "http://localhost:8000/api/v1/chat"
				body := &bytes.Buffer{}
				writer := multipart.NewWriter(body)

				if err := writer.WriteField("prompt", c.PostForm("prompt")); err != nil {
					c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to write prompt field"})
					return
				}

				form, err := c.MultipartForm()
				if err == nil {
					files := form.File["files"]
					for _, fileHeader := range files {
						originalContentType := fileHeader.Header.Get("Content-Type")
						h := make(textproto.MIMEHeader)
						h.Set("Content-Disposition", fmt.Sprintf(`form-data; name="%s"; filename="%s"`, "files", fileHeader.Filename))
						if originalContentType != "" {
							h.Set("Content-Type", originalContentType)
						}
						part, err := writer.CreatePart(h)
						if err != nil {
							c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to create form file"})
							return
						}
						file, err := fileHeader.Open()
						if err != nil {
							c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to open file"})
							return
						}
						_, err = io.Copy(part, file)
						file.Close()
						if err != nil {
							c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to copy file content"})
							return
						}
					}
				}
				writer.Close()

				proxyReq, err := http.NewRequest("POST", targetURL, body)
				if err != nil {
					c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to create request"})
					return
				}
				proxyReq.Header.Set("Content-Type", writer.FormDataContentType())

				client := &http.Client{Timeout: time.Second * 180}
				resp, err := client.Do(proxyReq)
				if err != nil {
					c.JSON(http.StatusServiceUnavailable, gin.H{"error": "AI service is unreachable", "details": err.Error()})
					return
				}
				defer resp.Body.Close()

				responseBody, err := io.ReadAll(resp.Body)
				if err != nil {
					c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to read response from Python service", "details": err.Error()})
					return
				}

				c.Data(resp.StatusCode, "application/json", responseBody)
			})
		}

		gradingRoutes := api.Group("/grading")
		gradingRoutes.Use(auth.AuthMiddleware())
		{
			gradingRoutes.POST("/upload", gradingHandler.GradeHomeworkHandler)
			gradingRoutes.GET("/history", gradingHandler.GetHistoryHandler)
			gradingRoutes.DELETE("/:id", gradingHandler.DeleteResultHandler)
			gradingRoutes.POST("/ocr", gradingHandler.OcrHandler)
		}
	}

	log.Println("Starting server on port :8080")
	r.Run(":8080")
}
