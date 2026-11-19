"""Images uploaded in the editor or mirrored from ReadMe (contract C2, PLAN.md §2.3.3, §7.3)."""

from django.conf import settings
from django.db import models
from django.utils import timezone


class MediaAsset(models.Model):
    gcs_path = models.CharField(max_length=1024)  # developers/<sha256-prefix>-<name>
    url = models.CharField(max_length=2048)
    content_type = models.CharField(max_length=100)
    size = models.PositiveBigIntegerField(default=0)
    width = models.PositiveIntegerField(null=True, blank=True)
    height = models.PositiveIntegerField(null=True, blank=True)
    sha256 = models.CharField(max_length=64, db_index=True)
    # The original external URL (e.g. files.readme.io). Unique, which makes mirroring idempotent.
    # Null for editor uploads.
    source_url = models.CharField(max_length=2048, null=True, blank=True, unique=True)
    uploaded_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        null=True,
        blank=True,
        on_delete=models.SET_NULL,
        related_name="+",
    )
    created_at = models.DateTimeField(default=timezone.now, editable=False)

    class Meta:
        ordering = ["-created_at", "-id"]

    def __str__(self):
        return self.gcs_path
