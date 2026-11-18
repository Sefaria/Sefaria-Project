"""Redirects and the 404 log (contract C2, PLAN.md §2.3.3)."""

from django.db import models
from django.utils import timezone


class Redirect(models.Model):
    """Consulted by the 404 handler. Created automatically when an editor changes a slug."""

    class Status(models.IntegerChoices):
        MOVED_PERMANENTLY = 301, "301 Moved Permanently"
        FOUND = 302, "302 Found"

    from_path = models.CharField(max_length=1024, unique=True)
    to_path = models.CharField(max_length=2048)
    status = models.PositiveSmallIntegerField(choices=Status.choices, default=Status.MOVED_PERMANENTLY)
    reason = models.CharField(max_length=32, blank=True, default="")  # e.g. "slug_change", "manual"
    created_at = models.DateTimeField(default=timezone.now, editable=False)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["from_path"]

    def __str__(self):
        return f"{self.from_path} -> {self.to_path} ({self.status})"


class NotFoundLog(models.Model):
    """Upserted on each 404 (rate limited); shown in the admin sorted by count."""

    path = models.CharField(max_length=1024, unique=True)
    count = models.PositiveBigIntegerField(default=0)
    first_seen = models.DateTimeField(default=timezone.now)
    last_seen = models.DateTimeField(default=timezone.now, db_index=True)
    last_referrer = models.CharField(max_length=2048, blank=True, default="")

    class Meta:
        ordering = ["-count", "path"]
        verbose_name = "not-found log entry"
        verbose_name_plural = "not-found log"

    def __str__(self):
        return f"{self.path} ({self.count})"
