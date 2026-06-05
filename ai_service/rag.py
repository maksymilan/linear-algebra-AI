import logging
import re
from typing import List, Optional, Tuple

from config import settings
from database import get_db_conn
from embedding_utils import create_embeddings


logger = logging.getLogger(__name__)

_PAGE_MARKER_RE = re.compile(r"---\s*第\s*(\d+)\s*页\s*---")


def extract_page_num(content: str) -> Optional[int]:
    if not content:
        return None
    match = _PAGE_MARKER_RE.search(content)
    if not match:
        return None
    try:
        return int(match.group(1))
    except ValueError:
        return None


def clean_snippet(content: str, max_chars: int = settings.rag_max_chars_per_chunk) -> str:
    if not content:
        return ""
    cleaned = _PAGE_MARKER_RE.sub(" ", content)
    cleaned = re.sub(r"\s+", " ", cleaned).strip()
    if len(cleaned) > max_chars:
        return cleaned[:max_chars].rstrip() + "..."
    return cleaned


def retrieve_textbook_context(
    query: str,
    current_week: int = 0,
    k: int = settings.rag_top_k,
    include_exercises: bool = False,
) -> Tuple[str, List[dict]]:
    query = (query or "").strip()
    if not query:
        return "", []

    try:
        query_vec = create_embeddings([query])[0]
    except Exception as exc:
        logger.warning("RAG embedding failed; skipping retrieval: %s", exc)
        return "", []

    try:
        conn = get_db_conn()
        cur = conn.cursor()
        if current_week and current_week > 0:
            cur.execute(
                """
                SELECT textbook_name, content, week_num, embedding <=> %s::vector AS distance
                FROM textbook_chunks
                WHERE week_num <= %s
                ORDER BY embedding <=> %s::vector
                LIMIT %s
                """,
                (query_vec, current_week, query_vec, k),
            )
        else:
            cur.execute(
                """
                SELECT textbook_name, content, week_num, embedding <=> %s::vector AS distance
                FROM textbook_chunks
                ORDER BY embedding <=> %s::vector
                LIMIT %s
                """,
                (query_vec, query_vec, k),
            )
        chunk_rows = cur.fetchall()
        # 问答 RAG 默认只用正文 chunks；题目检索交给独立的题库接口，避免题目污染问答上下文。
        exercise_rows = []
        if include_exercises:
            cur.execute(
                """
                SELECT textbook_name, page_num, exercise_number, stem, answer, solution,
                       concepts, source_excerpt, embedding <=> %s::vector AS distance
                FROM textbook_exercises
                WHERE embedding IS NOT NULL
                  AND (answer != '' OR solution != '')
                ORDER BY embedding <=> %s::vector
                LIMIT %s
                """,
                (query_vec, query_vec, k),
            )
            exercise_rows = cur.fetchall()
        cur.close()
        conn.close()
    except Exception as exc:
        logger.warning("RAG vector search failed; skipping retrieval: %s", exc)
        return "", []

    candidates = []
    for tb_name, content, week_num, distance in chunk_rows:
        candidates.append(
            {
                "source_type": "textbook",
                "textbook_name": tb_name,
                "content": content or "",
                "week_num": week_num,
                "page_num": extract_page_num(content or ""),
                "distance": distance,
            }
        )
    for tb_name, page_num, exercise_number, stem, answer, solution, concepts, source_excerpt, distance in exercise_rows:
        parts = []
        if exercise_number:
            parts.append(f"题号：{exercise_number}")
        parts.append(f"题目：{stem}")
        if concepts:
            parts.append(f"概念：{concepts}")
        if answer:
            parts.append(f"答案：{answer}")
        if solution:
            parts.append(f"解析：{solution}")
        if source_excerpt:
            parts.append(f"原文摘录：{source_excerpt}")
        candidates.append(
            {
                "source_type": "exercise",
                "textbook_name": tb_name,
                "content": "\n".join(parts),
                "week_num": None,
                "page_num": page_num,
                "exercise_number": exercise_number or "",
                "distance": distance,
            }
        )
    candidates.sort(key=lambda item: float(item["distance"]) if item["distance"] is not None else 999.0)

    pieces: List[str] = []
    citations: List[dict] = []
    for candidate in candidates[:k]:
        tb_name = candidate["textbook_name"]
        content = candidate["content"]
        week_num = candidate["week_num"]
        page_num = candidate["page_num"]
        distance = candidate["distance"]
        if distance is not None and distance > settings.rag_distance_threshold:
            continue

        idx = len(pieces) + 1
        location_parts = []
        if week_num is not None:
            location_parts.append(f"第{week_num}周")
        if page_num is not None:
            location_parts.append(f"第{page_num}页")
        location = " · ".join(location_parts) or "位置未知"

        raw_snippet = (content or "").strip().replace("\x00", "")
        if len(raw_snippet) > settings.rag_max_chars_per_chunk:
            raw_snippet = raw_snippet[: settings.rag_max_chars_per_chunk] + "..."

        source_label = "题目" if candidate["source_type"] == "exercise" else "教材片段"
        pieces.append(
            f"[{source_label}{idx} | 教材《{tb_name}》· {location} · 距离={distance:.3f}]\n{raw_snippet}"
        )
        citations.append(
            {
                "index": idx,
                "source_type": candidate["source_type"],
                "textbook_name": tb_name,
                "week_num": int(week_num) if week_num is not None else None,
                "page_num": page_num,
                "distance": float(distance) if distance is not None else None,
                "snippet": clean_snippet(content or ""),
                "exercise_number": candidate.get("exercise_number", ""),
            }
        )

    if pieces:
        logger.info("RAG retrieved %d textbook/exercise results for current_week=%s", len(pieces), current_week)
    return "\n\n".join(pieces), citations
