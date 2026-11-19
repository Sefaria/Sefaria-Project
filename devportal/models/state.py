"""Portal-wide state and the built artifacts (contract C2, PLAN.md §2.3.3)."""

from django.db import models
from django.db.models import Q
from django.utils import timezone


class PortalState(models.Model):
    """The single row of portal state. Read it with `PortalState.load()`."""

    SINGLETON_ID = 1

    # Bumped on every publish or tree change; caches key on it.
    generation = models.PositiveBigIntegerField(default=0)
    # Hashes of the content snapshot (devportal/migration_source/) and of docs/openAPI.json last
    # imported. The post_migrate seeding hook compares them with the image's (PLAN.md §7.6).
    snapshot_sha = models.CharField(max_length=64, blank=True, default="")
    spec_sha = models.CharField(max_length=64, blank=True, default="")
    last_seed_at = models.DateTimeField(null=True, blank=True)
    last_seed_error = models.TextField(blank=True, default="")  # empty when the last seed succeeded
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        verbose_name = "portal state"
        verbose_name_plural = "portal state"
        constraints = [
            models.CheckConstraint(condition=Q(id=1), name="devportal_portalstate_singleton"),
        ]

    def __str__(self):
        return f"generation {self.generation}"

    @classmethod
    def load(cls):
        state, _ = cls.objects.get_or_create(id=cls.SINGLETON_ID)
        return state


class PortalArtifact(models.Model):
    """A built file keyed by name: the search documents, the `llms` files, the sitemap, the
    sidebar trees and the import report. Rebuilt by the publish pipeline."""

    name = models.CharField(max_length=255, unique=True)
    content = models.TextField(blank=True, default="")
    content_type = models.CharField(max_length=100, default="application/json")
    sha256 = models.CharField(max_length=64, blank=True, default="")
    generation = models.PositiveBigIntegerField(default=0)  # the PortalState.generation it was built for
    created_at = models.DateTimeField(default=timezone.now, editable=False)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["name"]

    def __str__(self):
        return self.name
