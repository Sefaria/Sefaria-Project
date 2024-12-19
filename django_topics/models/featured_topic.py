from django.db import models
from datetime import datetime
from django.utils.timezone import now
from django_topics.models import Topic


class FeaturedTopicManager(models.Manager):

    def get_featured_topic(self, lang: str, date: datetime = None) -> 'TopicOfTheDay':
        """
        Return featured topic for given date or closest date that is less than or equal to given date
        @param lang: language code, "en" or "he"
        @param date: datetime object
        @return:
        """
        date = date or now().date()
        return (
            self.filter(start_date__lte=date, lang=lang)
            .order_by('-start_date')
            .first()
        )


class TopicOfTheDay(models.Model):
    topic = models.ForeignKey(
        Topic,
        on_delete=models.CASCADE,
        related_name='topic_of_the_day'
    )
    start_date = models.DateField()
    lang = models.CharField(max_length=2, choices=[('en', 'English'), ('he', 'Hebrew')])
    objects = FeaturedTopicManager()

    class Meta:
        unique_together = ('topic', 'start_date')
        verbose_name = "Landing Page - Featured Topic"
        verbose_name_plural = "Landing Page - Featured Topic"

    def __str__(self):
        return f"{self.topic.slug} ({self.start_date})"


class FeaturedTopicEnglish(TopicOfTheDay):
    class Meta:
        proxy = True
        verbose_name = "Landing Page - Featured Topic (EN)"
        verbose_name_plural = "Landing Page - Featured Topic (EN)"

    def save(self, *args, **kwargs):
        self.lang = "en"
        super().save(*args, **kwargs)


class FeaturedTopicHebrew(TopicOfTheDay):
    class Meta:
        proxy = True
        verbose_name = "Landing Page - Featured Topic (HE)"
        verbose_name_plural = "Landing Page - Featured Topic (HE)"

    def save(self, *args, **kwargs):
        self.lang = "he"
        super().save(*args, **kwargs)
