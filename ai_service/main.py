# ai_service/main.py

import logging
import base64
import pymupdf # a.k.a. Fitz
import os
import re
import json
import psycopg2
from pgvector.psycopg2 import register_vector
from fastapi import FastAPI, HTTPException, UploadFile, File, Form, Request, BackgroundTasks
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from typing import List, Optional, Dict
from dotenv import load_dotenv
from openai import OpenAI, APIError
# 导入修正后的 prompts
from prompts import SYSTEM_PROMPT, GRADING_SYSTEM_PROMPT, GRADING_FOLLOW_UP_PROMPT, PPT_SUMMARY_PROMPT
import ingest_pdf

# --- 日志记录设置 ---
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# --- 加载环境变量 ---
load_dotenv()
api_key = os.getenv("AI_API_KEY", os.getenv("QWEN_API_KEY")) # 兼容旧变量
url = os.getenv("AI_BASE_URL", os.getenv("QWEN_URL"))
model_name = os.getenv("AI_MODEL_NAME", "gemini-3.1-pro-preview")
model_name_vl = os.getenv("AI_VL_MODEL_NAME", "gemini-3.1-pro-preview") # 使用相同或指定的视觉模型
embedding_model = os.getenv("AI_EMBEDDING_MODEL", "text-embedding-3-small")

# --- RAG 相关配置 ---
DB_CONFIG = {
    "dbname": os.getenv("DB_NAME", "LA-DB"),
    "user": os.getenv("DB_USER", "postgres"),
    "password": os.getenv("DB_PASSWORD", "password"),
    "host": os.getenv("DB_HOST", "localhost"),
    "port": os.getenv("DB_PORT", "5432"),
}
RAG_TOP_K = int(os.getenv("RAG_TOP_K", "5"))
RAG_MAX_CHARS_PER_CHUNK = int(os.getenv("RAG_MAX_CHARS_PER_CHUNK", "600"))
RAG_DISTANCE_THRESHOLD = float(os.getenv("RAG_DISTANCE_THRESHOLD", "0.8"))  # 余弦距离，越小越相关

# --- 对话记忆相关配置 ---
# 一次对话中最多带回多少"轮"历史（一轮 = 一条 user + 一条 assistant）。
# 超出的最老对话会被丢弃，防止 token 爆炸 + 老话题干扰当下。
HISTORY_MAX_TURNS = int(os.getenv("HISTORY_MAX_TURNS", "8"))
# 每条历史消息最多保留的字符数（AI 回答可能上万字；截断 + 保头尾，兼顾省 token 和保留结论）
HISTORY_MAX_CHARS_PER_MSG = int(os.getenv("HISTORY_MAX_CHARS_PER_MSG", "1500"))
# RAG 合成查询时，最多回看多少条最近的用户问题拼进 query
# （比如用户这轮说"来几个例题"，配上他上轮说的"什么是欧氏空间"，才能检出对题的教材片段）
RAG_HISTORY_LOOKBACK = int(os.getenv("RAG_HISTORY_LOOKBACK", "2"))

if not api_key or not url:
    logger.error("API key or URL not found in environment variables. Please check your .env file.")
    exit()

# --- 初始化服务 ---
client = OpenAI(api_key=api_key, base_url=url)
app = FastAPI()


def _get_db_conn():
    conn = psycopg2.connect(**DB_CONFIG)
    register_vector(conn)
    return conn


@app.on_event("startup")
def _ensure_vector_index():
    """启动时尝试创建 pgvector 的 ivfflat 索引（幂等）。失败不影响服务启动。"""
    try:
        conn = _get_db_conn()
        cur = conn.cursor()
        cur.execute(
            "CREATE INDEX IF NOT EXISTS idx_textbook_chunks_embedding "
            "ON textbook_chunks USING ivfflat (embedding vector_cosine_ops) WITH (lists = 100)"
        )
        conn.commit()
        cur.close()
        conn.close()
        logger.info("textbook_chunks ivfflat 索引已就绪")
    except Exception as e:
        logger.warning(f"创建 ivfflat 索引失败（可忽略，走全表扫描）：{e}")


_PAGE_MARKER_RE = re.compile(r"---\s*第\s*(\d+)\s*页\s*---")


def _extract_page_num(content: str) -> Optional[int]:
    """
    从 chunk 内容里用正则抓最近的 `--- 第 N 页 ---` 标记。
    - 注意：chunk 有可能跨页，我们返回该 chunk 内**第一个**页码（代表片段开始的位置）。
    - 找不到返回 None。
    """
    if not content:
        return None
    m = _PAGE_MARKER_RE.search(content)
    if not m:
        return None
    try:
        return int(m.group(1))
    except ValueError:
        return None


def _clean_snippet(content: str, max_chars: int = RAG_MAX_CHARS_PER_CHUNK) -> str:
    """把 chunk content 清成给前端展示的简短预览：去掉页码标记，压缩空白，截断。"""
    if not content:
        return ""
    cleaned = _PAGE_MARKER_RE.sub(" ", content)
    cleaned = re.sub(r"\s+", " ", cleaned).strip()
    if len(cleaned) > max_chars:
        cleaned = cleaned[:max_chars].rstrip() + "..."
    return cleaned


# ---------------------------------------------------------------------------
# 对话历史解析
# ---------------------------------------------------------------------------
def _truncate_middle(text: str, max_chars: int) -> str:
    """过长消息做"保头保尾"的截断，比单纯截首更稳妥地保留对话结论。"""
    if not text or len(text) <= max_chars:
        return text
    head = max_chars * 2 // 3
    tail = max_chars - head - 20
    if tail <= 0:
        return text[:max_chars].rstrip() + "..."
    return text[:head].rstrip() + "\n...\n" + text[-tail:].lstrip()


def parse_history(
    history_raw: Optional[str],
    max_turns: int = HISTORY_MAX_TURNS,
    max_chars_per_msg: int = HISTORY_MAX_CHARS_PER_MSG,
) -> List[Dict[str, str]]:
    """
    解析 Go 端传来的 history JSON 字符串，返回 OpenAI 格式的 messages 列表。
    Go 的 ChatMessage.Role 是 "user" / "ai"，此处把 "ai" 翻译成 "assistant"。
    同时按"轮数"封顶（保留最近 max_turns 轮）并对过长消息做截断。
    """
    if not history_raw:
        return []
    try:
        raw_list = json.loads(history_raw)
    except (json.JSONDecodeError, TypeError) as e:
        logger.warning(f"history 解析失败，忽略: {e}")
        return []
    if not isinstance(raw_list, list):
        return []

    normalized: List[Dict[str, str]] = []
    for item in raw_list:
        if not isinstance(item, dict):
            continue
        role_raw = (item.get("sender") or item.get("role") or "").strip().lower()
        content = item.get("text") or item.get("content") or ""
        if not isinstance(content, str) or not content.strip():
            continue
        if role_raw in ("user", "human"):
            role = "user"
        elif role_raw in ("ai", "assistant", "bot", "system-ai"):
            role = "assistant"
        else:
            continue
        normalized.append({"role": role, "content": _truncate_middle(content, max_chars_per_msg)})

    # 只保留最近 max_turns 轮对话（一轮大约 2 条消息）
    if max_turns > 0:
        max_msgs = max_turns * 2
        if len(normalized) > max_msgs:
            normalized = normalized[-max_msgs:]
    return normalized


def build_rag_query(current_prompt: str, history: List[Dict[str, str]]) -> str:
    """
    合成用于 RAG 向量检索的"增强 query"。
    单看当前这句（比如"来几个例题"）语义稀薄，命中率很差；
    我们把最近 RAG_HISTORY_LOOKBACK 条用户问题拼起来作为话题上下文，
    让 embedding 检索能命中真正想要的教材片段。
    """
    current_prompt = (current_prompt or "").strip()
    if RAG_HISTORY_LOOKBACK <= 0 or not history:
        return current_prompt

    past_user_qs: List[str] = []
    for msg in reversed(history):
        if msg.get("role") == "user":
            q = (msg.get("content") or "").strip()
            if q:
                past_user_qs.append(q)
        if len(past_user_qs) >= RAG_HISTORY_LOOKBACK:
            break
    past_user_qs.reverse()

    if not past_user_qs:
        return current_prompt
    # 历史问题权重低一点；把当前问题重复一次强化"这才是主查询"
    joined_past = " / ".join(past_user_qs)
    return f"[上下文：{joined_past}] {current_prompt}"


def retrieve_textbook_context(query: str, current_week: int = 0, k: int = RAG_TOP_K):
    """
    从 textbook_chunks 里按余弦相似度检索 top-k 片段。
    - current_week > 0 时只检索 week_num <= current_week 的片段，避免剧透后续章节。
    - 会跨所有已上传教材检索（不按 textbook_name 过滤）。
    - 返回 tuple(context_text: str, citations: List[dict])
        citations 元素结构：
        {
            "index": 1,
            "textbook_name": "...",
            "week_num": 3,
            "page_num": 42,   # 可能为 None
            "distance": 0.12,
            "snippet": "...",
        }
    - 无结果则返回 ("", [])。
    """
    query = (query or "").strip()
    if not query:
        return "", []

    # 1. 拿 query 的 embedding
    try:
        emb_resp = client.embeddings.create(input=[query], model=embedding_model)
        query_vec = emb_resp.data[0].embedding
    except Exception as e:
        logger.warning(f"RAG 取 query embedding 失败，本轮跳过检索: {e}")
        return "", []

    # 2. 向量检索
    try:
        conn = _get_db_conn()
        cur = conn.cursor()
        if current_week and current_week > 0:
            cur.execute(
                """
                SELECT textbook_name, content, week_num, embedding <=> %s::vector AS distance
                FROM textbook_chunks
                WHERE week_num <= %s
                ORDER BY embedding <=> %s::vector
                LIMIT %s
                """,
                (query_vec, current_week, query_vec, k),
            )
        else:
            cur.execute(
                """
                SELECT textbook_name, content, week_num, embedding <=> %s::vector AS distance
                FROM textbook_chunks
                ORDER BY embedding <=> %s::vector
                LIMIT %s
                """,
                (query_vec, query_vec, k),
            )
        rows = cur.fetchall()
        cur.close()
        conn.close()
    except Exception as e:
        logger.warning(f"RAG 向量检索失败，本轮跳过: {e}")
        return "", []

    if not rows:
        return "", []

    # 3. 过滤低相关度并拼接
    pieces: List[str] = []
    citations: List[dict] = []
    for (tb_name, content, week_num, distance) in rows:
        if distance is not None and distance > RAG_DISTANCE_THRESHOLD:
            continue

        page_num = _extract_page_num(content or "")
        raw_snippet = (content or "").strip().replace("\x00", "")
        if len(raw_snippet) > RAG_MAX_CHARS_PER_CHUNK:
            raw_snippet = raw_snippet[:RAG_MAX_CHARS_PER_CHUNK] + "..."

        idx = len(pieces) + 1
        location = f"第{week_num}周"
        if page_num is not None:
            location += f" · 第{page_num}页"

        pieces.append(
            f"[片段{idx} | 教材《{tb_name}》· {location} · 相似度距离={distance:.3f}]\n{raw_snippet}"
        )
        citations.append({
            "index": idx,
            "textbook_name": tb_name,
            "week_num": int(week_num) if week_num is not None else None,
            "page_num": page_num,
            "distance": float(distance) if distance is not None else None,
            "snippet": _clean_snippet(content or ""),
        })

    if not pieces:
        return "", []

    logger.info(
        f"RAG 检索命中 {len(pieces)} 个相关片段 (current_week={current_week}), "
        f"教材来源 {sorted(set(ci['textbook_name'] for ci in citations))}"
    )
    return "\n\n".join(pieces), citations

# --- 辅助函数 (保持不变) ---
def file_to_base64(file: UploadFile) -> str:
    content = file.file.read()
    file.file.seek(0)
    mime_type = file.content_type
    encoded_string = base64.b64encode(content).decode('utf-8')
    return f"data:{mime_type};base64,{encoded_string}"

def extract_text_from_file(file: UploadFile) -> str:
    mime_type = file.content_type if file.content_type else ""
    content = file.file.read()
    file.file.seek(0)

    if "pdf" in mime_type:
        try:
            doc = pymupdf.open(stream=content, filetype="pdf")
            text = "".join(page.get_text() for page in doc)
            return text
        except Exception as e:
            logger.error(f"Error extracting PDF text: {e}")
            return f"Error extracting PDF text: {e}"
    elif "text" in mime_type:
        return content.decode("utf-8")
    elif "image" in mime_type:
        data_url = file_to_base64(file)
        messages = [{"role": "user","content": [{"type": "text", "text": "请提取这张图片中的所有数学公式和文本内容。不要有任何额外的解释或说明，只返回提取的纯文本。"},{"type": "image_url", "image_url": {"url": data_url}}]}]
        try:
            logger.info(f"Sending image OCR request to model '{model_name_vl}'...")
            response = client.chat.completions.create(model=model_name_vl, messages=messages, max_tokens=2048)
            logger.info("Successfully received OCR response from model.")
            return response.choices[0].message.content or ""
        except APIError as e:
            return f"Error from AI service: {e.message}"
        except Exception as e:
            return f"An unexpected error occurred: {e}"
    else:
        return "Unsupported file type."

# --- 新增: 后台异步 OCR 与向量化处理 ---
def process_textbook_task(file_path: str, textbook_name: str, textbook_id: int):
    try:
        logger.info(f"Background Task: 开始解析教材 {textbook_name}")
        # 1. OCR 提取 (复用 ingest_pdf.py 逻辑)
        text = ingest_pdf.extract_text_via_ocr(file_path, textbook_id=textbook_id, max_workers=5)
        # 2. 分块
        chunks = ingest_pdf.chunk_text(text)
        # 3. 向量化入库
        ingest_pdf.ingest_to_db(textbook_name, 1, chunks) # 全量教材默认 week 1
        
        # 4. 更新数据库状态为 completed
        conn = psycopg2.connect(dbname="LA-DB", user="postgres", password="password", host="localhost", port="5432")
        cur = conn.cursor()
        cur.execute("UPDATE textbooks SET status = 'completed' WHERE id = %s", (textbook_id,))
        conn.commit()
        cur.close()
        conn.close()
        logger.info(f"Background Task: {textbook_name} 处理完成")
    except Exception as e:
        logger.error(f"Background Task Error: {e}")
        if str(e) == "Task canceled by user":
            logger.info(f"Background Task: {textbook_name} 解析已取消")
            return
        try:
            conn = psycopg2.connect(dbname="LA-DB", user="postgres", password="password", host="localhost", port="5432")
            cur = conn.cursor()
            # 如果由于其他原因失败，我们才将状态置为 failed，避免覆盖 canceled 状态
            cur.execute("SELECT status FROM textbooks WHERE id = %s", (textbook_id,))
            current_status = cur.fetchone()[0]
            if current_status != 'canceled':
                cur.execute("UPDATE textbooks SET status = 'failed' WHERE id = %s", (textbook_id,))
            conn.commit()
            conn.close()
        except:
            pass

@app.post("/api/v1/textbook/ingest")
async def ingest_textbook_api(
    background_tasks: BackgroundTasks,
    file_path: str = Form(...),
    textbook_name: str = Form(...),
    textbook_id: int = Form(...)
):
    background_tasks.add_task(process_textbook_task, file_path, textbook_name, textbook_id)
    return {"message": "Started processing textbook asynchronously"}


@app.post("/api/v1/textbook/delete")
async def delete_textbook_api(
    textbook_id: int = Form(...),
    textbook_name: str = Form(...)
):
    """
    删除向量库里某本教材的全部 chunks。
    由于 textbook_chunks 当前没有 textbook_id 外键，这里按 textbook_name 精确删除。
    """
    try:
        conn = _get_db_conn()
        cur = conn.cursor()
        cur.execute(
            "DELETE FROM textbook_chunks WHERE textbook_name = %s",
            (textbook_name,),
        )
        deleted = cur.rowcount
        conn.commit()
        cur.close()
        conn.close()
        logger.info(
            f"已删除教材《{textbook_name}》(id={textbook_id}) 的向量库 chunks，共 {deleted} 行"
        )
        return {"message": "deleted", "deleted_chunks": deleted}
    except Exception as e:
        logger.error(f"Delete textbook chunks error: {e}")
        raise HTTPException(status_code=500, detail=str(e))

# --- API 端点 ---

@app.post("/api/v1/ocr")
async def ocr_endpoint(file: UploadFile = File(...)):
    if not file:
        raise HTTPException(status_code=400, detail="No file provided for OCR.")
    text = extract_text_from_file(file)
    if "Error" in text or "Unsupported" in text:
        raise HTTPException(status_code=400, detail=text)
    return {"text": text}

@app.post("/api/v1/summarize_ppt")
async def summarize_ppt(file: UploadFile = File(...)):
    if not file:
        raise HTTPException(status_code=400, detail="No file provided.")
    
    text = extract_text_from_file(file)
    if "Error" in text or "Unsupported" in text:
        raise HTTPException(status_code=400, detail=text)
    
    messages = [
        {"role": "system", "content": PPT_SUMMARY_PROMPT},
        {"role": "user", "content": f"以下是课件提取的文本内容：\n\n{text}"}
    ]
    try:
        response = client.chat.completions.create(model=model_name, messages=messages, max_tokens=2048, temperature=0.3)
        summary = response.choices[0].message.content or ""
        return {"summary": summary}
    except Exception as e:
        logger.error(f"PPT Summarize API Error: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/api/v1/chat")
async def multimodal_chat(
    prompt: Optional[str] = Form(None),
    files: Optional[List[UploadFile]] = File(None),
    is_first_message: bool = Form(False),
    learned_summaries: str = Form(""), # **新增：接收后端传来的已学知识总结**
    current_week: int = Form(0),       # **新增：班级当前教学周，用于限制 RAG 检索范围**
    history: Optional[str] = Form(None) # **新增：JSON 字符串形式的历史对话，由 Go 后端从数据库加载并传入**
):
    if not prompt and not files:
        raise HTTPException(status_code=400, detail="Prompt or files must be provided.")
    user_content_list = []
    current_prompt = prompt if prompt else ""
    if files:
        for file in files:
            if file.content_type and "image" in file.content_type:
                data_url = file_to_base64(file)
                user_content_list.append({"type": "image_url", "image_url": {"url": data_url}})
            else:
                extracted_text = extract_text_from_file(file)
                file_info = f"\n\n--- 来自文件 '{file.filename}' 的附加内容 ---\n{extracted_text}\n--- 文件内容结束 ---"
                current_prompt += file_info
    user_content_list.insert(0, {"type": "text", "text": current_prompt})

    # --- 解析对话历史（Go 端以 JSON 字符串 multipart 传入） ---
    history_messages = parse_history(history)
    logger.info(
        f"multimodal_chat: 本轮对话携带历史消息 {len(history_messages)} 条 "
        f"(封顶 {HISTORY_MAX_TURNS} 轮)"
    )

    # --- RAG 检索：合成"当前问题 + 最近几轮用户问题"作为检索 query ---
    # 单纯一句"来几个例题"几乎检索不到任何相关教材；配上话题上下文后才能命中。
    rag_query = build_rag_query(current_prompt, history_messages)
    retrieved_context, citations = retrieve_textbook_context(
        query=rag_query,
        current_week=current_week,
        k=RAG_TOP_K,
    )
    if not retrieved_context:
        retrieved_context = "（未检索到相关教材片段，请主要依赖你的自身知识作答）"

    # 动态构建 SYSTEM_PROMPT，注入已学知识 + 检索上下文
    formatted_system_prompt = SYSTEM_PROMPT.replace(
        "{learned_summaries}",
        learned_summaries if learned_summaries else "无。"
    ).replace(
        "{retrieved_context}",
        retrieved_context
    )

    # 组装 messages：system → 历史对话 → 当前用户消息
    # 注意：历史消息的 content 是纯文本字符串，当前消息是 list（支持图文混合）
    messages: List[dict] = [{"role": "system", "content": formatted_system_prompt}]
    messages.extend(history_messages)
    messages.append({"role": "user", "content": user_content_list})

    # 强制要求模型在首次对话时生成 title
    if is_first_message:
        messages[0]["content"] += "\n\n请注意：这是用户开启的全新对话。请在返回的JSON结果中，额外提供一个 `title` 字段，用最简短的词语（不超过10个字）总结用户这第一句话的意图或主题。如果不是JSON返回，请不要加 title。"

    try:
        response = client.chat.completions.create(model=model_name, messages=messages, max_tokens=4096, temperature=0.7)
        ai_response = response.choices[0].message.content or ""
        try:
            if ai_response.strip().startswith("```json"):
                json_part = ai_response.strip().replace("```json", "").replace("```", "")
                parsed = json.loads(json_part.strip())
            else:
                parsed = json.loads(ai_response)
            # 附带 citations 一起返回
            if isinstance(parsed, dict):
                parsed.setdefault("citations", citations)
            return parsed
        except json.JSONDecodeError:
            logger.warning("AI response was not valid JSON, returning as plain text.")
            return {
                "response": ai_response,
                "title": "新对话" if is_first_message else None,
                "citations": citations,
            }
    except Exception as e:
        logger.error(f"Chat API Error: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/api/v1/grade")
async def grade_homework(problem_text: str = Form(...), solution_text: str = Form(...)):
    if not solution_text or not problem_text:
        raise HTTPException(status_code=400, detail="Problem and solution text must be provided.")
    try:
        user_prompt = f"请批改以下作业：\n--- 题目 ---\n{problem_text}\n--- 学生解答 ---\n{solution_text}"
        messages = [{"role": "system", "content": GRADING_SYSTEM_PROMPT}, {"role": "user", "content": user_prompt}]
        response = client.chat.completions.create(model=model_name, messages=messages, max_tokens=4096, temperature=0.3)
        correction = response.choices[0].message.content or ""
        return {"correction": correction}
    except Exception as e:
        logger.error(f"Grading Error: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/api/v1/grading/chat")
async def grading_chat(
    problem_text: str = Form(...),
    solution_text: str = Form(...),
    correction_text: str = Form(...),
    new_question: str = Form(...),
    chat_history: str = Form("[]")
):
    """作业批改后的追问答疑接口"""
    
    # --- 最终修正：使用 f-string 安全地构建 prompt ---
    # 这样可以完全避免 .format() 带来的所有解析问题
    final_prompt = f"""{GRADING_FOLLOW_UP_PROMPT}

**作业上下文 (已加载)**:
---
### 原始题目
{problem_text}

### 学生的解答
{solution_text}

### 你给出的批改意见
{correction_text}
---

**学生接着问了以下问题**:
{new_question}
"""
    
    messages = [{"role": "user", "content": final_prompt}]

    try:
        logger.info("Sending request to grading chat AI.")
        response = client.chat.completions.create(model=model_name, messages=messages, max_tokens=4096, temperature=0.5)
        ai_response = response.choices[0].message.content or "Response Error"

        # --- 健壮的返回逻辑 ---
        try:
            if ai_response.strip().startswith("```json"):
                json_part = ai_response.strip().replace("```json", "").replace("```", "")
                return json.loads(json_part.strip())
            if ai_response.strip().startswith("{"):
                 return json.loads(ai_response)
            
            # 如果是纯文本，包装成符合Go后端期望的格式
            return {"text_explanation": ai_response}
        except json.JSONDecodeError:
            logger.warning("AI response was not valid JSON, wrapping as plain text.")
            return {"text_explanation": ai_response}

    except Exception as e:
        logger.error(f"Grading Chat API Error: {e}")
        raise HTTPException(status_code=500, detail=str(e))

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)