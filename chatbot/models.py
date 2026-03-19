from remote_config import remoteConfigCache
from remote_config.keys import CHATBOT_WELCOME_MESSAGES
from remote_config.models import RemoteConfigEntry


DEFAULT_WELCOME_EN = "Welcome! Ask me anything about Jewish texts."
DEFAULT_WELCOME_HE = "ברוך הבא! שאל אותי כל מה שתרצה על טקסטים יהודיים."
DEFAULT_RESTART_EN = "Start a conversation"
DEFAULT_RESTART_HE = "התחל שיחה"
DEFAULT_NEW_SESSION_EN = "Start a new conversation"
DEFAULT_NEW_SESSION_HE = "התחל שיחה חדשה"

DEFAULTS = {
    "welcome_english": DEFAULT_WELCOME_EN,
    "welcome_hebrew": DEFAULT_WELCOME_HE,
    "restart_english": DEFAULT_RESTART_EN,
    "restart_hebrew": DEFAULT_RESTART_HE,
    "new_session_english": DEFAULT_NEW_SESSION_EN,
    "new_session_hebrew": DEFAULT_NEW_SESSION_HE,
}


def get_chatbot_welcome_messages():
    """
    Returns dict with welcome_english, welcome_hebrew, restart_english,
    restart_hebrew, new_session_english, new_session_hebrew for the chatbot.

    Reads from the RemoteConfig JSON entry; falls back to hard-coded defaults
    for any missing or empty value.
    """
    stored = remoteConfigCache.get(CHATBOT_WELCOME_MESSAGES, {})
    if not isinstance(stored, dict):
        stored = {}
    return {key: stored.get(key) or default for key, default in DEFAULTS.items()}


class ChatbotWelcomeMessageProxy(RemoteConfigEntry):
    """Proxy so Django admin registers a separate page under the chatbot app."""
    class Meta:
        proxy = True
        verbose_name = "Chatbot welcome message"
        verbose_name_plural = "Chatbot welcome messages"
        app_label = "chatbot"
