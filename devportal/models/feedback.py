"""The "Did this page help you?" widget (contract C2, PLAN.md §2.3.3)."""

from django.conf import settings
from django.db import models
from django.utils import timezone


class Feedback(models.Model):
    path = models.CharField(max_length=1024)
    page = models.ForeignKey(
        "devportal.Page",
        null=True,
        blank=True,
        on_delete=models.SET_NULL,
        related_name="feedback",
    )
    helpful = models.BooleanField(null=True, blank=True)  # null when only a comment was sent
    comment = models.TextField(blank=True, default="")
    created_at = models.DateTimeField(default=timezone.now, db_index=True)
    user = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        null=True,
        blank=True,
        on_delete=models.SET_NULL,
        related_name="+",
    )
    # A salted daily hash, used only to limit repeats. Never an IP address.
    visitor_hash = models.CharField(max_length=64, blank=True, default="", db_index=True)

    class Meta:
        ordering = ["-created_at", "-id"]
        verbose_name_plural = "feedback"

    def __str__(self):
        verdict = {True: "helpful", False: "not helpful", None: "comment"}[self.helpful]
        return f"{self.path}: {verdict}"
