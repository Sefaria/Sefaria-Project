"""Tests for ChatbotWelcomeMessage model and get_chatbot_welcome_messages()."""
import pytest
from reader.models import (
    ChatbotWelcomeMessage,
    get_chatbot_welcome_messages,
    DEFAULT_WELCOME,
    DEFAULT_RESTART,
)


@pytest.mark.django_db
def test_get_chatbot_welcome_messages_returns_defaults_when_no_record():
    ChatbotWelcomeMessage.objects.filter(key="default").delete()
    result = get_chatbot_welcome_messages()
    assert result["welcome"] == DEFAULT_WELCOME
    assert result["restart"] == DEFAULT_RESTART


@pytest.mark.django_db
def test_get_chatbot_welcome_messages_returns_db_values_when_record_exists():
    ChatbotWelcomeMessage.objects.update_or_create(
        key="default",
        defaults={"welcome": "Custom welcome", "restart": "Custom restart"},
    )
    result = get_chatbot_welcome_messages()
    assert result["welcome"] == "Custom welcome"
    assert result["restart"] == "Custom restart"


@pytest.mark.django_db
def test_get_chatbot_welcome_messages_returns_defaults_when_record_has_empty_strings():
    ChatbotWelcomeMessage.objects.update_or_create(
        key="default",
        defaults={"welcome": "", "restart": ""},
    )
    result = get_chatbot_welcome_messages()
    assert result["welcome"] == DEFAULT_WELCOME
    assert result["restart"] == DEFAULT_RESTART
