from logging import log
from fastapi import FastAPI, HTTPException, UploadFile, File, Form, logger
from pydantic import BaseModel
from typing import List, Optional
from dotenv import load_dotenv
from openai import OpenAI
import base64
import pymupdf
import os
import time
import json

from prompts import SYSTEM_PROMPT, GRADING_SYSTEM_PROMPT

load_dotenv()
api_key = os.getenv("QWEN_API_KEY")
url = os.getenv("QWEN_URL")
model_name = "qwen-plus"
client = OpenAI(api_key=api_key, base_url=url)
app = FastAPI()



def file_to_base64(file: UploadFile) -> str:
    content = file.file.read()
    file.file.seek(0)
    mime_type = file.content_type
    encoded_string = base64.b64encode(content).decode('utf-8')
    return f"data:{mime_type};base64,{encoded_string}", mime_type

def extract_text_from_file(file: UploadFile) -> str:
    mime_type = file.content_type
    content = file.file.read()
    file.file.seek(0) # 重置文件指针以便后续读取

    if "pdf" in mime_type:
        try:
            doc = pymupdf.open(stream=content, filetype="pdf")
            text = ""
            for page in doc:
                text += page.get_text()
            return text
        except Exception as e:
            return f"Error extracting PDF text: {e}"
    elif "text" in mime_type:
        return content.decode("utf-8")
    elif "image" in mime_type:
        # 对于图片，我们需要使用多模态模型来识别文本
        base64_image = base64.b64encode(content).decode('utf-8')
        data_url = f"data:{mime_type};base64,{base64_image}"
        try:
            response = client.chat.completions.create(
                model=model_name,
                messages=[
                    {
                        "role": "user",
                        "content": [
                            {"type": "text", "text": "Extract all text from this image."},
                            {"type": "image_url", "image_url": {"url": data_url}}
                        ]
                    }
                ]
            )
            return response.choices[0].message.content
        except Exception as e:
            return f"Error processing image with vision model: {e}"
    else:
        return "Unsupported file type."


@app.post("/api/v1/chat")
async def multimodal_chat(
    prompt: Optional[str] = Form(None),
    files: Optional[List[UploadFile]] = File(None)
):
    if not prompt and not files:
        raise HTTPException(status_code=400, detail="Prompt or files must be provided.")
    
    user_prompt = prompt if prompt else ""
    
    # --- 2. 构造包含系统提示的消息 ---
    messages = [
        {"role": "system", "content": SYSTEM_PROMPT},
        {"role": "user", "content": [{"type": "text", "text": user_prompt}]}
    ]

    if files:
        for file in files:
            base64_content, mime_type = file_to_base64(file)
            if "image" in mime_type:
                messages[1]['content'].append({
                    "type":"image_url",
                    "image_url": { "url": base64_content }
                })
            elif "pdf" in mime_type or "text" in mime_type or file.filename.endswith('.txt'):
                extracted_text = extract_text_from_file(file)
                file_info = f"\n\n来自文件 {file.filename} 的内容：\n{extracted_text}\n ----文件内容结束----"
                messages[1]['content'][0]['text'] += file_info
            else:
                print(f"Unsupported file type: {mime_type}")

    try:
        response = client.chat.completions.create(
            model=model_name,
            messages=messages,
            max_tokens=4096,
            temperature=0.7
        )
        ai_response = response.choices[0].message.content

        # --- 3. 尝试解析AI的回答为JSON ---
        try:
            # 假设AI可能返回被markdown代码块包裹的JSON
            if ai_response.strip().startswith("```json"):
                clean_response = ai_response.strip()[7:-3].strip()
                return json.loads(clean_response)
            return json.loads(ai_response)
        except json.JSONDecodeError:
            # 如果不是JSON，就按原来的纯文本格式返回
            return {"response": ai_response}
            
    except Exception as e:
        return {"error": str(e)}

@app.post("/api/v1/ocr")
async def ocr_endpoint(file: UploadFile = File(...)):
    if not file:
        raise HTTPException(status_code=400, detail="No file provided for OCR.")
    try:
        text = extract_text_from_file(file)
        if "Error" in text or "Unsupported" in text:
            raise HTTPException(status_code=400, detail=text)
        return {"text": text}
    except Exception as e:
        logger.error(f"OCR Error: {e}")
        raise HTTPException(status_code=500, detail=str(e))

# 更新的批改端点
@app.post("/api/v1/grade")
async def grade_homework(
    problem_text: str = Form(...),
    solution_text: str = Form(...) # 修改：接收 solution_text
):
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
        
        messages = [
            {"role": "system", "content": GRADING_SYSTEM_PROMPT},
            {"role": "user", "content": user_prompt}
        ]

        response = client.chat.completions.create(
            model=model_name,
            messages=messages,
            max_tokens=4096,
            temperature=0.3
        )
        correction = response.choices[0].message.content

        return {"correction": correction}

    except Exception as e:
        logger.error(f"Grading Error: {e}")
        return {"error": str(e)}
