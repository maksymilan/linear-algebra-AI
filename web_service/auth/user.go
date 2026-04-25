// web_service/auth/user.go

package auth

import "time"

type Class struct {
	ID          uint      `gorm:"primarykey" json:"id"`
	Name        string    `gorm:"size:255;not null" json:"name"`
	InviteCode  string    `gorm:"size:6;unique;not null" json:"invite_code"`
	TeacherID   uint      `gorm:"not null" json:"teacher_id"`
	CurrentWeek int       `gorm:"default:1" json:"current_week"`
	CreatedAt   time.Time `json:"created_at"`
}

// **新增: 每周课件总结模型**
type ClassWeeklyMaterial struct {
	ID        uint      `gorm:"primarykey" json:"id"`
	ClassID   uint      `gorm:"not null;index;uniqueIndex:idx_class_week" json:"class_id"`
	WeekNum   int       `gorm:"not null;uniqueIndex:idx_class_week" json:"week_num"`
	Summary   string    `gorm:"type:text;not null" json:"summary"`
	CreatedAt time.Time `json:"created_at"`
}

type User struct {
	ID           uint      `gorm:"primarykey" json:"id"`
	Username     string    `gorm:"unique;not null;index" json:"username"`          // 用户名，唯一且加索引
	UserIDNo     string    `gorm:"unique;not null" json:"user_id_no"`              // 用户学工号，唯一且不允许为空
	Email        string    `gorm:"unique;not null" json:"email"`                   // 邮箱保持唯一
	PasswordHash string    `gorm:"not null" json:"-"`                              // 存储哈希后的密码，json:"-"确保不被序列化返回
	Role         string    `gorm:"size:50;not null;default:'student'" json:"role"` // <-- 新增字段：用户角色
	ClassID      *uint     `json:"class_id"`                                       // <-- 新增字段：班级关联
	CreatedAt    time.Time `json:"created_at"`
	DisplayName  string    `gorm:"default:''" json:"displayName"`
	AvatarURL    string    `gorm:"default:''" json:"avatarUrl"`
}
