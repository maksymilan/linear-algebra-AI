package textbook

import (
	"bytes"
	"fmt"
	"mime/multipart"
	"net/http"
	"os"
	"path/filepath"
	"time"

	"github.com/gin-gonic/gin"
	"gorm.io/gorm"
)

type Textbook struct {
	ID             uint      `gorm:"primarykey" json:"id"`
	Name           string    `gorm:"size:255;not null" json:"name"`
	FilePath       string    `gorm:"size:255" json:"file_path"`
	Status         string    `gorm:"size:50;default:'processing'" json:"status"` // processing, completed, failed
	TotalPages     int       `gorm:"default:0" json:"total_pages"`
	ProcessedPages int       `gorm:"default:0" json:"processed_pages"`
	CreatedAt      time.Time `json:"created_at"`
}

type TextbookHandler struct {
	DB *gorm.DB
}

// 获取教材列表
func (h *TextbookHandler) GetTextbooks(c *gin.Context) {
	var textbooks []Textbook
	if err := h.DB.Order("created_at desc").Find(&textbooks).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to fetch textbooks"})
		return
	}
	c.JSON(http.StatusOK, textbooks)
}

// 老师上传新教材
func (h *TextbookHandler) UploadTextbook(c *gin.Context) {
	name := c.PostForm("name")
	if name == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "需要提供教材名称"})
		return
	}

	file, err := c.FormFile("file")
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "未检测到上传的文件"})
		return
	}

	// 将文件保存到本地
	uploadDir := "uploads/textbooks"
	os.MkdirAll(uploadDir, os.ModePerm)
	fileName := fmt.Sprintf("%d_%s", time.Now().Unix(), file.Filename)
	filePath := filepath.Join(uploadDir, fileName)

	if err := c.SaveUploadedFile(file, filePath); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "保存文件失败"})
		return
	}

	// 存入数据库状态为处理中
	tb := Textbook{
		Name:     name,
		FilePath: filePath,
		Status:   "processing",
	}
	if err := h.DB.Create(&tb).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "创建数据库记录失败"})
		return
	}

	// 获取绝对路径以传给 Python 服务
	absPath, _ := filepath.Abs(filePath)

	// 异步调用 Python AI 服务进行 OCR 和 Embedding
	go func(path string, tbName string, id uint) {
		reqBody := &bytes.Buffer{}
		writer := multipart.NewWriter(reqBody)
		_ = writer.WriteField("file_path", path)
		_ = writer.WriteField("textbook_name", tbName)
		_ = writer.WriteField("textbook_id", fmt.Sprintf("%d", id))
		writer.Close()

		req, err := http.NewRequest("POST", "http://localhost:8000/api/v1/textbook/ingest", reqBody)
		if err == nil {
			req.Header.Set("Content-Type", writer.FormDataContentType())
			client := &http.Client{}
			client.Do(req) // 发送即忘，Python 那边是后台任务，会自己改数据库
		}
	}(absPath, tb.Name, tb.ID)

	c.JSON(http.StatusOK, gin.H{
		"message":  "教材已上传，后台正在进行 OCR 和向量化处理...",
		"textbook": tb,
	})
}

// 老师取消上传教材
func (h *TextbookHandler) CancelTextbook(c *gin.Context) {
	id := c.Param("id")
	if id == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "需要提供教材 ID"})
		return
	}

	var tb Textbook
	if err := h.DB.First(&tb, id).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "找不到该教材"})
		return
	}

	if tb.Status == "completed" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "该教材已完成解析，无法取消"})
		return
	}

	if tb.Status == "canceled" {
		c.JSON(http.StatusOK, gin.H{"message": "该教材已处于取消状态"})
		return
	}

	tb.Status = "canceled"
	if err := h.DB.Save(&tb).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "取消失败"})
		return
	}

	c.JSON(http.StatusOK, gin.H{"message": "已取消该教材的解析任务"})
}

// 老师删除教材（级联删除向量库 chunks）
func (h *TextbookHandler) DeleteTextbook(c *gin.Context) {
	id := c.Param("id")
	if id == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "需要提供教材 ID"})
		return
	}

	var tb Textbook
	if err := h.DB.First(&tb, id).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "找不到该教材"})
		return
	}

	// 调用 Python AI 服务删除向量库中的 chunks
	reqBody := &bytes.Buffer{}
	writer := multipart.NewWriter(reqBody)
	_ = writer.WriteField("textbook_id", fmt.Sprintf("%d", tb.ID))
	_ = writer.WriteField("textbook_name", tb.Name)
	writer.Close()

	req, err := http.NewRequest("POST", "http://localhost:8000/api/v1/textbook/delete", reqBody)
	if err == nil {
		req.Header.Set("Content-Type", writer.FormDataContentType())
		client := &http.Client{}
		resp, err := client.Do(req)
		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "删除向量库数据失败"})
			return
		}
		defer resp.Body.Close()
		if resp.StatusCode != http.StatusOK {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "向量库删除返回异常"})
			return
		}
	}

	// 删除本地文件
	if tb.FilePath != "" {
		_ = os.Remove(tb.FilePath)
	}

	// 删除数据库记录
	if err := h.DB.Delete(&tb).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "删除数据库记录失败"})
		return
	}

	c.JSON(http.StatusOK, gin.H{"message": "已删除该教材及其向量库数据"})
}
