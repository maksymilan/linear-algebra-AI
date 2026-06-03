import json
import logging
from typing import List, Optional

from fastapi import BackgroundTasks, FastAPI, File, Form, HTTPException, Query, UploadFile
from fastapi.middleware.cors import CORSMiddleware

from clients import client
from config import resolve_model, resolve_model_id, settings
from database import ensure_vector_index, get_db_conn
from file_utils import extract_text_from_file, file_to_base64
from llm import chat_completion
from memory import build_memory_state, build_rag_query
from prompts import GRADING_FOLLOW_UP_PROMPT, GRADING_SYSTEM_PROMPT, PPT_SUMMARY_PROMPT, SYSTEM_PROMPT
from rag import retrieve_textbook_context
from response_utils import extract_model_title, parse_model_json
from textbook_tasks import process_textbook_task


logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

app = FastAPI()
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.on_event("startup")
def on_startup() -> None:
    ensure_vector_index()


def format_chat_system_prompt(
    *,
    memory_context: str,
    learned_summaries: str,
    retrieved_context: str,
) -> str:
    return (
        SYSTEM_PROMPT.replace("{memory_context}", memory_context or "无。")
        .replace("{learned_summaries}", learned_summaries or "无。")
        .replace("{retrieved_context}", retrieved_context or "（未检索到相关教材片段。）")
    )


def generate_title(prompt: str) -> str:
    prompt = (prompt or "").strip()
    if not prompt:
        return "未命名对话"
    try:
        response = chat_completion(
            client,
            model=resolve_model("title"),
            messages=[
                {
                    "role": "system",
                    "content": (
                        "你是一个对话标题生成器。请根据用户开启对话的第一条问题，"
                        "生成一个自然、具体、简短的中文标题。不要照抄整句问题，"
                        "不要使用“新对话”“线性代数答疑”“问题”等泛标题。"
                    ),
                },
                {
                    "role": "user",
                    "content": (
                        "请只输出标题本身，不要加引号、JSON、Markdown 或解释。"
                        "标题不超过12个汉字。\n\n"
                        f"用户第一条问题：{prompt}"
                    ),
                }
            ],
            max_tokens=80,
            temperature=0.2,
        )
        raw_title = response.choices[0].message.content or ""
        return extract_model_title(raw_title)
    except Exception as exc:
        logger.warning("AI title generation failed: %s", exc)
        return "未命名对话"


def enforce_premium_chat_limit(user_id: int, model_id: str) -> int:
    """Increment and enforce the shared daily limit for premium chat models."""
    if model_id not in settings.limited_chat_model_ids:
        return -1
    if user_id <= 0:
        raise HTTPException(status_code=400, detail="高级模型需要有效的用户 ID")

    conn = get_db_conn()
    cur = conn.cursor()
    try:
        cur.execute(
            """
            INSERT INTO model_usage_daily (user_id, usage_date, bucket, count, updated_at)
            VALUES (%s, CURRENT_DATE, 'premium_chat', 1, CURRENT_TIMESTAMP)
            ON CONFLICT (user_id, usage_date, bucket)
            DO UPDATE SET
                count = model_usage_daily.count + 1,
                updated_at = CURRENT_TIMESTAMP
            WHERE model_usage_daily.count < %s
            RETURNING count
            """,
            (user_id, settings.premium_chat_daily_limit),
        )
        row = cur.fetchone()
        if not row:
            conn.rollback()
            raise HTTPException(
                status_code=429,
                detail=f"高级模型今日调用次数已达上限 {settings.premium_chat_daily_limit} 次",
            )
        conn.commit()
        return int(row[0])
    finally:
        cur.close()
        conn.close()


def get_premium_chat_usage(user_id: int) -> dict:
    if user_id <= 0:
        return {"count": 0, "limit": settings.premium_chat_daily_limit, "remaining": settings.premium_chat_daily_limit}

    conn = get_db_conn()
    cur = conn.cursor()
    try:
        cur.execute(
            """
            SELECT count
            FROM model_usage_daily
            WHERE user_id = %s AND usage_date = CURRENT_DATE AND bucket = 'premium_chat'
            """,
            (user_id,),
        )
        row = cur.fetchone()
        count = int(row[0]) if row else 0
        remaining = max(0, settings.premium_chat_daily_limit - count)
        return {"count": count, "limit": settings.premium_chat_daily_limit, "remaining": remaining}
    finally:
        cur.close()
        conn.close()


@app.post("/api/v1/textbook/ingest")
async def ingest_textbook_api(
    background_tasks: BackgroundTasks,
    file_path: str = Form(...),
    textbook_name: str = Form(...),
    textbook_id: int = Form(...),
):
    background_tasks.add_task(process_textbook_task, file_path, textbook_name, textbook_id)
    return {"message": "Started processing textbook asynchronously"}


@app.get("/api/v1/models")
async def list_models(user_id: int = Query(0)):
    premium_usage = get_premium_chat_usage(user_id)
    return {
        "chat_models": settings.chat_model_options,
        "model_groups": settings.model_groups,
        "roles": {
            "chat": settings.chat_model,
            "title": settings.title_model,
            "grading": settings.grading_model,
            "grading_chat": settings.grading_chat_model,
            "memory": settings.memory_model,
            "ppt_summary": settings.ppt_summary_model,
            "ocr": settings.vision_model_name,
            "ocr_repair": settings.ocr_repair_model,
            "exercise_extract": settings.exercise_extract_model,
            "embedding": settings.embedding_model,
        },
        "defaults": {
            "chat": resolve_model("chat"),
            "title": resolve_model("title"),
            "grading": resolve_model("grading"),
            "grading_chat": resolve_model("grading_chat"),
            "ppt_summary": resolve_model("ppt_summary"),
            "ocr": resolve_model("ocr"),
            "ocr_repair": resolve_model("ocr_repair"),
            "exercise_extract": resolve_model("exercise_extract"),
            "embedding": resolve_model("embedding"),
        },
        "features": {
            "ocr_repair_enabled": settings.ocr_repair_enabled,
            "premium_chat_daily_limit": settings.premium_chat_daily_limit,
            "limited_chat_model_ids": settings.limited_chat_model_ids,
        },
        "usage": {
            "premium_chat": premium_usage,
        },
    }


@app.post("/api/v1/textbook/delete")
async def delete_textbook_api(
    textbook_id: int = Form(...),
    textbook_name: str = Form(...),
):
    try:
        conn = get_db_conn()
        cur = conn.cursor()
        cur.execute("DELETE FROM textbook_chunks WHERE textbook_name = %s", (textbook_name,))
        deleted = cur.rowcount
        cur.execute(
            "DELETE FROM textbook_exercises WHERE textbook_name = %s OR textbook_id = %s",
            (textbook_name, textbook_id),
        )
        deleted_exercises = cur.rowcount
        conn.commit()
        cur.close()
        conn.close()
        logger.info(
            "Deleted %s chunks and %s exercises for textbook %s (id=%s)",
            deleted,
            deleted_exercises,
            textbook_name,
            textbook_id,
        )
        return {"message": "deleted", "deleted_chunks": deleted, "deleted_exercises": deleted_exercises}
    except Exception as exc:
        logger.error("Delete textbook chunks error: %s", exc)
        raise HTTPException(status_code=500, detail=str(exc))


@app.post("/api/v1/ocr")
async def ocr_endpoint(file: UploadFile = File(...)):
    text = extract_text_from_file(file)
    if "Error" in text or "Unsupported" in text:
        raise HTTPException(status_code=400, detail=text)
    return {"text": text}


@app.post("/api/v1/summarize_ppt")
async def summarize_ppt(file: UploadFile = File(...)):
    text = extract_text_from_file(file)
    if "Error" in text or "Unsupported" in text:
        raise HTTPException(status_code=400, detail=text)

    messages = [
        {"role": "system", "content": PPT_SUMMARY_PROMPT},
        {"role": "user", "content": f"以下是课件提取的文本内容：\n\n{text}"},
    ]
    try:
        response = chat_completion(
            client,
            model=resolve_model("ppt_summary"),
            messages=messages,
            max_tokens=2048,
            temperature=0.3,
        )
        return {"summary": response.choices[0].message.content or ""}
    except Exception as exc:
        logger.error("PPT summarize API error: %s", exc)
        raise HTTPException(status_code=500, detail=str(exc))


@app.post("/api/v1/chat")
async def multimodal_chat(
    prompt: Optional[str] = Form(None),
    files: Optional[List[UploadFile]] = File(None),
    is_first_message: bool = Form(False),
    learned_summaries: str = Form(""),
    current_week: int = Form(0),
    history: Optional[str] = Form(None),
    model_id: Optional[str] = Form(None),
    user_id: int = Form(0),
):
    if not prompt and not files:
        raise HTTPException(status_code=400, detail="Prompt or files must be provided.")

    current_prompt = prompt or ""
    user_content_list = []
    if files:
        for file in files:
            if file.content_type and "image" in file.content_type:
                user_content_list.append(
                    {"type": "image_url", "image_url": {"url": file_to_base64(file)}}
                )
            else:
                extracted_text = extract_text_from_file(file)
                current_prompt += (
                    f"\n\n--- 来自文件 '{file.filename}' 的附加内容 ---\n"
                    f"{extracted_text}\n--- 文件内容结束 ---"
                )
    user_content_list.insert(0, {"type": "text", "text": current_prompt})

    selected_model_id = resolve_model_id("chat", model_id)
    selected_model = resolve_model("chat", selected_model_id)
    premium_usage_count = enforce_premium_chat_limit(user_id, selected_model_id)
    memory_state = build_memory_state(client, resolve_model("memory"), history)
    rag_query = build_rag_query(current_prompt, memory_state)
    retrieved_context, citations = retrieve_textbook_context(
        query=rag_query,
        current_week=current_week,
        k=settings.rag_top_k,
    )
    system_prompt = format_chat_system_prompt(
        memory_context=memory_state.prompt_context,
        learned_summaries=learned_summaries,
        retrieved_context=retrieved_context,
    )

    messages: List[dict] = [{"role": "system", "content": system_prompt}]
    messages.extend(memory_state.recent_messages)
    messages.append({"role": "user", "content": user_content_list})

    try:
        response = chat_completion(
            client,
            model=selected_model,
            messages=messages,
            max_tokens=4096,
            temperature=0.55,
        )
        ai_response = response.choices[0].message.content or ""
        parsed = parse_model_json(ai_response)
        title = generate_title(prompt or current_prompt) if is_first_message else None

        if isinstance(parsed, dict):
            text = parsed.get("response") or parsed.get("text_explanation") or ai_response
            parsed["response"] = text
            parsed.setdefault("text_explanation", text)
            parsed.setdefault("citations", citations)
            parsed.setdefault("model", selected_model)
            parsed.setdefault("model_id", selected_model_id)
            if premium_usage_count >= 0:
                parsed.setdefault("premium_usage", {
                    "count": premium_usage_count,
                    "limit": settings.premium_chat_daily_limit,
                })
            if title:
                parsed["title"] = title
            return parsed

        return {
            "response": ai_response,
            "text_explanation": ai_response,
            "title": title,
            "citations": citations,
            "model": selected_model,
            "model_id": selected_model_id,
            "premium_usage": (
                {"count": premium_usage_count, "limit": settings.premium_chat_daily_limit}
                if premium_usage_count >= 0 else None
            ),
        }
    except Exception as exc:
        logger.error("Chat API error: %s", exc)
        raise HTTPException(status_code=500, detail=str(exc))


@app.post("/api/v1/grade")
async def grade_homework(problem_text: str = Form(...), solution_text: str = Form(...)):
    if not solution_text or not problem_text:
        raise HTTPException(status_code=400, detail="Problem and solution text must be provided.")
    try:
        user_prompt = f"请批改以下作业：\n--- 题目 ---\n{problem_text}\n--- 学生解答 ---\n{solution_text}"
        messages = [
            {"role": "system", "content": GRADING_SYSTEM_PROMPT},
            {"role": "user", "content": user_prompt},
        ]
        response = chat_completion(
            client,
            model=resolve_model("grading"),
            messages=messages,
            max_tokens=4096,
            temperature=0.3,
        )
        return {"correction": response.choices[0].message.content or ""}
    except Exception as exc:
        logger.error("Grading error: %s", exc)
        raise HTTPException(status_code=500, detail=str(exc))


@app.post("/api/v1/grading/chat")
async def grading_chat(
    problem_text: str = Form(...),
    solution_text: str = Form(...),
    correction_text: str = Form(...),
    new_question: str = Form(...),
    chat_history: str = Form("[]"),
):
    final_prompt = f"""{GRADING_FOLLOW_UP_PROMPT}

作业上下文：
---
### 原始题目
{problem_text}

### 学生的解答
{solution_text}

### 已给出的批改意见
{correction_text}
---

学生接着问：
{new_question}
"""

    messages = [{"role": "user", "content": final_prompt}]
    try:
        response = chat_completion(
            client,
            model=resolve_model("grading_chat"),
            messages=messages,
            max_tokens=4096,
            temperature=0.45,
        )
        ai_response = response.choices[0].message.content or "Response Error"
        parsed = parse_model_json(ai_response)
        if isinstance(parsed, dict):
            text = parsed.get("response") or parsed.get("text_explanation") or json.dumps(parsed, ensure_ascii=False)
        else:
            text = ai_response
        return {"response": text, "text_explanation": text}
    except Exception as exc:
        logger.error("Grading chat API error: %s", exc)
        raise HTTPException(status_code=500, detail=str(exc))


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(app, host="0.0.0.0", port=8000)
