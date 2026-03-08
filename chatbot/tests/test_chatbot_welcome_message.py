"""Tests for ChatbotWelcomeMessage model and get_chatbot_welcome_messages()."""
import pytest
from chatbot.models import (
    ChatbotWelcomeMessage,
    get_chatbot_welcome_messages,
    DEFAULT_WELCOME_EN,
    DEFAULT_WELCOME_HE,
    DEFAULT_RESTART_EN,
    DEFAULT_RESTART_HE,
    DEFAULT_NEW_SESSION_EN,
    DEFAULT_NEW_SESSION_HE,
)


@pytest.mark.django_db
def test_get_chatbot_welcome_messages_returns_defaults_when_no_record():
    ChatbotWelcomeMessage.objects.filter(key="default").delete()
    result = get_chatbot_welcome_messages()
    assert result["welcome_english"] == DEFAULT_WELCOME_EN
    assert result["welcome_hebrew"] == DEFAULT_WELCOME_HE
    assert result["restart_english"] == DEFAULT_RESTART_EN
    assert result["restart_hebrew"] == DEFAULT_RESTART_HE
    assert result["new_session_english"] == DEFAULT_NEW_SESSION_EN
    assert result["new_session_hebrew"] == DEFAULT_NEW_SESSION_HE


@pytest.mark.django_db
def test_get_chatbot_welcome_messages_returns_db_values_when_record_exists():
    ChatbotWelcomeMessage.objects.update_or_create(
        key="default",
        defaults={
            "welcome_english": "Custom welcome EN",
            "welcome_hebrew": "Custom welcome HE",
            "restart_english": "Custom restart EN",
            "restart_hebrew": "Custom restart HE",
            "new_session_english": "Custom new session EN",
            "new_session_hebrew": "Custom new session HE",
        },
    )
    result = get_chatbot_welcome_messages()
    assert result["welcome_english"] == "Custom welcome EN"
    assert result["welcome_hebrew"] == "Custom welcome HE"
    assert result["restart_english"] == "Custom restart EN"
    assert result["restart_hebrew"] == "Custom restart HE"
    assert result["new_session_english"] == "Custom new session EN"
    assert result["new_session_hebrew"] == "Custom new session HE"


@pytest.mark.django_db
def test_get_chatbot_welcome_messages_returns_defaults_when_record_has_empty_strings():
    ChatbotWelcomeMessage.objects.update_or_create(
        key="default",
        defaults={
            "welcome_english": "",
            "welcome_hebrew": "",
            "restart_english": "",
            "restart_hebrew": "",
            "new_session_english": "",
            "new_session_hebrew": "",
        },
    )
    result = get_chatbot_welcome_messages()
    assert result["welcome_english"] == DEFAULT_WELCOME_EN
    assert result["welcome_hebrew"] == DEFAULT_WELCOME_HE
    assert result["restart_english"] == DEFAULT_RESTART_EN
    assert result["restart_hebrew"] == DEFAULT_RESTART_HE
    assert result["new_session_english"] == DEFAULT_NEW_SESSION_EN
    assert result["new_session_hebrew"] == DEFAULT_NEW_SESSION_HE
