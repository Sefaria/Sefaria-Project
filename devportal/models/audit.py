"""Who did what in the editor (contract C2, PLAN.md §2.3.3)."""

from django.conf import settings
from django.db import models
from django.utils import timezone


class EditorAuditLog(models.Model):
    class Action(models.TextChoices):
        CREATE = "create", "Create"
        SAVE_DRAFT = "save_draft", "Save draft"
        PUBLISH = "publish", "Publish"
        RESTORE = "restore", "Restore"
        MOVE = "move", "Move"
        CHANGE_SLUG = "change_slug", "Change slug"
        DELETE = "delete", "Delete"
        UPLOAD = "upload", "Upload"

    created_at = models.DateTimeField(default=timezone.now, db_index=True)
    user = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        null=True,
        blank=True,
        on_delete=models.SET_NULL,
        related_name="+",
    )
    action = models.CharField(max_length=32, choices=Action.choices)
    page = models.ForeignKey(
        "devportal.Page",
        null=True,
        blank=True,
        on_delete=models.SET_NULL,
        related_name="audit_log",
    )
    # A copy of the page's section and path at the time, kept when the page is gone.
    section = models.CharField(max_length=16, blank=True, default="")
    path = models.CharField(max_length=1024, blank=True, default="")
    # Action-specific detail, e.g. {"from_parent": 3, "to_parent": 7, "position": 2} for a move.
    details = models.JSONField(default=dict, blank=True)

    class Meta:
        ordering = ["-created_at", "-id"]
        verbose_name = "editor audit log entry"
        verbose_name_plural = "editor audit log"

    def __str__(self):
        return f"{self.created_at:%Y-%m-%d %H:%M} {self.action} {self.path}"
