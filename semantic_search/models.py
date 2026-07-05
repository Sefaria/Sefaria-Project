from typing import Optional

from django.db import models
from django.contrib.postgres.fields import ArrayField
from pgvector.django import VectorField, CosineDistance


class SemanticTextChunk(models.Model):
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
    })

    class Meta:
        managed = False
        db_table = 'library_chunks'
        app_label = 'semantic_search'

    def upsert(self, chunks: list['SemanticTextChunk']) -> None:
        if not chunks:
            return
        SemanticTextChunk.objects.bulk_create(
            chunks,
            update_conflicts=True,
            unique_fields=['doc_id'],
            update_fields=_UPSERT_UPDATE_FIELDS,
        )

    def get_indexed_unit_refs(self, index_title: str, language: str, version_title: str) -> set:
        return set(
            SemanticTextChunk.objects
            .filter(index_title=index_title, language=language, version_title=version_title)
            .values_list('chunked_from_ref', flat=True)
            .distinct()
        )

    def bulk_delete(self, doc_ids: list) -> None:
        SemanticTextChunk.objects.filter(doc_id__in=doc_ids).delete()

    def search_by_embedding(self, embedding: list, limit: int = 10, filters: Optional[dict] = None) -> list['SemanticTextChunk']:
        safe_filters = {k: v for k, v in (filters or {}).items() if k in self._ALLOWED_FILTER_FIELDS}
        return list(
            SemanticTextChunk.objects.filter(**safe_filters).order_by(
                CosineDistance('embedding', embedding)
            )[:limit]
        )

    def filter(self, **kwargs) -> list['SemanticTextChunk']:
        return list(SemanticTextChunk.objects.filter(**kwargs))


_UPSERT_UPDATE_FIELDS = [
    f.attname
    for f in SemanticTextChunk._meta.concrete_fields
    if not f.primary_key and f.attname != "created_at"
]
