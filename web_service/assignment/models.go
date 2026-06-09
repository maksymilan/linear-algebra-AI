// web_service/assignment/models.go

package assignment

import (
	"time"

	"gorm.io/gorm"
)

// Assignment 代表老师发布的一份作业 (已更新)
type Assignment struct {
	ID          uint   `gorm:"primarykey" json:"id"`
	TeacherID   uint   `gorm:"not null" json:"teacherId"`
	ClassID     *uint  `gorm:"index" json:"classId,omitempty"`
	Title       string `gorm:"size:255;not null" json:"title"`
	ProblemText string `gorm:"type:text;not null" json:"problemText"`
	// **↓↓↓ 新增字段 ↓↓↓**
	ProblemFilePath string `gorm:"size:255" json:"problemFilePath,omitempty"` // 存储题目附件的路径
	ProblemFileName string `gorm:"size:255" json:"problemFileName,omitempty"` // 存储题目附件的原始文件名
	ProblemFileURL  string `gorm:"-" json:"problemFileUrl,omitempty"`

	CreatedAt       time.Time                   `json:"createdAt"`
	DeletedAt       gorm.DeletedAt              `gorm:"index" json:"-"`
	AssignmentItems []AssignmentExercise        `gorm:"foreignKey:AssignmentID" json:"-"`
	ExerciseIDs     []uint                      `gorm:"-" json:"exerciseIds,omitempty"`
	Exercises       []AssignmentExerciseContent `gorm:"-" json:"exercises,omitempty"`
	Submissions     []Submission                `gorm:"foreignKey:AssignmentID" json:"submissions,omitempty"`
}

type AssignmentExercise struct {
	ID           uint      `gorm:"primarykey" json:"id"`
	AssignmentID uint      `gorm:"not null;uniqueIndex:idx_assignment_exercise;index" json:"assignmentId"`
	ExerciseID   uint      `gorm:"not null;uniqueIndex:idx_assignment_exercise;index" json:"exerciseId"`
	Position     int       `gorm:"default:0" json:"position"`
	CreatedAt    time.Time `json:"createdAt"`
}

type AssignmentExerciseContent struct {
	ID             uint   `json:"id"`
	TextbookID     *uint  `json:"textbook_id,omitempty"`
	TextbookName   string `json:"textbook_name"`
	PageNum        *int   `json:"page_num,omitempty"`
	ExerciseNumber string `json:"exercise_number"`
	Stem           string `json:"stem"`
	ConceptTags    string `json:"concept_tags"`
	ExerciseType   string `json:"exercise_type"`
	QuestionType   string `json:"question_type"`
	HasAnswer      bool   `json:"has_answer"`
}

// Submission 结构体保持不变
type Submission struct {
	ID               uint           `gorm:"primarykey" json:"id"`
	AssignmentID     uint           `gorm:"not null;index" json:"assignmentId"`
	StudentID        uint           `gorm:"not null;index" json:"studentId"`
	StudentName      string         `gorm:"-" json:"studentName"`
	SolutionFilePath string         `gorm:"size:255;not null" json:"solutionFilePath"`
	SolutionFileName string         `gorm:"size:255;not null" json:"solutionFileName"`
	Comment          string         `gorm:"type:text" json:"comment"`
	Status           string         `gorm:"size:50;default:'submitted'" json:"status"`
	GradedAt         time.Time      `json:"gradedAt,omitempty"`
	CreatedAt        time.Time      `json:"createdAt"`
	DeletedAt        gorm.DeletedAt `gorm:"index" json:"-"`
}
