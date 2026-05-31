import json
import logging
import re
from typing import Any, Optional


logger = logging.getLogger(__name__)

_JSON_BLOCK_RE = re.compile(r"```(?:json)?\s*(.*?)```", re.DOTALL | re.IGNORECASE)
_TITLE_FIELD_RE = re.compile(
    r"[\"“”']?title[\"“”']?\s*[:：]\s*[\"“](?P<title>[^\"”]+)[\"”]",
    re.IGNORECASE,
)


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


def compact_title(text: str, fallback: str = "未命名对话", max_chars: int = 12) -> str:
    cleaned = (text or "").strip()
    cleaned = re.sub(r"^[\s{[（(「『\"'`“”]+|[\s}\]）)」』\"'`“”。！？?!：:，,]+$", "", cleaned)
    cleaned = re.sub(r"^(标题|话题|主题)\s*[:：]\s*", "", cleaned)
    cleaned = re.sub(r"\s+", "", cleaned)
    if not cleaned or cleaned.lower().startswith("title") or "title" in cleaned.lower():
        return fallback
    return cleaned[:max_chars]


def extract_model_title(text: str, fallback: str = "未命名对话", max_chars: int = 12) -> str:
    parsed = parse_model_json(text)
    if isinstance(parsed, dict):
        title = parsed.get("title")
        if title:
            return compact_title(str(title), fallback=fallback, max_chars=max_chars)
    if isinstance(parsed, str):
        nested = parse_model_json(parsed)
        if isinstance(nested, dict) and nested.get("title"):
            return compact_title(str(nested["title"]), fallback=fallback, max_chars=max_chars)
        return compact_title(parsed, fallback=fallback, max_chars=max_chars)

    raw = text or ""
    raw = raw.replace('\\"', '"')
    block = _JSON_BLOCK_RE.search(raw)
    if block:
        raw = block.group(1)
    match = _TITLE_FIELD_RE.search(raw)
    if match:
        return compact_title(match.group("title"), fallback=fallback, max_chars=max_chars)
    return compact_title(raw, fallback=fallback, max_chars=max_chars)
