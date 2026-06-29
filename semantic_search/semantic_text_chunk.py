from typing import Optional

from pgvector.django import CosineDistance

from .models import DjangoSemanticTextChunk

_UPSERT_UPDATE_FIELDS = [
    f.attname
    for f in DjangoSemanticTextChunk._meta.concrete_fields
    if not f.primary_key and f.attname != "created_at"
]

_ALLOWED_FILTER_FIELDS = frozenset({
    'index_title', 'language', 'version_title', 'ref', 'chunked_from_ref',
    'primary_category', 'is_primary', 'is_source', 'era_name', 'direction',
})


class SemanticTextChunk:
    def upsert(self, chunks: list[DjangoSemanticTextChunk]) -> None:
        if not chunks:
            return
        DjangoSemanticTextChunk.objects.bulk_create(
            chunks,
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

    def search_by_embedding(self, embedding: list, limit: int = 10, filters: Optional[dict] = None) -> list[DjangoSemanticTextChunk]:
        safe_filters = {k: v for k, v in (filters or {}).items() if k in _ALLOWED_FILTER_FIELDS}
        return list(
            DjangoSemanticTextChunk.objects.filter(**safe_filters).order_by(
                CosineDistance('embedding', embedding)
            )[:limit]
        )

    def filter(self, **kwargs) -> list[DjangoSemanticTextChunk]:
        return list(DjangoSemanticTextChunk.objects.filter(**kwargs))
