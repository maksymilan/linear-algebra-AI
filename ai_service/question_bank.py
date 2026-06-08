"""题库检索：语义向量 + pg_trgm 关键词混合（RRF 融合），支持题型 / 知识点 tag / 有无答案筛选。

数据来源：textbook_exercises 表（例题 example + 课后习题 homework）。
- query 为空时退化为纯条件浏览（按页码排序）。
- query 非空时两路召回后用 RRF（倒数排名融合）合并。
"""

import logging
from typing import List, Optional, Union

from concepts_taxonomy import map_to_standard
from database import get_db_conn
from embedding_utils import create_embeddings

logger = logging.getLogger(__name__)

# 召回池大小：每路各取 pool 条参与融合，最终返回 limit 条
_POOL = 50
_RRF_K = 60

# 两路 SQL 共用的返回列（顺序固定，_row_to_dict 依赖它）
_COLS = (
    "id, textbook_name, page_num, exercise_number, stem, answer, solution, "
    "concept_tags, exercise_type, question_type, has_answer"
)


def _normalize_concept_filters(concept_tags):
    """归一化受控知识点筛选；多个 tag 表示同时包含这些 tag。"""
    if not concept_tags:
        return []
    raw_items = []
    for item in concept_tags:
        cleaned = str(item or "").strip().lstrip("#").strip()
        if cleaned:
            raw_items.append(cleaned)
    return map_to_standard(raw_items, max_tags=max(1, len(raw_items)))


def _build_filters(question_type, exercise_type, has_answer, concept_tags):
    """构建两路共用的 WHERE 附加筛选子句和命名参数。"""
    clauses = []
    params = {}
    if question_type:
        clauses.append("AND question_type = %(question_type)s")
        params["question_type"] = question_type
    if exercise_type:
        clauses.append("AND exercise_type = %(exercise_type)s")
        params["exercise_type"] = exercise_type
    if has_answer is not None:
        clauses.append("AND has_answer = %(has_answer)s")
        params["has_answer"] = bool(has_answer)
    exact_tags = _normalize_concept_filters(concept_tags)
    if concept_tags:
        if exact_tags:
            clauses.append("AND concept_tags @> %(concept_tags)s")
            params["concept_tags"] = exact_tags
        else:
            clauses.append("AND FALSE")
    return " ".join(clauses), params


def _row_to_dict(row):
    # 本期不下发 answer/solution（答案受控展示属第二期），仅返回 has_answer 标记
    return {
        "id": row[0],
        "textbook_name": row[1],
        "page_num": row[2],
        "exercise_number": row[3] or "",
        "stem": row[4] or "",
        "concept_tags": list(row[7] or []),
        "exercise_type": row[8] or "",
        "question_type": row[9] or "",
        "has_answer": bool(row[10]),
    }


def _rrf_fuse(semantic_rows, keyword_rows, limit, offset=0):
    """倒数排名融合：score = Σ 1/(K + rank)。两路都命中的题排名更靠前。"""
    scores: dict = {}
    rows_by_id: dict = {}
    for rank, row in enumerate(semantic_rows):
        rid = row[0]
        scores[rid] = scores.get(rid, 0.0) + 1.0 / (_RRF_K + rank + 1)
        rows_by_id[rid] = row
    for rank, row in enumerate(keyword_rows):
        rid = row[0]
        scores[rid] = scores.get(rid, 0.0) + 1.0 / (_RRF_K + rank + 1)
        rows_by_id.setdefault(rid, row)
    ranked_all = sorted(scores.items(), key=lambda kv: kv[1], reverse=True)
    ranked = ranked_all[offset:offset + limit]
    results = []
    for rid, score in ranked:
        item = _row_to_dict(rows_by_id[rid])
        item["score"] = round(score, 6)
        results.append(item)
    return results, len(ranked_all) > offset + limit


def search_questions(
    query: str = "",
    question_type: Optional[str] = None,
    exercise_type: Optional[str] = None,
    has_answer: Optional[bool] = None,
    concept_tags: Optional[List[str]] = None,
    limit: int = 10,
    offset: int = 0,
    return_meta: bool = False,
) -> Union[List[dict], dict]:
    query = (query or "").strip()
    limit = max(1, min(int(limit or 10), 50))
    offset = max(0, int(offset or 0))
    filter_sql, filter_params = _build_filters(question_type, exercise_type, has_answer, concept_tags)

    try:
        conn = get_db_conn()
        cur = conn.cursor()
    except Exception as exc:
        logger.warning("题库检索：数据库连接失败: %s", exc)
        return []

    try:
        # 无 query：纯条件浏览
        if not query:
            cur.execute(
                f"SELECT COUNT(*) FROM textbook_exercises WHERE TRUE {filter_sql}",
                filter_params,
            )
            total = int(cur.fetchone()[0] or 0)
            cur.execute(
                f"SELECT {_COLS} FROM textbook_exercises "
                f"WHERE TRUE {filter_sql} "
                f"ORDER BY textbook_name, page_num NULLS LAST, id "
                f"LIMIT %(limit)s OFFSET %(offset)s",
                {**filter_params, "limit": limit, "offset": offset},
            )
            rows = cur.fetchall()
            results = [_row_to_dict(r) for r in rows]
            if return_meta:
                return {
                    "results": results,
                    "total": total,
                    "limit": limit,
                    "offset": offset,
                    "has_more": offset + len(results) < total,
                }
            return results

        # 语义路
        semantic_rows = []
        pool = max(_POOL, offset + limit + 1)
        try:
            qvec = create_embeddings([query])[0]
            cur.execute(
                f"SELECT {_COLS} FROM textbook_exercises "
                f"WHERE embedding IS NOT NULL {filter_sql} "
                f"ORDER BY embedding <=> %(qvec)s::vector "
                f"LIMIT %(pool)s",
                {**filter_params, "qvec": qvec, "pool": pool},
            )
            semantic_rows = cur.fetchall()
        except Exception as exc:
            logger.warning("题库检索：语义路失败（降级为纯关键词）: %s", exc)

        # 关键词路：pg_trgm 模糊（trigram 相似）+ ILIKE 子串（对中文有效）
        cur.execute(
            f"SELECT {_COLS} FROM textbook_exercises "
            f"WHERE (stem %% %(q)s OR stem ILIKE %(like)s) {filter_sql} "
            f"ORDER BY similarity(stem, %(q)s) DESC "
            f"LIMIT %(pool)s",
            {**filter_params, "q": query, "like": f"%{query}%", "pool": pool},
        )
        keyword_rows = cur.fetchall()

        results, has_more = _rrf_fuse(semantic_rows, keyword_rows, limit, offset)
        if return_meta:
            return {
                "results": results,
                "total": None,
                "limit": limit,
                "offset": offset,
                "has_more": has_more,
            }
        return results
    except Exception as exc:
        logger.warning("题库检索失败: %s", exc)
        return []
    finally:
        cur.close()
        conn.close()
