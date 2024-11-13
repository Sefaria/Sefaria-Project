from django.db import models
from topics.models.pool import TopicPool


class Topic(models.Model):
    slug = models.CharField(max_length=255, unique=True)
    en_title = models.CharField(max_length=255, blank=True, default="")
    he_title = models.CharField(max_length=255, blank=True, default="")
    pools = models.ManyToManyField(TopicPool, related_name="topics")

    def __str__(self):
        return f"Topic('{self.slug}')"
