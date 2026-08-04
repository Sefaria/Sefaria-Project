from django.contrib.auth.models import User
from django.db import models


class UserExperimentSettings(models.Model):
    """
    Vestigial: the whitelist for the retired experiments program. Nothing reads it — the
    Library Assistant, the only feature it ever gated, is a plain user setting (see
    sefaria.helper.library_assistant). The class stays only so its Postgres table has a
    model to drop it by; deleting the class without a migration would strand the table.
    """
    user = models.OneToOneField(User, on_delete=models.CASCADE, related_name="experiment_settings")
    experiments = models.BooleanField(default=True)

    class Meta:
        verbose_name = "User experiment settings"
        verbose_name_plural = "User experiment settings"

    def __str__(self):
        return f"Experiments for user {self.user_id}"
