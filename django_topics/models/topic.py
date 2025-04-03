from django.db import models
from django.db.models.query import QuerySet
from django_topics.models.pool import TopicPool
from collections import defaultdict


class TopicManager(models.Manager):
    slug_to_pools = {}


    def sample_topic_slugs(self, order, pool: str = None, limit=10) -> list[str]:
        queryset = self.get_topic_slugs_by_pool(pool) if pool else self.all().values_list('slug', flat=True)
        if order == 'random':
            return list(queryset.order_by("?")[:limit])  # Uses database-level random ordering
        else:
            raise ValueError(f"Invalid order: '{order}'")

    def get_pools_by_topic_slug(self, topic_slug: str) -> QuerySet:
        if not self.slug_to_pools:
            self.build_slug_to_pools_cache()
        return self.slug_to_pools.get(topic_slug, [])

    def get_topic_slugs_by_pool(self, pool: str) -> QuerySet:
        return self.filter(pools__name=pool).values_list("slug", flat=True)

    def build_slug_to_pools_cache(self, rebuild=False):
        if rebuild or not self.slug_to_pools:
            new_slug_to_pools = defaultdict(list)
            topics = self.model.objects.values_list('slug', 'pools__name')
            for slug, pool_name in topics:
                if pool_name:
                    new_slug_to_pools[slug].append(pool_name)
            self.slug_to_pools = new_slug_to_pools

class Topic(models.Model):
    slug = models.CharField(max_length=255, primary_key=True)
    en_title = models.CharField(max_length=255, blank=True, default="")
    he_title = models.CharField(max_length=255, blank=True, default="")
    pools = models.ManyToManyField(TopicPool, related_name="topics", blank=True)
    objects = TopicManager()

    def save(self, *args, **kwargs):
        """
        On save of a topics, update the cache of slugs to pools.
        """
        self.slug = self.slug.lower()
        super().save(*args, **kwargs)
        
        # Update cache of slugs to pools
        Topic.objects.build_slug_to_pools_cache(rebuild=True)

    class Meta:
        verbose_name = "Topic Pool Management"
        verbose_name_plural = "Topic Pool Management"

    def __str__(self):
        return self.slug
