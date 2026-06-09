// web_service/config/config.go

package config

import (
	"log"
	"os"
	"workplace/web_service/assignment" // <-- 1. 导入新的 assignment 包
	"workplace/web_service/auth"
	"workplace/web_service/chat"
	"workplace/web_service/favorite"
	"workplace/web_service/grading"
	"workplace/web_service/textbook"

	"github.com/joho/godotenv"
	"gorm.io/driver/postgres"
	"gorm.io/gorm"
)

func ConnectDB() *gorm.DB {
	// 统一环境变量：优先加载仓库根目录 .env（../.env），再兼容旧的 web_service/.env。
	// godotenv 不覆盖已存在的环境变量，先加载的根 .env 为准；两者都没有则用系统环境变量。
	rootErr := godotenv.Load("../.env")
	_ = godotenv.Load(".env")
	if rootErr != nil {
		log.Println("根目录 .env 未找到，回退 web_service/.env 或系统环境变量")
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
	err = db.AutoMigrate(
		&auth.Class{},
		&auth.ClassWeeklyMaterial{},
		&auth.ClassTextbook{},
		&auth.User{},
		&grading.GradeResult{},
		&chat.ChatSession{},
		&chat.ChatMessage{},
		&assignment.Assignment{},
		&assignment.AssignmentExercise{},
		&assignment.Submission{},
		&textbook.Textbook{},
		&auth.VerificationCode{},
		&favorite.FavoriteExercise{},
	)
	if err != nil {
		log.Fatalf("GORM AutoMigrate failed: %v", err)
	}
	db.Exec("ALTER TABLE assignments ALTER COLUMN problem_text SET DEFAULT ''")

	log.Println("Successfully connected to the database and migrated schema!")
	return db
}
