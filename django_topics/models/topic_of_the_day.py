from django.db import models
from datetime import datetime
from django.utils.timezone import now
from django_topics.models import Topic


class TopicOfTheDayManager(models.Manager):

    def get_topic_of_the_day(self, lang: str, date: datetime = None) -> 'TopicOfTheDay':
        """
        Return topic of day for given date or closest date that is less than or equal to given date
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
    objects = TopicOfTheDayManager()

    class Meta:
        unique_together = ('topic', 'start_date')
        verbose_name = "Landing Page - Topic of the Day"
        verbose_name_plural = "Landing Page - Topic of the Day"

    def __str__(self):
        return f"{self.topic.slug} ({self.start_date})"


class TopicOfTheDayEnglish(TopicOfTheDay):
    class Meta:
        proxy = True
        verbose_name = "Landing Page - Topic of the Day (EN)"
        verbose_name_plural = "Landing Page - Topic of the Day (EN)"

    def save(self, *args, **kwargs):
        self.lang = "en"
        super().save(*args, **kwargs)


class TopicOfTheDayHebrew(TopicOfTheDay):
    class Meta:
        proxy = True
        verbose_name = "Landing Page - Topic of the Day (HE)"
        verbose_name_plural = "Landing Page - Topic of the Day (HE)"

    def save(self, *args, **kwargs):
        self.lang = "he"
        super().save(*args, **kwargs)
