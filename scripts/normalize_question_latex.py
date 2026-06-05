#!/usr/bin/env python3
"""Normalize LaTeX delimiters in existing question-bank rows."""

import argparse
import os
import sys


ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
AI_SERVICE = os.path.join(ROOT, "ai_service")
sys.path.insert(0, AI_SERVICE)

from database import get_db_conn  # noqa: E402
from ingest_pdf import _dedup_exercises_in_db, normalize_latex_text  # noqa: E402


FIELDS = ("stem", "answer", "solution", "source_excerpt")


def main():
    parser = argparse.ArgumentParser(description="Normalize existing textbook_exercises LaTeX fields.")
    parser.add_argument("--dry-run", action="store_true", help="Only report changed rows; do not update DB.")
    args = parser.parse_args()

    conn = get_db_conn()
    cur = conn.cursor()
    cur.execute(
        """
        SELECT id, textbook_name, stem, answer, solution, source_excerpt
        FROM textbook_exercises
        ORDER BY id
        """
    )
    rows = cur.fetchall()

    changed_rows = []
    changed_textbooks = set()
    for row in rows:
        row_id, textbook_name, *values = row
        normalized = [normalize_latex_text(value or "") for value in values]
        if normalized != [value or "" for value in values]:
            changed_rows.append((row_id, textbook_name, normalized))
            if textbook_name:
                changed_textbooks.add(textbook_name)

    if args.dry_run:
        print(f"Scanned {len(rows)} rows; {len(changed_rows)} rows would be updated.")
        cur.close()
        conn.close()
        return

    for row_id, _textbook_name, normalized in changed_rows:
        cur.execute(
            """
            UPDATE textbook_exercises
            SET stem = %s, answer = %s, solution = %s, source_excerpt = %s
            WHERE id = %s
            """,
            (*normalized, row_id),
        )
    conn.commit()
    cur.close()
    conn.close()

    removed = 0
    for textbook_name in sorted(changed_textbooks):
        removed += _dedup_exercises_in_db(textbook_name)

    print(
        f"Scanned {len(rows)} rows; updated {len(changed_rows)} rows; "
        f"deduplicated {removed} rows."
    )


if __name__ == "__main__":
    main()
