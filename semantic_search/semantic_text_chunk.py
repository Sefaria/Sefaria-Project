from dataclasses import dataclass
from typing import Optional

from django.db import connections
from pgvector.django import CosineDistance

from .models import DjangoSemanticTextChunk

_SCHEMA_ADVISORY_LOCK_KEY = 727274002

_SCHEMA_SQL = """
CREATE EXTENSION IF NOT EXISTS vector;

CREATE TABLE IF NOT EXISTS library_chunks (
    doc_id                  TEXT PRIMARY KEY,
    index_title             TEXT NOT NULL,
    ref                     TEXT NOT NULL,
    url                     TEXT NOT NULL,
    chunked_from_ref        TEXT NOT NULL,
    language                TEXT NOT NULL,
    version_title           TEXT NOT NULL,
    direction               TEXT NOT NULL,
    text                    TEXT NOT NULL,
    embedding               VECTOR(1536) NOT NULL,
    primary_category        TEXT,
    all_categories          TEXT[],
    is_primary              BOOLEAN,
    is_source               BOOLEAN,
    composition_date        JSONB,
    composition_place       TEXT,
    era_name                TEXT,
    pagerank                DOUBLE PRECISION,
    author_names            TEXT[],
    author_slugs            TEXT[],
    associated_topic_names  TEXT[],
    associated_topic_slugs  TEXT[],
    linked_refs             TEXT[],
    chunker_metadata        JSONB NOT NULL,
    created_at              TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at              TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_library_chunks_resume
    ON library_chunks (index_title, language, version_title);
"""

_UPSERT_UPDATE_FIELDS = [
    'index_title', 'ref', 'url', 'chunked_from_ref', 'language', 'version_title',
    'direction', 'text', 'embedding', 'primary_category', 'all_categories',
    'is_primary', 'is_source', 'composition_date', 'composition_place',
    'era_name', 'pagerank', 'author_names', 'author_slugs',
    'associated_topic_names', 'associated_topic_slugs', 'linked_refs',
    'chunker_metadata', 'updated_at',
]


@dataclass
class SemanticTextChunkData:
    doc_id: str
    index_title: str
    ref: str
    url: str
    chunked_from_ref: str
    language: str
    version_title: str
    direction: str
    text: str
    embedding: list
    primary_category: Optional[str]
    all_categories: list
    is_primary: Optional[bool]
    is_source: Optional[bool]
    composition_date: Optional[dict]
    composition_place: Optional[str]
    era_name: Optional[str]
    pagerank: Optional[float]
    author_names: list
    author_slugs: list
    associated_topic_names: list
    associated_topic_slugs: list
    linked_refs: list
    chunker_metadata: dict


def _to_model(data: SemanticTextChunkData) -> DjangoSemanticTextChunk:
    return DjangoSemanticTextChunk(
        doc_id=data.doc_id,
        index_title=data.index_title,
        ref=data.ref,
        url=data.url,
        chunked_from_ref=data.chunked_from_ref,
        language=data.language,
        version_title=data.version_title,
        direction=data.direction,
        text=data.text,
        embedding=data.embedding,
        primary_category=data.primary_category,
        all_categories=data.all_categories,
        is_primary=data.is_primary,
        is_source=data.is_source,
        composition_date=data.composition_date,
        composition_place=data.composition_place,
        era_name=data.era_name,
        pagerank=data.pagerank,
        author_names=data.author_names,
        author_slugs=data.author_slugs,
        associated_topic_names=data.associated_topic_names,
        associated_topic_slugs=data.associated_topic_slugs,
        linked_refs=data.linked_refs,
        chunker_metadata=data.chunker_metadata,
    )


def _to_dataclass(obj: DjangoSemanticTextChunk) -> SemanticTextChunkData:
    return SemanticTextChunkData(
        doc_id=obj.doc_id,
        index_title=obj.index_title,
        ref=obj.ref,
        url=obj.url,
        chunked_from_ref=obj.chunked_from_ref,
        language=obj.language,
        version_title=obj.version_title,
        direction=obj.direction,
        text=obj.text,
        embedding=list(obj.embedding) if obj.embedding is not None else [],
        primary_category=obj.primary_category,
        all_categories=list(obj.all_categories or []),
        is_primary=obj.is_primary,
        is_source=obj.is_source,
        composition_date=obj.composition_date,
        composition_place=obj.composition_place,
        era_name=obj.era_name,
        pagerank=obj.pagerank,
        author_names=list(obj.author_names or []),
        author_slugs=list(obj.author_slugs or []),
        associated_topic_names=list(obj.associated_topic_names or []),
        associated_topic_slugs=list(obj.associated_topic_slugs or []),
        linked_refs=list(obj.linked_refs or []),
        chunker_metadata=obj.chunker_metadata,
    )


class SemanticTextChunk:
    def ensure_schema(self) -> None:
        with connections['vector_db'].cursor() as cur:
            cur.execute("SELECT pg_advisory_lock(%s)", [_SCHEMA_ADVISORY_LOCK_KEY])
            try:
                cur.execute(_SCHEMA_SQL)
            finally:
                cur.execute("SELECT pg_advisory_unlock(%s)", [_SCHEMA_ADVISORY_LOCK_KEY])

    def upsert(self, chunks: list) -> None:
        if not chunks:
            return
        DjangoSemanticTextChunk.objects.bulk_create(
            [_to_model(c) for c in chunks],
            update_conflicts=True,
            unique_fields=['doc_id'],
            update_fields=_UPSERT_UPDATE_FIELDS,
        )

    def get_indexed_unit_refs(self, index_title: str, language: str, version_title: str) -> set:
        return set(
            DjangoSemanticTextChunk.objects
            .filter(index_title=index_title, language=language, version_title=version_title)
            .values_list('chunked_from_ref', flat=True)
            .distinct()
        )

    def delete(self, doc_ids: list) -> None:
        DjangoSemanticTextChunk.objects.filter(doc_id__in=doc_ids).delete()

    def search_by_embedding(self, embedding: list, limit: int = 10) -> list:
        qs = DjangoSemanticTextChunk.objects.order_by(
            CosineDistance('embedding', embedding)
        )[:limit]
        return [_to_dataclass(obj) for obj in qs]

    def filter(self, **kwargs) -> list:
        return [_to_dataclass(obj) for obj in DjangoSemanticTextChunk.objects.filter(**kwargs)]
