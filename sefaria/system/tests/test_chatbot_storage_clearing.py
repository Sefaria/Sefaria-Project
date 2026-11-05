"""
Logging out clears the Library Assistant's saved chat in the browser.

Logout (from any module) sets CLEAR_STORAGE_COOKIE; the next Library page renders a
script that clears the assistant's localStorage and deletes the cookie.
"""
from unittest.mock import patch

import pytest
from django.contrib.auth.models import AnonymousUser
from django.http import HttpResponse
from django.test import RequestFactory

from sefaria.constants.model import LIBRARY_MODULE, VOICES_MODULE
from sefaria.system.context_processors import chatbot_user_token
from sefaria.utils.chatbot import (
    CLEAR_STORAGE_COOKIE,
    CLEAR_STORAGE_COOKIE_MAX_AGE,
    mark_chatbot_storage_for_clearing,
)


@pytest.mark.django_db
def test_logout_sets_the_clear_storage_cookie(client):
    response = client.get("/logout")

    cookie = response.cookies[CLEAR_STORAGE_COOKIE]
    assert cookie.value == "1"
    assert cookie["max-age"] == CLEAR_STORAGE_COOKIE_MAX_AGE


def test_the_cookie_uses_the_session_cookie_domain_so_voices_and_library_share_it():
    request = RequestFactory().get("/logout")
    request._cookie_domain = ".sefaria.org"

    response = mark_chatbot_storage_for_clearing(request, HttpResponse())

    assert response.cookies[CLEAR_STORAGE_COOKIE]["domain"] == ".sefaria.org"


def context_for(cookies, active_module):
    request = RequestFactory().get("/Genesis.1")
    request.COOKIES.update(cookies)
    request.active_module = active_module
    request.user = AnonymousUser()
    request.session = {}
    request._cookie_domain = ".sefaria.org"
    with patch("sefaria.system.context_processors.library_assistant.is_enabled_for_user", return_value=True):
        return chatbot_user_token(request)


def test_library_page_after_logout_clears_the_storage():
    context = context_for({CLEAR_STORAGE_COOKIE: "1"}, LIBRARY_MODULE)

    assert context["chatbot_clear_storage"] is True
    assert context["chatbot_clear_storage_cookie"] == CLEAR_STORAGE_COOKIE
    assert context["chatbot_cookie_domain"] == ".sefaria.org"


def test_voices_page_leaves_the_cookie_for_the_library():
    context = context_for({CLEAR_STORAGE_COOKIE: "1"}, VOICES_MODULE)

    assert context["chatbot_clear_storage"] is False


def test_without_a_logout_nothing_is_cleared():
    context = context_for({}, LIBRARY_MODULE)

    assert context["chatbot_clear_storage"] is False
