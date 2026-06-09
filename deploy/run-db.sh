#!/usr/bin/env bash
# 启动 pgvector（PostgreSQL 15 + vector 扩展）容器。数据持久化到命名卷 la-pgdata。
# 用法：先 export 好密码（要和根 .env 的 DB_PASSWORD / DB_SOURCE 一致），再执行本脚本。
#   DB_PASSWORD=yourpw bash deploy/run-db.sh
set -euo pipefail

CONTAINER="${PG_CONTAINER:-LA-AI-pgvector}"
DB_NAME="${DB_NAME:-LA-DB}"
DB_PASSWORD="${DB_PASSWORD:?请先 export DB_PASSWORD（需与根 .env 一致）}"
PORT="${DB_PORT:-5432}"

if docker ps -a --format '{{.Names}}' | grep -qx "$CONTAINER"; then
  echo "容器 $CONTAINER 已存在，直接启动…"
  docker start "$CONTAINER"
else
  echo "创建并启动 pgvector 容器 $CONTAINER …"
  docker run -d \
    --name "$CONTAINER" \
    --restart unless-stopped \
    -e POSTGRES_PASSWORD="$DB_PASSWORD" \
    -e POSTGRES_DB="$DB_NAME" \
    -p "127.0.0.1:${PORT}:5432" \
    -v la-pgdata:/var/lib/postgresql/data \
    pgvector/pgvector:pg15
fi

echo "等待数据库就绪…"
for i in $(seq 1 30); do
  if docker exec "$CONTAINER" pg_isready -U postgres >/dev/null 2>&1; then
    echo "✅ 数据库已就绪（容器=$CONTAINER, 库=$DB_NAME, 端口=127.0.0.1:$PORT）"
    exit 0
  fi
  sleep 1
done
echo "⚠️ 数据库未在 30s 内就绪，请检查 docker logs $CONTAINER"
exit 1
