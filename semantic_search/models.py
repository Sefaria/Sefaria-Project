from typing import Optional

from django.db import models
from django.db.models import Func, Value
from django.db.models.functions import Concat, Length, Substr
from django.contrib.postgres.fields import ArrayField
from pgvector.django import VectorField, CosineDistance


class SemanticTextChunkManager(models.Manager):
    _ALLOWED_FILTER_FIELDS = frozenset({
        'index_title', 'language', 'version_title', 'ref', 'chunked_from_ref',
        'primary_category', 'is_primary', 'is_source', 'era_name', 'direction',
    })

    def upsert(self, chunks: list['SemanticTextChunk']) -> None:
        if not chunks:
            return
        self.bulk_create(
            chunks,
            update_conflicts=True,
            unique_fields=['doc_id'],
            update_fields=_UPSERT_UPDATE_FIELDS,
        )

    def get_indexed_unit_refs(self, index_title: str, language: str, version_title: str) -> set:
        return set(
            self.filter(index_title=index_title, language=language, version_title=version_title)
            .values_list('chunked_from_ref', flat=True)
            .distinct()
        )

    def bulk_delete(self, doc_ids: list) -> None:
        self.filter(doc_id__in=doc_ids).delete()

    def search_by_embedding(self, embedding: list, limit: int = 10, filters: Optional[dict] = None) -> list['SemanticTextChunk']:
        safe_filters = {k: v for k, v in (filters or {}).items() if k in self._ALLOWED_FILTER_FIELDS}
        return list(
            self.filter(**safe_filters).order_by(
                CosineDistance('embedding', embedding)
            )[:limit]
        )

    # --- Targeted field-level update methods ---

    def update_index_metadata(self, index_title: str, fields: dict) -> int:
        """Bulk UPDATE metadata fields for all chunks of an index. Returns row count."""
        return self.filter(index_title=index_title).update(**fields)

    def update_index_title(self, old_title: str, new_title: str) -> int:
        """UPDATE index_title (and string-prefix in ref/url/chunked_from_ref) when an index is renamed."""
        def rewritten(field_name: str):
            return Concat(
                Value(new_title), Substr(field_name, Length(Value(old_title)) + 1),
                output_field=models.TextField(),
            )

        return self.filter(index_title=old_title).update(
            index_title=new_title,
            ref=rewritten('ref'),
            url=rewritten('url'),
            chunked_from_ref=rewritten('chunked_from_ref'),
        )

    def update_version_fields(self, index_title: str, version_title: str, fields: dict) -> int:
        """Bulk UPDATE fields for all chunks of a specific index + version."""
        return self.filter(
            index_title=index_title, version_title=version_title
        ).update(**fields)

    def update_version_title(self, index_title: str, old_vtitle: str, new_vtitle: str) -> int:
        """Rename version_title for all matching chunks."""
        return self.filter(
            index_title=index_title, version_title=old_vtitle
        ).update(version_title=new_vtitle)

    def delete_by_index(self, index_title: str) -> int:
        count, _ = self.filter(index_title=index_title).delete()
        return count

    def delete_by_version(self, index_title: str, version_title: str) -> int:
        count, _ = self.filter(
            index_title=index_title, version_title=version_title
        ).delete()
        return count

    def bulk_update_chunks(self, chunks: list['SemanticTextChunk'], fields: list[str]) -> None:
        self.bulk_update(chunks, fields)

    def get_chunks_for_section(
        self, index_title: str, language: str, version_title: str, section_ref: str
    ) -> list['SemanticTextChunk']:
        return list(self.filter(
            index_title=index_title,
            language=language,
            version_title=version_title,
            chunked_from_ref=section_ref,
        ))

    def get_chunks_containing_ref(self, index_title: str, ref_str: str) -> list['SemanticTextChunk']:
        """Find chunks whose source_segment_refs (in chunker_metadata JSONB) contain the given ref."""
        return list(self.filter(
            index_title=index_title,
            chunker_metadata__source_segment_refs__contains=[ref_str],
        ))

    def replace_author_slug(self, old_slug: str, new_slug: str) -> int:
        """Replace old_slug with new_slug in the author_slugs array for all matching chunks."""
        return self.filter(author_slugs__contains=[old_slug]).update(
            author_slugs=Func(
                'author_slugs', Value(old_slug), Value(new_slug),
                function='array_replace',
                output_field=ArrayField(models.TextField()),
            )
        )

    def replace_associated_topic_slug(self, old_slug: str, new_slug: str) -> int:
        """Replace old_slug with new_slug in the associated_topic_slugs array for all matching chunks."""
        return self.filter(associated_topic_slugs__contains=[old_slug]).update(
            associated_topic_slugs=Func(
                'associated_topic_slugs', Value(old_slug), Value(new_slug),
                function='array_replace',
                output_field=ArrayField(models.TextField()),
            )
        )


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

    objects = SemanticTextChunkManager()

    class Meta:
        managed = False
        db_table = 'library_chunks'
        app_label = 'semantic_search'


_UPSERT_UPDATE_FIELDS = [
    f.attname
    for f in SemanticTextChunk._meta.concrete_fields
    if not f.primary_key and f.attname != "created_at"
]
