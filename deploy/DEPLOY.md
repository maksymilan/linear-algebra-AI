# Linear-Algebra-AI 全新服务器部署指南

面向 **Ubuntu 22.04 / Debian 12**、单机部署（推荐 ≥2C2G，2G 需加 swap）。
架构：nginx 提供前端静态页 + 反代 `/api` → Go(`:8080`) → ai_service(`:8000`) → 大模型；PostgreSQL(pgvector) 跑在 Docker。

```
浏览器 ──80──> nginx ──/──> frontend/dist (静态)
                    └──/api──> Go :8080 ──HTTP──> ai_service :8000 ──> aihubmix(大模型)
                                   └──────────────> PostgreSQL(pgvector) :5432 (Docker)
```

> 下文假设部署目录为 `/opt/linear-algebra-AI`、运行用户为 `ubuntu`。如不同请全局替换。

---

## 0. 关键前置（务必满足，否则"现在的效果"无法复现）

- **重新构建前端**：渲染修复在前端构建产物里，必须在服务器 `npm run build`，不能用旧 dist。
- **LibreOffice**：PPT/Word 转 PDF 依赖 `soffice`，不装则只能传 PDF。
- **同一套模型**：`ai_service/model_config.json` 在位（OCR=deepseek-ocr，问答=deepseek-v4-flash，向量=embed-v-4-0）。
- **AI Key 有效且网络稳定**：`.env` 的 `AI_API_KEY` + `AI_BASE_URL`（aihubmix）。
- **pgvector**：用带 vector 扩展的镜像（脚本已用 `pgvector/pgvector:pg15`）。

---

## 1. 安装系统依赖

```bash
sudo apt update

# CPU 架构（云服务器常见 arm64，Go 等下载需按此选包）
ARCH=$(dpkg --print-architecture)   # 输出 amd64 或 arm64

# (2G 内存务必加 swap，否则前端 npm / Go 构建会 OOM 被 kill)
sudo fallocate -l 2G /swapfile && sudo chmod 600 /swapfile
sudo mkswap /swapfile && sudo swapon /swapfile
echo '/swapfile none swap sw 0 0' | sudo tee -a /etc/fstab

# Docker（跑 pgvector）
sudo apt install -y docker.io
sudo systemctl enable --now docker
sudo usermod -aG docker $USER
# ⚠️ 执行上一行后必须【退出重新登录】(或先 `newgrp docker`)，否则第 4 步 docker 命令会 permission denied

# Node 20（vite 7 需要 Node ≥20）
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt install -y nodejs

# Go 1.24（apt 版本太旧，用官方包；按架构自动选 amd64/arm64）
curl -fsSL "https://go.dev/dl/go1.24.4.linux-${ARCH}.tar.gz" -o /tmp/go.tgz
sudo rm -rf /usr/local/go && sudo tar -C /usr/local -xzf /tmp/go.tgz
echo 'export PATH=$PATH:/usr/local/go/bin' | sudo tee /etc/profile.d/go.sh
source /etc/profile.d/go.sh && go version

# Python（Ubuntu 22.04 自带 3.10，requirements 兼容；venv + 编译头给 psycopg2 等兜底）
sudo apt install -y python3 python3-venv python3-dev build-essential

# LibreOffice + 中文字体（PPT/Word → PDF）
# ⚠️ fonts-noto-cjk 必装：缺中文字体时 LibreOffice 转出的中文会变方块/乱码，连带 OCR 全错
sudo apt install -y libreoffice fonts-noto-cjk
# 磁盘紧张可只装组件：sudo apt install -y libreoffice-impress libreoffice-writer fonts-noto-cjk --no-install-recommends

# nginx
sudo apt install -y nginx
```

> 验证依赖到位：`go version`（≥1.24）、`node -v`（≥20）、`docker --version`、`which soffice`、`fc-list | grep -i noto` 应有中文字体。

---

## 2. 拉代码到服务器

```bash
sudo mkdir -p /opt/linear-algebra-AI && sudo chown $USER:$USER /opt/linear-algebra-AI
git clone <你的仓库地址> /opt/linear-algebra-AI
cd /opt/linear-algebra-AI
```

---

## 3. 配置统一 .env

```bash
cd /opt/linear-algebra-AI
cp deploy/.env.example .env
# 编辑 .env，至少改：DB_PASSWORD / DB_SOURCE 里的密码、JWT_SECRET、AI_API_KEY
openssl rand -hex 32     # 生成 JWT_SECRET 用
nano .env
```

> `DB_SOURCE` 里的密码、`DB_PASSWORD`、第 4 步起容器的密码 **三者必须一致**。

---

## 4. 启动数据库（pgvector）

```bash
cd /opt/linear-algebra-AI
# 密码要与 .env 一致
export DB_PASSWORD="你在 .env 里设的密码"
bash deploy/run-db.sh
```

表结构 / 向量索引 / 扩展会在 ai_service、web_service 首次启动时自动创建（无需手动建表）。

---

## 5. 构建三端产物

```bash
cd /opt/linear-algebra-AI
bash deploy/build-app.sh
```

产物：`frontend/dist`（前端）、`ai_service/.venv`（Python 环境）、`web_service/bin/web_service`（Go 二进制）。

---

## 6. 配置 systemd 常驻服务

```bash
sudo cp deploy/systemd/la-ai.service  /etc/systemd/system/
sudo cp deploy/systemd/la-web.service /etc/systemd/system/
# 如部署路径/用户不是 /opt/linear-algebra-AI 与 ubuntu，编辑这两个文件改 WorkingDirectory/User/ExecStart
sudo touch /var/log/la-ai.log /var/log/la-web.log && sudo chown $USER /var/log/la-*.log

sudo systemctl daemon-reload
sudo systemctl enable --now la-ai la-web
sudo systemctl status la-ai la-web --no-pager
```

---

## 7. 配置 nginx

```bash
sudo cp deploy/nginx-la.conf /etc/nginx/sites-available/la.conf
# 编辑改 server_name 和 root（前端 dist 路径）
sudo nano /etc/nginx/sites-available/la.conf
sudo ln -sf /etc/nginx/sites-available/la.conf /etc/nginx/sites-enabled/la.conf
sudo rm -f /etc/nginx/sites-enabled/default
sudo nginx -t && sudo systemctl reload nginx
```

放行安全组 / 防火墙的 80（如启用 ufw：`sudo ufw allow 80,443/tcp`）。

---

## 8. 验证

```bash
# 后端健康
curl -s localhost:8080/api/health/db          # {"status":"healthy"}
curl -s -o /dev/null -w "%{http_code}\n" localhost:8000/docs   # 200

# 前端（浏览器打开 http://服务器IP/ ）
```

**注册测试账号**（白名单邮箱 `3230105779@zju.edu.cn`）：
- 注册页邮箱填 `3230105779@zju.edu.cn`，验证码框**随便填 6 位数字（如 123456），不用点"发送验证码"**；
- 换不同用户名 + 学工号，可注册任意多个老师/学生账号；用**用户名**登录。

**课本解析全流程**：老师端上传 PDF/PPT/Word → 后台 OCR+分块+抽题入库 → 题库/检索/AI 讲解可用。
首本课本解析耗时取决于页数与模型速度，可 `tail -f /var/log/la-ai.log` 观察进度。

---

## 9. ✅ 上线前安全 checklist（首次对外前逐项确认）

> 这些是审计后必须落实的项。前 4 项不做 = 等于裸奔。

- [ ] **强 `JWT_SECRET`**：`.env` 里已是 `openssl rand -hex 32` 的随机值（不是 `dev-secret-change-me` / `CHANGE_ME...`）。启动 `la-web` 日志**不应**出现 `⚠️⚠️ 严重安全风险：JWT_SECRET...`。
- [ ] **清空注册白名单**：正式对外把 `.env` 的 `REGISTER_EMAIL_CHECK_BYPASS`、`REGISTER_TEST_CODE_EMAILS`、`REGISTER_TEST_CODE` 三项留空（否则该邮箱可无限注册、免验证码）。
- [ ] **强 DB 口令**：`DB_PASSWORD` 非 `password`；且 `DB_SOURCE` 里的密码、`DB_PASSWORD`、容器创建时的密码**三处一致**。
- [ ] **端口最小暴露**：云安全组/防火墙**只放 80/443（+SSH）**。`8000`(ai_service) 和 `5432`(pgvector) **绝不对公网开放**——ai_service 无鉴权，公网可达即被人白嫖 AI Key、甚至删向量库。本项目已把它们绑在 `127.0.0.1`，安全组再确认一遍。
- [ ] **HTTPS**：建议 `sudo apt install certbot python3-certbot-nginx && sudo certbot --nginx -d 你的域名` 一键上 SSL。
- [ ] **依赖审计（建议）**：`cd frontend && npm audit`；`cd web_service && go install golang.org/x/vuln/cmd/govulncheck@latest && govulncheck ./...`。
- [ ] **配置数据库定期备份**（见第 10 节 `pg_dump`，可挂 cron）。

---

## 10. 更新云上服务（不删库）

**原理：数据库迁移是"只增不删"的**——Go 的 GORM AutoMigrate 与 ai_service 的 `ensure_vector_index` 都是 `CREATE TABLE/COLUMN ... IF NOT EXISTS`，只会**新增**表/列/索引，**不会删除或清空**已有数据。所以正常更新代码不会动你的课本、题库、用户、对话数据。

### 🚫 两条红线（会删库，永远别在生产做）

- **绝不**在生产库执行 `init_v2.sql`——它**首行就是 `DROP SCHEMA public CASCADE`，会清空整库**。那是开发期全量重置脚本，仅供空库初始化。
- **绝不** `docker volume rm la-pgdata`、也别 `docker rm` 容器后不挂卷重建——数据在命名卷 `la-pgdata` 里，删卷即删库。

### 标准更新流程

```bash
# 0) 先备份数据库（强烈建议每次更新前都做）
docker exec LA-AI-pgvector pg_dump -U postgres -d LA-DB | gzip > ~/la-backup-$(date +%F-%H%M).sql.gz

# 1) 拉新代码（保留本地 .env，.env 已被 .gitignore，git pull 不会覆盖）
cd /opt/linear-algebra-AI && git pull

# 2) 重新构建三端（增量迁移会在服务重启时自动跑）
bash deploy/build-app.sh

# 3) 重启后端服务（迁移在 la-web / la-ai 启动时自动执行，只加不删）
sudo systemctl restart la-ai la-web

# 4) 前端有改动时刷新 nginx（静态文件已被 build 更新，reload 让其生效）
sudo systemctl reload nginx
```

> 只改了 `.env`：`sudo systemctl restart la-ai la-web` 即可（应用启动时重新加载根 `.env`）。

### 回滚

```bash
cd /opt/linear-algebra-AI
git checkout <上一个可用的 tag 或 commit>
bash deploy/build-app.sh
sudo systemctl restart la-ai la-web && sudo systemctl reload nginx
```

增量迁移向后兼容：新版加的列，旧版代码读不到也不会报错（直接忽略），所以回滚代码**无需回滚数据库**。真要恢复数据再用备份：
`gunzip -c ~/la-backup-xxxx.sql.gz | docker exec -i LA-AI-pgvector psql -U postgres -d LA-DB`。

### 定期备份（可选，挂 cron）

```bash
# 每天凌晨 3 点备份，保留最近 7 天
(crontab -l 2>/dev/null; echo '0 3 * * * docker exec LA-AI-pgvector pg_dump -U postgres -d LA-DB | gzip > ~/la-backup-$(date +\%F).sql.gz; find ~ -name "la-backup-*.sql.gz" -mtime +7 -delete') | crontab -
```

---

## 11. 常见问题排查

| 现象 | 排查 |
|---|---|
| 前端能开但接口 404/502 | nginx `/api` 反代是否指向 `127.0.0.1:8080`；`systemctl status la-web` |
| 上传中文 PPT/Word 解析出乱码/方块 | 服务器缺中文字体，`sudo apt install -y fonts-noto-cjk` 后重新上传 |
| `docker` 命令 permission denied | 加 docker 组后没重新登录，先 `newgrp docker` 或退出重登 |
| `la-web` 起不来 | 看 `/var/log/la-web.log`；多半是 `.env` 的 `DB_SOURCE` 连不上库 |
| `la-ai` 起不来 | 看 `/var/log/la-ai.log`；`ModuleNotFound` 说明 venv 没装好，重跑 build-app.sh |
| 公式渲染又乱了 | 几乎只可能是**前端用了旧 dist**——重跑 `npm run build` 再 reload nginx |
| 上传 PPT/Word 不解析 | 服务器没装 LibreOffice；`which soffice` 应有路径 |
| AI 讲解/批改报错 | `.env` 的 `AI_API_KEY` 无效或 aihubmix 不可达；偶发连接错误重试即可 |
| 课本上传 413 | nginx `client_max_body_size` 调大（已设 100m） |
| 构建时卡死/被 kill | 2G 内存未加 swap，回到第 1 步加 swap |
| 数据库重启后数据没了 | 必须用命名卷（`run-db.sh` 已用 `-v la-pgdata`），不要 `docker rm` 后不挂卷重建 |

---

## 备注：邮件验证码

默认 `MAIL_PROVIDER=console`：验证码只打印到 `la-web` 日志（适合内测）。
要发真实邮件，把 `.env` 的 `MAIL_PROVIDER=aliyun` 并填 `ALIYUN_DM_*`（阿里云邮件推送 SMTP）。
白名单测试邮箱无需验证码，不受此影响。
