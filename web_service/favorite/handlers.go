// web_service/favorite/handlers.go
package favorite

import (
	"net/http"
	"strconv"
	"workplace/web_service/accesscontrol"

	"github.com/gin-gonic/gin"
	"gorm.io/gorm"
	"gorm.io/gorm/clause"
)

type FavoriteHandler struct {
	DB *gorm.DB
}

// currentUserID 从 JWT 中间件存入的上下文里取用户 ID（claims["sub"] 为 float64）。
func currentUserID(c *gin.Context) (uint, bool) {
	raw, ok := c.Get("userID")
	if !ok {
		return 0, false
	}
	if f, ok := raw.(float64); ok {
		return uint(f), true
	}
	return 0, false
}

type addFavoriteRequest struct {
	ExerciseID uint `json:"exercise_id" binding:"required"`
}

// Add 收藏一道题（幂等：已收藏则忽略）。
func (h *FavoriteHandler) Add(c *gin.Context) {
	uid, ok := currentUserID(c)
	if !ok {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "未登录"})
		return
	}
	var req addFavoriteRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "需要 exercise_id"})
		return
	}
	allowedIDs, restricted, _, err := accesscontrol.AllowedTextbookIDsForContext(h.DB, c)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "读取班级教材范围失败"})
		return
	}
	var exerciseCount int64
	exerciseQuery := h.DB.Table("textbook_exercises").Where("id = ?", req.ExerciseID)
	if restricted {
		if len(allowedIDs) == 0 {
			c.JSON(http.StatusForbidden, gin.H{"error": "该题目不在当前班级资料范围内"})
			return
		}
		exerciseQuery = exerciseQuery.Where("textbook_id IN ?", allowedIDs)
	}
	if err := exerciseQuery.Count(&exerciseCount).Error; err != nil || exerciseCount == 0 {
		c.JSON(http.StatusForbidden, gin.H{"error": "该题目不在当前可访问范围内"})
		return
	}
	fav := FavoriteExercise{UserID: uid, ExerciseID: req.ExerciseID}
	if err := h.DB.Clauses(clause.OnConflict{DoNothing: true}).Create(&fav).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "收藏失败"})
		return
	}
	c.JSON(http.StatusOK, gin.H{"message": "已收藏"})
}

// Remove 取消收藏。
func (h *FavoriteHandler) Remove(c *gin.Context) {
	uid, ok := currentUserID(c)
	if !ok {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "未登录"})
		return
	}
	exerciseID, err := strconv.Atoi(c.Param("exerciseId"))
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "无效的题目 ID"})
		return
	}
	h.DB.Where("user_id = ? AND exercise_id = ?", uid, exerciseID).Delete(&FavoriteExercise{})
	c.JSON(http.StatusOK, gin.H{"message": "已取消收藏"})
}

// FavoriteItem 收藏夹返回的题目详情。
// 本期不下发 answer/solution（答案受控展示属第二期），仅返回 has_answer 标记。
type FavoriteItem struct {
	ID             uint   `json:"id"`
	Stem           string `json:"stem"`
	ExerciseType   string `json:"exercise_type"`
	QuestionType   string `json:"question_type"`
	HasAnswer      bool   `json:"has_answer"`
	PageNum        *int   `json:"page_num"`
	TextbookName   string `json:"textbook_name"`
	ExerciseNumber string `json:"exercise_number"`
	ConceptTags    string `json:"concept_tags"` // 逗号分隔，前端 split
}

// List 返回当前用户的收藏夹（join 同库的 textbook_exercises 取题目详情）。
// concept_tags 用 array_to_string 转字符串，避开 Go 端 TEXT[] 扫描。
func (h *FavoriteHandler) List(c *gin.Context) {
	uid, ok := currentUserID(c)
	if !ok {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "未登录"})
		return
	}
	allowedIDs, restricted, _, err := accesscontrol.AllowedTextbookIDsForContext(h.DB, c)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "读取班级教材范围失败"})
		return
	}
	if restricted && len(allowedIDs) == 0 {
		c.JSON(http.StatusOK, gin.H{"results": []FavoriteItem{}, "count": 0})
		return
	}

	var items []FavoriteItem
	query := h.DB.Table("favorite_exercises f").
		Select(`
			e.id, e.stem, e.exercise_type, e.question_type, e.has_answer,
			e.page_num, e.textbook_name, e.exercise_number,
			COALESCE(array_to_string(e.concept_tags, ','), '') AS concept_tags
		`).
		Joins("JOIN textbook_exercises e ON e.id = f.exercise_id").
		Where("f.user_id = ?", uid)
	if restricted {
		query = query.Where("e.textbook_id IN ?", allowedIDs)
	}
	err = query.Order("f.created_at DESC").Scan(&items).Error
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "查询收藏失败"})
		return
	}
	c.JSON(http.StatusOK, gin.H{"results": items, "count": len(items)})
}
