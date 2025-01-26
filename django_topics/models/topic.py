from django.db import models
from django.db.models.query import QuerySet
import random
from django_topics.models.pool import TopicPool


class TopicManager(models.Manager):
    def sample_topic_slugs(self, order, pool: str = None, limit=10) -> list[str]:
        if pool:
            topics = self.get_topic_slugs_by_pool(pool)
        else:
            topics = self.all().values_list('slug', flat=True)
        if order == 'random':
            return random.sample(list(topics), min(limit, len(topics)))
        else:
            raise Exception("Invalid order: '{}'".format(order))

    def get_pools_by_topic_slug(self, topic_slug: str) -> QuerySet:
        return self.filter(slug=topic_slug).values_list("pools__name", flat=True)

    def get_topic_slugs_by_pool(self, pool: str) -> QuerySet:
        return self.filter(pools__name=pool).values_list("slug", flat=True)

    def get_pools_for_all_topic_slugs(self) -> dict[str, list[str]]:
        from collections import defaultdict
        """
        Returns a dictionary mapping each topic slug in the database to its list of pools.
        """
        slug_to_pools = defaultdict(list)
        topics = self.values_list('slug', 'pools__name')  # Fetch all slugs and their pools
        for slug, pool_name in topics:
            if pool_name:  # Avoid adding None values
                slug_to_pools[slug].append(pool_name)
        return dict(slug_to_pools)


class Topic(models.Model):
    slug = models.CharField(max_length=255, primary_key=True)
    en_title = models.CharField(max_length=255, blank=True, default="")
    he_title = models.CharField(max_length=255, blank=True, default="")
    pools = models.ManyToManyField(TopicPool, related_name="topics", blank=True)
    objects = TopicManager()

    class Meta:
        verbose_name = "Topic Pool Management"
        verbose_name_plural = "Topic Pool Management"

    def __str__(self):
        return self.slug
