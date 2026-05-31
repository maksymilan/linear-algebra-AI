---
name: linear-algebra-ai-api-checks
description: Use after every new feature or bug fix in /Users/hudou/Develop/linear-algebra-AI, especially changes touching ai_service, prompts, memory, RAG, Go proxy handlers, or API response shapes. Runs the local interface smoke checks for the AI service endpoints and verifies compatibility with existing callers.
---

# Linear Algebra AI API Checks

Use this skill before finalizing any feature development or bug fix in this repo.

## Prerequisites

Make sure the local stack is running:

- Go web service: `http://127.0.0.1:8080`
- AI service: `http://127.0.0.1:8000`
- Frontend, when relevant: `http://127.0.0.1:5173`

If the stack is not running, use the `linear-algebra-ai-runner` skill first.

## Default Check

From the repo root:

```bash
python3 skills/linear-algebra-ai-api-checks/scripts/check_ai_interfaces.py
```

This validates:

- `GET /docs`
- `POST /api/v1/chat`
- `POST /api/v1/grade`
- `POST /api/v1/grading/chat`
- `POST /api/v1/ocr`
- `POST /api/v1/summarize_ppt`
- `POST /api/v1/textbook/delete` using a guaranteed-missing textbook name
- Go DB health: `GET /api/health/db`

The check asserts HTTP success and response keys expected by the current Go and frontend callers, especially `response`, `text_explanation`, `correction`, `text`, `summary`, `message`, and `deleted_chunks`.

## Useful Options

```bash
python3 skills/linear-algebra-ai-api-checks/scripts/check_ai_interfaces.py --ai-base http://127.0.0.1:8000 --web-base http://127.0.0.1:8080
```

```bash
python3 skills/linear-algebra-ai-api-checks/scripts/check_ai_interfaces.py --skip-llm
```

Use `--skip-llm` only for fast syntax or routing checks when model calls are unavailable. It skips chat, grading, grading follow-up, and PPT summary.

## Manual Mutating Check

Do not run this by default. `POST /api/v1/textbook/ingest` starts background OCR, embedding, and database writes. Test it only when textbook ingestion code changed:

1. Create or reuse a tiny PDF fixture.
2. Insert a temporary `textbooks` row through the Go workflow or database.
3. POST `file_path`, `textbook_name`, and `textbook_id` to `/api/v1/textbook/ingest`.
4. Poll the `textbooks.status`, `processed_pages`, and `textbook_chunks` rows.
5. Clean up temporary DB rows and files.

## Expected Behavior After Prompt/Memory Changes

- Chat responses should remain plain Markdown/text by default, not visualization JSON.
- `/api/v1/chat` must still include both `response` and `text_explanation` for compatibility.
- First-message chat may include `title`; non-first-message chat can return `title: null`.
- RAG failures should not fail chat; they should return a normal answer with an empty `citations` list.

