from django.db import models
from django_topics.models import Topic
from django.core.exceptions import ValidationError


class SeasonalTopic(models.Model):
    topic = models.ForeignKey(
        Topic,
        on_delete=models.CASCADE,
        related_name='seasonal_topic'
    )
    secondary_topic = models.ForeignKey(
        Topic,
        on_delete=models.CASCADE,
        related_name='seasonal_secondary_topic',
        blank=True,
        null=True,
    )  # e.g. for topic Teshuva, secondary_topic would be Yom Kippur
    start_date = models.DateField()
    display_start_date_israel = models.DateField(blank=True, null=True)
    display_end_date_israel = models.DateField(blank=True, null=True)
    display_start_date_diaspora = models.DateField(blank=True, null=True)
    display_end_date_diaspora = models.DateField(blank=True, null=True)

    class Meta:
        unique_together = ('topic', 'start_date')
        verbose_name = "Seasonal Topic"
        verbose_name_plural = "Seasonal Topics"

    def populate_field_based_on_field(self, field, reference_field):
        if not getattr(self, field, None) and getattr(self, reference_field, None):
            setattr(self, field, getattr(self, reference_field))

    def validate_start_end_dates(self, start_date_field, end_date_field):
        if not getattr(self, start_date_field, None) and getattr(self, end_date_field):
            raise ValidationError(f"End date field '{end_date_field}' defined without start date.")
        if getattr(self, start_date_field) > getattr(self, end_date_field):
            raise ValidationError(f"Start date field '{start_date_field}' cannot be after end date.")

    def clean(self):
        self.populate_field_based_on_field('display_end_date_israel', 'display_start_date_israel')
        self.populate_field_based_on_field('display_end_date_diaspora', 'display_start_date_diaspora')
        self.populate_field_based_on_field('display_start_date_diaspora', 'display_start_date_israel')
        self.populate_field_based_on_field('display_end_date_diaspora', 'display_end_date_israel')
        if not getattr(self, 'display_start_date_israel') and getattr(self, 'display_start_date_diaspora'):
            raise ValidationError("If diaspora date is defined, Israel date must also be defined.")
        self.validate_start_end_dates('display_start_date_israel', 'display_end_date_israel')
        self.validate_start_end_dates('display_start_date_diaspora', 'display_end_date_diaspora')

    def __str__(self):
        return f"{self.topic.slug} ({self.start_date})"
