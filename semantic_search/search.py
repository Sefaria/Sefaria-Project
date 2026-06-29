from django.conf import settings

from semantic_search.embedder import embed_query
from semantic_search.models import DjangoSemanticTextChunk
from semantic_search.semantic_text_chunk import SemanticTextChunk


def semantic_search(
    query: str,
    filters: dict | None = None,
    limit: int = 10,
) -> list[DjangoSemanticTextChunk]:
    api_key = getattr(settings, "GEMINI_API_KEY", "")
    if not api_key:
        raise ValueError("GEMINI_API_KEY is not configured")
    embedding = embed_query(query, api_key=api_key)
    return SemanticTextChunk().search_by_embedding(embedding, limit=limit, filters=filters)
