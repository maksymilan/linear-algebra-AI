// web_service/questionbank/handlers.go
package questionbank

import (
	"bytes"
	"encoding/json"
	"io"
	"net/http"
	"workplace/web_service/aiclient"

	"github.com/gin-gonic/gin"
)

type QuestionBankHandler struct{}

// SearchRequest 题库检索入参（透传给 ai_service）
type SearchRequest struct {
	Query        string   `json:"query"`
	QuestionType string   `json:"question_type,omitempty"`
	ExerciseType string   `json:"exercise_type,omitempty"`
	HasAnswer    *bool    `json:"has_answer,omitempty"`
	ConceptTags  []string `json:"concept_tags,omitempty"`
	Limit        int      `json:"limit,omitempty"`
	Offset       int      `json:"offset,omitempty"`
}

// Search 把题库混合检索请求转发给 ai_service，并原样回传结果。
func (h *QuestionBankHandler) Search(c *gin.Context) {
	var req SearchRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "请求体格式错误"})
		return
	}

	body, _ := json.Marshal(req)
	resp, err := http.Post(
		aiclient.URL("/api/v1/questions/search"),
		"application/json",
		bytes.NewReader(body),
	)
	if err != nil {
		c.JSON(http.StatusBadGateway, gin.H{"error": "AI 服务不可用: " + err.Error()})
		return
	}
	defer resp.Body.Close()

	data, _ := io.ReadAll(resp.Body)
	c.Data(resp.StatusCode, "application/json", data)
}
