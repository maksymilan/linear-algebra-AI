package chat

import (
	"encoding/json"
	"time"

	"gorm.io/gorm"
)

// ChatSession 代表一个完整的对话会话
type ChatSession struct {
	ID        uint           `gorm:"primarykey" json:"id"`
	UserID    uint           `gorm:"index;not null" json:"-"`
	Title     string         `gorm:"size:255" json:"title"`
	CreatedAt time.Time      `json:"createdAt"`
	Messages  []ChatMessage  `gorm:"foreignKey:SessionID;constraint:OnDelete:CASCADE;" json:"messages,omitempty"` // **修复关联键: SessionID**
	DeletedAt gorm.DeletedAt `gorm:"index" json:"-"`
}

// ChatMessage 代表对话中的一条消息
type ChatMessage struct {
	ID            uint      `gorm:"primarykey" json:"id"`
	SessionID     uint      `gorm:"column:session_id;index;not null" json:"chatSessionId"` // **修复: 映射到数据库的 session_id**
	Role          string    `gorm:"column:role;size:20;not null" json:"sender"`            // **修复: 映射到数据库的 role ('user' or 'ai')**
	Content       string    `gorm:"column:content;type:text;not null" json:"text"`         // 消息内容
	Citations     string    `gorm:"column:citations;type:text" json:"-"`                   // **新增: RAG 教材检索引用 (JSON 数组字符串)，自定义 MarshalJSON 暴露为结构化数组**
	FeedbackScore int       `gorm:"column:feedback_score;default:0" json:"feedbackScore"`  // **新增: RLHF 评价**
	CreatedAt     time.Time `gorm:"column:created_at" json:"createdAt"`
}

// MarshalJSON 让 Citations 字段在前端看到的是真正的 JSON 数组而不是一段转义的字符串。
// 存储仍是 TEXT 列（便于跨版本兼容与调试），但出参是结构化的。
func (m ChatMessage) MarshalJSON() ([]byte, error) {
	type alias ChatMessage
	out := struct {
		alias
		Citations json.RawMessage `json:"citations,omitempty"`
	}{alias: alias(m)}
	if m.Citations != "" {
		// 校验是否是合法 JSON，不是就直接忽略，避免把脏数据吐给前端
		if json.Valid([]byte(m.Citations)) {
			out.Citations = json.RawMessage(m.Citations)
		}
	}
	return json.Marshal(out)
}
