go mod init workplace/web_service   # 初始化 Go 模块
go get github.com/gin-gonic/gin  # 安装 Gin 框架
go get github.com/gin-contrib/cors # 安装 CORS 中间件
go get github.com/jackc/pgx/v5
go get github.com/joho/godotenv
go get github.com/jackc/pgx/v5/pgxpool@v5.7.5

运行
```bash
go run main.go  # 启动服务
```