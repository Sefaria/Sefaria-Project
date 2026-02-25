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
    experiments_enabled = bool(value)
    settings, _ = UserExperimentSettings.objects.get_or_create(user=user)
    settings.experiments = experiments_enabled
    settings.save(update_fields=["experiments"])

    from sefaria.model.user_profile import UserProfile
    profile = UserProfile(id=user.id)
    profile.experiments = experiments_enabled
    profile.save()


if not hasattr(User, "experiments"):
    User.add_to_class("experiments", property(_get_user_experiments, _set_user_experiments))


def user_has_experiments(user):
    if not user or not getattr(user, "is_authenticated", False):
        return False
    return UserExperimentSettings.objects.filter(user=user, experiments=True).exists()


DEFAULT_WELCOME = "Welcome! Ask me anything about Jewish texts."
DEFAULT_RESTART = "Start a conversation"


class ChatbotWelcomeMessage(models.Model):
    """
    Editable welcome/restart messages for the LC chatbot empty state.
    Single record per key (e.g. 'default'). Managed via Django admin.
    """
    key = models.CharField(
        max_length=50,
        unique=True,
        default="default",
        help_text="Identifier for this message set (e.g. 'default')",
    )
    welcome = models.TextField(
        default=DEFAULT_WELCOME,
        help_text="Message shown when chat is empty (first-time or cleared)",
    )
    restart = models.TextField(
        default=DEFAULT_RESTART,
        help_text="Message shown on restart button when chat is empty",
    )
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        verbose_name = "Chatbot welcome message"
        verbose_name_plural = "Chatbot welcome messages"
        ordering = ["key"]

    def __str__(self):
        return f"Chatbot welcome ({self.key})"


def get_chatbot_welcome_messages():
    """
    Returns dict with 'welcome' and 'restart' keys for the chatbot.
    Falls back to defaults if no record exists.
    """
    try:
        obj = ChatbotWelcomeMessage.objects.get(key="default")
        return {
            "welcome": obj.welcome or DEFAULT_WELCOME,
            "restart": obj.restart or DEFAULT_RESTART,
        }
    except ChatbotWelcomeMessage.DoesNotExist:
        return {
            "welcome": DEFAULT_WELCOME,
            "restart": DEFAULT_RESTART,
        }
