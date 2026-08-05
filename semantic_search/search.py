from django.conf import settings

from semantic_search.embedder import embed_query
from semantic_search.models import Chunk, Vector, DEFAULT_EMBEDDING_MODEL_ID


def semantic_search(
    query: str,
    filters: dict | None = None,
    limit: int = 10,
) -> list[Chunk]:
    embedding = get_query_embedding(query)
    return semantic_search_by_embedding(embedding, filters=filters, limit=limit)


def get_query_embedding(query: str) -> list[float]:
    api_key = getattr(settings, "GEMINI_API_KEY", "")
    if not api_key:
        raise ValueError("GEMINI_API_KEY is not configured")
    return embed_query(query, api_key=api_key)


def semantic_search_by_embedding(
    embedding: list[float],
    filters: dict | None = None,
    limit: int = 10,
    embedding_model_id: int = DEFAULT_EMBEDDING_MODEL_ID,
) -> list[Chunk]:
    return Vector().search_by_embedding(
        embedding, limit=limit, filters=filters, embedding_model_id=embedding_model_id
    )
