"""Homepage content edited in the Django admin (contract C2, PLAN.md §2.3.3).

Seeded by a later data migration with live's three carousel cards and six tool tiles.
"""

from adminsortable.models import SortableMixin
from django.db import models
from django.utils import timezone


class HomepageItem(SortableMixin):
    title = models.CharField(max_length=200)
    blurb = models.TextField(blank=True, default="")
    link_url = models.CharField(max_length=2048, blank=True, default="")
    link_label = models.CharField(max_length=200, blank=True, default="")
    link_new_tab = models.BooleanField(default=False)
    image_url = models.CharField(max_length=2048, blank=True, default="")
    image_alt = models.CharField(max_length=300, blank=True, default="")
    # The name of an icon shipped with devportal-ui. No markup is stored in the database.
    icon = models.CharField(max_length=64, blank=True, default="")
    color = models.CharField(max_length=32, blank=True, default="")  # a CSS color such as "#802F3E"
    position = models.PositiveIntegerField(default=0, db_index=True)
    is_active = models.BooleanField(default=True)
    created_at = models.DateTimeField(default=timezone.now, editable=False)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        abstract = True
        ordering = ["position"]

    def __str__(self):
        return self.title


class HomepageCarouselCard(HomepageItem):
    """A "featured project" card in the homepage carousel."""

    class Meta(HomepageItem.Meta):
        verbose_name = "homepage carousel card"


class HomepageToolTile(HomepageItem):
    """A tile in the homepage's developer tools grid."""

    class Meta(HomepageItem.Meta):
        verbose_name = "homepage tool tile"
