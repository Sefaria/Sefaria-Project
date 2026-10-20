import re

import pytest
from django.test import Client, override_settings

from sefaria.utils.chatbot import (
    MCP_LOGIN_TOKEN_AUDIENCE,
    _decrypt_chatbot_user_token,
    get_user_id_from_chatbot_user_token,
)

SECRET = "test-user-mcp-secret"
CALLBACK = "https://chat.sefaria.org/oauth/sefaria/callback"
STATE = "s" * 32
URL = "/api/mcp/authorize"


@pytest.fixture
def mcp_settings():
    with override_settings(MCP_TOKEN_SECRET=SECRET, MCP_AUTH_CALLBACK_URLS=[CALLBACK]):
        yield


def _field(html, name):
    return re.search(rf'name="{name}" value="([^"]*)"', html).group(1)


@pytest.mark.django_db
def test_signed_in_user_is_handed_to_the_callback(mcp_settings, django_user_model):
    user = django_user_model.objects.create_user(username="mcp-signin", password="pass")
    client = Client()
    client.force_login(user)

    response = client.get(URL, {"state": STATE, "redirect_uri": CALLBACK})

    assert response.status_code == 200
    assert response["Cache-Control"] == "no-store"
    body = response.content.decode()
    assert f'action="{CALLBACK}"' in body
    assert _field(body, "state") == STATE
    token = _field(body, "token")
    assert get_user_id_from_chatbot_user_token(token, SECRET, aud=MCP_LOGIN_TOKEN_AUDIENCE) == user.id
    assert token not in response.get("Location", "")


@pytest.mark.django_db
def test_login_token_is_short_lived(mcp_settings, django_user_model):
    from django.utils import timezone
    from django.utils.dateparse import parse_datetime

    user = django_user_model.objects.create_user(username="mcp-ttl", password="pass")
    client = Client()
    client.force_login(user)
    token = _field(client.get(URL, {"state": STATE, "redirect_uri": CALLBACK}).content.decode(), "token")

    expires_at = parse_datetime(_decrypt_chatbot_user_token(token, SECRET)["expiration"])
    assert (expires_at - timezone.now()).total_seconds() <= 5 * 60


@pytest.mark.django_db
def test_anonymous_user_is_sent_to_login_and_back(mcp_settings):
    response = Client().get(URL, {"state": STATE, "redirect_uri": CALLBACK})

    assert response.status_code == 302
    assert "next=" in response["Location"]
    assert "api/mcp/authorize" in response["Location"]


@pytest.mark.django_db
@pytest.mark.parametrize("params", [
    {"state": STATE, "redirect_uri": "https://evil.example/callback"},
    {"state": STATE, "redirect_uri": CALLBACK + "/extra"},
    {"state": "short", "redirect_uri": CALLBACK},
    {"state": STATE + "<script>", "redirect_uri": CALLBACK},
    {"redirect_uri": CALLBACK},
])
def test_rejects_bad_requests_before_anything_else(mcp_settings, django_user_model, params):
    user = django_user_model.objects.create_user(username=f"mcp-bad-{abs(hash(str(params)))}", password="pass")
    client = Client()
    client.force_login(user)

    assert client.get(URL, params).status_code == 400


@pytest.mark.django_db
def test_header_auth_is_not_enough(django_user_model):
    """An X-Session-ID token is not a browser sign-in, so it cannot mint a login token."""
    from sefaria.utils.chatbot import build_chatbot_user_token

    user = django_user_model.objects.create_user(username="mcp-header-only", password="pass")
    with override_settings(MCP_TOKEN_SECRET=SECRET, MCP_AUTH_CALLBACK_URLS=[CALLBACK], CHATBOT_USER_ID_SECRET="chatbot"):
        response = Client().get(
            URL, {"state": STATE, "redirect_uri": CALLBACK},
            HTTP_X_SESSION_ID=build_chatbot_user_token(user.id, "chatbot"),
        )

    assert response.status_code == 302


@pytest.mark.django_db
def test_disabled_without_secret():
    with override_settings(MCP_TOKEN_SECRET=None):
        assert Client().get(URL, {"state": STATE, "redirect_uri": CALLBACK}).status_code == 404


@pytest.mark.django_db
def test_get_only(mcp_settings):
    assert Client().post(URL, {"state": STATE, "redirect_uri": CALLBACK}).status_code == 405
