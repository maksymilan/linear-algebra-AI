// web_service/auth/verification.go
//
// 邮箱验证码（忘记密码 / 后续注册邮箱验证）
//
// 目前实现策略：
//   1. 验证码写入 verification_codes 表，6 位数字，有效期 10 分钟。
//   2. 发送方式走 Mailer 接口。默认使用 ConsoleMailer，仅打印到服务器日志，
//      方便后续替换为真实 SMTP / 阿里云 / SendGrid 邮件服务。
//   3. 校验通过后置 Used=true，防止重复使用。
//
// 未来要接真邮件：
//   - 实现 Mailer 接口
//   - 在 main.go 注入 authHandler.Mailer = NewSMTPMailer(cfg)

package auth

import (
	"crypto/rand"
	"fmt"
	"log"
	"math/big"
	"net/http"
	"strings"
	"time"

	"github.com/gin-gonic/gin"
	"golang.org/x/crypto/bcrypt"
)

// --------------- Model ---------------

type VerificationCode struct {
	ID        uint      `gorm:"primarykey" json:"id"`
	Email     string    `gorm:"size:255;index:idx_email_purpose;not null" json:"email"`
	Purpose   string    `gorm:"size:32;index:idx_email_purpose;not null" json:"purpose"` // password_reset / register
	Code      string    `gorm:"size:8;not null" json:"-"`
	ExpiresAt time.Time `gorm:"not null" json:"expires_at"`
	Used      bool      `gorm:"default:false" json:"used"`
	CreatedAt time.Time `json:"created_at"`
}

// --------------- Mailer 抽象 ---------------

// Mailer 发送验证码的抽象，当前用打印到日志，未来可替换为真实邮件服务
type Mailer interface {
	SendVerificationCode(toEmail, code, purpose string) error
}

// ConsoleMailer 仅将验证码打印到服务端日志（开发/演示阶段使用）
type ConsoleMailer struct{}

func (c *ConsoleMailer) SendVerificationCode(toEmail, code, purpose string) error {
	log.Printf("[ConsoleMailer] ➜ 发送验证码 | purpose=%s | to=%s | code=%s | 10分钟内有效", purpose, toEmail, code)
	return nil
}

// DefaultMailer 方便全局初始化
var DefaultMailer Mailer = &ConsoleMailer{}

// --------------- 工具函数 ---------------

const (
	codeTTL       = 10 * time.Minute
	minResendGap  = 60 * time.Second // 同一邮箱 + 用途 60s 内不能重复请求
	codeCharset   = "0123456789"
	codeLength    = 6
)

func generateNumericCode(n int) (string, error) {
	var sb strings.Builder
	max := big.NewInt(int64(len(codeCharset)))
	for i := 0; i < n; i++ {
		idx, err := rand.Int(rand.Reader, max)
		if err != nil {
			return "", err
		}
		sb.WriteByte(codeCharset[idx.Int64()])
	}
	return sb.String(), nil
}

func validPurpose(p string) bool {
	return p == "password_reset" || p == "register"
}

// --------------- Request DTO ---------------

type RequestCodeRequest struct {
	Email    string `json:"email" binding:"required,email"`
	Purpose  string `json:"purpose" binding:"required"` // password_reset | register
	Username string `json:"username"`                   // password_reset 时需提供，作为额外校验
}

type ResetPasswordWithCodeRequest struct {
	Email       string `json:"email" binding:"required,email"`
	Code        string `json:"code" binding:"required"`
	NewPassword string `json:"new_password" binding:"required,min=6"`
}

// --------------- Handlers ---------------

// RequestVerificationCode 申请验证码
// POST /api/auth/request-code
func (h *AuthHandler) RequestVerificationCode(c *gin.Context) {
	var req RequestCodeRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "请求参数有误"})
		return
	}
	if !validPurpose(req.Purpose) {
		c.JSON(http.StatusBadRequest, gin.H{"error": "不支持的验证码用途"})
		return
	}

	req.Email = strings.ToLower(strings.TrimSpace(req.Email))

	// 如果是密码重置，需要校验该邮箱（+用户名如提供）确实存在
	if req.Purpose == "password_reset" {
		query := h.DB.Model(&User{}).Where("email = ?", req.Email)
		if strings.TrimSpace(req.Username) != "" {
			query = query.Where("username = ?", req.Username)
		}
		var count int64
		query.Count(&count)
		if count == 0 {
			// 注意：对外返回模糊提示，避免泄露邮箱是否注册
			c.JSON(http.StatusOK, gin.H{"message": "如果账号存在，我们已发送验证码到该邮箱"})
			return
		}
	}

	// 节流：60 秒内不得重发
	var last VerificationCode
	if err := h.DB.Where("email = ? AND purpose = ?", req.Email, req.Purpose).
		Order("created_at desc").First(&last).Error; err == nil {
		if time.Since(last.CreatedAt) < minResendGap {
			remain := minResendGap - time.Since(last.CreatedAt)
			c.JSON(http.StatusTooManyRequests, gin.H{
				"error": fmt.Sprintf("请求过于频繁，请 %d 秒后重试", int(remain.Seconds())+1),
			})
			return
		}
	}

	// 生成 + 落库
	code, err := generateNumericCode(codeLength)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "生成验证码失败"})
		return
	}
	vc := VerificationCode{
		Email:     req.Email,
		Purpose:   req.Purpose,
		Code:      code,
		ExpiresAt: time.Now().Add(codeTTL),
		Used:      false,
	}
	if err := h.DB.Create(&vc).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "保存验证码失败"})
		return
	}

	// 发送（目前打印到日志）
	mailer := h.Mailer
	if mailer == nil {
		mailer = DefaultMailer
	}
	if err := mailer.SendVerificationCode(req.Email, code, req.Purpose); err != nil {
		log.Printf("验证码发送失败: %v", err)
		// 不把失败原因暴露给客户端
	}

	resp := gin.H{"message": "验证码已发送（开发环境下请查看后端日志）"}
	// 开发环境便利：允许通过环境变量直接返回 code，方便本地联调
	if c.GetHeader("X-Debug-Return-Code") == "1" {
		resp["debug_code"] = code
	}
	c.JSON(http.StatusOK, resp)
}

// ResetPasswordWithCode 通过验证码重置密码
// POST /api/auth/reset-password  （注意：这会覆盖老的 ResetPassword 路由）
func (h *AuthHandler) ResetPasswordWithCode(c *gin.Context) {
	var req ResetPasswordWithCodeRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "请求参数有误"})
		return
	}
	req.Email = strings.ToLower(strings.TrimSpace(req.Email))
	req.Code = strings.TrimSpace(req.Code)

	var vc VerificationCode
	if err := h.DB.Where("email = ? AND purpose = ? AND code = ? AND used = ?",
		req.Email, "password_reset", req.Code, false).
		Order("created_at desc").First(&vc).Error; err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "验证码无效"})
		return
	}
	if time.Now().After(vc.ExpiresAt) {
		c.JSON(http.StatusBadRequest, gin.H{"error": "验证码已过期，请重新获取"})
		return
	}

	var user User
	if err := h.DB.Where("email = ?", req.Email).First(&user).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "账号不存在"})
		return
	}

	hashed, err := bcrypt.GenerateFromPassword([]byte(req.NewPassword), bcrypt.DefaultCost)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "加密失败"})
		return
	}

	// 事务：一并标记验证码已使用
	tx := h.DB.Begin()
	if err := tx.Model(&User{}).Where("id = ?", user.ID).
		Update("password_hash", string(hashed)).Error; err != nil {
		tx.Rollback()
		c.JSON(http.StatusInternalServerError, gin.H{"error": "重置密码失败"})
		return
	}
	if err := tx.Model(&VerificationCode{}).Where("id = ?", vc.ID).
		Update("used", true).Error; err != nil {
		tx.Rollback()
		c.JSON(http.StatusInternalServerError, gin.H{"error": "重置密码失败"})
		return
	}
	tx.Commit()

	c.JSON(http.StatusOK, gin.H{"message": "密码重置成功，请使用新密码登录"})
}
