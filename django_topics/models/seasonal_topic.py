from django.db import models
from django_topics.models import Topic
from django.core.exceptions import ValidationError
from django.utils.timezone import now
from datetime import datetime

class SeasonalTopicManager(models.Manager):
    def get_seasonal_topic(self, lang: str, date: datetime = None) -> 'SeasonalTopic':
        """
        Return seasonal topic for given date or closest date that is less than or equal to given date
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
        help_text="Secondary topic which will be displayed alongside `topic`. E.g. `topic` is 'Teshuva' then secondary topic could be 'Yom Kippur'."
    )
    start_date = models.DateField(help_text="Start date of when this will appear. End date is implied by when the next Seasonal Topic is displayed.")
    display_start_date_israel = models.DateField(blank=True, null=True)
    display_end_date_israel = models.DateField(blank=True, null=True)
    display_start_date_diaspora = models.DateField(blank=True, null=True)
    display_end_date_diaspora = models.DateField(blank=True, null=True)
    display_date_prefix = models.CharField(max_length=255, blank=True, null=True)
    display_date_suffix = models.CharField(max_length=255, blank=True, null=True)
    lang = models.CharField(max_length=2, choices=[('en', 'English'), ('he', 'Hebrew')])
    objects = SeasonalTopicManager()

    class Meta:
        unique_together = ('topic', 'start_date')
        verbose_name = "Landing Page - Calendar"
        verbose_name_plural = "Landing Page - Calendar"

    def populate_field_based_on_field(self, field, reference_field):
        if not getattr(self, field, None) and getattr(self, reference_field, None):
            setattr(self, field, getattr(self, reference_field))

    def validate_start_end_dates(self, start_date_field, end_date_field):
        if not getattr(self, start_date_field, None) and not getattr(self, end_date_field, None):
            # no data
            return
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
        if self.display_date_prefix:
            self.display_date_prefix = self.display_date_prefix.strip()
        if self.display_date_suffix:
            self.display_date_suffix = self.display_date_suffix.strip()

    def __str__(self):
        return f"{self.topic.slug} ({self.start_date})"

    def get_display_start_date(self, diaspora=True):
        return self.display_start_date_diaspora if diaspora else self.display_start_date_israel

    def get_display_end_date(self, diaspora=True):
        return self.display_end_date_diaspora if diaspora else self.display_end_date_israel


class SeasonalTopicEnglish(SeasonalTopic):
    class Meta:
        proxy = True
        verbose_name = "Landing Page - Calendar (EN)"
        verbose_name_plural = "Landing Page - Calendar (EN)"

    def save(self, *args, **kwargs):
        self.lang = "en"
        super().save(*args, **kwargs)


class SeasonalTopicHebrew(SeasonalTopic):
    class Meta:
        proxy = True
        verbose_name = "Landing Page - Calendar (HE)"
        verbose_name_plural = "Landing Page - Calendar (HE)"

    def save(self, *args, **kwargs):
        self.lang = "he"
        super().save(*args, **kwargs)
