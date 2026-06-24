from semantic_search.query_embedding import embed_query
from semantic_search.semantic_text_chunk import SemanticTextChunk, SemanticTextChunkData


def semantic_search(
    query: str,
    filters: dict | None = None,
    limit: int = 10,
) -> list[SemanticTextChunkData]:
    embedding = embed_query(query)
    return SemanticTextChunk().search_by_embedding(embedding, limit=limit, filters=filters)
