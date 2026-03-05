from django.db import models


DEFAULT_WELCOME_EN = "Welcome! Ask me anything about Jewish texts."
DEFAULT_WELCOME_HE = "ברוך הבא! שאל אותי כל מה שתרצה על טקסטים יהודיים."
DEFAULT_RESTART_EN = "Start a conversation"
DEFAULT_RESTART_HE = "התחל שיחה"


class ChatbotWelcomeMessage(models.Model):
    """
    Editable welcome/restart messages for the LC chatbot empty state.
    Single record per key (e.g. 'default'). Managed via Django admin.
    Supports English and Hebrew via separate fields.
    """
    key = models.CharField(
        max_length=50,
        unique=True,
        default="default",
        help_text="Identifier for this message set (e.g. 'default')",
    )
    welcome_english = models.TextField(
        default=DEFAULT_WELCOME_EN,
        help_text="Welcome message (English) shown when chat is empty",
    )
    welcome_hebrew = models.TextField(
        default=DEFAULT_WELCOME_HE,
        help_text="Welcome message (Hebrew) shown when chat is empty",
    )
    restart_english = models.TextField(
        default=DEFAULT_RESTART_EN,
        help_text="Restart message (English) shown when chat is empty after restart",
    )
    restart_hebrew = models.TextField(
        default=DEFAULT_RESTART_HE,
        help_text="Restart message (Hebrew) shown when chat is empty after restart",
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
    Returns dict with welcome_english, welcome_hebrew, restart_english, restart_hebrew
    for the chatbot. Falls back to defaults if no record exists.
    """
    try:
        obj = ChatbotWelcomeMessage.objects.get(key="default")
        return {
            "welcome_english": obj.welcome_english or DEFAULT_WELCOME_EN,
            "welcome_hebrew": obj.welcome_hebrew or DEFAULT_WELCOME_HE,
            "restart_english": obj.restart_english or DEFAULT_RESTART_EN,
            "restart_hebrew": obj.restart_hebrew or DEFAULT_RESTART_HE,
        }
    except ChatbotWelcomeMessage.DoesNotExist:
        return {
            "welcome_english": DEFAULT_WELCOME_EN,
            "welcome_hebrew": DEFAULT_WELCOME_HE,
            "restart_english": DEFAULT_RESTART_EN,
            "restart_hebrew": DEFAULT_RESTART_HE,
        }
