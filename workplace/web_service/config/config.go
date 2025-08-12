// web_service/config/config.go

package config

import (
	"log"
	"os"
	"workplace/web_service/assignment" // <-- 1. 导入新的 assignment 包
	"workplace/web_service/auth"
	"workplace/web_service/chat"
	"workplace/web_service/grading"

	"github.com/joho/godotenv"
	"gorm.io/driver/postgres"
	"gorm.io/gorm"
)

func ConnectDB() *gorm.DB {
	err := godotenv.Load()
	if err != nil {
		log.Println("No .env file found, reading from environment variables")
	}

	dsn := os.Getenv("DB_SOURCE")
	if dsn == "" {
		log.Fatal("DB_SOURCE environment variable is not set")
	}

	db, err := gorm.Open(postgres.Open(dsn), &gorm.Config{})
	if err != nil {
		log.Fatalf("Failed to connect to database: %v", err)
	}

	// --- 2. 添加 Assignment 和 Submission 模型到自动迁移列表 ---
	log.Println("Running GORM AutoMigrate...")
	err = db.AutoMigrate(&auth.User{}, &grading.GradeResult{}, &chat.ChatSession{}, &chat.ChatMessage{}, &assignment.Assignment{}, &assignment.Submission{})
	if err != nil {
		log.Fatalf("GORM AutoMigrate failed: %v", err)
	}

	log.Println("Successfully connected to the database and migrated schema!")
	return db
}
