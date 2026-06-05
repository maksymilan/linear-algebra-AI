import time

from clients import client
from config import resolve_model, settings


def create_embeddings(texts: list[str]) -> list[list[float]]:
    """Create embeddings with project-level retry control."""
    for attempt in range(settings.embedding_call_retries):
        try:
            response = client.embeddings.create(
                input=texts,
                model=resolve_model("embedding"),
            )
            return [data.embedding for data in response.data]
        except Exception:
            if attempt >= settings.embedding_call_retries - 1:
                raise
            time.sleep(min(2 ** attempt, 5))

    return []
