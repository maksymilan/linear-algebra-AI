import json
import logging
import re
from typing import Any, Optional


logger = logging.getLogger(__name__)

_JSON_BLOCK_RE = re.compile(r"```(?:json)?\s*(.*?)```", re.DOTALL | re.IGNORECASE)


def parse_model_json(text: str) -> Optional[Any]:
    if not text:
        return None
    stripped = text.strip()
    block = _JSON_BLOCK_RE.search(stripped)
    if block:
        stripped = block.group(1).strip()
    try:
        return json.loads(stripped)
    except json.JSONDecodeError:
        return None


def compact_title(text: str, fallback: str = "新对话", max_chars: int = 10) -> str:
    cleaned = re.sub(r"^[「『\"'`]+|[」』\"'`。！？?!：:，,\s]+$", "", text or "")
    cleaned = re.sub(r"\s+", "", cleaned)
    if not cleaned:
        return fallback
    return cleaned[:max_chars]


def title_from_prompt(prompt: str, max_chars: int = 10) -> str:
    cleaned = re.sub(r"\s+", "", prompt or "")
    cleaned = re.sub(r"^(请问|请解释|解释一下|什么是|啥是|如何理解|怎么理解|为什么)", "", cleaned)
    cleaned = re.sub(r"[。！？?!：:，,]+$", "", cleaned)
    return compact_title(cleaned, max_chars=max_chars)
