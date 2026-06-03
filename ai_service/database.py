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
                source_excerpt TEXT,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
            """
        )
        cur.execute(
            "CREATE INDEX IF NOT EXISTS idx_textbook_exercises_textbook "
            "ON textbook_exercises (textbook_name, textbook_id)"
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
        logger.info("textbook_chunks ivfflat index is ready")
    except Exception as exc:
        logger.warning("Could not create ivfflat index; continuing without it: %s", exc)
