import logging
from fastapi import FastAPI, HTTPException, UploadFile, File, Form
from typing import List, Optional
from dotenv import load_dotenv
from openai import OpenAI, APIError  # 1. 导入 openai 的特定APIError
import base64
import pymupdf
import os
import json
from prompts import SYSTEM_PROMPT, GRADING_SYSTEM_PROMPT

# 配置日志
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

load_dotenv()
api_key = os.getenv("QWEN_API_KEY")
url = os.getenv("QWEN_URL")
model_name = "qwen-plus"
model_name_vl = "qwen-vl-ocr-latest" # 为图片识别指定多模態模型

# 检查环境变量是否加载
if not api_key or not url:
    logger.error("API key or URL not found in environment variables. Please check your .env file.")

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
            return response.choices[0].message.content
        # 2. --- 增强错误捕获 ---
        except APIError as e:
            # 捕获来自API本身的错误 (例如，认证失败，无效请求等)
            logger.error(f"OpenAI APIError during image processing: {e.status_code} - {e.response}")
            return f"Error from AI service: {e.message}"
        except Exception as e:
            # 捕获其他所有异常 (例如，网络问题)
            logger.error(f"An unexpected error occurred during image processing: {e}")
            return f"An unexpected error occurred: {e}"
    else:
        logger.warning(f"Unsupported file type received: {mime_type} for file: {file.filename}")
        return "Unsupported file type."

# --- API 端点 ---

@app.post("/api/v1/ocr")
async def ocr_endpoint(file: UploadFile = File(...)):
    if not file:
        raise HTTPException(status_code=400, detail="No file provided for OCR.")
    
    # 增加日志来确认接收到文件
    logger.info(f"Received file for OCR: {file.filename}, Content-Type: {file.content_type}")

    text = extract_text_from_file(file)

    if "Error" in text or "Unsupported" in text:
        # 如果函数内部返回了错误信息，将其作为400错误返回
        raise HTTPException(status_code=400, detail=text)
    
    return {"text": text}


# ... (multimodal_chat 和 grade_homework 端点保持不变)
@app.post("/api/v1/chat")
async def multimodal_chat(prompt: Optional[str] = Form(None), files: Optional[List[UploadFile]] = File(None)):
    if not prompt and not files:
        raise HTTPException(status_code=400, detail="Prompt or files must be provided.")
    user_content = [{"type": "text", "text": prompt if prompt else ""}]
    if files:
        for file in files:
            # 为聊天中的图片也使用多模態模型
            if file.content_type and "image" in file.content_type:
                data_url = file_to_base64(file)
                # 在聊天中，我们让 qwen-plus 自己处理图片
                user_content.append({"type": "image_url", "image_url": {"url": data_url}})
            else:
                extracted_text = extract_text_from_file(file)
                file_info = f"\n\n--- 来自文件 '{file.filename}' 的附加内容 ---\n{extracted_text}\n--- 文件内容结束 ---"
                user_content[0]["text"] += file_info

    messages = [{"role": "system", "content": SYSTEM_PROMPT}, {"role": "user", "content": user_content}]
    try:
        response = client.chat.completions.create(model=model_name, messages=messages, max_tokens=4096, temperature=0.7)
        ai_response = response.choices[0].message.content
        try:
            if ai_response.strip().startswith("```json"):
                clean_response = ai_response.strip()[7:-3].strip()
                return json.loads(clean_response)
            return json.loads(ai_response)
        except json.JSONDecodeError:
            return {"response": ai_response}
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
        correction = response.choices[0].message.content
        return {"correction": correction}
    except Exception as e:
        logger.error(f"Grading Error: {e}")
        raise HTTPException(status_code=500, detail=str(e))