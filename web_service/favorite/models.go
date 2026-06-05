// web_service/favorite/models.go
package favorite

import "time"

// FavoriteExercise 用户对题库题目的收藏关系。
// exercise_id 指向 ai_service 维护的 textbook_exercises.id（同库）。
type FavoriteExercise struct {
	ID         uint      `gorm:"primarykey" json:"id"`
	UserID     uint      `gorm:"not null;uniqueIndex:idx_user_exercise" json:"userId"`
	ExerciseID uint      `gorm:"not null;uniqueIndex:idx_user_exercise" json:"exerciseId"`
	CreatedAt  time.Time `json:"createdAt"`
}
