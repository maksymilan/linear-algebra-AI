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
            "CREATE INDEX IF NOT EXISTS idx_textbook_chunks_embedding "
            "ON textbook_chunks USING ivfflat (embedding vector_cosine_ops) WITH (lists = 100)"
        )
        conn.commit()
        cur.close()
        conn.close()
        logger.info("textbook_chunks ivfflat index is ready")
    except Exception as exc:
        logger.warning("Could not create ivfflat index; continuing without it: %s", exc)

