import math
import random
import time

import requests

_MODEL = "gemini-embedding-001"
_DIM = 1536
_GEMINI_API_BASE = "https://generativelanguage.googleapis.com/v1beta"
_RETRYABLE_STATUS_CODES = {429, 500, 502, 503, 504}
_RETRYABLE_EXCEPTIONS = (
    requests.exceptions.ConnectionError,
    requests.exceptions.Timeout,
)


class EmbeddingError(Exception):
    pass


class GeminiEmbedder:
    def __init__(
        self,
        api_key: str,
        timeout_seconds: int = 60,
        max_retries: int = 5,
        initial_backoff_seconds: float = 1.0,
    ):
        self.api_key = api_key
        self.timeout_seconds = timeout_seconds
        self.max_retries = max_retries
        self.initial_backoff_seconds = initial_backoff_seconds
        self.session = requests.Session()

    def _backoff(self, attempt: int) -> None:
        delay = self.initial_backoff_seconds * (2 ** attempt) + random.uniform(0, self.initial_backoff_seconds)
        time.sleep(delay)

    def embed_text(self, text: str, task_type: str) -> list[float]:
        url = f"{_GEMINI_API_BASE}/models/{_MODEL}:embedContent"
        body = {
            "content": {"parts": [{"text": text}]},
            "outputDimensionality": _DIM,
            "taskType": task_type,
        }
        last_error: Exception | None = None
        for attempt in range(self.max_retries):
            try:
                response = self.session.post(
                    url,
                    params={"key": self.api_key},
                    json=body,
                    timeout=self.timeout_seconds,
                )
            except _RETRYABLE_EXCEPTIONS as exc:
                last_error = exc
                if attempt < self.max_retries - 1:
                    self._backoff(attempt)
                continue

            if response.status_code in _RETRYABLE_STATUS_CODES:
                last_error = EmbeddingError(f"{response.status_code} {response.text[:200]}")
                if attempt < self.max_retries - 1:
                    self._backoff(attempt)
                continue

            if not response.ok:
                raise EmbeddingError(f"Embedding failed: {response.status_code} {response.text}")

            payload = response.json()
            values = (payload.get("embedding") or {}).get("values")
            if values is None:
                raise EmbeddingError(f"Missing embedding values in response: {payload}")
            return values

        detail = f": {last_error}" if last_error is not None else ""
        raise EmbeddingError(f"Embedding failed after {self.max_retries} attempts{detail}")


def l2_normalize_vector(vector: list[float]) -> list[float]:
    norm = math.sqrt(sum(v * v for v in vector))
    if norm == 0:
        return vector
    return [v / norm for v in vector]


def embed_query(query: str, api_key: str) -> list[float]:
    return l2_normalize_vector(GeminiEmbedder(api_key=api_key).embed_text(query, "RETRIEVAL_QUERY"))


def embed_documents(texts: list[str], api_key: str) -> list[list[float]]:
    embedder = GeminiEmbedder(api_key=api_key)
    return [embedder.embed_text(text, "RETRIEVAL_DOCUMENT") for text in texts]
