from django.contrib.auth.models import User
from django.db import models


class UserExperimentSettings(models.Model):
    """
    Vestigial: the whitelist for the experiments program, whose only member was ever the
    Library Assistant. The assistant is now a plain user setting — see
    sefaria.helper.library_assistant — and nothing reads this model any more. The table
    is dropped in the following deploy; the rows are archived first.
    """
    user = models.OneToOneField(User, on_delete=models.CASCADE, related_name="experiment_settings")
    experiments = models.BooleanField(default=True)

    class Meta:
        verbose_name = "User experiment settings"
        verbose_name_plural = "User experiment settings"

    def __str__(self):
        return f"Experiments for user {self.user_id}"
