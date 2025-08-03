# ai_service/main.py
from fastapi import FastAPI, HTTPException, UploadFile, File, Form
from pydantic import BaseModel
from typing import List, Optional
from dotenv import load_dotenv
from openai import OpenAI
import base64
import pymupdf
import os
import time
import json

load_dotenv()
api_key = os.getenv("QWEN_API_KEY")
url = os.getenv("QWEN_URL")
model_name = "qwen-plus"
client = OpenAI(api_key=api_key, base_url=url)
app = FastAPI()

# --- 1. 新的系统提示，指导AI如何返回矩阵 ---
SYSTEM_PROMPT = """
你是一个线性代数AI助教。请清晰、准确地回答用户的问题。
当你的回答涉及到具体的线性变换矩阵时，你必须使用以下的JSON格式来封装你的回答。
这能让前端的可视化工具展示你的矩阵。

JSON格式:
{
  "text_explanation": "这里是你对变换的文字解释，例如：这是一个将空间沿Y轴剪切的变换。",
  "visualization_matrix": {
    "dimension": 2,
    "matrix": [[1, 1], [0, 1]]
  }
}

- `text_explanation`: (必须) 你对矩阵和变换的文字描述。
- `visualization_matrix`: (必须) 包含变换信息的对象。
  - `dimension`: (必须) 矩阵的维度，2代表2D，3代表3D。
  - `matrix`: (必须) 变换矩阵，一个二维数组。

如果你的回答不涉及具体的变换矩阵，请直接返回纯文本回答。

例如，如果用户问：“什么是剪切变换？”，你应该像这样回答:
{
  "text_explanation": "好的，这是一个典型的剪切变换，它将所有点的x坐标增加了其y坐标的值。对应的矩阵是 [[1, 1], [0, 1]]。请看右侧的可视化效果。",
  "visualization_matrix": {
    "dimension": 2,
    "matrix": [[1, 1], [0, 1]]
  }
}
"""

def file_to_base64(file: UploadFile) -> str:
    content = file.file.read()
    file.file.seek(0)
    mime_type = file.content_type
    encoded_string = base64.b64encode(content).decode('utf-8')
    return f"data:{mime_type};base64,{encoded_string}", mime_type

def extract_text_from_file(file: UploadFile) -> str:
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