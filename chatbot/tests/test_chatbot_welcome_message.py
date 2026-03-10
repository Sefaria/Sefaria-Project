"""Tests for get_chatbot_welcome_messages() backed by RemoteConfig."""
import json

import pytest

from remote_config.models import RemoteConfigEntry, ValueType
from remote_config.cache import remoteConfigCache
from remote_config.keys import CHATBOT_WELCOME_MESSAGES
from chatbot.models import (
    get_chatbot_welcome_messages,
    DEFAULT_WELCOME_EN,
    DEFAULT_WELCOME_HE,
    DEFAULT_RESTART_EN,
    DEFAULT_RESTART_HE,
    DEFAULT_NEW_SESSION_EN,
    DEFAULT_NEW_SESSION_HE,
)


def _set_welcome_config(data):
    RemoteConfigEntry.objects.update_or_create(
        key=CHATBOT_WELCOME_MESSAGES,
        defaults={
            "raw_value": json.dumps(data),
            "value_type": ValueType.JSON,
            "is_active": True,
        },
    )
    remoteConfigCache.reload()


def _clear_welcome_config():
    RemoteConfigEntry.objects.filter(key=CHATBOT_WELCOME_MESSAGES).delete()
    remoteConfigCache.reload()


@pytest.mark.django_db
def test_get_chatbot_welcome_messages_returns_defaults_when_no_entry():
    _clear_welcome_config()
    result = get_chatbot_welcome_messages()
    assert result["welcome_english"] == DEFAULT_WELCOME_EN
    assert result["welcome_hebrew"] == DEFAULT_WELCOME_HE
    assert result["restart_english"] == DEFAULT_RESTART_EN
    assert result["restart_hebrew"] == DEFAULT_RESTART_HE
    assert result["new_session_english"] == DEFAULT_NEW_SESSION_EN
    assert result["new_session_hebrew"] == DEFAULT_NEW_SESSION_HE


@pytest.mark.django_db
def test_get_chatbot_welcome_messages_returns_stored_values():
    _set_welcome_config({
        "welcome_english": "Custom welcome EN",
        "welcome_hebrew": "Custom welcome HE",
        "restart_english": "Custom restart EN",
        "restart_hebrew": "Custom restart HE",
        "new_session_english": "Custom new session EN",
        "new_session_hebrew": "Custom new session HE",
    })
    result = get_chatbot_welcome_messages()
    assert result["welcome_english"] == "Custom welcome EN"
    assert result["welcome_hebrew"] == "Custom welcome HE"
    assert result["restart_english"] == "Custom restart EN"
    assert result["restart_hebrew"] == "Custom restart HE"
    assert result["new_session_english"] == "Custom new session EN"
    assert result["new_session_hebrew"] == "Custom new session HE"


@pytest.mark.django_db
def test_get_chatbot_welcome_messages_returns_defaults_for_empty_strings():
    _set_welcome_config({
        "welcome_english": "",
        "welcome_hebrew": "",
        "restart_english": "",
        "restart_hebrew": "",
        "new_session_english": "",
        "new_session_hebrew": "",
    })
    result = get_chatbot_welcome_messages()
    assert result["welcome_english"] == DEFAULT_WELCOME_EN
    assert result["welcome_hebrew"] == DEFAULT_WELCOME_HE
    assert result["restart_english"] == DEFAULT_RESTART_EN
    assert result["restart_hebrew"] == DEFAULT_RESTART_HE
    assert result["new_session_english"] == DEFAULT_NEW_SESSION_EN
    assert result["new_session_hebrew"] == DEFAULT_NEW_SESSION_HE


@pytest.mark.django_db
def test_get_chatbot_welcome_messages_fills_missing_keys():
    _set_welcome_config({"welcome_english": "Only this one"})
    result = get_chatbot_welcome_messages()
    assert result["welcome_english"] == "Only this one"
    assert result["welcome_hebrew"] == DEFAULT_WELCOME_HE
    assert result["restart_english"] == DEFAULT_RESTART_EN
