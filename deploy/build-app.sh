#!/usr/bin/env bash
# 在服务器上构建三端产物（代码已就位、依赖已装、根 .env 已配置后执行）。
# 用法：bash deploy/build-app.sh
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"
echo "项目根目录：$ROOT"

# 0) 根 .env 检查
if [ ! -f "$ROOT/.env" ]; then
  echo "❌ 缺少根目录 .env，请先 cp deploy/.env.example .env 并填值"; exit 1
fi

# 1) 前端：安装依赖并构建静态产物到 frontend/dist
echo "==> 构建前端 (vite build) …"
cd "$ROOT/frontend"
npm ci || npm install
npm run build
echo "✅ 前端产物：$ROOT/frontend/dist"

# 2) ai_service：创建 venv 并装依赖
echo "==> 准备 ai_service Python venv …"
cd "$ROOT/ai_service"
if [ ! -d ".venv" ]; then python3 -m venv .venv; fi
./.venv/bin/pip install --upgrade pip
./.venv/bin/pip install -r requirements.txt
echo "✅ ai_service venv 就绪：$ROOT/ai_service/.venv"

# 3) web_service：编译 Go 生产二进制
echo "==> 编译 Go web_service …"
cd "$ROOT/web_service"
mkdir -p bin
go build -o bin/web_service .
echo "✅ Go 二进制：$ROOT/web_service/bin/web_service"

echo ""
echo "全部构建完成。接下来：配置 systemd 服务与 nginx（见 deploy/DEPLOY.md）。"
