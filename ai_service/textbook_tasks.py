import logging

import ingest_pdf
from database import get_db_conn


logger = logging.getLogger(__name__)


def update_textbook_status(textbook_id: int, status: str) -> None:
    conn = get_db_conn()
    cur = conn.cursor()
    cur.execute("UPDATE textbooks SET status = %s WHERE id = %s", (status, textbook_id))
    conn.commit()
    cur.close()
    conn.close()


def get_textbook_status(textbook_id: int) -> str:
    conn = get_db_conn()
    cur = conn.cursor()
    cur.execute("SELECT status FROM textbooks WHERE id = %s", (textbook_id,))
    row = cur.fetchone()
    cur.close()
    conn.close()
    return row[0] if row else ""


def process_textbook_task(file_path: str, textbook_name: str, textbook_id: int) -> None:
    try:
        logger.info("Background task: processing textbook %s", textbook_name)
        text = ingest_pdf.extract_text_via_ocr(file_path, textbook_id=textbook_id, max_workers=5)
        chunks = ingest_pdf.chunk_text(text)
        ingest_pdf.ingest_to_db(textbook_name, 1, chunks)
        update_textbook_status(textbook_id, "completed")
        logger.info("Background task: %s completed", textbook_name)
    except Exception as exc:
        if str(exc) == "Task canceled by user":
            logger.info("Background task: %s canceled by user", textbook_name)
            return
        logger.error("Background task failed for %s: %s", textbook_name, exc)
        try:
            if get_textbook_status(textbook_id) != "canceled":
                update_textbook_status(textbook_id, "failed")
        except Exception:
            logger.exception("Could not mark textbook %s as failed", textbook_id)

