from django.db import models


class TopicPoolLinkManager(models.Manager):
    def get_random_topic_slugs(self, pool=None, limit=10) -> list[str]:
        query_set = self.get_queryset()
        if pool:
            query_set = query_set.filter(pool=pool)
        query_set = query_set.values('topic_slug').distinct().order_by('?')[:limit]
        return [x['topic_slug'] for x in query_set]


class TopicPoolLink(models.Model):
    pool = models.CharField(max_length=255)
    topic_slug = models.CharField(max_length=255)
    objects = TopicPoolLinkManager()

    def __str__(self):
        return f"{self.pool} <> {self.topic_slug}"






