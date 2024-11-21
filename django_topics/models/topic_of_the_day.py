from django.db import models
from django_topics.models import Topic
from django.core.exceptions import ValidationError


class TopicOfTheDay(models.Model):
    topic = models.ForeignKey(
        Topic,
        on_delete=models.CASCADE,
        related_name='topic_of_the_day'
    )
    start_date = models.DateField()

    class Meta:
        unique_together = ('topic', 'start_date')
        verbose_name = "Landing Page - Topic of the Day"
        verbose_name_plural = "Landing Page - Topic of the Day"

    def __str__(self):
        return f"{self.topic.slug} ({self.start_date})"
