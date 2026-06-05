import base64
import logging

import pymupdf
from fastapi import UploadFile
from openai import APIError

from clients import client
from config import resolve_model
from llm import chat_completion
from ocr_utils import build_vision_ocr_messages


logger = logging.getLogger(__name__)


def file_to_base64(file: UploadFile) -> str:
    content = file.file.read()
    file.file.seek(0)
    mime_type = file.content_type
    encoded_string = base64.b64encode(content).decode("utf-8")
    return f"data:{mime_type};base64,{encoded_string}"


def extract_text_from_file(file: UploadFile) -> str:
    mime_type = file.content_type if file.content_type else ""
    content = file.file.read()
    file.file.seek(0)

    if "pdf" in mime_type:
        try:
            doc = pymupdf.open(stream=content, filetype="pdf")
            return "".join(page.get_text() for page in doc)
        except Exception as exc:
            logger.error("Error extracting PDF text: %s", exc)
            return f"Error extracting PDF text: {exc}"

    if "text" in mime_type:
        return content.decode("utf-8")

    if "image" in mime_type:
        data_url = file_to_base64(file)
        model = resolve_model("ocr")
        prompt = "请提取这张图片中的所有数学公式和文本内容。不要额外解释，只返回纯文本。"
        messages = build_vision_ocr_messages(model, data_url, prompt)
        try:
            response = chat_completion(
                client,
                model=model,
                messages=messages,
                max_tokens=2048,
            )
            return (response.choices[0].message.content or "").strip() or "[空白]"
        except APIError as exc:
            return f"Error from AI service: {exc.message}"
        except Exception as exc:
            return f"An unexpected error occurred: {exc}"

    return "Unsupported file type."
