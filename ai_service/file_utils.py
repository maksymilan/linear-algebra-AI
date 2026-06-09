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

# 视觉 OCR（把 PDF 渲染成图片再交给视觉模型识别）的提示与限制
_OCR_PROMPT = "请提取这张图片中的所有数学公式和文本内容。不要额外解释，只返回纯文本。"
_VISION_PDF_MAX_PAGES = 15  # 学生作业一般几页，封顶防滥用
_VISION_PDF_DPI = 180


def file_to_base64(file: UploadFile) -> str:
    content = file.file.read()
    file.file.seek(0)
    mime_type = file.content_type
    encoded_string = base64.b64encode(content).decode("utf-8")
    return f"data:{mime_type};base64,{encoded_string}"


def _ocr_image_data_url(data_url: str) -> str:
    """把一张图片（data URL）交给视觉 OCR 模型识别，返回纯文本。"""
    model = resolve_model("ocr")
    messages = build_vision_ocr_messages(model, data_url, _OCR_PROMPT)
    response = chat_completion(client, model=model, messages=messages, max_tokens=2048)
    return (response.choices[0].message.content or "").strip()


def _ocr_pdf_with_vision(doc) -> str:
    """逐页把 PDF 渲染成 PNG 再走视觉 OCR——用于扫描件 / 图片型 / 手写 PDF。"""
    pages_out = []
    total = min(len(doc), _VISION_PDF_MAX_PAGES)
    for idx in range(total):
        try:
            pix = doc[idx].get_pixmap(dpi=_VISION_PDF_DPI)
            data_url = "data:image/png;base64," + base64.b64encode(pix.tobytes("png")).decode("utf-8")
            text = _ocr_image_data_url(data_url)
        except Exception as exc:
            logger.error("Vision OCR failed on page %d: %s", idx + 1, exc)
            text = ""
        if text:
            pages_out.append(text)
    if len(doc) > _VISION_PDF_MAX_PAGES:
        pages_out.append(f"[超过 {_VISION_PDF_MAX_PAGES} 页，仅识别前 {_VISION_PDF_MAX_PAGES} 页]")
    return "\n\n".join(pages_out)


def extract_text_from_file(file: UploadFile, use_vision: bool = False) -> str:
    """从上传文件提取文本。

    use_vision=True 时，PDF 会被逐页渲染成图片交给视觉模型 OCR（适合扫描件 /
    图片型 / 手写 PDF）；默认 False 时 PDF 直接用 PyMuPDF 抽取文字层（更快、零成本，
    但对没有文字层的扫描件无效）。图片始终走视觉 OCR。
    """
    mime_type = file.content_type if file.content_type else ""
    content = file.file.read()
    file.file.seek(0)

    if "pdf" in mime_type:
        try:
            doc = pymupdf.open(stream=content, filetype="pdf")
        except Exception as exc:
            logger.error("Error extracting PDF text: %s", exc)
            return f"Error extracting PDF text: {exc}"
        if use_vision:
            vision_text = _ocr_pdf_with_vision(doc)
            if vision_text.strip():
                return vision_text
            logger.warning("Vision OCR returned empty; falling back to PyMuPDF text layer")
        return "".join(page.get_text() for page in doc)

    if "text" in mime_type:
        return content.decode("utf-8")

    if "image" in mime_type:
        data_url = file_to_base64(file)
        try:
            return _ocr_image_data_url(data_url) or "[空白]"
        except APIError as exc:
            return f"Error from AI service: {exc.message}"
        except Exception as exc:
            return f"An unexpected error occurred: {exc}"

    return "Unsupported file type."
