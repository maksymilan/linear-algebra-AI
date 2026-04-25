# Linear Algebra AI 助教系统 (V2.0)

本项目是一个专为学习和教授线性代数设计的 AI 辅助教育平台，包含基于大模型的知识问答、作业批改以及 3D 几何可视化引擎。

## 目录结构
项目由三个独立的服务模块构成：
- `frontend/` : React + Vite + TailwindCSS 构建的前端界面。
- `web_service/` : Go + Gin 构建的业务核心后端。
- `ai_service/` : Python + FastAPI 构建的 AI 大模型推理服务。

---

## 🚀 项目启动指南

要完整体验项目功能，你需要按照以下顺序启动所有依赖和服务：

### 1. 启动数据库 (PostgreSQL + pgvector)
项目依赖带有向量检索扩展的 PostgreSQL 15 数据库。请确保你已安装并运行了 Docker Desktop。

```bash
# 1. 为新数据库创建一个本地数据文件夹
mkdir -p ~/docker-volumes/LA-AI_data

# 2. 运行带有 pgvector 扩展的容器
docker run --name LA-AI \
  -e POSTGRES_PASSWORD=password \
  -e POSTGRES_DB=LA-DB \
  -p 5432:5432 \
  -d \
  -v LA-AI_data:/var/lib/postgresql/data \
  pgvector/pgvector:pg15

# 3. 初始化 V2.0 数据库表结构 (在项目根目录下执行)
docker exec -i LA-AI psql -U postgres -d LA-DB < init_v2.sql
```

---

### 2. 启动业务后端 (Go Web Service)
该服务运行在 `8080` 端口，负责鉴权、数据库交互和路由转发。

```bash
# 1. 进入后端目录
cd web_service

# 2. 配置环境变量
# 在 web_service 目录下新建一个 .env 文件，并写入以下内容：
echo 'DB_SOURCE="host=localhost user=postgres password=password dbname=LA-DB port=5432 sslmode=disable TimeZone=Asia/Shanghai"' > .env

# 3. 下载依赖并启动服务
go mod tidy
go run main.go
```
*启动成功后，可访问 `http://localhost:8080/api/health/db` 检查数据库连接状态。*

---

### 3. 启动 AI 服务 (Python FastAPI)
该服务运行在 `8000` 端口，负责处理大模型对话、RAG 检索和 OCR 识别。

```bash
# 1. 进入 AI 服务目录
cd ai_service

# 2. 创建并激活虚拟环境 (强烈推荐)
python -m venv venv
source venv/bin/activate  # Windows 用户请使用 venv\Scripts\activate

# 3. 安装依赖
pip install "uvicorn[standard]" fastapi pymupdf python-dotenv openai

# 4. 配置大模型 API 密钥
# 在 ai_service 目录下新建一个 .env 文件，并写入你的配置 (以 Gemini 为例)：
echo 'AI_API_KEY="你的_API_KEY"' > .env
echo 'AI_BASE_URL="https://aihubmix.com/v1"' >> .env
echo 'AI_MODEL_NAME="gemini-3.1-pro-preview"' >> .env
echo 'AI_VL_MODEL_NAME="gemini-3.1-pro-preview"' >> .env

# 5. 启动服务
python -m uvicorn main:app --reload --port 8000
```

---

### 4. 启动前端页面 (React + Vite)
这是用户直接访问的网页端。

```bash
# 1. 进入前端目录
cd frontend

# 2. 安装依赖 (包括新引入的 TailwindCSS 和 Math.js)
npm install

# 3. 启动开发服务器
npm run dev
```
运行成功后，终端会打印出本地网页访问地址（通常为 `http://localhost:5173/`）。点击链接即可在浏览器中开始使用 Linear Algebra AI 系统！