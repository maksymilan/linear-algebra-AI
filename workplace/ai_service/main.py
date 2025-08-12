# ai_service/main.py

import logging
from fastapi import FastAPI, HTTPException, UploadFile, File, Form
from typing import List, Optional
from dotenv import load_dotenv
from openai import OpenAI, APIError
import base64
import pymupdf
import os
import json
from prompts import SYSTEM_PROMPT, GRADING_SYSTEM_PROMPT, GRADING_FOLLOW_UP_PROMPT

# 配置日志
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

load_dotenv()
api_key = os.getenv("QWEN_API_KEY")
url = os.getenv("QWEN_URL")
model_name = "qwen-plus"
model_name_vl = "qwen-vl-ocr-latest"

if not api_key or not url:
    logger.error("API key or URL not found in environment variables. Please check your .env file.")
    # 在实际应用中可能需要退出或抛出异常
    # For this script, we'll let it continue and fail on API call

client = OpenAI(api_key=api_key, base_url=url)
app = FastAPI()

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
        messages = [{
            "role": "user",
            "content": [
                {"type": "text", "text": "请提取这张图片中的所有数学公式和文本内容。不要有任何额外的解释或说明，只返回提取的纯文本。"},
                {"type": "image_url", "image_url": {"url": data_url}}
            ]
        }]
        
        try:
            logger.info(f"Sending image OCR request to model '{model_name_vl}'...")
            response = client.chat.completions.create(
                model=model_name_vl,
                messages=messages,
                max_tokens=2048,
            )
            logger.info("Successfully received OCR response from model.")
            return response.choices[0].message.content or ""
        except APIError as e:
            logger.error(f"OpenAI APIError during image processing: {e.status_code} - {e.response}")
            return f"Error from AI service: {e.message}"
        except Exception as e:
            logger.error(f"An unexpected error occurred during image processing: {e}")
            return f"An unexpected error occurred: {e}"
    else:
        logger.warning(f"Unsupported file type received: {mime_type} for file: {file.filename}")
        return "Unsupported file type."

@app.post("/api/v1/ocr")
async def ocr_endpoint(file: UploadFile = File(...)):
    if not file:
        raise HTTPException(status_code=400, detail="No file provided for OCR.")
    
    logger.info(f"Received file for OCR: {file.filename}, Content-Type: {file.content_type}")
    text = extract_text_from_file(file)

    if "Error" in text or "Unsupported" in text:
        raise HTTPException(status_code=400, detail=text)
    
    return {"text": text}


@app.post("/api/v1/chat")
async def multimodal_chat(prompt: Optional[str] = Form(None), files: Optional[List[UploadFile]] = File(None), is_first_message: bool = Form(False)):
    if not prompt and not files:
        raise HTTPException(status_code=400, detail="Prompt or files must be provided.")
    user_content = [{"type": "text", "text": prompt if prompt else ""}]
    if files:
        for file in files:
            if file.content_type and "image" in file.content_type:
                data_url = file_to_base64(file)
                user_content.append({"type": "image_url", "image_url": {"url": data_url}})
            else:
                extracted_text = extract_text_from_file(file)
                file_info = f"\n\n--- 来自文件 '{file.filename}' 的附加内容 ---\n{extracted_text}\n--- 文件内容结束 ---"
                user_content[0]["text"] += file_info
    
    final_prompt_content = user_content[0]["text"]
    if is_first_message:
        final_prompt_content += "\n\n(请注意：这是本次对话的第一条消息，请在你的JSON回答中包含一个'title'字段。)"
    
    user_content[0]["text"] = final_prompt_content
    
    messages = [{"role": "system", "content": SYSTEM_PROMPT}, {"role": "user", "content": user_content}]
    try:
        response = client.chat.completions.create(model=model_name, messages=messages, max_tokens=4096, temperature=0.7)
        ai_response = response.choices[0].message.content or ""
        try:
            if ai_response.strip().startswith("```json"):
                clean_response = ai_response.strip()[7:-3].strip()
                return json.loads(clean_response)
            return json.loads(ai_response)
        except json.JSONDecodeError:
            logger.warning("AI response was not valid JSON, returning as plain text.")
            return {"response": ai_response, "title": None}
    except Exception as e:
        logger.error(f"Chat API Error: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/api/v1/grade")
async def grade_homework(problem_text: str = Form(...), solution_text: str = Form(...)):
    if not solution_text or not problem_text:
        raise HTTPException(status_code=400, detail="Problem and solution text must be provided.")
    try:
        user_prompt = f"""
        请批改以下作业：
        --- 题目 ---
        {problem_text}
        --- 学生解答 ---
        {solution_text}
        """
        messages = [{"role": "system", "content": GRADING_SYSTEM_PROMPT}, {"role": "user", "content": user_prompt}]
        response = client.chat.completions.create(model=model_name, messages=messages, max_tokens=4096, temperature=0.3)
        correction = response.choices[0].message.content or ""
        return {"correction": correction}
    except Exception as e:
        logger.error(f"Grading Error: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/api/v1/start_grading_chat")
async def start_grading_chat(
    problem_text: str = Form(...),
    solution_text: str = Form(...),
    correction_text: str = Form(...)
):
    """
    创建一个带有完整作业上下文的系统消息，用于开启一个专门的答疑会话。
    """
    initial_context = f"""
{GRADING_FOLLOW_UP_PROMPT}

---
### 原始题目
{problem_text}

### 学生的解答
{solution_text}

### 你的批改意见
{correction_text}
---
"""
    return {"system_prompt": initial_context}