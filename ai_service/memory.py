import json
import logging
from dataclasses import dataclass
from typing import Dict, List, Optional

from openai import OpenAI

from config import settings


logger = logging.getLogger(__name__)


@dataclass
class MemoryState:
    pinned_context: str
    summary: str
    recent_messages: List[Dict[str, str]]
    retrieval_query_context: str

    @property
    def prompt_context(self) -> str:
        parts: List[str] = []
        if self.pinned_context:
            parts.append(f"固定上下文：\n{self.pinned_context}")
        if self.summary:
            parts.append(f"此前对话摘要：\n{self.summary}")
        if not parts:
            return "无。"
        return "\n\n".join(parts)


def truncate_middle(text: str, max_chars: int) -> str:
    if not text or len(text) <= max_chars:
        return text
    head = max_chars * 2 // 3
    tail = max_chars - head - 20
    if tail <= 0:
        return text[:max_chars].rstrip() + "..."
    return text[:head].rstrip() + "\n...\n" + text[-tail:].lstrip()


def parse_history(
    history_raw: Optional[str],
    max_chars_per_message: int = settings.memory_max_chars_per_message,
) -> List[Dict[str, str]]:
    if not history_raw:
        return []
    try:
        raw_list = json.loads(history_raw)
    except (json.JSONDecodeError, TypeError) as exc:
        logger.warning("Could not parse chat history; ignoring it: %s", exc)
        return []
    if not isinstance(raw_list, list):
        return []

    normalized: List[Dict[str, str]] = []
    for item in raw_list:
        if not isinstance(item, dict):
            continue
        role_raw = (item.get("sender") or item.get("role") or "").strip().lower()
        content = item.get("text") or item.get("content") or ""
        if not isinstance(content, str) or not content.strip():
            continue

        if role_raw in ("user", "human"):
            role = "user"
        elif role_raw in ("ai", "assistant", "bot", "system-ai"):
            role = "assistant"
        elif role_raw in ("system", "context"):
            role = "system"
        else:
            continue
        normalized.append({"role": role, "content": truncate_middle(content, max_chars_per_message)})
    return normalized


def _count_user_turns(messages: List[Dict[str, str]]) -> int:
    return sum(1 for msg in messages if msg.get("role") == "user")


def split_history(
    messages: List[Dict[str, str]],
    recent_turns: int = settings.memory_recent_turns,
) -> tuple[str, List[Dict[str, str]], List[Dict[str, str]]]:
    pinned = [msg["content"] for msg in messages if msg.get("role") == "system"]
    chat_messages = [msg for msg in messages if msg.get("role") in ("user", "assistant")]

    if recent_turns <= 0:
        return "\n\n".join(pinned), chat_messages, []

    user_seen = 0
    split_at = 0
    for idx in range(len(chat_messages) - 1, -1, -1):
        if chat_messages[idx].get("role") == "user":
            user_seen += 1
            if user_seen > recent_turns:
                split_at = idx + 1
                break
    else:
        split_at = 0

    older = chat_messages[:split_at]
    recent = chat_messages[split_at:]
    return "\n\n".join(pinned), older, recent


def summarize_messages(client: OpenAI, model: str, messages: List[Dict[str, str]]) -> str:
    if not messages:
        return ""
    text = "\n".join(f"{msg['role']}: {msg['content']}" for msg in messages)
    prompt = (
        "请把下面这段线性代数学习对话压缩成给后续助教使用的记忆摘要。"
        "只保留：学生正在学的主题、已经问过的关键点、已确认的结论、仍困惑的地方。"
        "不要加入新知识，不要评价学生。控制在 300 字以内。\n\n"
        f"{text}"
    )
    try:
        response = client.chat.completions.create(
            model=model,
            messages=[{"role": "user", "content": prompt}],
            max_tokens=600,
            temperature=0.1,
        )
        return (response.choices[0].message.content or "").strip()
    except Exception as exc:
        logger.warning("Conversation summary failed, using deterministic fallback: %s", exc)
        fallback = "\n".join(f"{msg['role']}: {msg['content']}" for msg in messages[-8:])
        return truncate_middle(fallback, 1200)


def build_memory_state(client: OpenAI, model: str, history_raw: Optional[str]) -> MemoryState:
    messages = parse_history(history_raw)
    pinned_context, older_messages, recent_messages = split_history(messages)

    summary = ""
    if _count_user_turns(messages) >= settings.memory_summary_trigger_turns:
        summary = summarize_messages(client, model, older_messages)

    recent_user_questions: List[str] = []
    for msg in reversed(recent_messages):
        if msg.get("role") == "user" and msg.get("content"):
            recent_user_questions.append(msg["content"])
        if len(recent_user_questions) >= settings.rag_history_lookback:
            break
    recent_user_questions.reverse()

    retrieval_parts = []
    if summary:
        retrieval_parts.append(summary)
    retrieval_parts.extend(recent_user_questions)

    logger.info(
        "memory: parsed=%d pinned=%s older=%d recent=%d summarized=%s",
        len(messages),
        bool(pinned_context),
        len(older_messages),
        len(recent_messages),
        bool(summary),
    )
    return MemoryState(
        pinned_context=pinned_context,
        summary=summary,
        recent_messages=recent_messages,
        retrieval_query_context=" / ".join(part for part in retrieval_parts if part),
    )


def build_rag_query(current_prompt: str, memory: MemoryState) -> str:
    current_prompt = (current_prompt or "").strip()
    if not memory.retrieval_query_context:
        return current_prompt
    return f"[对话上下文：{memory.retrieval_query_context}] {current_prompt}"

