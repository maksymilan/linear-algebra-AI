import json
import logging
import os
from dataclasses import dataclass
from pathlib import Path
from typing import Any, Dict, List, Optional

from dotenv import load_dotenv


load_dotenv()


@dataclass(frozen=True)
class Settings:
    ai_api_key: str
    ai_base_url: str
    model_name: str
    chat_model: str
    title_model: str
    grading_model: str
    grading_chat_model: str
    memory_model: str
    ppt_summary_model: str
    vision_model_name: str
    ocr_repair_model: str
    exercise_extract_model: str
    embedding_model: str
    chat_model_options: List[Dict[str, Any]]
    model_groups: Dict[str, List[Dict[str, Any]]]
    model_aliases: Dict[str, str]
    model_unsupported_params: Dict[str, List[str]]
    limited_chat_model_ids: List[str]
    premium_chat_daily_limit: int
    ocr_repair_enabled: bool
    ocr_max_concurrency: int
    ocr_call_retries: int
    embedding_call_retries: int
    ai_connect_timeout_seconds: float
    ai_read_timeout_seconds: float
    ai_write_timeout_seconds: float
    ai_pool_timeout_seconds: float
    ai_max_retries: int
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


def _bool_env(name: str, default: bool) -> bool:
    raw = os.getenv(name)
    if raw is None:
        return default
    return raw.strip().lower() in {"1", "true", "yes", "on"}


def _load_model_config() -> Dict[str, Any]:
    config_path = Path(os.getenv("AI_MODEL_CONFIG_FILE", "model_config.json"))
    if not config_path.is_absolute():
        config_path = Path(__file__).resolve().parent / config_path
    if not config_path.exists():
        return {}
    try:
        with config_path.open("r", encoding="utf-8") as f:
            data = json.load(f)
        if isinstance(data, dict):
            return data
    except Exception as exc:
        logging.warning("Could not load model config %s: %s", config_path, exc)
    return {}


def _normalize_model_options(raw_options: Any) -> List[Dict[str, Any]]:
    options: List[Dict[str, Any]] = []
    if not isinstance(raw_options, list):
        return options
    for item in raw_options:
        if isinstance(item, str):
            item = {"id": item, "model": item, "label": item}
        if not isinstance(item, dict):
            continue
        model = str(item.get("model") or item.get("id") or "").strip()
        if not model:
            continue
        model_id = str(item.get("id") or model).strip()
        label = str(item.get("label") or model_id).strip()
        option = {"id": model_id, "model": model, "label": label}
        provider = str(item.get("provider") or "").strip()
        if provider:
            option["provider"] = provider
        if "daily_limited" in item:
            option["daily_limited"] = bool(item.get("daily_limited"))
        unsupported_params = item.get("unsupported_params")
        if isinstance(unsupported_params, list):
            option["unsupported_params"] = [str(param).strip() for param in unsupported_params if str(param).strip()]
        options.append(option)
    return options


def _parse_model_options(raw: str, fallback_model: str) -> List[Dict[str, Any]]:
    """Parse `id:model:label,id2:model2` style model choices for UI/API use."""
    options: List[Dict[str, Any]] = []
    for item in (raw or "").split(","):
        item = item.strip()
        if not item:
            continue
        parts = [part.strip() for part in item.split(":")]
        if len(parts) == 1:
            model = parts[0]
            options.append({"id": model, "model": model, "label": model})
        elif len(parts) == 2:
            model_id, model = parts
            options.append({"id": model_id, "model": model, "label": model_id})
        else:
            model_id, model = parts[0], parts[1]
            label = ":".join(parts[2:]).strip() or model_id
            options.append({"id": model_id, "model": model, "label": label})

    if not options:
        options.append({"id": "default", "model": fallback_model, "label": "默认模型"})
    return options


def _model_aliases(groups: Dict[str, List[Dict[str, Any]]]) -> Dict[str, str]:
    aliases: Dict[str, str] = {}
    for options in groups.values():
        for option in options:
            aliases[option["id"]] = option["model"]
            aliases[option["model"]] = option["model"]
    return aliases


def _unsupported_params_by_model(groups: Dict[str, List[Dict[str, Any]]]) -> Dict[str, List[str]]:
    params_by_model: Dict[str, List[str]] = {}
    for options in groups.values():
        for option in options:
            unsupported = option.get("unsupported_params")
            if not isinstance(unsupported, list):
                continue
            normalized = [str(param).strip() for param in unsupported if str(param).strip()]
            if not normalized:
                continue
            params_by_model[option["id"]] = normalized
            params_by_model[option["model"]] = normalized
    return params_by_model


_model_config = _load_model_config()
_roles = _model_config.get("roles") if isinstance(_model_config.get("roles"), dict) else {}
_features = _model_config.get("features") if isinstance(_model_config.get("features"), dict) else {}
_client_config = _model_config.get("client") if isinstance(_model_config.get("client"), dict) else {}
_limits = _model_config.get("limits") if isinstance(_model_config.get("limits"), dict) else {}
_configured_groups = _model_config.get("model_groups") if isinstance(_model_config.get("model_groups"), dict) else {}

_default_model = str(_roles.get("default") or os.getenv("AI_MODEL_NAME") or "gemini-3.1-pro-preview")
_chat_model = str(_roles.get("chat") or os.getenv("AI_CHAT_MODEL") or _default_model)
_legacy_chat_options = _parse_model_options(os.getenv("AI_CHAT_MODELS", ""), _chat_model)
_model_groups = {
    "chat": _normalize_model_options(_configured_groups.get("chat")) or _legacy_chat_options,
    "vision": _normalize_model_options(_configured_groups.get("vision")),
    "embedding": _normalize_model_options(_configured_groups.get("embedding")),
}
_limited_chat_model_ids = [
    str(model_id).strip()
    for model_id in _limits.get("limited_chat_model_ids", [])
    if str(model_id).strip()
] if isinstance(_limits.get("limited_chat_model_ids"), list) else []
if not _limited_chat_model_ids:
    _limited_chat_model_ids = [
        option["id"]
        for option in _model_groups["chat"]
        if option.get("daily_limited")
    ]

settings = Settings(
    ai_api_key=os.getenv("AI_API_KEY", os.getenv("QWEN_API_KEY", "")),
    ai_base_url=os.getenv("AI_BASE_URL", os.getenv("QWEN_URL", "")),
    model_name=_default_model,
    chat_model=_chat_model,
    title_model=str(_roles.get("title") or os.getenv("AI_TITLE_MODEL") or _chat_model),
    grading_model=str(_roles.get("grading") or os.getenv("AI_GRADING_MODEL") or _chat_model),
    grading_chat_model=str(
        _roles.get("grading_chat")
        or os.getenv("AI_GRADING_CHAT_MODEL")
        or os.getenv("AI_GRADING_MODEL")
        or _chat_model
    ),
    memory_model=str(_roles.get("memory") or os.getenv("AI_MEMORY_MODEL") or _chat_model),
    ppt_summary_model=str(_roles.get("ppt_summary") or os.getenv("AI_PPT_SUMMARY_MODEL") or _chat_model),
    vision_model_name=str(
        _roles.get("ocr")
        or os.getenv("AI_OCR_MODEL")
        or os.getenv("AI_VL_MODEL_NAME")
        or _default_model
    ),
    ocr_repair_model=str(_roles.get("ocr_repair") or os.getenv("AI_OCR_REPAIR_MODEL") or _chat_model),
    exercise_extract_model=str(
        _roles.get("exercise_extract")
        or os.getenv("AI_EXERCISE_EXTRACT_MODEL")
        or os.getenv("AI_OCR_REPAIR_MODEL")
        or _chat_model
    ),
    embedding_model=str(_roles.get("embedding") or os.getenv("AI_EMBEDDING_MODEL") or "text-embedding-3-small"),
    chat_model_options=_model_groups["chat"],
    model_groups=_model_groups,
    model_aliases=_model_aliases(_model_groups),
    model_unsupported_params=_unsupported_params_by_model(_model_groups),
    limited_chat_model_ids=_limited_chat_model_ids,
    premium_chat_daily_limit=int(_limits.get("premium_chat_daily_limit") or _int_env("PREMIUM_CHAT_DAILY_LIMIT", 30)),
    ocr_repair_enabled=bool(_features.get("ocr_repair_enabled", _bool_env("AI_OCR_REPAIR_ENABLED", True))),
    ocr_max_concurrency=max(1, int(_features.get("ocr_max_concurrency") or 5)),
    ocr_call_retries=max(1, int(_features.get("ocr_call_retries") or 3)),
    embedding_call_retries=max(1, int(_features.get("embedding_call_retries") or 3)),
    ai_connect_timeout_seconds=float(_client_config.get("connect_timeout_seconds") or 30),
    ai_read_timeout_seconds=float(_client_config.get("read_timeout_seconds") or 600),
    ai_write_timeout_seconds=float(_client_config.get("write_timeout_seconds") or 600),
    ai_pool_timeout_seconds=float(_client_config.get("pool_timeout_seconds") or 60),
    ai_max_retries=max(0, int(_client_config.get("max_retries") or 0)),
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


def resolve_model_id(role: str, requested_model: Optional[str] = None) -> str:
    """Resolve a request to a configured model option id when possible."""
    default_by_role = {
        "chat": settings.chat_model,
        "ocr": settings.vision_model_name,
        "embedding": settings.embedding_model,
    }
    target = (requested_model or default_by_role.get(role) or settings.model_name).strip()
    options = settings.model_groups.get("chat" if role == "chat" else role, [])
    for option in options:
        if target in {option.get("id"), option.get("model")}:
            return str(option["id"])
    return target


def resolve_model(role: str, requested_model: Optional[str] = None) -> str:
    """Resolve user-facing model IDs and role defaults to provider model names."""
    if requested_model:
        requested_model = requested_model.strip()
        if requested_model:
            return settings.model_aliases.get(requested_model, requested_model)

    defaults = {
        "chat": settings.chat_model,
        "title": settings.title_model,
        "grading": settings.grading_model,
        "grading_chat": settings.grading_chat_model,
        "memory": settings.memory_model,
        "ppt_summary": settings.ppt_summary_model,
        "ocr": settings.vision_model_name,
        "ocr_repair": settings.ocr_repair_model,
        "exercise_extract": settings.exercise_extract_model,
        "embedding": settings.embedding_model,
    }
    default_model = defaults.get(role, settings.model_name)
    return settings.model_aliases.get(default_model, default_model)
