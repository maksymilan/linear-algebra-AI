package main

import (
	"context"
	"io"
	"log"
	"net/http"

	"workplace/web_service/config" // 导入我们自己的 config 包

	"github.com/gin-contrib/cors"
	"github.com/gin-gonic/gin"
)

func main() {
	// --- 1. Connect to Database ---
	dbpool := config.ConnectDB()
	defer dbpool.Close()

	// --- 2. Setup Gin Router ---
	r := gin.Default()
	corsConfig := cors.DefaultConfig()
	corsConfig.AllowOrigins = []string{"http://localhost:3000", "http://localhost:5173"}
	r.Use(cors.New(corsConfig))

	// --- 3. Define Routes ---
	r.GET("/api/ping", func(c *gin.Context) {
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

	// --- Database Health Check Route ---
	r.GET("/api/health/db", func(c *gin.Context) {
		err := dbpool.Ping(context.Background())
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

	// --- 4. Start Server ---
	r.Run(":8080")
}
