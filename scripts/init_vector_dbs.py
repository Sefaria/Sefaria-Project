"""
One-time setup: creates the pgvector table and Qdrant collection.
Run before loading embeddings.

Usage:
    ./run scripts/init_vector_dbs.py [--dimensions 768]
"""
import argparse
import django
django.setup()

from django.conf import settings
from django.db import connection

parser = argparse.ArgumentParser()
parser.add_argument("--dimensions", type=int, default=settings.VECTOR_DIMENSIONS)
args = parser.parse_args()
dims = args.dimensions


def init_pgvector():
    with connection.cursor() as cur:
        cur.execute("CREATE EXTENSION IF NOT EXISTS vector")
        cur.execute(f"""
            CREATE TABLE IF NOT EXISTS sefaria_embeddings (
                id SERIAL PRIMARY KEY,
                ref TEXT NOT NULL UNIQUE,
                text TEXT,
                embedding vector({dims})
            )
        """)
        cur.execute(
            "CREATE INDEX IF NOT EXISTS sefaria_embeddings_embedding_idx "
            "ON sefaria_embeddings USING ivfflat (embedding vector_cosine_ops) WITH (lists = 100)"
        )
    print(f"pgvector: table sefaria_embeddings ready (dimensions={dims})")


def init_qdrant():
    from qdrant_client import QdrantClient
    from qdrant_client.models import VectorParams, Distance

    client = QdrantClient(host=settings.QDRANT_HOST, port=settings.QDRANT_PORT)
    existing = [c.name for c in client.get_collections().collections]
    if settings.QDRANT_COLLECTION in existing:
        print(f"qdrant: collection '{settings.QDRANT_COLLECTION}' already exists, skipping")
        return
    client.create_collection(
        collection_name=settings.QDRANT_COLLECTION,
        vectors_config=VectorParams(size=dims, distance=Distance.COSINE),
    )
    print(f"qdrant: collection '{settings.QDRANT_COLLECTION}' created (dimensions={dims})")


init_pgvector()
init_qdrant()
