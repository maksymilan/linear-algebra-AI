package auth

import "time"

type User struct {
	ID           uint      `gorm:"primarykey" json:"id"`
	Username     string    `gorm:"unique;not null;index" json:"username"` // 用户名，唯一且加索引
	UserIDNo     string    `gorm:"unique;not null" json:"user_id_no"`     // 用户学工号，唯一且不允许为空
	Email        string    `gorm:"unique;not null" json:"email"`          // 邮箱保持唯一
	PasswordHash string    `gorm:"not null" json:"-"`                     // 存储哈希后的密码，json:"-"确保不被序列化返回
	Role         string    `gorm:"not null;default:'student'" json:"role"`
	CreatedAt    time.Time `json:"created_at"`
	DisplayName  string    `gorm:"default:''" json:"displayName"`
	AvatarURL    string    `gorm:"default:''" json:"avatarUrl"`
}
