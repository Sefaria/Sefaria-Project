import json
from django.conf import settings

_qdrant_client = None
_pgvector_conn = None


def _get_pgvector_conn():
    global _pgvector_conn
    if _pgvector_conn is None or _pgvector_conn.closed:
        import psycopg2
        _pgvector_conn = psycopg2.connect(
            host=settings.PGVECTOR_HOST,
            port=settings.PGVECTOR_PORT,
            dbname=settings.PGVECTOR_DB,
            user=settings.PGVECTOR_USER,
            password=settings.PGVECTOR_PASSWORD,
        )
    return _pgvector_conn


def _get_qdrant_client():
    global _qdrant_client
    if _qdrant_client is None:
        from qdrant_client import QdrantClient
        _qdrant_client = QdrantClient(host=settings.QDRANT_HOST, port=settings.QDRANT_PORT)
    return _qdrant_client


def pgvector_search(embedding: list, top_k: int = 10) -> list:
    conn = _get_pgvector_conn()
    embedding_str = json.dumps(embedding)
    with conn.cursor() as cur:
        cur.execute(
            "SELECT ref, text, 1 - (embedding <=> %s::vector) AS score "
            "FROM sefaria_embeddings ORDER BY embedding <=> %s::vector LIMIT %s",
            [embedding_str, embedding_str, top_k],
        )
        return [{"ref": row[0], "text": row[1], "score": float(row[2])} for row in cur.fetchall()]


def qdrant_search(embedding: list, top_k: int = 10) -> list:
    client = _get_qdrant_client()
    hits = client.search(
        collection_name=settings.QDRANT_COLLECTION,
        query_vector=embedding,
        limit=top_k,
    )
    return [{"ref": h.payload["ref"], "text": h.payload.get("text", ""), "score": h.score} for h in hits]


def pgvector_index(records: list) -> int:
    from psycopg2.extras import execute_values
    conn = _get_pgvector_conn()
    rows = [(r["ref"], r.get("text", ""), json.dumps(r["embedding"])) for r in records]
    with conn.cursor() as cur:
        execute_values(
            cur,
            "INSERT INTO sefaria_embeddings (ref, text, embedding) VALUES %s "
            "ON CONFLICT (ref) DO UPDATE SET text = EXCLUDED.text, embedding = EXCLUDED.embedding",
            rows,
            template="(%s, %s, %s::vector)",
        )
    conn.commit()
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
