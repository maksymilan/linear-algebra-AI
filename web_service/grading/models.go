package grading

import (
	"time"

	"gorm.io/gorm"
)

// GradeResult 代表一条AI批改作业的记录
type GradeResult struct {
	ID         uint           `gorm:"primarykey" json:"id"`
	UserID     uint           `gorm:"index;not null" json:"-"`
	Filename   string         `json:"filename"`                 // 解答的文件名
	Problem    string         `gorm:"type:text" json:"problem"` // 题目的内容
	Content    string         `gorm:"type:text" json:"content"` // 解答的内容
	Correction string         `gorm:"type:text" json:"correction"`
	CreatedAt  time.Time      `json:"createdAt"`
	DeletedAt  gorm.DeletedAt `gorm:"index" json:"-"`
}
