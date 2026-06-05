import logging

import httpx
from openai import OpenAI

from config import settings


logger = logging.getLogger(__name__)


def create_openai_client() -> OpenAI:
    if not settings.ai_api_key or not settings.ai_base_url:
        raise RuntimeError("AI_API_KEY and AI_BASE_URL must be set in ai_service/.env")
    timeout = httpx.Timeout(
        connect=settings.ai_connect_timeout_seconds,
        read=settings.ai_read_timeout_seconds,
        write=settings.ai_write_timeout_seconds,
        pool=settings.ai_pool_timeout_seconds,
    )
    return OpenAI(
        api_key=settings.ai_api_key,
        base_url=settings.ai_base_url,
        timeout=timeout,
        max_retries=settings.ai_max_retries,
    )


client = create_openai_client()
