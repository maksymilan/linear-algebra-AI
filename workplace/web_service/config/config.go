// workplace/web_service/config/config.go
package config

import (
	"log"
	"os"
	"workplace/web_service/auth"

	"github.com/joho/godotenv"
	"gorm.io/driver/postgres"
	"gorm.io/gorm"
)

func ConnectDB() *gorm.DB {
	// ... (dotenv and dsn loading logic remains the same) ...
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

	// 自动迁移：GORM现在只会处理User表
	log.Println("Running GORM AutoMigrate for User model...")
	err = db.AutoMigrate(&auth.User{})
	if err != nil {
		log.Fatalf("GORM AutoMigrate failed: %v", err)
	}

	log.Println("Successfully connected to the database and migrated schema!")
	return db
}
