# AGENT.md — Linear Algebra AI 项目设计与架构文档

> **本文件面向后续接手开发的 AI Agent / 工程师。**
> 它不是流水账记录，而是**项目当前的设计方案与系统架构总览**：
> 读完这一份文件，你应该可以独立做新需求、加新接口、定位故障，而不需要再去翻其他 README。
>
> 维护原则：当**架构、数据流、接口契约、关键约定**发生变化时，请同步更新本文件。

---

## 0. TL;DR — 30 秒了解项目

- **是什么**：面向《线性代数》课程的 AI 教学助手。学生能问问题、写作业；教师能管理班级、上传教材、看学生学情。
- **三端架构**：React 前端（5173）→ Go 业务后端（8080）→ Python AI 服务（8000）→ PostgreSQL+pgvector（5432）。
- **AI 能力**：基于 OpenAI 兼容 API 的多模态对话 + RAG 检索 + OCR 解析 + 自动批改。
- **运维**：监控栈 Prometheus + Grafana + Loki + Alertmanager（国内可用，替代 Sentry）。
- **特殊约定**：仅允许 `@zju.edu.cn` 邮箱注册；前端 LaTeX 三层兜底渲染。

---

## 1. 业务设计

### 1.1 核心用户场景

| 角色 | 主要场景 |
|---|---|
| **学生** | 加入班级 → 与 AI 对话学习 → 提交作业 → 查看 AI 批改与教师评语 |
| **教师** | 创建班级（生成 6 位邀请码）→ 上传周次教材（PDF/PPT）→ 推进教学进度 → 发布作业 → 查看学情 |

### 1.2 关键产品决策

1. **班级 = 教学单位**：所有内容（教材、作业、AI 上下文）都按 `class_id + week_num` 切片。
2. **教学周（current_week）控制可见性**：学生 RAG 查询和当前周内容仅看到 ≤ current_week 的教材。
3. **RAG 优先于通识**：模型先在教材向量库里检索，再用检索结果作为上下文回答。
4. **多模态批改**：作业可上传图片/PDF，先 OCR → 再 LLM 评分 → 学生可对单题发起 follow-up 答疑。
5. **强校验注册**：邮箱必须 `@zju.edu.cn` + 邮箱验证码（6 位数字，10 分钟有效）。

---

## 2. 系统架构总览

```
                        浏览器（React + Vite）
                              │ HTTPS
                              ▼
                  ┌───────────────────────┐
                  │  Go 后端 (Gin)        │  :8080
                  │  · 鉴权（JWT）        │
                  │  · CORS / 限流        │
                  │  · 业务编排           │
                  │  · /metrics, /telemetry│
                  └─────┬───────────┬─────┘
                        │           │
          internal HTTP │           │ SQL (GORM)
                        ▼           ▼
            ┌───────────────────┐  ┌───────────────────┐
            │ Python AI 服务    │  │ PostgreSQL 15     │
            │  (FastAPI) :8000  │  │  + pgvector       │
            │  · LLM 多模态对话 │  │  · 业务表          │
            │  · RAG 检索       │  │  · embedding 向量 │
            │  · OCR / 批改     │  │  · chat history   │
            │  · /metrics       │  └───────────────────┘
            └─────────┬─────────┘
                      │
                      ▼
            ┌───────────────────┐
            │ OpenAI 兼容 LLM   │
            │  (AIHubMix 等)    │
            └───────────────────┘

  旁路（可观测性）：
  Go/Py stdout → Promtail → Loki ─┐
  Go/Py /metrics ─→ Prometheus ───┼─→ Grafana :3000
  Prometheus 告警 → Alertmanager ─┘
```

### 2.1 各端职责切分（重要）

| 关注点 | 归属 | 理由 |
|---|---|---|
| 业务模型 / 鉴权 / 班级 / 作业 | **Go 后端** | 性能稳定，强类型；GORM 操作业务表 |
| LLM 调用 / 向量化 / OCR | **Python AI 服务** | OpenAI SDK 生态、PyMuPDF 等都在 Python |
| 文件存储（教材、作业、课件） | **Go 后端** 本地磁盘 | 当前阶段不接入对象存储；生产再切 OSS |
| 向量库（embedding） | **Python AI 服务**写入 + Go 不直接读 | 解耦；Go 仅触发 ingest 流程 |
| Chat 上下文管理 | **Go 后端** 持久化 + **AI 服务**消费 history | Go 是真理之源，AI 服务是无状态的 |

### 2.2 部署形态

- **本地开发**：4 进程（PG/Go/Py/Vite）+ 5 容器监控栈。
- **生产建议**：单 VM Docker Compose（Caddy + 前述四个服务 + 监控栈），≤ ¥150/月可用。

---

## 3. 数据模型（核心 ER）

> 以 [init_v2.sql](file:///Users/bytedance/School/linear-algebra-AI/init_v2.sql) 为准。**注意：该脚本头部有 `\q` 保险丝，平时不会真的执行 DROP**。

```
┌──────────────┐       teacher_id       ┌──────────────┐
│  classes     │◀───────────────────────│   users      │
│ id           │                        │ id           │
│ name         │       class_id         │ username     │
│ invite_code  │───────────────────────▶│ email        │
│ teacher_id   │      (1:N)             │ role         │
│ current_week │                        │ class_id     │
└──────┬───────┘                        └──────┬───────┘
       │                                       │
       │ class_id (隐含通过用户)                │ user_id
       ▼                                       ▼
┌──────────────┐                        ┌──────────────────────────┐
│ assignments  │                        │ student_concept_profiles │
│ id, week_num │                        │ user_id, concept_name    │
│ deadline     │                        │ mastery_score (0-100)    │
└──────┬───────┘                        └──────────────────────────┘
       │ assignment_id
       ▼
┌──────────────┐
│ submissions  │── ai_score / comments
└──────────────┘

┌─────────────────────┐         ┌─────────────────┐
│  textbooks (元数据) │         │ chat_sessions   │
│  id, name, status   │         │  id, user_id    │
└─────────┬───────────┘         │  title          │
          │ textbook_id         └────────┬────────┘
          ▼                              │ session_id
┌─────────────────────┐         ┌────────▼────────┐
│ textbook_chunks     │         │ chat_messages   │
│  id, content        │         │  role(user/ai)  │
│  embedding(1536)    │         │  content        │
│  week_num           │         │  feedback_score │
└─────────────────────┘         └─────────────────┘

┌────────────────────┐
│ verification_codes │  注册/找回密码 6 位数字码（10 min TTL）
│  email, code       │
│  purpose, used_at  │
└────────────────────┘
```

### 关键字段约束
- `users.email` UNIQUE + `@zju.edu.cn` 校验（[verification.go IsAllowedRegisterEmail](file:///Users/bytedance/School/linear-algebra-AI/web_service/auth/verification.go)）
- `classes.invite_code` UNIQUE，6 位大写字母数字
- `textbook_chunks.embedding` 维度 = 1536（text-embedding-3-small）
- `chat_messages.feedback_score`：1=赞，-1=踩，0=未评

---

## 4. 模块边界与目录结构

```
linear-algebra-AI/
├── web_service/              ── Go 业务后端（:8080）
│   ├── main.go               ── 路由编排 + 中间件挂载
│   ├── config/config.go      ── 环境变量 / DB 连接
│   ├── auth/
│   │   ├── handler.go        ── 注册/登录/鉴权 JWT
│   │   ├── verification.go   ── 邮箱验证码 + SMTP/Console mailer + 域名白名单
│   │   ├── class_handler.go  ── 班级 CRUD / 邀请码 / 周进度 / 周次教材
│   │   ├── middleware.go     ── AuthMiddleware / TeacherMiddleware
│   │   └── user.go           ── User 模型
│   ├── chat/
│   │   ├── handlers.go       ── 会话/消息/feedback；调用 AI 服务 /chat
│   │   └── models.go
│   ├── grading/
│   │   ├── handlers.go       ── 上传 → OCR → grade → followup
│   │   └── models.go
│   ├── assignment/           ── 作业发布 / 提交 / 评语
│   ├── textbook/             ── 教材上传 → 触发 AI 服务 /textbook/ingest
│   ├── metrics/metrics.go    ── Prometheus 中间件 + /metrics
│   ├── telemetry/telemetry.go── slog JSON 日志 + /api/telemetry/{frontend,alert}
│   └── uploadguard/          ── 上传 MIME/大小校验
│
├── ai_service/               ── Python AI 服务（:8000）
│   ├── main.py               ── FastAPI 入口；7 个 /api/v1/* 端点
│   ├── ingest_pdf.py         ── PDF → OCR → LaTeX 清洗 → embedding → 入库
│   ├── prompts.py            ── OCR / 对话 / 批改 prompt 模板
│   └── requirements.txt
│
├── frontend/                 ── React + Vite（:5173）
│   ├── src/main.jsx          ── axios baseURL / 全局错误捕获 / Sentry 可选
│   ├── src/contexts/AuthContext.jsx
│   ├── src/routes/           ── ProtectedRoute / AppRoutes
│   ├── src/pages/*.jsx       ── 业务页面（按角色组织）
│   ├── src/components/*.jsx  ── 复用组件（MessageList/TextbookManager 等）
│   └── src/utils/
│       ├── autoWrapMath.js   ── LaTeX 兜底包裹
│       └── errorReporter.js  ── 前端错误上报
│
├── monitoring/               ── 监控栈（Docker Compose 独立）
│   ├── docker-compose.yml
│   ├── prometheus.yml / alert_rules.yml
│   ├── loki-config.yml / promtail-config.yml
│   ├── alertmanager.yml
│   └── grafana/
│       ├── provisioning/{datasources,dashboards}/
│       └── dashboards/{api-performance.json, logs-errors.json}
│
├── docker-compose.db.yml     ── 独立数据库 compose（pgvector/pg15）
├── init_v2.sql               ── ⚠️ 数据库初始化脚本（带 \q 保险丝）
├── readme.md                 ── 跨机器启动指南（用户视角）
└── AGENT.md                  ── 本文件（Agent 视角）
```

---

## 5. 接口契约

### 5.1 Go 后端对外（前端调用）

公开接口：

| Method & Path | 用途 |
|---|---|
| `POST /api/auth/register` | 注册（需 verify_code + 邮箱后缀 @zju.edu.cn）|
| `POST /api/auth/login` | 登录，返回 JWT |
| `POST /api/auth/request-code` | 申请验证码（purpose: register / reset_password）|
| `POST /api/auth/reset-password` | 凭验证码重置密码 |
| `GET  /api/health/db` | DB 健康检查 |
| `GET  /metrics` | Prometheus 指标 |
| `POST /api/telemetry/frontend` | 前端错误上报 |
| `POST /api/telemetry/alert` | Alertmanager webhook |

需鉴权（`Authorization: Bearer <jwt>`）：

| Method & Path | 用途 |
|---|---|
| `POST /api/chat/send` | 发消息（form-data：question, session_id?, image?, history?）|
| `GET  /api/chat/sessions` | 当前用户的会话列表 |
| `GET  /api/chat/messages/:id` | 某会话的所有消息 |
| `POST /api/chat/messages/:id/feedback` | 点赞/点踩 |
| `POST /api/grading/upload` | 上传作业图片/PDF 触发 OCR + 批改 |
| `POST /api/grading/ocr` | 仅 OCR，不批改 |
| `POST /api/grading/followup` | 对单题发起后续答疑会话 |

教师专属（`/api/teacher/*`，需 `role=teacher`）：

| Path | 用途 |
|---|---|
| `POST /classes` / `GET /classes` / `GET /classes/:id` | 班级 CRUD + 详情含学情 |
| `PATCH /classes/:id/week` | 推进当前教学周 |
| `POST /classes/:id/weekly_content` | 上传当周课件总结（→ 写 textbook 表 + 触发 ingest）|
| `POST/GET /assignments`、`GET /assignments/:id` | 作业管理 |
| `GET /submission/file/:id` / `POST /submission/:id/comment` | 查阅提交 / 加评语 |
| `GET/POST /textbooks`、`POST /textbooks/:id/cancel`、`DELETE /textbooks/:id` | 教材库管理 |

学生专属（`/api/student/*`，需 `role=student`）：

| Path | 用途 |
|---|---|
| `POST /class/join` / `GET /class` | 加入班级 / 查看自己班级 |
| `GET /assignments` / `GET /assignments/:id` | 作业列表 / 详情 |
| `POST /assignments/submit` | 提交作业 |

### 5.2 AI 服务对内（Go 后端调用）

固定 base URL：默认 `http://localhost:8000`，全部 multipart/form-data：

| Path | 入参（关键） | 出参 |
|---|---|---|
| `POST /api/v1/textbook/ingest` | textbook_id, name, week_num, file(PDF) | `{ chunks: int }` 异步返回 |
| `POST /api/v1/textbook/delete` | textbook_id 或 textbook_name | 删除 chunks |
| `POST /api/v1/ocr` | image | `{ text }` |
| `POST /api/v1/summarize_ppt` | file(PPT) | `{ summary }` |
| `POST /api/v1/chat` | question, week_num?, history?(JSON), image? | `{ answer, citations[] }` |
| `POST /api/v1/grade` | image/pdf, week_num? | `{ score, comments, items[] }` |
| `POST /api/v1/grading/chat` | grade_item_id, question, history? | `{ answer }` |

> `history` 是 JSON 字符串：`[{"role":"user|ai","content":"..."}]`，最多 8 轮，每条 ≤ 1500 字符（见 `HISTORY_MAX_*` env）。

### 5.3 错误码约定

- Go 后端：`{ "error": "<msg>" }`，对应 HTTP 4xx/5xx
- AI 服务：`{ "detail": "..." }`，FastAPI 默认格式
- 前端 axios 拦截器：**只对 5xx/网络错误自动上报**到 `/api/telemetry/frontend`；4xx 视为业务期望

---

## 6. 关键流程时序

### 6.1 学生发消息（多模态 + RAG + 历史）

```
学生 → Go: POST /api/chat/send (question, image?, session_id, history?)
Go: 鉴权 → 写入 chat_sessions（如果是新会话）+ chat_messages(user)
Go → Py: POST /api/v1/chat (question + history + image + week_num)
Py:
  1) build_rag_query(question + 最近 2 轮历史)
  2) embeddings.create(query) → cosine search textbook_chunks
  3) 拼装 prompt: system + history + RAG citations + 当前 question
  4) chat.completions.create(...)
Py → Go: { answer, citations }
Go: 写 chat_messages(ai)；返回前端
前端: autoWrapMath(answer) → react-markdown + KaTeX 渲染
```

### 6.2 教师上传教材

```
教师 → Go: POST /api/teacher/textbooks (multipart: name, week_num, file)
Go: uploadguard 校验 (PDF ≤ 50MB) → 落本地磁盘 → 写 textbooks(status=processing)
Go → Py: POST /api/v1/textbook/ingest (textbook_id, name, week_num, file)
Py:
  1) PyMuPDF 解析 PDF
  2) 对每页/每段先 OCR_PROMPT 走视觉模型整理 LaTeX
  3) sanitize_ocr_text + auto_wrap_math
  4) 切 chunk → embeddings.create → INSERT textbook_chunks
Go: 收到结果后 textbooks.status=ready
```

### 6.3 学生交作业 + AI 批改 + 答疑

```
学生 → Go: POST /api/student/assignments/submit (image/pdf)
Go → Py: POST /api/v1/grade
Py: OCR → grading prompt → JSON { score, items[{q, ans, score, comment}] }
Go: 写 submissions + grade_items
学生点击单题"问AI" → POST /api/grading/followup
Go → Py: POST /api/v1/grading/chat (grade_item_id, question)
Py: 以题目+学生答案为上下文，多轮答疑
```

### 6.4 前端错误兜底链路

```
浏览器 JS 异常 / Promise rejection / axios 5xx
   → window.onerror / unhandledrejection / interceptor
   → reportFrontendError()  (10s 限流, sendBeacon 优先)
   → POST /api/telemetry/frontend
   → telemetry.HandleFrontendError → slog JSON to stdout
   → Promtail 采集 → Loki 存储
   → Grafana "Logs & Errors" 看板可查
```

---

## 7. 配置与环境变量

### 7.1 Go 后端（`web_service/.env`）

```bash
DB_SOURCE="host=localhost user=postgres password=password dbname=LA-DB port=5432 sslmode=disable TimeZone=Asia/Shanghai"
JWT_SECRET="<random-long-string>"          # 生产必须改
ALLOWED_ORIGINS="http://localhost:5173"     # 生产填真实域名；不设则降级为允许所有
APP_ENV="dev"

# SMTP（不设则降级为 ConsoleMailer 仅打印）
SMTP_HOST="smtp.qq.com"
SMTP_PORT="465"
SMTP_USERNAME="..."
SMTP_PASSWORD="..."
SMTP_FROM="..."

AI_SERVICE_URL="http://localhost:8000"
SENTRY_DSN=""                               # 可选；不设则跳过
LOG_LEVEL="info"
```

### 7.2 AI 服务（`ai_service/.env`）

```bash
AI_API_KEY="..."
AI_BASE_URL="https://aihubmix.com/v1"
AI_MODEL_NAME="gemini-3.1-pro-preview"
AI_VL_MODEL_NAME="gemini-3.1-pro-preview"
AI_EMBEDDING_MODEL="text-embedding-3-small"

DB_NAME="LA-DB"
DB_USER="postgres"
DB_PASSWORD="password"
DB_HOST="localhost"
DB_PORT="5432"

RAG_TOP_K="5"
RAG_MAX_CHARS_PER_CHUNK="600"
HISTORY_MAX_TURNS="8"
HISTORY_MAX_CHARS_PER_MSG="1500"
RAG_HISTORY_LOOKBACK="2"
```

### 7.3 前端（`frontend/.env.local`，可选）

```bash
VITE_SENTRY_DSN=""
VITE_APP_VERSION="dev"
```

---

## 8. 已建立的工程化能力

### 8.1 可观测性（Sentry 替代方案）

| 能力 | 实现 |
|---|---|
| 指标 | Go/Py 各自 `/metrics` → Prometheus → Grafana **API Performance** 看板（10 个面板）|
| 日志 | slog JSON → stdout → Promtail → Loki → Grafana **Logs & Errors** 看板 |
| 前端错误 | 全局捕获 → POST `/api/telemetry/frontend` → 落日志 → Loki |
| 告警 | Prometheus alert_rules → Alertmanager → Webhook（默认）/ 邮件/飞书/钉钉（可换）|
| 入口 | Grafana :3000（admin/admin），首登强制改密 |

告警规则（5 条）：ServiceDown / HighErrorRate / HighLatencyP95 / High4xxRate / GoroutineLeak。

### 8.2 安全与可靠性

- **鉴权**：JWT（HS256），中间件 `AuthMiddleware` + `TeacherMiddleware`
- **CORS 白名单**（`ALLOWED_ORIGINS`）
- **上传校验**（[uploadguard](file:///Users/bytedance/School/linear-algebra-AI/web_service/uploadguard/uploadguard.go)）：PDF ≤ 50MB / 图 ≤ 10MB / 课件 ≤ 20MB
- **MaxMultipartMemory** = 8 MiB，超出转磁盘临时文件
- **注册强校验**：邮箱 `@zju.edu.cn` + 验证码（10 min TTL，单次有效）

### 8.3 数据安全

- 数据库容器命名卷（`la_ai_pgdata` 或现存 `LA-AI_data`）
- [init_v2.sql](file:///Users/bytedance/School/linear-algebra-AI/init_v2.sql) 加 `\q` 保险丝，防止误执行清库
- `docker restart LA-AI` 是唯一安全的"重启"姿势

---

## 9. 关键约定（Agent 必读，避免踩坑）

### 9.1 数据库
- ⚠️ `init_v2.sql` 第一句是 `DROP SCHEMA public CASCADE`，**不是重启脚本**。
- 平时只用 `docker restart LA-AI`；要清库时**先备份**再注释掉 `\q`。
- 容器名 `LA-AI`；DB 名 `LA-DB`。

### 9.2 Go 后端
- 日志一律走 `telemetry.Logger()`（slog JSON），**禁用 `log.Println` 与 `fmt.Println` 做错误日志**。
- Gin 中间件顺序：`CORS → metrics.Middleware → /metrics → telemetry.Register → sentry → 业务路由`。
- Prometheus path label **必须用 `c.FullPath()`**，避免 cardinality 爆炸（`/api/chat/messages/123` 会爆）。
- 上传接口**必须**走 `uploadguard.Check(...)`。

### 9.3 Python AI 服务
- 虚拟环境位于 `ai_service/venv`；任何 pip / 依赖数据库的脚本都要用 `venv/bin/python`。
- `prometheus-fastapi-instrumentator` 是**可选**依赖，未装时 `/metrics` 不暴露但主流程不受影响。
- 改动 `OCR_PROMPT` 后请跑 LaTeX 回归用例（见 `autoWrapMath.test`）。

### 9.4 前端
- Vite 静态分析会 resolve `import('xxx')` 字面量。**可选依赖**必须用变量中转：
  ```js
  const pkg = '@sentry/react';
  import(/* @vite-ignore */ pkg).then(...)
  ```
- 渲染 AI 输出前**先过 `autoWrapMath()`** 再交给 react-markdown + KaTeX。
- axios 拦截器仅上报 5xx / 网络错误，4xx 不报。

### 9.5 监控栈
- Grafana provisioning 配置 `updateIntervalSeconds: 30`：**改 dashboard JSON 后 30 秒自动热加载**，不用重启容器。
- Promtail 必须挂 `/var/lib/docker/containers` 才能采集其他容器日志。
- 看板 JSON 的修改要从 Grafana UI **Settings → JSON Model** 导出，回写到 `monitoring/grafana/dashboards/`，并 git 提交。

### 9.6 通用
- 与用户对话默认中文。
- 代码注释中文，函数/变量英文；commit message 中文动词开头。
- 涉及监控/数据库的修改优先动配置文件，不要在 UI 里点（持久化 + 可追溯）。

---

## 10. 已知缺陷 & Roadmap

### 当前 Pending（按优先级）

| Pri | 项 | 说明 |
|---|---|---|
| P1 | 修复 `ChatPage.jsx` 刷新会话状态丢失（D1） | 刷新 `/chat/:id` 首次渲染 chats 为空，session 不会被正确加载 |
| P1 | 上线脚手架 | Docker Compose + Caddy + 一键部署脚本 |
| P2 | 飞书 / 钉钉告警机器人 | 编辑 `monitoring/alertmanager.yml` receivers |
| P2 | Python AI 服务结构化日志 | 与 Go 统一 JSON 字段，便于 Loki 检索 |
| P2 | postgres-exporter / node-exporter | 完善 DB 与主机指标 |
| P3 | F1 学情仪表盘（教师端） | 班级整体掌握度图 + 个体下钻 |
| P3 | F3 RLHF 闭环 | 👎 接真后端 + 教师审阅负反馈 |
| P3 | DB Migration 工具 | goose / atlas 替代 GORM AutoMigrate |

### 架构演进建议（中期）

1. **存储**：`uploads/` 和 `submissions/` 切到 S3/OSS，前端走预签 URL
2. **任务队列**：教材 ingest 现在是同步阻塞；上 Asynq / Celery 做异步
3. **缓存**：班级元数据 / 用户信息 → Redis；session 也可放 Redis
4. **多模型 fallback**：AI 服务对 LLM 调用做超时与降级，避免上游卡死全链路

---

## 11. 给接手 Agent 的 Playbook

接到一个新任务时，建议这样推进：

1. **先读本文**，再读 [readme.md](file:///Users/bytedance/School/linear-algebra-AI/readme.md)（启动指南）。
2. **理解需求归属**：是 Go 业务还是 AI 推理？落到第 4 节哪个模块？
3. **找到对应的"接口契约"**（第 5 节）确定要新增/修改哪个 endpoint。
4. **遵循约定**（第 9 节）—— 中间件顺序、日志、CORS、上传校验、Vite import。
5. **写完跑 build/lint**：
   ```bash
   cd web_service && go vet ./... && go build ./...
   cd frontend && npm run lint
   ```
6. **加监控**：新接口路径会自动被 metrics 中间件采集；如有业务指标需自定义，在 `web_service/metrics/` 里 `promauto.NewCounter(...)`。
7. **更新本文件**：架构 / 接口 / 约定有变化的话，回到第 5、9 节追加。

---

_Last updated: 2026-05-02_
_If you are an AI Agent reading this: you are encouraged to keep this document up-to-date. Treat it as the project's source of truth for design intent._
