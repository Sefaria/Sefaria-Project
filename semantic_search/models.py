from typing import Optional

from django.db import models
from django.contrib.postgres.fields import ArrayField
from pgvector.django import VectorField, CosineDistance

DEFAULT_CHUNKING_SCHEME_ID = 1
DEFAULT_EMBEDDING_MODEL_ID = 1


class SemanticTextChunk(models.Model):
    """Legacy single-table semantic search store.

    Keep this available while `chunk_metadata` + `vectors` are being indexed so production
    reads can stay on `library_chunks` until cutover.
    """
    doc_id                 = models.TextField(primary_key=True)
    index_title            = models.TextField()
    ref                    = models.TextField()
    url                    = models.TextField()
    chunked_from_ref       = models.TextField()
    language               = models.TextField()
    version_title          = models.TextField()
    direction              = models.TextField()
    text                   = models.TextField()
    embedding              = VectorField(dimensions=1536)
    primary_category       = models.TextField(null=True)
    all_categories         = ArrayField(models.TextField(), default=list)
    is_primary             = models.BooleanField(null=True)
    is_source              = models.BooleanField(null=True)
    composition_date       = models.JSONField(null=True)
    composition_place      = models.TextField(null=True)
    era_name               = models.TextField(null=True)
    pagerank               = models.FloatField(null=True)
    author_names           = ArrayField(models.TextField(), default=list)
    author_slugs           = ArrayField(models.TextField(), default=list)
    associated_topic_names = ArrayField(models.TextField(), default=list)
    associated_topic_slugs = ArrayField(models.TextField(), default=list)
    linked_refs            = ArrayField(models.TextField(), default=list)
    chunker_metadata       = models.JSONField()
    created_at             = models.DateTimeField(auto_now_add=True)
    updated_at             = models.DateTimeField(auto_now=True)

    _ALLOWED_FILTER_FIELDS = frozenset({
        'index_title', 'language', 'version_title', 'ref', 'chunked_from_ref',
        'primary_category', 'is_primary', 'is_source', 'era_name', 'direction',
        'ref__in',
    })

    class Meta:
        managed = False
        db_table = 'library_chunks'
        app_label = 'semantic_search'

    def search_by_embedding(self, embedding: list, limit: int = 10, filters: Optional[dict] = None) -> list['SemanticTextChunk']:
        safe_filters = {k: v for k, v in (filters or {}).items() if k in self._ALLOWED_FILTER_FIELDS}
        return list(
            SemanticTextChunk.objects.filter(**safe_filters).order_by(
                CosineDistance('embedding', embedding)
            )[:limit]
        )

    def filter(self, **kwargs) -> list['SemanticTextChunk']:
        return list(SemanticTextChunk.objects.filter(**kwargs))


class ChunkMetadata(models.Model):
    """Metadata for a chunk of library text: index/version/ref context, categories, authors,
    topics, pagerank, and chunking provenance. No text, no embedding - those live on `Vector`,
    which changes on a different lifecycle (re-chunk/re-embed) than this metadata does
    (admin/content operations: title renames, topic slug changes, pagerank recompute, ...).
    """
    id                      = models.BigAutoField(primary_key=True)
    index_title             = models.TextField()
    version_title           = models.TextField()
    language                = models.TextField()
    ref                     = models.TextField()
    url                     = models.TextField()
    chunked_from_ref        = models.TextField()
    direction               = models.TextField()
    chunk_ordinal           = models.IntegerField()
    chunking_scheme_id      = models.SmallIntegerField(default=DEFAULT_CHUNKING_SCHEME_ID)
    primary_category        = models.TextField(null=True)
    all_categories          = ArrayField(models.TextField(), default=list)
    is_primary              = models.BooleanField(null=True)
    is_source               = models.BooleanField(null=True)
    composition_date        = models.JSONField(null=True)
    composition_place       = models.TextField(null=True)
    era_name                = models.TextField(null=True)
    pagerank                = models.FloatField(null=True)
    author_names            = ArrayField(models.TextField(), default=list)
    author_slugs            = ArrayField(models.TextField(), default=list)
    associated_topic_names  = ArrayField(models.TextField(), default=list)
    associated_topic_slugs  = ArrayField(models.TextField(), default=list)
    linked_refs             = ArrayField(models.TextField(), default=list)
    chunker_metadata        = models.JSONField()
    created_at              = models.DateTimeField(auto_now_add=True)
    updated_at              = models.DateTimeField(auto_now=True)

    _ALLOWED_FILTER_FIELDS = frozenset({
        'index_title', 'language', 'version_title', 'ref', 'chunked_from_ref',
        'primary_category', 'is_primary', 'is_source', 'era_name', 'direction',
        'ref__in',
    })

    _UNIQUE_FIELDS = ['ref', 'version_title', 'language', 'chunk_ordinal', 'chunking_scheme_id']

    class Meta:
        managed = False
        db_table = 'chunk_metadata'
        app_label = 'semantic_search'

    def upsert(self, chunks: list['ChunkMetadata']) -> list['ChunkMetadata']:
        if not chunks:
            return []
        return ChunkMetadata.objects.bulk_create(
            chunks,
            update_conflicts=True,
            unique_fields=self._UNIQUE_FIELDS,
            update_fields=_CHUNK_UPSERT_UPDATE_FIELDS,
        )

    def get_indexed_unit_refs(self, index_title: str, language: str, version_title: str,
                               chunking_scheme_id: int = DEFAULT_CHUNKING_SCHEME_ID,
                               embedding_model_id: int = DEFAULT_EMBEDDING_MODEL_ID) -> set:
        """
        Section/passage refs already fully done (chunked AND embedded) for this
        (index, language, version, chunking scheme, embedding model). Requires a matching
        `Vector` row, not just a `ChunkMetadata` row - a chunk with no vector yet (e.g.
        a prior run died between the metadata upsert and the vectors upsert) must not be
        treated as done.
        """
        return set(
            ChunkMetadata.objects
            .filter(
                index_title=index_title, language=language, version_title=version_title,
                chunking_scheme_id=chunking_scheme_id,
                vectors__embedding_model_id=embedding_model_id,
            )
            .values_list('chunked_from_ref', flat=True)
            .distinct()
        )

    def bulk_delete(self, ids: list) -> None:
        ChunkMetadata.objects.filter(id__in=ids).delete()

    def filter(self, **kwargs) -> list['ChunkMetadata']:
        return list(ChunkMetadata.objects.filter(**kwargs))


_CHUNK_UPSERT_UPDATE_FIELDS = [
    f.attname
    for f in ChunkMetadata._meta.concrete_fields
    if not f.primary_key and f.attname not in ('created_at',) and f.attname not in ChunkMetadata._UNIQUE_FIELDS
]


class Vector(models.Model):
    """Text + embedding for a chunk, keyed by which embedding model produced the embedding.
    Text lives here (not on ChunkMetadata) because text and embedding always change together
    - see the incremental-update `sync_text_and_embedding` pattern, which re-assembles text
    and re-embeds in one step.
    """
    id                  = models.BigAutoField(primary_key=True)
    chunk_metadata      = models.ForeignKey(ChunkMetadata, db_column='chunk_metadata_id', on_delete=models.CASCADE, related_name='vectors')
    embedding_model_id  = models.SmallIntegerField(default=DEFAULT_EMBEDDING_MODEL_ID)
    text                = models.TextField()
    embedding           = VectorField(dimensions=1536)
    created_at          = models.DateTimeField(auto_now_add=True)
    updated_at          = models.DateTimeField(auto_now=True)

    _UNIQUE_FIELDS = ['chunk_metadata', 'embedding_model_id']

    class Meta:
        managed = False
        db_table = 'vectors'
        app_label = 'semantic_search'

    def upsert(self, vectors: list['Vector']) -> list['Vector']:
        if not vectors:
            return []
        return Vector.objects.bulk_create(
            vectors,
            update_conflicts=True,
            unique_fields=self._UNIQUE_FIELDS,
            update_fields=_VECTOR_UPSERT_UPDATE_FIELDS,
        )

    def search_by_embedding(self, embedding: list, limit: int = 10, filters: Optional[dict] = None,
                             embedding_model_id: int = DEFAULT_EMBEDDING_MODEL_ID) -> list[ChunkMetadata]:
        safe_filters = {k: v for k, v in (filters or {}).items() if k in ChunkMetadata._ALLOWED_FILTER_FIELDS}
        chunk_filters = {f"chunk_metadata__{k}": v for k, v in safe_filters.items()}
        results = list(
            Vector.objects
            .filter(embedding_model_id=embedding_model_id, **chunk_filters)
            .select_related('chunk_metadata')
            .order_by(CosineDistance('embedding', embedding))[:limit]
        )
        chunks = []
        for vector in results:
            chunk = vector.chunk_metadata
            chunk.text = vector.text
            chunks.append(chunk)
        return chunks


_VECTOR_UPSERT_UPDATE_FIELDS = [
    f.attname
    for f in Vector._meta.concrete_fields
    if not f.primary_key and f.attname not in ('created_at', 'chunk_metadata_id', 'embedding_model_id')
]


class SectionTextHash(models.Model):
    """Last-seen text hash per (section/passage ref, version, language), independent of
    `chunk_metadata`/`vectors` (no chunking_scheme_id/embedding_model_id) - only the
    underlying text invalidates a row, so it stays valid across chunker or embedding-model
    changes. Lets `embed_library_to_pgvector.py` skip re-running the patot chunker (and
    re-billing Gemini) for units whose text hasn't changed since the last run.
    """
    id                  = models.BigAutoField(primary_key=True)
    section_ref         = models.TextField()
    version_title       = models.TextField()
    language            = models.TextField()
    section_text_hash   = models.TextField()
    updated_at          = models.DateTimeField(auto_now=True)

    _UNIQUE_FIELDS = ['section_ref', 'version_title', 'language']

    class Meta:
        managed = False
        db_table = 'section_text_hash'
        app_label = 'semantic_search'

    def upsert(self, rows: list['SectionTextHash']) -> None:
        if not rows:
            return
        SectionTextHash.objects.bulk_create(
            rows,
            update_conflicts=True,
            unique_fields=self._UNIQUE_FIELDS,
            update_fields=['section_text_hash', 'updated_at'],
        )

    def all_hashes(self) -> dict:
        """{(section_ref, version_title, language): section_text_hash} for the whole table."""
        return {
            (row.section_ref, row.version_title, row.language): row.section_text_hash
            for row in SectionTextHash.objects.all()
        }
