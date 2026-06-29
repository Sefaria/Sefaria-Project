from typing import Optional

from django.db import connections
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

    # --- Targeted field-level update methods ---

    def update_index_metadata(self, index_title: str, fields: dict) -> int:
        """Bulk UPDATE metadata fields for all chunks of an index. Returns row count."""
        return DjangoSemanticTextChunk.objects.filter(index_title=index_title).update(**fields)

    def update_index_title(self, old_title: str, new_title: str) -> int:
        """UPDATE index_title (and string-prefix in ref/url/chunked_from_ref) when an index is renamed."""
        with connections['vector_db'].cursor() as cur:
            cur.execute(
                """
                UPDATE library_chunks
                SET index_title       = %s,
                    ref               = %s || substring(ref FROM length(%s) + 1),
                    url               = %s || substring(url FROM length(%s) + 1),
                    chunked_from_ref  = %s || substring(chunked_from_ref FROM length(%s) + 1)
                WHERE index_title = %s
                """,
                [new_title, new_title, old_title, new_title, old_title, new_title, old_title, old_title],
            )
            return cur.rowcount

    def update_version_fields(self, index_title: str, version_title: str, fields: dict) -> int:
        """Bulk UPDATE fields for all chunks of a specific index + version."""
        return DjangoSemanticTextChunk.objects.filter(
            index_title=index_title, version_title=version_title
        ).update(**fields)

    def update_version_title(self, index_title: str, old_vtitle: str, new_vtitle: str) -> int:
        """Rename version_title for all matching chunks."""
        return DjangoSemanticTextChunk.objects.filter(
            index_title=index_title, version_title=old_vtitle
        ).update(version_title=new_vtitle)

    def delete_by_index(self, index_title: str) -> int:
        count, _ = DjangoSemanticTextChunk.objects.filter(index_title=index_title).delete()
        return count

    def delete_by_version(self, index_title: str, version_title: str) -> int:
        count, _ = DjangoSemanticTextChunk.objects.filter(
            index_title=index_title, version_title=version_title
        ).delete()
        return count

    def bulk_update_chunks(self, chunks: list[DjangoSemanticTextChunk], fields: list[str]) -> None:
        DjangoSemanticTextChunk.objects.bulk_update(chunks, fields)

    def get_chunks_for_section(
        self, index_title: str, language: str, version_title: str, section_ref: str
    ) -> list[DjangoSemanticTextChunk]:
        return list(DjangoSemanticTextChunk.objects.filter(
            index_title=index_title,
            language=language,
            version_title=version_title,
            chunked_from_ref=section_ref,
        ))

    def get_chunks_containing_ref(self, index_title: str, ref_str: str) -> list[DjangoSemanticTextChunk]:
        """Find chunks whose source_segment_refs (in chunker_metadata JSONB) contain the given ref."""
        return list(DjangoSemanticTextChunk.objects.filter(
            index_title=index_title,
            chunker_metadata__source_segment_refs__contains=[ref_str],
        ))

    def replace_author_slug(self, old_slug: str, new_slug: str) -> int:
        """Replace old_slug with new_slug in the author_slugs array for all matching chunks."""
        with connections['vector_db'].cursor() as cur:
            cur.execute(
                "UPDATE library_chunks SET author_slugs = array_replace(author_slugs, %s, %s) WHERE %s = ANY(author_slugs)",
                [old_slug, new_slug, old_slug],
            )
            return cur.rowcount

    def replace_associated_topic_slug(self, old_slug: str, new_slug: str) -> int:
        """Replace old_slug with new_slug in the associated_topic_slugs array for all matching chunks."""
        with connections['vector_db'].cursor() as cur:
            cur.execute(
                "UPDATE library_chunks SET associated_topic_slugs = array_replace(associated_topic_slugs, %s, %s) WHERE %s = ANY(associated_topic_slugs)",
                [old_slug, new_slug, old_slug],
            )
            return cur.rowcount
