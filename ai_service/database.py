import logging

import psycopg2
from pgvector.psycopg2 import register_vector

from config import settings


logger = logging.getLogger(__name__)


def get_db_conn():
    conn = psycopg2.connect(**settings.db_config)
    register_vector(conn)
    return conn


def ensure_vector_index() -> None:
    """Create the pgvector index if possible; startup should continue on failure."""
    try:
        conn = get_db_conn()
        cur = conn.cursor()
        cur.execute(
            """
            CREATE TABLE IF NOT EXISTS textbook_exercises (
                id SERIAL PRIMARY KEY,
                textbook_id INTEGER,
                textbook_name VARCHAR(255) NOT NULL,
                page_num INTEGER,
                exercise_number VARCHAR(100),
                stem TEXT NOT NULL,
                answer TEXT,
                solution TEXT,
                concepts TEXT,
                concept_tags TEXT[],
                exercise_type VARCHAR(20),
                question_type VARCHAR(20),
                has_answer BOOLEAN DEFAULT FALSE,
                source_excerpt TEXT,
                embedding vector(1536),
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
            """
        )
        # 已有库的平滑迁移：补齐题库新字段
        cur.execute(
            "ALTER TABLE textbook_exercises "
            "ADD COLUMN IF NOT EXISTS embedding vector(1536), "
            "ADD COLUMN IF NOT EXISTS concept_tags TEXT[], "
            "ADD COLUMN IF NOT EXISTS exercise_type VARCHAR(20), "
            "ADD COLUMN IF NOT EXISTS question_type VARCHAR(20), "
            "ADD COLUMN IF NOT EXISTS has_answer BOOLEAN DEFAULT FALSE"
        )
        cur.execute(
            "CREATE INDEX IF NOT EXISTS idx_textbook_exercises_textbook "
            "ON textbook_exercises (textbook_name, textbook_id)"
        )
        cur.execute(
            "CREATE INDEX IF NOT EXISTS idx_textbook_exercises_embedding "
            "ON textbook_exercises USING ivfflat (embedding vector_cosine_ops) WITH (lists = 100)"
        )
        # 题库混合检索：pg_trgm 关键词模糊（题干）+ concept_tags 数组筛选
        cur.execute("CREATE EXTENSION IF NOT EXISTS pg_trgm")
        cur.execute(
            "CREATE INDEX IF NOT EXISTS idx_textbook_exercises_stem_trgm "
            "ON textbook_exercises USING gin (stem gin_trgm_ops)"
        )
        cur.execute(
            "CREATE INDEX IF NOT EXISTS idx_textbook_exercises_concept_tags "
            "ON textbook_exercises USING gin (concept_tags)"
        )
        cur.execute(
            """
            CREATE TABLE IF NOT EXISTS model_usage_daily (
                user_id INTEGER NOT NULL,
                usage_date DATE NOT NULL DEFAULT CURRENT_DATE,
                bucket VARCHAR(100) NOT NULL,
                count INTEGER NOT NULL DEFAULT 0,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                PRIMARY KEY (user_id, usage_date, bucket)
            )
            """
        )
        cur.execute(
            "CREATE INDEX IF NOT EXISTS idx_textbook_chunks_embedding "
            "ON textbook_chunks USING ivfflat (embedding vector_cosine_ops) WITH (lists = 100)"
        )
        conn.commit()
        cur.close()
        conn.close()
        logger.info("textbook chunk and exercise ivfflat indexes are ready")
    except Exception as exc:
        logger.warning("Could not create ivfflat index; continuing without it: %s", exc)
