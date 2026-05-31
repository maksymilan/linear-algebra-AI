import logging

from openai import OpenAI

from config import settings


logger = logging.getLogger(__name__)


def create_openai_client() -> OpenAI:
    if not settings.ai_api_key or not settings.ai_base_url:
        raise RuntimeError("AI_API_KEY and AI_BASE_URL must be set in ai_service/.env")
    return OpenAI(api_key=settings.ai_api_key, base_url=settings.ai_base_url)


client = create_openai_client()

