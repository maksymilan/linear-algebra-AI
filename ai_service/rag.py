import logging
import re
from typing import List, Optional, Tuple

from clients import client
from config import resolve_model, settings
from database import get_db_conn


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
) -> Tuple[str, List[dict]]:
    query = (query or "").strip()
    if not query:
        return "", []

    try:
        emb_resp = client.embeddings.create(input=[query], model=resolve_model("embedding"))
        query_vec = emb_resp.data[0].embedding
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
        rows = cur.fetchall()
        cur.close()
        conn.close()
    except Exception as exc:
        logger.warning("RAG vector search failed; skipping retrieval: %s", exc)
        return "", []

    pieces: List[str] = []
    citations: List[dict] = []
    for tb_name, content, week_num, distance in rows:
        if distance is not None and distance > settings.rag_distance_threshold:
            continue

        idx = len(pieces) + 1
        page_num = extract_page_num(content or "")
        location = f"第{week_num}周"
        if page_num is not None:
            location += f" · 第{page_num}页"

        raw_snippet = (content or "").strip().replace("\x00", "")
        if len(raw_snippet) > settings.rag_max_chars_per_chunk:
            raw_snippet = raw_snippet[: settings.rag_max_chars_per_chunk] + "..."

        pieces.append(
            f"[片段{idx} | 教材《{tb_name}》· {location} · 距离={distance:.3f}]\n{raw_snippet}"
        )
        citations.append(
            {
                "index": idx,
                "textbook_name": tb_name,
                "week_num": int(week_num) if week_num is not None else None,
                "page_num": page_num,
                "distance": float(distance) if distance is not None else None,
                "snippet": clean_snippet(content or ""),
            }
        )

    if pieces:
        logger.info("RAG retrieved %d chunks for current_week=%s", len(pieces), current_week)
    return "\n\n".join(pieces), citations
