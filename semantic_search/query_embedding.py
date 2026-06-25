from django.conf import settings
from patot.embedding import GeminiEmbedder, l2_normalize_vector

_MODEL = "gemini-embedding-001"
_DIM = 1536
_TASK_TYPE = "RETRIEVAL_QUERY"  # paired with "RETRIEVAL_DOCUMENT" used at index time


def embed_query(query: str) -> list:
    api_key = settings.GEMINI_API_KEY
    if not api_key:
        raise ValueError("GEMINI_API_KEY is not set in Django settings")
    embedder = GeminiEmbedder(api_key=api_key)
    embedding = embedder.embed_text(
        model=_MODEL,
        text=query,
        output_dimensionality=_DIM,
        task_type=_TASK_TYPE,
    )
    return l2_normalize_vector(embedding)
