package auth

import (
	"context"
	"crypto/rand"
	"log"
	"net/http"
	"os"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/golang-jwt/jwt/v5"
	"github.com/jackc/pgx/v5/pgxpool"
)

// AuthHandler 包含处理认证请求所需的所有依赖
type AuthHandler struct {
	DB *pgxpool.Pool
}

// --- 新的请求结构体 ---

type SendCodeRequest struct {
	Email string `json:"email" binding:"required,email"`
}

type VerifyRequest struct {
	Email    string `json:"email" binding:"required,email"`
	Code     string `json:"code" binding:"required"`
	UserIDNo string `json:"user_id_no"` // 仅在注册新用户时需要
}

// --- 新的 Handler 方法 ---

// SendCode 生成验证码并“发送”给用户
func (h *AuthHandler) SendCode(c *gin.Context) {
	var req SendCodeRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid email provided"})
		return
	}

	// 1. 生成一个6位随机数字验证码
	code := generateRandomCode(6)

	// 2. 将验证码存入数据库，有效期10分钟
	expiresAt := time.Now().Add(10 * time.Minute)
	sql := "INSERT INTO verification_codes (email, code, expires_at) VALUES ($1, $2, $3)"
	_, err := h.DB.Exec(context.Background(), sql, req.Email, code, expiresAt)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to store verification code"})
		return
	}

	// 3. **重要：模拟发送邮件**
	// 在真实世界中，这里会调用邮件服务API。为了测试，我们直接在控制台打印出来。
	log.Printf("====== EMAIL SIMULATION ======\n")
	log.Printf("TO: %s\n", req.Email)
	log.Printf("SUBJECT: Your Login Code\n")
	log.Printf("BODY: Your verification code is: %s\n", code)
	log.Printf("============================\n")

	c.JSON(http.StatusOK, gin.H{"message": "Verification code sent successfully."})
}

// Verify 验证用户提交的验证码，并完成登录或注册
func (h *AuthHandler) Verify(c *gin.Context) {
	var req VerifyRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid input"})
		return
	}

	// 1. 验证验证码是否正确且未过期
	var storedCode string
	sqlVerify := "SELECT code FROM verification_codes WHERE email = $1 AND code = $2 AND expires_at > NOW()"
	err := h.DB.QueryRow(context.Background(), sqlVerify, req.Email, req.Code).Scan(&storedCode)
	if err != nil {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "Invalid or expired verification code"})
		return
	}

	// 2. 验证码使用后立即删除，防止重放攻击
	sqlDelete := "DELETE FROM verification_codes WHERE email = $1 AND code = $2"
	_, _ = h.DB.Exec(context.Background(), sqlDelete, req.Email, req.Code)

	// 3. 检查用户是否存在
	var user User
	sqlFindUser := "SELECT id, user_id_no, email, role FROM users WHERE email = $1"
	err = h.DB.QueryRow(context.Background(), sqlFindUser, req.Email).Scan(&user.ID, &user.UserIDNo, &user.Email, &user.Role)

	if err != nil { // 用户不存在，走注册流程
		if req.UserIDNo == "" {
			c.JSON(http.StatusBadRequest, gin.H{"error": "User ID is required for new user registration"})
			return
		}
		sqlRegister := "INSERT INTO users (user_id_no, email) VALUES ($1, $2) RETURNING id, user_id_no, email, role"
		errReg := h.DB.QueryRow(context.Background(), sqlRegister, req.UserIDNo, req.Email).Scan(&user.ID, &user.UserIDNo, &user.Email, &user.Role)
		if errReg != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to create new user"})
			return
		}
	}

	// 4. 用户已存在或已创建，生成JWT
	token := jwt.NewWithClaims(jwt.SigningMethodHS256, jwt.MapClaims{
		"sub":  user.ID,
		"role": user.Role,
		"uidn": user.UserIDNo,
		"exp":  time.Now().Add(time.Hour * 24 * 7).Unix(),
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

	c.JSON(http.StatusOK, gin.H{"token": tokenString, "user": user})
}

// generateRandomCode 生成指定长度的随机数字字符串
func generateRandomCode(length int) string {
	b := make([]byte, length)
	n, err := rand.Read(b)
	if n != length || err != nil {
		return "123456" // Fallback
	}
	for i := range b {
		b[i] = '0' + (b[i] % 10)
	}
	return string(b)
}
