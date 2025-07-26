# ai_service/main.py
from fastapi import FastAPI, HTTPException, UploadFile, File,Form
from pydantic import BaseModel
from typing import List,Optional
from dotenv import load_dotenv
from openai import OpenAI
import base64
import pymupdf
import os
import time

load_dotenv()
api_key = os.getenv("QWEN_API_KEY")
url = os.getenv("QWEN_URL")
model_name = "qwen-plus"
client = OpenAI(api_key=api_key,base_url=url)
app = FastAPI()

def file_to_base64(file: UploadFile) -> str:
    """
    将上传的文件转换为Base64编码字符串。
    """
    content = file.file.read()
    file.file.seek(0)  # 重置文件指针
    mime_type = file.content_type
    encoded_string = base64.b64encode(content).decode('utf-8')
    return f"data:{mime_type};base64,{encoded_string}", mime_type

def extract_text_from_file(file: UploadFile) -> str:
    """
    根据文件类型提取文本内容。
    """
    mime_type = file.content_type
    if "pdf" in mime_type:
        try:
            doc = pymupdf.open(stream=file.file.read(), filetype="pdf")
            text = ""
            for page in doc:
                text += page.get_text()
            return text
        except Exception as e:
            return f"Error extracting PDF text: {e}"
    elif "text" in mime_type:
        return file.file.read().decode("utf-8")
    else:
        return "Unsupported file type."

@app.post("/api/v1/chat")
async def multimodal_chat(
    prompt: Optional[str] = Form(None),
    files: Optional[List[UploadFile]] = File(None)  
):
    """
    多模态聊天接口，支持文本和文件输入。
    """
    if not prompt and not files:
        raise HTTPException(status_code=400, detail="Prompt or files must be provided.")
    user_prompt = prompt if prompt else ""
    messages = [{"role": "user", "content": []}]
    messages[0]['content'].append({"type": "text", "text": user_prompt})
    if files:
        for file in files:
            base64_content, mime_type = file_to_base64(file)

            if "image" in mime_type:
                print(f"Processing image file: {file.filename}")
                messages[0]["content"].append({
                    "type":"image_url",
                    "image_url": {
                        "url": base64_content
                    }
                })
            elif "pdf" in mime_type or "text" in mime_type or file.filename.endswith('.txt') or file.filename.endswith('.txt'):
                print(f"Processing file: {file.filename} with MIME type: {mime_type}")
                # 对于PDF或文本文件，提取文本内容
                extracted_text = extract_text_from_file(file)
                file_info = f"\n\n来自文件 {file.filename} 的内容：\n{extracted_text}\n ----文件内容结束----"
                messages[0]["content"][0]["text"] += file_info
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
        return {"response": ai_response}
    except Exception as e:
        return {"error": str(e)}

@app.get("/api/v1/greet")
def get_greeting():
    """
    一个简单的接口，返回一条问候消息和当前时间戳。
    """
    return {
        "message": "Hello from Python AI Service!",
        "timestamp": int(time.time())
    }