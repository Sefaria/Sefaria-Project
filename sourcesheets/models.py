from django.db import models
from adminsortable.models import Sortable
import json

class Guide(models.Model):
    """
    Guide model for organizing InfoCards by guide type (e.g., 'sheets', 'topics')
    """
    key = models.CharField(
        max_length=100, 
        unique=True, 
        verbose_name="Guide Key",
        help_text="Unique identifier for the guide (e.g., 'sheets', 'topics')"
    )
    title_prefix_en = models.CharField(
        max_length=255, 
        verbose_name="Title Prefix (EN)",
        help_text="Prefix shown before tips (e.g., 'Quick Start:')"
    )
    title_prefix_he = models.CharField(
        max_length=255, 
        verbose_name="Title Prefix (HE)",
        help_text="Prefix shown before tips in Hebrew"
    )
    footer_links_json = models.TextField(
        default="[]",
        verbose_name="Footer Links",
        help_text="JSON array of footer links with structure: [{'text': {'en': 'Link Text', 'he': 'טקסט קישור'}, 'url': '/path'}]"
    )
    
    @property
    def footer_links(self):
        """Parse JSON string to Python object"""
        try:
            return json.loads(self.footer_links_json)
        except (json.JSONDecodeError, TypeError):
            return []
    
    @footer_links.setter
    def footer_links(self, value):
        """Serialize Python object to JSON string"""
        self.footer_links_json = json.dumps(value)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    def __str__(self):
        return f"{self.key} - {self.title_prefix_en}"

    class Meta:
        verbose_name = "Guide"
        verbose_name_plural = "Guides"
        ordering = ['key']

class InfoCard(Sortable):
    """
    InfoCard model for individual tips within a guide
    """
    guide = models.ForeignKey(
        Guide,
        on_delete=models.CASCADE,
        related_name='info_cards',
        verbose_name="Guide"
    )
    title_en = models.CharField(max_length=255, verbose_name="Title (EN)")
    title_he = models.CharField(max_length=255, verbose_name="Title (HE)")
    text_en = models.TextField(verbose_name="Text (EN)")
    text_he = models.TextField(verbose_name="Text (HE)")
    order = models.PositiveIntegerField(default=0, blank=False, null=False)
    image_en = models.URLField(
        verbose_name="Image URL (EN)",
        help_text="Upload the image via Google Cloud and provide the URL here.",
        blank=True,
    )
    image_he = models.URLField(
        verbose_name="Image URL (HE)",
        help_text="Upload the image via Google Cloud and provide the URL here.",
        blank=True,
    )
    image_alt_en = models.CharField(
        max_length=255,
        verbose_name="Image Alt Text (EN)",
        blank=True,
        help_text="Alternative text for the image in English"
    )
    image_alt_he = models.CharField(
        max_length=255,
        verbose_name="Image Alt Text (HE)",
        blank=True,
        help_text="Alternative text for the image in Hebrew"
    )

    def __str__(self):
        return f"{self.guide.key} - {self.title_en}"

    class Meta(Sortable.Meta):
        verbose_name = "Info Card"
        verbose_name_plural = "Info Cards"
        ordering = ['order']