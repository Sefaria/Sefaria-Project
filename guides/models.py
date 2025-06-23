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
        help_text="Unique identifier for the guide (e.g., 'editor', 'topics')",
        choices=[('editor', 'editor')],  # Closed list, add more as needed. Format: [(key, value), ...]
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
    # Footer Link 1
    footer_link_1_text_en = models.CharField(
        max_length=255,
        blank=True,
        verbose_name="Footer Link 1 Text (EN)",
        help_text="Text for the first footer link in English (optional)"
    )
    footer_link_1_text_he = models.CharField(
        max_length=255,
        blank=True,
        verbose_name="Footer Link 1 Text (HE)",
        help_text="Text for the first footer link in Hebrew (optional)"
    )
    footer_link_1_url = models.URLField(
        blank=True,
        verbose_name="Footer Link 1 URL",
        help_text="URL for the first footer link (optional)"
    )
    
    # Footer Link 2
    footer_link_2_text_en = models.CharField(
        max_length=255,
        blank=True,
        verbose_name="Footer Link 2 Text (EN)",
        help_text="Text for the second footer link in English (optional)"
    )
    footer_link_2_text_he = models.CharField(
        max_length=255,
        blank=True,
        verbose_name="Footer Link 2 Text (HE)",
        help_text="Text for the second footer link in Hebrew (optional)"
    )
    footer_link_2_url = models.URLField(
        blank=True,
        verbose_name="Footer Link 2 URL",
        help_text="URL for the second footer link (optional)"
    )
    
    @property
    def footer_links(self):
        """Generate footer links array from individual fields"""
        links = []
        
        # Process both footer links
        for i in [1, 2]: # Currently up to 2 links are supported
            text_en = getattr(self, f'footer_link_{i}_text_en')
            text_he = getattr(self, f'footer_link_{i}_text_he')
            url = getattr(self, f'footer_link_{i}_url')
            
            # Add link if it has texts and URL
            if text_en and text_he and url:
                links.append({
                    'text': {
                        'en': text_en,
                        'he': text_he
                    },
                    'url': url
                })
        
        return links
    
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    def contents(self, **kwargs):
        """
        Returns the complete guide data structure for API responses.
        
        Returns:
            dict: Dictionary containing titlePrefix, footerLinks, and cards
        """
        # Get all info cards for this guide, ordered by their sort order
        info_cards = self.info_cards.all().order_by('order')
        
        # Build the cards array
        cards = [card.contents() for card in info_cards]
        
        # Build the response
        return {
            "titlePrefix": {
                "en": self.title_prefix_en,
                "he": self.title_prefix_he
            },
            "footerLinks": self.footer_links,
            "cards": cards
        }

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
    text_en = models.TextField(verbose_name="Text (EN)",
        help_text="Text supports markdown.",
    )
    text_he = models.TextField(verbose_name="Text (HE)",
        help_text="Text supports markdown.",
    )
    order = models.PositiveIntegerField(default=0, blank=False, null=False)
    video_en = models.URLField(
        verbose_name="Video URL (EN)",
        help_text="Upload the video via Google Cloud to the Bucket 'guides-resources'and provide the URL here."
    )
    video_he = models.URLField(
        verbose_name="Video URL (HE)",
        help_text="Upload the video via Google Cloud to the Bucket 'guides-resources' and provide the URL here."
    )

    def contents(self, **kwargs):
        """
        Returns the card data structure for API responses.
        
        Returns:
            dict: Dictionary containing id, title, text, and videoUrl
        """
        return {
            "id": str(self.id),
            "title": {
                "en": self.title_en,
                "he": self.title_he
            },
            "text": {
                "en": self.text_en,
                "he": self.text_he
            },
            "videoUrl": {
                "en": self.video_en,
                "he": self.video_he
            }
        }

    def __str__(self):
        return f"{self.guide.key} - {self.title_en}"

    class Meta(Sortable.Meta):
        verbose_name = "Info Card"
        verbose_name_plural = "Info Cards"
        ordering = ['order']