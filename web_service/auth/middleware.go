// web_service/auth/middleware.go

package auth

import (
	"fmt"
	"net/http"
	"os"
	"strings"

	"github.com/gin-gonic/gin"
	"github.com/golang-jwt/jwt/v5"
)

// parseToken 是一个内部函数，用于解析和验证Token
func parseToken(c *gin.Context) (jwt.MapClaims, error) {
	authHeader := c.GetHeader("Authorization")
	if authHeader == "" {
		return nil, fmt.Errorf("authorization header is required")
	}

	parts := strings.Split(authHeader, " ")
	if len(parts) != 2 || parts[0] != "Bearer" {
		return nil, fmt.Errorf("authorization header format must be Bearer {token}")
	}
	tokenString := parts[1]
	secretKey := os.Getenv("JWT_SECRET")
	if secretKey == "" {
		secretKey = "a_default_secret_key"
	}

	token, err := jwt.Parse(tokenString, func(token *jwt.Token) (interface{}, error) {
		if _, ok := token.Method.(*jwt.SigningMethodHMAC); !ok {
			return nil, jwt.ErrSignatureInvalid
		}
		return []byte(secretKey), nil
	})

	if err != nil {
		return nil, fmt.Errorf("invalid token: %v", err)
	}

	if claims, ok := token.Claims.(jwt.MapClaims); ok && token.Valid {
		return claims, nil
	}

	return nil, fmt.Errorf("invalid token claims")
}

// AuthMiddleware 仅验证用户是否已登录
func AuthMiddleware() gin.HandlerFunc {
	return func(c *gin.Context) {
		claims, err := parseToken(c)
		if err != nil {
			c.JSON(http.StatusUnauthorized, gin.H{"error": err.Error()})
			c.Abort()
			return
		}
		c.Set("userID", claims["sub"])
		c.Set("userRole", claims["role"]) // 将角色也存入上下文
		c.Next()
	}
}

// **↓↓↓ 新增：教师角色验证中间件 ↓↓↓**
func TeacherMiddleware() gin.HandlerFunc {
	return func(c *gin.Context) {
		role, exists := c.Get("userRole")
		if !exists || role.(string) != "teacher" {
			c.JSON(http.StatusForbidden, gin.H{"error": "Access denied: requires teacher role"})
			c.Abort()
			return
		}
		c.Next()
	}
}

// **↓↓↓ 新增：学生角色验证中间件 ↓↓↓**
func StudentMiddleware() gin.HandlerFunc {
	return func(c *gin.Context) {
		role, exists := c.Get("userRole")
		if !exists || role.(string) != "student" {
			c.JSON(http.StatusForbidden, gin.H{"error": "Access denied: requires student role"})
			c.Abort()
			return
		}
		c.Next()
	}
}
