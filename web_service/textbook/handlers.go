package textbook

import (
	"bytes"
	"fmt"
	"mime/multipart"
	"net/http"
	"os"
	"path/filepath"
	"time"
	"workplace/web_service/accesscontrol"
	"workplace/web_service/aiclient"
	"workplace/web_service/auth"

	"github.com/gin-gonic/gin"
	"gorm.io/gorm"
	"gorm.io/gorm/clause"
)

type Textbook struct {
	ID               uint      `gorm:"primarykey" json:"id"`
	TeacherID        uint      `gorm:"index" json:"teacher_id"`
	Name             string    `gorm:"size:255;not null" json:"name"`
	FilePath         string    `gorm:"size:255" json:"file_path"`
	Status           string    `gorm:"size:50;default:'processing'" json:"status"` // processing, completed, failed
	TotalPages       int       `gorm:"default:0" json:"total_pages"`
	ProcessedPages   int       `gorm:"default:0" json:"processed_pages"`
	CreatedAt        time.Time `json:"created_at"`
	SelectedClassIDs []uint    `gorm:"-" json:"selected_class_ids,omitempty"`
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

	if len(textbooks) > 0 {
		teacherID, _ := accesscontrol.CurrentUserID(c)
		var links []auth.ClassTextbook
		if err := h.DB.Table("class_textbooks ct").
			Select("ct.id, ct.class_id, ct.textbook_id, ct.created_at").
			Joins("JOIN classes c ON c.id = ct.class_id").
			Where("c.teacher_id = ?", teacherID).
			Scan(&links).Error; err == nil {
			selectedByTextbook := map[uint][]uint{}
			for _, link := range links {
				selectedByTextbook[link.TextbookID] = append(selectedByTextbook[link.TextbookID], link.ClassID)
			}
			for i := range textbooks {
				textbooks[i].SelectedClassIDs = selectedByTextbook[textbooks[i].ID]
			}
		}
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
	// filepath.Base 防止文件名带 ../ 造成路径穿越（写到上传目录之外）
	fileName := fmt.Sprintf("%d_%s", time.Now().Unix(), filepath.Base(file.Filename))
	filePath := filepath.Join(uploadDir, fileName)

	if err := c.SaveUploadedFile(file, filePath); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "保存文件失败"})
		return
	}

	// 存入数据库状态为处理中
	teacherID, _ := accesscontrol.CurrentUserID(c)
	tb := Textbook{
		TeacherID: teacherID,
		Name:      name,
		FilePath:  filePath,
		Status:    "processing",
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

		req, err := http.NewRequest("POST", aiclient.URL("/api/v1/textbook/ingest"), reqBody)
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

// SetClassTextbooks 将某个班级可见的教材列表替换为 teacher 当前选择。
func (h *TextbookHandler) SetClassTextbooks(c *gin.Context) {
	classID := c.Param("id")
	teacherID, ok := accesscontrol.CurrentUserID(c)
	if !ok {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "未登录"})
		return
	}

	var cls auth.Class
	if err := h.DB.Where("id = ? AND teacher_id = ?", classID, teacherID).First(&cls).Error; err != nil {
		c.JSON(http.StatusForbidden, gin.H{"error": "无权操作该班级"})
		return
	}

	var req struct {
		TextbookIDs []uint `json:"textbook_ids"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "请求体格式错误"})
		return
	}

	if len(req.TextbookIDs) > 0 {
		var count int64
		if err := h.DB.Model(&Textbook{}).Where("id IN ?", req.TextbookIDs).Count(&count).Error; err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "校验教材失败"})
			return
		}
		if count != int64(len(req.TextbookIDs)) {
			c.JSON(http.StatusBadRequest, gin.H{"error": "包含不存在的教材"})
			return
		}
	}

	tx := h.DB.Begin()
	if err := tx.Where("class_id = ?", cls.ID).Delete(&auth.ClassTextbook{}).Error; err != nil {
		tx.Rollback()
		c.JSON(http.StatusInternalServerError, gin.H{"error": "更新教材范围失败"})
		return
	}
	if len(req.TextbookIDs) > 0 {
		links := make([]auth.ClassTextbook, 0, len(req.TextbookIDs))
		seen := map[uint]bool{}
		for _, textbookID := range req.TextbookIDs {
			if textbookID == 0 || seen[textbookID] {
				continue
			}
			seen[textbookID] = true
			links = append(links, auth.ClassTextbook{ClassID: cls.ID, TextbookID: textbookID})
		}
		if len(links) > 0 {
			if err := tx.Clauses(clause.OnConflict{DoNothing: true}).Create(&links).Error; err != nil {
				tx.Rollback()
				c.JSON(http.StatusInternalServerError, gin.H{"error": "保存教材范围失败"})
				return
			}
		}
	}
	tx.Commit()

	c.JSON(http.StatusOK, gin.H{"message": "班级教材范围已更新", "textbook_ids": req.TextbookIDs})
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
	teacherID, _ := accesscontrol.CurrentUserID(c)
	if tb.TeacherID != 0 && tb.TeacherID != teacherID {
		c.JSON(http.StatusForbidden, gin.H{"error": "只能取消自己上传的教材解析"})
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
	teacherID, _ := accesscontrol.CurrentUserID(c)
	if tb.TeacherID != 0 && tb.TeacherID != teacherID {
		c.JSON(http.StatusForbidden, gin.H{"error": "只能删除自己上传的教材"})
		return
	}

	// 调用 Python AI 服务删除向量库中的 chunks
	reqBody := &bytes.Buffer{}
	writer := multipart.NewWriter(reqBody)
	_ = writer.WriteField("textbook_id", fmt.Sprintf("%d", tb.ID))
	_ = writer.WriteField("textbook_name", tb.Name)
	writer.Close()

	req, err := http.NewRequest("POST", aiclient.URL("/api/v1/textbook/delete"), reqBody)
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
	tx := h.DB.Begin()
	if err := tx.Where("textbook_id = ?", tb.ID).Delete(&auth.ClassTextbook{}).Error; err != nil {
		tx.Rollback()
		c.JSON(http.StatusInternalServerError, gin.H{"error": "删除教材关联失败"})
		return
	}
	if err := tx.Delete(&tb).Error; err != nil {
		tx.Rollback()
		c.JSON(http.StatusInternalServerError, gin.H{"error": "删除数据库记录失败"})
		return
	}
	tx.Commit()

	c.JSON(http.StatusOK, gin.H{"message": "已删除该教材及其向量库数据"})
}
