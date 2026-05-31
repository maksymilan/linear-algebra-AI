import logging
import os
from dataclasses import dataclass

from dotenv import load_dotenv


load_dotenv()


@dataclass(frozen=True)
class Settings:
    ai_api_key: str
    ai_base_url: str
    model_name: str
    vision_model_name: str
    embedding_model: str
    db_name: str
    db_user: str
    db_password: str
    db_host: str
    db_port: str
    rag_top_k: int
    rag_max_chars_per_chunk: int
    rag_distance_threshold: float
    memory_recent_turns: int
    memory_summary_trigger_turns: int
    memory_max_chars_per_message: int
    rag_history_lookback: int

    @property
    def db_config(self) -> dict:
        return {
            "dbname": self.db_name,
            "user": self.db_user,
            "password": self.db_password,
            "host": self.db_host,
            "port": self.db_port,
        }


def _int_env(name: str, default: int) -> int:
    raw = os.getenv(name)
    if raw is None:
        return default
    try:
        return int(raw)
    except ValueError:
        logging.warning("Invalid integer for %s=%r, using %s", name, raw, default)
        return default


def _float_env(name: str, default: float) -> float:
    raw = os.getenv(name)
    if raw is None:
        return default
    try:
        return float(raw)
    except ValueError:
        logging.warning("Invalid float for %s=%r, using %s", name, raw, default)
        return default


settings = Settings(
    ai_api_key=os.getenv("AI_API_KEY", os.getenv("QWEN_API_KEY", "")),
    ai_base_url=os.getenv("AI_BASE_URL", os.getenv("QWEN_URL", "")),
    model_name=os.getenv("AI_MODEL_NAME", "gemini-3.1-pro-preview"),
    vision_model_name=os.getenv("AI_VL_MODEL_NAME", os.getenv("AI_MODEL_NAME", "gemini-3.1-pro-preview")),
    embedding_model=os.getenv("AI_EMBEDDING_MODEL", "text-embedding-3-small"),
    db_name=os.getenv("DB_NAME", "LA-DB"),
    db_user=os.getenv("DB_USER", "postgres"),
    db_password=os.getenv("DB_PASSWORD", "password"),
    db_host=os.getenv("DB_HOST", "localhost"),
    db_port=os.getenv("DB_PORT", "5432"),
    rag_top_k=_int_env("RAG_TOP_K", 5),
    rag_max_chars_per_chunk=_int_env("RAG_MAX_CHARS_PER_CHUNK", 600),
    rag_distance_threshold=_float_env("RAG_DISTANCE_THRESHOLD", 0.8),
    memory_recent_turns=_int_env("MEMORY_RECENT_TURNS", 6),
    memory_summary_trigger_turns=_int_env("MEMORY_SUMMARY_TRIGGER_TURNS", 8),
    memory_max_chars_per_message=_int_env("MEMORY_MAX_CHARS_PER_MESSAGE", 1800),
    rag_history_lookback=_int_env("RAG_HISTORY_LOOKBACK", 3),
)

