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
    end_date = models.DateField(blank=True, null=True)

    class Meta:
        unique_together = ('topic', 'start_date', 'end_date')
        verbose_name = "Topic of the Day"
        verbose_name_plural = "Topics of the Day"

    def clean(self):
        if not self.end_date:
            # end_date is optional. When not passed, default it to use start_date
            self.end_date = self.start_date

        if self.start_date > self.end_date:
            raise ValidationError("Start date cannot be after end date.")

    def overlaps_with(self, other_start_date, other_end_date):
        """
        Check if this date range overlaps with another date range.
        """
        return (
            (self.start_date <= other_end_date) and
            (self.end_date >= other_start_date)
        )

    def __str__(self):
        return f"{self.topic.slug} ({self.start_date} to {self.end_date})"
