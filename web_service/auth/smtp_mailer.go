package auth

import (
	"crypto/tls"
	"fmt"
	"net"
	"net/mail"
	"net/smtp"
	"os"
	"strconv"
	"strings"
)

type SMTPMailer struct {
	Host     string
	Port     int
	Username string
	Password string
	FromName string
}

func NewSMTPMailerFromEnv() Mailer {
	provider := strings.TrimSpace(os.Getenv("MAIL_PROVIDER"))
	if provider != "" && provider != "aliyun_directmail" && provider != "smtp" {
		return nil
	}

	host := strings.TrimSpace(os.Getenv("ALIYUN_DM_SMTP_HOST"))
	if host == "" {
		host = "smtpdm.aliyun.com"
	}
	port := 465
	if raw := strings.TrimSpace(os.Getenv("ALIYUN_DM_SMTP_PORT")); raw != "" {
		if parsed, err := strconv.Atoi(raw); err == nil && parsed > 0 {
			port = parsed
		}
	}
	username := strings.TrimSpace(os.Getenv("ALIYUN_DM_SMTP_USER"))
	password := os.Getenv("ALIYUN_DM_SMTP_PASSWORD")
	fromName := strings.TrimSpace(os.Getenv("ALIYUN_DM_FROM_NAME"))
	if username == "" || password == "" {
		return nil
	}
	return &SMTPMailer{
		Host:     host,
		Port:     port,
		Username: username,
		Password: password,
		FromName: fromName,
	}
}

func (m *SMTPMailer) SendVerificationCode(toEmail, code, purpose string) error {
	subject := "智能助教平台邮箱验证码"
	purposeText := "完成身份验证"
	if purpose == "register" {
		purposeText = "完成账号注册"
	} else if purpose == "password_reset" {
		purposeText = "重置账号密码"
	}
	body := fmt.Sprintf(
		"你的验证码是：%s\n\n该验证码用于%s，10 分钟内有效。若非本人操作，请忽略此邮件。\n",
		code,
		purposeText,
	)

	from := mail.Address{Name: m.FromName, Address: m.Username}
	to := mail.Address{Address: toEmail}
	message := strings.Join([]string{
		fmt.Sprintf("From: %s", from.String()),
		fmt.Sprintf("To: %s", to.String()),
		fmt.Sprintf("Subject: %s", subject),
		"MIME-Version: 1.0",
		"Content-Type: text/plain; charset=UTF-8",
		"",
		body,
	}, "\r\n")

	addr := net.JoinHostPort(m.Host, strconv.Itoa(m.Port))
	auth := smtp.PlainAuth("", m.Username, m.Password, m.Host)
	if m.Port == 465 {
		conn, err := tls.Dial("tcp", addr, &tls.Config{ServerName: m.Host})
		if err != nil {
			return err
		}
		defer conn.Close()

		client, err := smtp.NewClient(conn, m.Host)
		if err != nil {
			return err
		}
		defer client.Quit()

		if err := client.Auth(auth); err != nil {
			return err
		}
		if err := client.Mail(m.Username); err != nil {
			return err
		}
		if err := client.Rcpt(toEmail); err != nil {
			return err
		}
		writer, err := client.Data()
		if err != nil {
			return err
		}
		if _, err := writer.Write([]byte(message)); err != nil {
			writer.Close()
			return err
		}
		return writer.Close()
	}

	return smtp.SendMail(addr, auth, m.Username, []string{toEmail}, []byte(message))
}
