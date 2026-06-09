package accesscontrol

import (
	"workplace/web_service/auth"

	"github.com/gin-gonic/gin"
	"gorm.io/gorm"
)

func CurrentUserID(c *gin.Context) (uint, bool) {
	raw, ok := c.Get("userID")
	if !ok {
		return 0, false
	}
	switch v := raw.(type) {
	case float64:
		return uint(v), true
	case uint:
		return v, true
	case int:
		return uint(v), true
	default:
		return 0, false
	}
}

func CurrentRole(c *gin.Context) string {
	raw, ok := c.Get("userRole")
	if !ok {
		return ""
	}
	role, _ := raw.(string)
	return role
}

func CurrentUser(db *gorm.DB, c *gin.Context) (auth.User, bool, error) {
	uid, ok := CurrentUserID(c)
	if !ok {
		return auth.User{}, false, nil
	}
	var user auth.User
	if err := db.First(&user, uid).Error; err != nil {
		return auth.User{}, true, err
	}
	return user, true, nil
}

func AllowedTextbookIDsForUser(db *gorm.DB, user auth.User) ([]uint, bool, error) {
	if user.Role != "student" {
		return nil, false, nil
	}
	if user.ClassID == nil {
		return []uint{}, true, nil
	}
	var ids []uint
	err := db.Model(&auth.ClassTextbook{}).
		Where("class_id = ?", *user.ClassID).
		Order("textbook_id asc").
		Pluck("textbook_id", &ids).Error
	return ids, true, err
}

func AllowedTextbookIDsForContext(db *gorm.DB, c *gin.Context) ([]uint, bool, auth.User, error) {
	user, exists, err := CurrentUser(db, c)
	if err != nil || !exists {
		return nil, false, auth.User{}, err
	}
	ids, restricted, err := AllowedTextbookIDsForUser(db, user)
	return ids, restricted, user, err
}
