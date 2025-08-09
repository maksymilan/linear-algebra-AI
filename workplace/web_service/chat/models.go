package chat

import (
	"time"

	"gorm.io/gorm"
)

// ChatSession 代表一个完整的对话会话
type ChatSession struct {
	ID        uint           `gorm:"primarykey" json:"id"`
	UserID    uint           `gorm:"index;not null" json:"-"`
	Title     string         `gorm:"size:255" json:"title"`
	CreatedAt time.Time      `json:"createdAt"`
	Messages  []ChatMessage  `gorm:"foreignKey:ChatSessionID;constraint:OnDelete:CASCADE;" json:"messages,omitempty"` // 关联消息, 级联删除
	DeletedAt gorm.DeletedAt `gorm:"index" json:"-"`
}

// ChatMessage 代表对话中的一条消息
type ChatMessage struct {
	ID            uint      `gorm:"primarykey" json:"id"`
	ChatSessionID uint      `gorm:"index;not null" json:"chatSessionId"`
	Sender        string    `gorm:"size:50" json:"sender"` // 'user' or 'ai'
	Content       string    `gorm:"type:text" json:"text"` // 消息内容
	CreatedAt     time.Time `json:"createdAt"`
}
