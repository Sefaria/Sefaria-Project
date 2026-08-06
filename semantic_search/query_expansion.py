from dataclasses import dataclass
from typing import cast

from django.conf import settings
from langchain_anthropic import ChatAnthropic
from langchain_core.messages import HumanMessage, SystemMessage

DEFAULT_MODEL = "claude-sonnet-5"

_SYSTEM_PROMPT = (
    "You expand short search queries about Jewish texts (Torah, Talmud, Midrash, "
    "halakha, Jewish thought, and related subjects) into longer, more descriptive "
    "queries for a semantic search engine over a library of Jewish texts. Elaborate "
    "on the user's query by adding relevant context, synonyms, and related concepts, "
    "while staying faithful to the original intent -- do not introduce a different "
    "topic. Respond with two versions of the elaborated query: one in English, and "
    "one in Hebrew that is a translation of the English version."
)

_QUERY_EXPANSION_SCHEMA = {
    "title": "QueryExpansion",
    "description": "An elaborated, more verbose version of a user's search query, in English and Hebrew.",
    "type": "object",
    "properties": {
        "english": {
            "type": "string",
            "description": "The elaborated, verbose version of the query, in English.",
        },
        "hebrew": {
            "type": "string",
            "description": "A Hebrew translation of the elaborated English query.",
        },
    },
    "required": ["english", "hebrew"],
}


class QueryExpansionError(Exception):
    pass


@dataclass(frozen=True)
class QueryExpansion:
    english: str
    hebrew: str


def expand_query(query: str) -> QueryExpansion:
    llm = _get_llm()
    structured_llm = llm.with_structured_output(_QUERY_EXPANSION_SCHEMA)
    try:
        result = cast(dict, structured_llm.invoke([
            SystemMessage(content=_SYSTEM_PROMPT),
            HumanMessage(content=query),
        ]))
    except Exception as e:
        raise QueryExpansionError(f"Query expansion failed: {e}") from e

    english = (result.get("english") or "").strip()
    hebrew = (result.get("hebrew") or "").strip()
    if not english or not hebrew:
        raise QueryExpansionError(f"Query expansion returned an incomplete result: {result}")
    return QueryExpansion(english=english, hebrew=hebrew)


def _get_llm() -> ChatAnthropic:
    api_key = getattr(settings, "ANTHROPIC_API_KEY", "")
    if not api_key:
        raise QueryExpansionError("ANTHROPIC_API_KEY is not configured")
    model = getattr(settings, "NATURAL_LANGUAGE_SEARCH_MODEL", DEFAULT_MODEL)
    return ChatAnthropic(model=model, api_key=api_key, max_tokens=1024, temperature=0)
