import json
import logging
from typing import List, Optional

from fastapi import BackgroundTasks, FastAPI, File, Form, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware

from clients import client
from config import settings
from database import ensure_vector_index, get_db_conn
from file_utils import extract_text_from_file, file_to_base64
from memory import build_memory_state, build_rag_query
from prompts import GRADING_FOLLOW_UP_PROMPT, GRADING_SYSTEM_PROMPT, PPT_SUMMARY_PROMPT, SYSTEM_PROMPT
from rag import retrieve_textbook_context
from response_utils import compact_title, parse_model_json, title_from_prompt
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
        return "新对话"
    try:
        response = client.chat.completions.create(
            model=settings.model_name,
            messages=[
                {
                    "role": "user",
                    "content": (
                        "请为下面这条线性代数学习提问生成一个中文会话标题，"
                        "不超过10个字，只输出标题本身：\n" + prompt
                    ),
                }
            ],
            max_tokens=40,
            temperature=0.2,
        )
        title = compact_title(response.choices[0].message.content or "")
        if title in {"矩阵", "线性代数", "问题", "学习"}:
            return title_from_prompt(prompt)
        return title or title_from_prompt(prompt)
    except Exception as exc:
        logger.warning("Title generation failed, using fallback: %s", exc)
        return title_from_prompt(prompt)


@app.post("/api/v1/textbook/ingest")
async def ingest_textbook_api(
    background_tasks: BackgroundTasks,
    file_path: str = Form(...),
    textbook_name: str = Form(...),
    textbook_id: int = Form(...),
):
    background_tasks.add_task(process_textbook_task, file_path, textbook_name, textbook_id)
    return {"message": "Started processing textbook asynchronously"}


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
        conn.commit()
        cur.close()
        conn.close()
        logger.info("Deleted %s chunks for textbook %s (id=%s)", deleted, textbook_name, textbook_id)
        return {"message": "deleted", "deleted_chunks": deleted}
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
        response = client.chat.completions.create(
            model=settings.model_name,
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

    memory_state = build_memory_state(client, settings.model_name, history)
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
        response = client.chat.completions.create(
            model=settings.model_name,
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
            if title:
                parsed["title"] = title
            return parsed

        return {
            "response": ai_response,
            "text_explanation": ai_response,
            "title": title,
            "citations": citations,
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
        response = client.chat.completions.create(
            model=settings.model_name,
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
        response = client.chat.completions.create(
            model=settings.model_name,
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
