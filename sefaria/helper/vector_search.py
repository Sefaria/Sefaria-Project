import json
from django.conf import settings
from django.db import connection
from psycopg2.extras import execute_values

_qdrant_client = None


def _get_qdrant_client():
    global _qdrant_client
    if _qdrant_client is None:
        from qdrant_client import QdrantClient
        _qdrant_client = QdrantClient(host=settings.QDRANT_HOST, port=settings.QDRANT_PORT)
    return _qdrant_client


def pgvector_search(embedding: list, top_k: int = 10) -> list:
    embedding_str = json.dumps(embedding)
    with connection.cursor() as cursor:
        cursor.execute(
            "SELECT ref, text, 1 - (embedding <=> %s::vector) AS score "
            "FROM sefaria_embeddings ORDER BY embedding <=> %s::vector LIMIT %s",
            [embedding_str, embedding_str, top_k]
        )
        return [{"ref": row[0], "text": row[1], "score": float(row[2])} for row in cursor.fetchall()]


def qdrant_search(embedding: list, top_k: int = 10) -> list:
    client = _get_qdrant_client()
    hits = client.search(
        collection_name=settings.QDRANT_COLLECTION,
        query_vector=embedding,
        limit=top_k,
    )
    return [{"ref": h.payload["ref"], "text": h.payload.get("text", ""), "score": h.score} for h in hits]


def pgvector_index(records: list) -> int:
    rows = [(r["ref"], r.get("text", ""), json.dumps(r["embedding"])) for r in records]
    with connection.cursor() as cursor:
        execute_values(
            cursor,
            "INSERT INTO sefaria_embeddings (ref, text, embedding) VALUES %s "
            "ON CONFLICT (ref) DO UPDATE SET text = EXCLUDED.text, embedding = EXCLUDED.embedding",
            rows,
            template="(%s, %s, %s::vector)",
        )
    return len(rows)


def qdrant_index(records: list) -> int:
    from qdrant_client.models import PointStruct
    client = _get_qdrant_client()
    points = [
        PointStruct(
            id=abs(hash(r["ref"])) % (2 ** 63),
            vector=r["embedding"],
            payload={"ref": r["ref"], "text": r.get("text", "")},
        )
        for r in records
    ]
    client.upsert(collection_name=settings.QDRANT_COLLECTION, points=points)
    return len(points)
