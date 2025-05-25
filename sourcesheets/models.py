from django.db import models
from adminsortable.models import Sortable

class InfoCard(Sortable):
    title_en = models.CharField(max_length=255, verbose_name="Title (EN)")
    body_en = models.TextField(verbose_name="Body (EN)")
    image_en = models.URLField(
        verbose_name="Image URL (EN)",
        help_text="Upload the image via Google Cloud and provide the URL here.",
        blank=True,
    )
    title_he = models.CharField(max_length=255, verbose_name="Title (HE)")
    body_he = models.TextField(verbose_name="Body (HE)")
    image_he = models.URLField(
        verbose_name="Image URL (HE)",
        help_text="Upload the image via Google Cloud and provide the URL here.",
        blank=True,
    )

    def __str__(self):
        return self.title_en 

    class Meta(Sortable.Meta):
        pass