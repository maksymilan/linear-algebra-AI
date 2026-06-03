import logging
import re
from typing import Any

from openai import OpenAI

from config import settings


logger = logging.getLogger(__name__)
_PARAM_RE = re.compile(r"`([^`]+)`")


def _params_from_error(exc: Exception) -> list[str]:
    message = str(exc)
    params = []
    for match in _PARAM_RE.findall(message):
        if match in {"temperature", "top_p", "presence_penalty", "frequency_penalty", "max_tokens"}:
            params.append(match)
    return params


def chat_completion(client: OpenAI, *, model: str, **kwargs: Any):
    """Create a chat completion while filtering model-specific unsupported params."""
    unsupported = set(settings.model_unsupported_params.get(model, []))
    filtered_kwargs = {key: value for key, value in kwargs.items() if key not in unsupported}

    try:
        return client.chat.completions.create(model=model, **filtered_kwargs)
    except Exception as exc:
        retry_without = set(_params_from_error(exc))
        if not retry_without:
            raise

        retry_kwargs = {key: value for key, value in filtered_kwargs.items() if key not in retry_without}
        if retry_kwargs == filtered_kwargs:
            raise

        logger.warning(
            "Retrying model %s without unsupported/deprecated params: %s",
            model,
            ", ".join(sorted(retry_without)),
        )
        return client.chat.completions.create(model=model, **retry_kwargs)
