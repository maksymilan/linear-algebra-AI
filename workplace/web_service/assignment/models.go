// web_service/assignment/models.go

package assignment

import (
	"time"

	"gorm.io/gorm"
)

// Assignment 代表老师发布的一份作业
type Assignment struct {
	ID          uint           `gorm:"primarykey" json:"id"`
	TeacherID   uint           `gorm:"not null" json:"teacherId"`
	Title       string         `gorm:"size:255;not null" json:"title"`
	ProblemText string         `gorm:"type:text;not null" json:"problemText"`
	CreatedAt   time.Time      `json:"createdAt"`
	DeletedAt   gorm.DeletedAt `gorm:"index" json:"-"`
	Submissions []Submission   `gorm:"foreignKey:AssignmentID" json:"submissions,omitempty"`
}

// Submission 代表学生提交的一份作业
type Submission struct {
	ID           uint           `gorm:"primarykey" json:"id"`
	AssignmentID uint           `gorm:"not null;index" json:"assignmentId"`
	StudentID    uint           `gorm:"not null;index" json:"studentId"`
	StudentName  string         `gorm:"-" json:"studentName"` // 用于前端显示，从User表Join
	SolutionText string         `gorm:"type:text;not null" json:"solutionText"`
	Correction   string         `gorm:"type:text" json:"correction,omitempty"`     // AI的批改结果
	Status       string         `gorm:"size:50;default:'submitted'" json:"status"` // 'submitted', 'graded'
	GradedAt     time.Time      `json:"gradedAt,omitempty"`
	CreatedAt    time.Time      `json:"createdAt"`
	DeletedAt    gorm.DeletedAt `gorm:"index" json:"-"`
}
