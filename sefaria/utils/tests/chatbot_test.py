# -*- coding: utf-8 -*-
"""
Which ai-chatbot PR preview a request uses (?chatbot_version=<PR#>).
"""

from types import SimpleNamespace

import pytest
from django.conf import settings

from sefaria.utils.chatbot import resolve_chatbot_version


@pytest.fixture(autouse=True)
def no_default_version(monkeypatch):
    monkeypatch.setattr(settings, "CHATBOT_DEFAULT_VERSION", None, raising=False)


def request(get=None, session=None):
    return SimpleNamespace(GET=get or {}, session=session if session is not None else {})


def test_query_param_wins_and_is_remembered():
    req = request(get={"chatbot_version": " 222 "}, session={"chatbot_version": "100"})

    assert resolve_chatbot_version(req) == "222"
    assert req.session["chatbot_version"] == "222"


def test_falls_back_to_the_session():
    assert resolve_chatbot_version(request(session={"chatbot_version": "222"})) == "222"


def test_nothing_set_is_none():
    assert resolve_chatbot_version(request()) is None


def test_clear_forgets_it():
    req = request(get={"chatbot_version": "clear"}, session={"chatbot_version": "222"})

    assert resolve_chatbot_version(req) is None
    assert "chatbot_version" not in req.session


def test_clear_without_a_stored_version_is_fine():
    assert resolve_chatbot_version(request(get={"chatbot_version": "clear"})) is None


def test_default_version_when_nothing_is_set(monkeypatch):
    monkeypatch.setattr(settings, "CHATBOT_DEFAULT_VERSION", "227")

    assert resolve_chatbot_version(request()) == "227"
    assert resolve_chatbot_version(request(session={"chatbot_version": "222"})) == "222"
    assert resolve_chatbot_version(request(get={"chatbot_version": "clear"})) == "227"
