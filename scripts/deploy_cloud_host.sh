#!/usr/bin/env bash
set -Eeuo pipefail

APP_NAME="linear-algebra-ai"
DEFAULT_APP_DIR="/opt/linear-algebra-AI"
DEFAULT_DOMAIN="ai.hudou.xyz"
DEFAULT_AI_BASE_URL="https://aihubmix.com/v1"
DEFAULT_MAIL_HOST="smtpdm.aliyun.com"
DEFAULT_MAIL_PORT="465"
DEFAULT_MAIL_USER="noreply@hudou.xyz"
DEFAULT_MAIL_FROM_NAME="智能助教平台"

log() { printf '\n\033[1;34m==>\033[0m %s\n' "$*"; }
warn() { printf '\n\033[1;33mWARN:\033[0m %s\n' "$*" >&2; }
die() { printf '\n\033[1;31mERROR:\033[0m %s\n' "$*" >&2; exit 1; }

require_root() {
  if [[ "${EUID}" -ne 0 ]]; then
    die "请用 root 执行，或使用 sudo bash scripts/deploy_cloud_host.sh"
  fi
}

ask() {
  local var="$1"
  local prompt="$2"
  local default="${3:-}"
  local value
  if [[ -n "${default}" ]]; then
    read -r -p "${prompt} [${default}]: " value
    printf -v "${var}" '%s' "${value:-$default}"
  else
    read -r -p "${prompt}: " value
    printf -v "${var}" '%s' "${value}"
  fi
}

ask_secret() {
  local var="$1"
  local prompt="$2"
  local value
  read -r -s -p "${prompt}: " value
  printf '\n'
  printf -v "${var}" '%s' "${value}"
}

ask_yes_no() {
  local var="$1"
  local prompt="$2"
  local default="${3:-n}"
  local value
  read -r -p "${prompt} [${default}]: " value
  value="${value:-$default}"
  case "${value}" in
    y|Y|yes|YES) printf -v "${var}" '%s' "y" ;;
    *) printf -v "${var}" '%s' "n" ;;
  esac
}

random_secret() {
  if command -v openssl >/dev/null 2>&1; then
    openssl rand -hex 32
  else
    tr -dc 'A-Za-z0-9' </dev/urandom | head -c 64
  fi
}

detect_os() {
  [[ -f /etc/os-release ]] || die "仅支持常见 Linux 发行版。"
  # shellcheck disable=SC1091
  source /etc/os-release
  case "${ID_LIKE:-$ID}" in
    *debian*|*ubuntu*) PKG_MANAGER="apt" ;;
    *) die "当前脚本优先支持 Ubuntu/Debian。检测到系统：${PRETTY_NAME:-unknown}" ;;
  esac
}

install_base_packages() {
  log "安装基础依赖"
  apt-get update
  DEBIAN_FRONTEND=noninteractive apt-get install -y \
    ca-certificates curl git nginx docker.io postgresql-client \
    build-essential python3 python3-venv python3-pip unzip
  systemctl enable --now docker
  systemctl enable --now nginx
}

install_node() {
  if command -v node >/dev/null 2>&1; then
    local major
    major="$(node -v | sed 's/^v//' | cut -d. -f1)"
    if [[ "${major}" -ge 20 ]]; then
      log "Node.js 已安装：$(node -v)"
      return
    fi
  fi
  log "安装 Node.js 20"
  curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
  DEBIAN_FRONTEND=noninteractive apt-get install -y nodejs
}

install_go() {
  if command -v go >/dev/null 2>&1; then
    local version major minor
    version="$(go version | awk '{print $3}' | sed 's/go//')"
    major="$(echo "$version" | cut -d. -f1)"
    minor="$(echo "$version" | cut -d. -f2)"
    if [[ "${major}" -gt 1 || ( "${major}" -eq 1 && "${minor}" -ge 22 ) ]]; then
      log "Go 已安装：$(go version)"
      return
    fi
  fi
  log "安装 Go 1.22.12"
  local arch
  case "$(uname -m)" in
    x86_64) arch="amd64" ;;
    aarch64|arm64) arch="arm64" ;;
    *) die "不支持的 CPU 架构：$(uname -m)" ;;
  esac
  curl -fsSL "https://go.dev/dl/go1.22.12.linux-${arch}.tar.gz" -o /tmp/go.tar.gz
  rm -rf /usr/local/go
  tar -C /usr/local -xzf /tmp/go.tar.gz
  ln -sf /usr/local/go/bin/go /usr/local/bin/go
  ln -sf /usr/local/go/bin/gofmt /usr/local/bin/gofmt
}

collect_inputs() {
  log "收集部署信息"
  ask APP_DIR "应用部署目录" "${DEFAULT_APP_DIR}"
  ask DOMAIN "访问域名，例如 ai.hudou.xyz" "${DEFAULT_DOMAIN}"
  ask REPO_URL "Git 仓库地址；如果已把代码放到部署目录，可留空" ""
  if [[ -n "${REPO_URL}" ]]; then
    ask GIT_BRANCH "Git 分支" "main"
  else
    GIT_BRANCH=""
  fi
  ask AI_BASE_URL "AI_BASE_URL" "${DEFAULT_AI_BASE_URL}"
  ask_secret AI_API_KEY "AI_API_KEY"
  [[ -n "${AI_API_KEY}" ]] || die "AI_API_KEY 不能为空"

  ask MAIL_HOST "阿里云 SMTP Host" "${DEFAULT_MAIL_HOST}"
  ask MAIL_PORT "阿里云 SMTP Port" "${DEFAULT_MAIL_PORT}"
  ask MAIL_USER "阿里云发信地址" "${DEFAULT_MAIL_USER}"
  ask_secret MAIL_PASSWORD "阿里云 SMTP 密码"
  [[ -n "${MAIL_PASSWORD}" ]] || die "SMTP 密码不能为空"
  ask MAIL_FROM_NAME "发信人显示名" "${DEFAULT_MAIL_FROM_NAME}"

  ask DB_PASSWORD "PostgreSQL 密码；留空自动生成" ""
  if [[ -z "${DB_PASSWORD}" ]]; then
    DB_PASSWORD="$(random_secret)"
  fi
  ask JWT_SECRET "JWT_SECRET；留空自动生成" ""
  if [[ -z "${JWT_SECRET}" ]]; then
    JWT_SECRET="$(random_secret)"
  fi

  ask_yes_no INIT_DB "是否初始化数据库表；已有生产数据时选 n" "n"
  ask_yes_no ENABLE_HTTPS "是否现在申请 HTTPS 证书；域名需已解析到本机" "y"
}

prepare_code() {
  log "准备代码目录：${APP_DIR}"
  if [[ -n "${REPO_URL}" ]]; then
    if [[ -d "${APP_DIR}/.git" ]]; then
      git -C "${APP_DIR}" fetch --all
      git -C "${APP_DIR}" checkout "${GIT_BRANCH}"
      git -C "${APP_DIR}" pull --ff-only origin "${GIT_BRANCH}"
    else
      mkdir -p "$(dirname "${APP_DIR}")"
      git clone --branch "${GIT_BRANCH}" "${REPO_URL}" "${APP_DIR}"
    fi
  else
    [[ -d "${APP_DIR}/frontend" && -d "${APP_DIR}/web_service" && -d "${APP_DIR}/ai_service" ]] || \
      die "未提供 Git 仓库，且 ${APP_DIR} 下没有完整项目代码。请先上传代码或提供 REPO_URL。"
  fi
}

start_database() {
  log "启动 PostgreSQL + pgvector"
  if docker ps -a --format '{{.Names}}' | grep -qx 'LA-AI-pgvector'; then
    docker start LA-AI-pgvector >/dev/null
  else
    docker run --name LA-AI-pgvector \
      -e POSTGRES_PASSWORD="${DB_PASSWORD}" \
      -e POSTGRES_DB=LA-DB \
      -p 127.0.0.1:5432:5432 \
      -d \
      -v LA-AI_data:/var/lib/postgresql/data \
      pgvector/pgvector:pg15 >/dev/null
  fi
  for _ in {1..30}; do
    if docker exec LA-AI-pgvector pg_isready -U postgres -d LA-DB >/dev/null 2>&1; then
      break
    fi
    sleep 1
  done
  docker exec LA-AI-pgvector pg_isready -U postgres -d LA-DB >/dev/null 2>&1 || die "数据库未就绪"

  if [[ "${INIT_DB}" == "y" ]]; then
    log "初始化数据库 schema"
    docker exec -i LA-AI-pgvector psql -U postgres -d LA-DB < "${APP_DIR}/init_v2.sql"
  else
    warn "跳过数据库初始化。若是全新数据库，请重新运行并选择初始化。"
  fi
}

write_env_files() {
  log "写入环境变量文件"
  cat > "${APP_DIR}/web_service/.env" <<EOF
DB_SOURCE=host=127.0.0.1 user=postgres password=${DB_PASSWORD} dbname=LA-DB port=5432 sslmode=disable
JWT_SECRET=${JWT_SECRET}
AI_SERVICE_BASE_URL=http://127.0.0.1:8000

MAIL_PROVIDER=aliyun_directmail
ALIYUN_DM_SMTP_HOST=${MAIL_HOST}
ALIYUN_DM_SMTP_PORT=${MAIL_PORT}
ALIYUN_DM_SMTP_USER=${MAIL_USER}
ALIYUN_DM_SMTP_PASSWORD=${MAIL_PASSWORD}
ALIYUN_DM_FROM_NAME=${MAIL_FROM_NAME}
EOF
  chmod 600 "${APP_DIR}/web_service/.env"

  cat > "${APP_DIR}/ai_service/.env" <<EOF
AI_API_KEY=${AI_API_KEY}
AI_BASE_URL=${AI_BASE_URL}

DB_NAME=LA-DB
DB_USER=postgres
DB_PASSWORD=${DB_PASSWORD}
DB_HOST=127.0.0.1
DB_PORT=5432
EOF
  chmod 600 "${APP_DIR}/ai_service/.env"
}

build_app() {
  log "构建前端"
  cd "${APP_DIR}/frontend"
  npm install
  npm run build

  log "构建 Go web_service"
  cd "${APP_DIR}/web_service"
  mkdir -p bin
  go build -o bin/web_service main.go

  log "准备 Python ai_service 虚拟环境"
  cd "${APP_DIR}/ai_service"
  python3 -m venv .venv
  ./.venv/bin/pip install --upgrade pip
  ./.venv/bin/pip install -r requirements.txt
}

write_systemd_units() {
  log "写入 systemd 服务"
  cat > /etc/systemd/system/la-ai.service <<EOF
[Unit]
Description=Linear Algebra AI FastAPI
After=network.target docker.service

[Service]
WorkingDirectory=${APP_DIR}/ai_service
EnvironmentFile=${APP_DIR}/ai_service/.env
ExecStart=${APP_DIR}/ai_service/.venv/bin/python -m uvicorn main:app --host 127.0.0.1 --port 8000
Restart=always
RestartSec=3

[Install]
WantedBy=multi-user.target
EOF

  cat > /etc/systemd/system/la-web.service <<EOF
[Unit]
Description=Linear Algebra AI Go Web Service
After=network.target docker.service la-ai.service

[Service]
WorkingDirectory=${APP_DIR}/web_service
EnvironmentFile=${APP_DIR}/web_service/.env
ExecStart=${APP_DIR}/web_service/bin/web_service
Restart=always
RestartSec=3

[Install]
WantedBy=multi-user.target
EOF

  systemctl daemon-reload
  systemctl enable --now la-ai
  systemctl enable --now la-web
}

write_nginx_config() {
  log "写入 Nginx 配置"
  cat > "/etc/nginx/sites-available/${APP_NAME}" <<EOF
server {
    listen 80;
    server_name ${DOMAIN};

    root ${APP_DIR}/frontend/dist;
    index index.html;

    client_max_body_size 300M;

    location /api/ {
        proxy_pass http://127.0.0.1:8080/api/;
        proxy_http_version 1.1;
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
        proxy_read_timeout 900s;
        proxy_send_timeout 900s;
    }

    location / {
        try_files \$uri \$uri/ /index.html;
    }
}
EOF
  ln -sf "/etc/nginx/sites-available/${APP_NAME}" "/etc/nginx/sites-enabled/${APP_NAME}"
  rm -f /etc/nginx/sites-enabled/default
  nginx -t
  systemctl reload nginx
}

setup_https() {
  if [[ "${ENABLE_HTTPS}" != "y" ]]; then
    warn "跳过 HTTPS。你可以稍后执行：certbot --nginx -d ${DOMAIN}"
    return
  fi
  log "申请 HTTPS 证书"
  DEBIAN_FRONTEND=noninteractive apt-get install -y certbot python3-certbot-nginx
  certbot --nginx -d "${DOMAIN}" --agree-tos --redirect --register-unsafely-without-email --non-interactive
}

print_summary() {
  log "部署完成"
  cat <<EOF
访问地址：
  http://${DOMAIN}
  ${ENABLE_HTTPS:+https://${DOMAIN}}

服务状态：
  systemctl status la-ai --no-pager
  systemctl status la-web --no-pager
  systemctl status nginx --no-pager

日志：
  journalctl -u la-ai -f
  journalctl -u la-web -f
  tail -f /var/log/nginx/error.log

安全组请只对公网开放：
  80, 443, SSH

内部端口应只在本机访问：
  8000, 8080, 5432
EOF
}

main() {
  require_root
  detect_os
  collect_inputs
  install_base_packages
  install_node
  install_go
  prepare_code
  start_database
  write_env_files
  build_app
  write_systemd_units
  write_nginx_config
  setup_https
  print_summary
}

main "$@"
