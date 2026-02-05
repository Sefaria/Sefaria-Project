from django.contrib.auth.models import User
from django.core.exceptions import ObjectDoesNotExist
from django.db import models


class UserExperimentSettings(models.Model):
    user = models.OneToOneField(User, on_delete=models.CASCADE, related_name="experiment_settings")
    experiments = models.BooleanField(default=True)

    class Meta:
        verbose_name = "User experiment settings"
        verbose_name_plural = "User experiment settings"

    def __str__(self):
        return f"Experiments for user {self.user_id}"


def _get_user_experiments(user):
    try:
        return bool(user.experiment_settings.experiments)
    except ObjectDoesNotExist:
        return False


def _set_user_experiments(user, value):
    settings, _ = UserExperimentSettings.objects.get_or_create(user=user)
    settings.experiments = bool(value)
    settings.save(update_fields=["experiments"])


if not hasattr(User, "experiments"):
    User.add_to_class("experiments", property(_get_user_experiments, _set_user_experiments))


def user_has_experiments(user):
    if not user or not getattr(user, "is_authenticated", False):
        return False
    return UserExperimentSettings.objects.filter(user=user, experiments=True).exists()
