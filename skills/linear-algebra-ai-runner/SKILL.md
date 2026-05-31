---
name: linear-algebra-ai-runner
description: Use when starting, verifying, or debugging the local Linear Algebra AI project at /Users/hudou/Develop/linear-algebra-AI. Covers the Docker pgvector database, Go Gin web_service, Python FastAPI ai_service, React/Vite frontend, expected ports, environment files, and common local sandbox issues.
---

# Linear Algebra AI Runner

Use this skill when the user wants to run or troubleshoot the `linear-algebra-AI` project.

## Project shape

- Root: `/Users/hudou/Develop/linear-algebra-AI`
- Database: PostgreSQL 15 + pgvector in Docker, exposed on `localhost:5432`, database `LA-DB`
- Web service: Go + Gin in `web_service/`, port `8080`
- AI service: Python + FastAPI in `ai_service/`, port `8000`
- Frontend: React + Vite in `frontend/`, usually port `5173`

## Start order

1. Start or verify the database.
2. Start `web_service`.
3. Start `ai_service`.
4. Start `frontend`.
5. Verify all three HTTP services.

## Database

Preferred existing local container name:

```bash
docker ps --format '{{.Names}} {{.Image}} {{.Ports}}'
```

If `LA-AI-pgvector` is already running on `5432`, reuse it. If no compatible container exists:

```bash
docker run --name LA-AI-pgvector \
  -e POSTGRES_PASSWORD=password \
  -e POSTGRES_DB=LA-DB \
  -p 5432:5432 \
  -d \
  -v LA-AI_data:/var/lib/postgresql/data \
  pgvector/pgvector:pg15
```

Initialize schema from the repo root only when tables are missing or a reset is explicitly intended:

```bash
docker exec -i LA-AI-pgvector psql -U postgres -d LA-DB < init_v2.sql
```

Check tables:

```bash
docker exec LA-AI-pgvector psql -U postgres -d LA-DB -c '\dt'
```

## Web Service

`web_service/.env` is ignored by git and should contain:

```dotenv
DB_SOURCE=host=localhost user=postgres password=password dbname=LA-DB port=5432 sslmode=disable
JWT_SECRET=dev-secret-change-me
```

Start:

```bash
cd /Users/hudou/Develop/linear-algebra-AI/web_service
go run main.go
```

Verify:

```bash
curl -sS http://127.0.0.1:8080/api/health/db
```

Expected response:

```json
{"status":"healthy"}
```

## AI Service

Do not use the repo's `ai_service/venv` if it was created with Python 3.14; `numpy==2.0.2` can fail to build there. Use Python 3.9 on this machine:

```bash
cd /Users/hudou/Develop/linear-algebra-AI/ai_service
/usr/bin/python3 -m venv .venv39
./.venv39/bin/python -m pip install -r requirements.txt
```

`ai_service/.env` must define at least:

```dotenv
AI_API_KEY=...
AI_BASE_URL=...
```

Optional model variables include `AI_MODEL_NAME`, `AI_VL_MODEL_NAME`, and `AI_EMBEDDING_MODEL`.

Start without reload when running under Codex sandbox, because file watching can fail with `Operation not permitted`:

```bash
cd /Users/hudou/Develop/linear-algebra-AI/ai_service
./.venv39/bin/python -m uvicorn main:app --port 8000
```

Verify:

```bash
curl -sS -o /dev/null -w '%{http_code}' http://127.0.0.1:8000/docs
```

Expected status: `200`.

## Frontend

Install dependencies if needed:

```bash
cd /Users/hudou/Develop/linear-algebra-AI/frontend
npm install
```

Start:

```bash
cd /Users/hudou/Develop/linear-algebra-AI/frontend
npm run dev
```

Expected Vite URL:

```text
http://localhost:5173/
```

Verify:

```bash
curl -sS -o /dev/null -w '%{http_code}' http://127.0.0.1:5173/
```

Expected status: `200`.

## Known Local Notes

- The frontend hardcodes the API base URL to `http://localhost:8080` in several files, so run the Go service on port `8080`.
- The Go service hardcodes AI service calls to `http://localhost:8000`, so run FastAPI on port `8000`.
- `npm run lint` currently fails on existing unused variables and one React Fast Refresh rule. Do not treat that as a startup blocker unless the user asks to fix lint.
- Under Codex sandbox, Docker access, local port binding, and localhost curl checks may need escalation.
- Keep existing user changes intact; this repo may have a dirty worktree.
