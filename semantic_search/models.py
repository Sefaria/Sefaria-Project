from django.db import models
from django.contrib.postgres.fields import ArrayField
from pgvector.django import VectorField


class DjangoSemanticTextChunk(models.Model):
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

    class Meta:
        managed = False
        db_table = 'library_chunks'
        app_label = 'semantic_search'
