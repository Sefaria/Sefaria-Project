import os

from django.conf import settings
from langchain_anthropic import ChatAnthropic

DEFAULT_MODEL = "claude-sonnet-5"


class LLMConfigError(Exception):
    pass


def get_chat_llm(max_tokens: int = 1024) -> ChatAnthropic:
    api_key = getattr(settings, "ANTHROPIC_API_KEY", "") or os.environ.get("ANTHROPIC_API_KEY", "")
    if not api_key:
        raise LLMConfigError("ANTHROPIC_API_KEY is not configured")
    model = getattr(settings, "NATURAL_LANGUAGE_SEARCH_MODEL", DEFAULT_MODEL)
    # temperature is not configurable on every model this can point to (e.g. it's
    # rejected outright for claude-sonnet-5), so leave it at the provider default.
    return ChatAnthropic(model=model, api_key=api_key, max_tokens=max_tokens)
