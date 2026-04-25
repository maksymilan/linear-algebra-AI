# ai_service/main.py

import logging
import base64
import pymupdf # a.k.a. Fitz
import os
import json
import psycopg2
from fastapi import FastAPI, HTTPException, UploadFile, File, Form, Request, BackgroundTasks
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from typing import List, Optional
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

if not api_key or not url:
    logger.error("API key or URL not found in environment variables. Please check your .env file.")
    exit()

# --- 初始化服务 ---
client = OpenAI(api_key=api_key, base_url=url)
app = FastAPI()

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
        text = ingest_pdf.extract_text_via_ocr(file_path, max_workers=5)
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
        try:
            conn = psycopg2.connect(dbname="LA-DB", user="postgres", password="password", host="localhost", port="5432")
            cur = conn.cursor()
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
    learned_summaries: str = Form("") # **新增：接收后端传来的已学知识总结**
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
    
    # 动态构建 SYSTEM_PROMPT，注入已学知识
    formatted_system_prompt = SYSTEM_PROMPT.replace(
        "{learned_summaries}", 
        learned_summaries if learned_summaries else "无。"
    )

    messages = [{"role": "system", "content": formatted_system_prompt},{"role": "user", "content": user_content_list}]
    
    # 强制要求模型在首次对话时生成 title
    if is_first_message:
        messages[0]["content"] += "\n\n请注意：这是用户开启的全新对话。请在返回的JSON结果中，额外提供一个 `title` 字段，用最简短的词语（不超过10个字）总结用户这第一句话的意图或主题。如果不是JSON返回，请不要加 title。"

    try:
        response = client.chat.completions.create(model=model_name, messages=messages, max_tokens=4096, temperature=0.7)
        ai_response = response.choices[0].message.content or ""
        try:
            if ai_response.strip().startswith("```json"):
                json_part = ai_response.strip().replace("```json", "").replace("```", "")
                return json.loads(json_part.strip())
            return json.loads(ai_response)
        except json.JSONDecodeError:
            logger.warning("AI response was not valid JSON, returning as plain text.")
            return {"response": ai_response, "title": "新对话" if is_first_message else None}
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