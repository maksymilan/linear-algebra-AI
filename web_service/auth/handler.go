// web_service/auth/handler.go

package auth

import (
	"net/http"
	"os"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/golang-jwt/jwt/v5"
	"golang.org/x/crypto/bcrypt"
	"gorm.io/gorm"
)

type AuthHandler struct {
	DB     *gorm.DB
	Mailer Mailer // 邮件/验证码发送器，nil 时使用 DefaultMailer（控制台打印）
}

// **↓↓↓ 修改注册请求结构体 ↓↓↓**
type RegisterRequest struct {
	Username   string `json:"username" binding:"required,min=4"`
	Email      string `json:"email" binding:"required,email"`
	Password   string `json:"password" binding:"required,min=6"`
	UserIDNo   string `json:"user_id_no" binding:"required"`
	Role       string `json:"role" binding:"required"` // **直接要求前端提供角色**
	InviteCode string `json:"invite_code"`             // 可选参数：班级邀请码
}

type LoginRequest struct {
	Username string `json:"username" binding:"required"`
	Password string `json:"password" binding:"required"`
}

// **↓↓↓ 废弃结构体：旧的无验证码重置密码请求，新版请使用 ResetPasswordWithCodeRequest（verification.go） ↓↓↓**
// type ResetPasswordRequest struct { ... }

func (h *AuthHandler) Register(c *gin.Context) {
	var req RegisterRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid input: " + err.Error()})
		return
	}

	// **↓↓↓ 验证角色是否合法 ↓↓↓**
	if req.Role != "student" && req.Role != "teacher" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid role specified"})
		return
	}

	var existingUser User
	if h.DB.Where("username = ? OR email = ? OR user_id_no = ?", req.Username, req.Email, req.UserIDNo).First(&existingUser).Error == nil {
		c.JSON(http.StatusConflict, gin.H{"error": "用户名、邮箱或学工号已存在"})
		return
	}

	hashedPassword, err := bcrypt.GenerateFromPassword([]byte(req.Password), bcrypt.DefaultCost)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to hash password"})
		return
	}

	newUser := User{
		Username:     req.Username,
		Email:        req.Email,
		UserIDNo:     req.UserIDNo,
		PasswordHash: string(hashedPassword),
		Role:         req.Role, // **直接使用前端提供的角色**
	}

	// 如果提供了邀请码，查询班级
	if req.InviteCode != "" {
		var class Class
		if err := h.DB.Where("invite_code = ?", req.InviteCode).First(&class).Error; err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": "无效的班级邀请码"})
			return
		}
		newUser.ClassID = &class.ID
	}

	if result := h.DB.Create(&newUser); result.Error != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to create user"})
		return
	}

	c.JSON(http.StatusCreated, gin.H{"message": "User registered successfully"})
}

// Login 函数保持不变，它已经可以正确处理带有角色的Token
func (h *AuthHandler) Login(c *gin.Context) {
	var req LoginRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid input"})
		return
	}

	var user User
	if err := h.DB.Where("username = ?", req.Username).First(&user).Error; err != nil {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "用户名或密码错误"})
		return
	}

	if err := bcrypt.CompareHashAndPassword([]byte(user.PasswordHash), []byte(req.Password)); err != nil {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "用户名或密码错误"})
		return
	}

	displayName := user.DisplayName
	if displayName == "" {
		displayName = user.Username
	}

	token := jwt.NewWithClaims(jwt.SigningMethodHS256, jwt.MapClaims{
		"sub":         user.ID,
		"name":        user.Username,
		"role":        user.Role,
		"displayName": displayName,
		"avatarUrl":   user.AvatarURL,
		"exp":         time.Now().Add(time.Hour * 24 * 30).Unix(), // 开发环境：延长至30天过期
	})

	jwtSecret := os.Getenv("JWT_SECRET")
	if jwtSecret == "" {
		jwtSecret = "a_default_secret_key"
	}

	tokenString, err := token.SignedString([]byte(jwtSecret))
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to generate token"})
		return
	}

	c.JSON(http.StatusOK, gin.H{"token": tokenString})
}

// **↓↓↓ 旧的简易版重置密码已废弃，改为使用 verification.go 中的 ResetPasswordWithCode ↓↓↓**
// func (h *AuthHandler) ResetPassword(...) —— 保留历史注释占位，不再实现
