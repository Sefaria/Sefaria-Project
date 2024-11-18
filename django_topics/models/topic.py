from django.db import models
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

    def get_pools_by_topic_slug(self, topic_slug: str) -> list[str]:
        return self.filter(slug=topic_slug).values_list("pools__name", flat=True)

    def get_topic_slugs_by_pool(self, pool: str) -> list[str]:
        return self.filter(pools__name=pool).values_list("slug", flat=True)


class Topic(models.Model):
    slug = models.CharField(max_length=255, unique=True)
    en_title = models.CharField(max_length=255, blank=True, default="")
    he_title = models.CharField(max_length=255, blank=True, default="")
    pools = models.ManyToManyField(TopicPool, related_name="topics", blank=True)
    objects = TopicManager()

    def __str__(self):
        return f"Topic('{self.slug}')"
