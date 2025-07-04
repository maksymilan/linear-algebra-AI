// web_service/main.go
package main

import (
	"io"
	"net/http"

	"github.com/gin-contrib/cors"
	"github.com/gin-gonic/gin"
)

func main() {
	r := gin.Default()

	// 配置 CORS (跨域资源共享)，这是连接前端的关键！
	// 允许来自 http://localhost:3000 (React 开发服务器) 的请求
	config := cors.DefaultConfig()
	config.AllowOrigins = []string{"http://localhost:3000", "http://localhost:5173"} // 允许的前端地址
	r.Use(cors.New(config))

	// 定义一个 API 端点
	r.GET("/api/ping", func(c *gin.Context) {
		// 在内部调用 Python 服务的 API
		// 注意：这里的地址是 Python 服务的地址
		resp, err := http.Get("http://localhost:8000/api/v1/greet")
		if err != nil {
			// 如果调用失败，返回服务器错误
			c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to call Python service"})
			return
		}
		defer resp.Body.Close()

		// 读取 Python 服务返回的内容
		body, err := io.ReadAll(resp.Body)
		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to read response from Python service"})
			return
		}

		// 将从 Python 获取的原始 JSON 数据直接转发给前端
		c.Data(http.StatusOK, "application/json", body)
	})

	r.Run(":8080") // 运行在 8080 端口
}
