"""POST /_portal/feedback (PLAN.md §2.3.3, §6.7 S-14; contract C3 feedback-request/response)."""

import json

import pytest
from django.core.cache import cache
from django.test import Client

from devportal.models import Feedback

from .portal_helpers import is_standalone

pytestmark = [pytest.mark.django_db, pytest.mark.skipif(not is_standalone(), reason="standalone URLconf")]


def _client():
    return Client(enforce_csrf_checks=True)


def _token(client):
    return client.get("/_portal/csrf").json()["csrfToken"]


def _post(client, body, token=None):
    headers = {"HTTP_X_CSRFTOKEN": token} if token else {}
    return client.post("/_portal/feedback", data=json.dumps(body), content_type="application/json", **headers)


@pytest.fixture(autouse=True)
def _clear_cache():
    cache.clear()
    yield
    cache.clear()


def test_vote_is_stored_with_a_hash_not_an_ip():
    client = _client()
    response = _post(client, {"path": "/docs/welcome", "helpful": True, "comment": "  Thanks  "}, _token(client))
    assert response.status_code == 201
    assert response.json() == {"ok": True}
    row = Feedback.objects.get()
    assert (row.path, row.helpful, row.comment) == ("/docs/welcome", True, "Thanks")
    assert len(row.visitor_hash) == 32 and "127.0.0.1" not in row.visitor_hash


def test_csrf_token_is_required():
    assert _post(_client(), {"path": "/docs/welcome", "helpful": False, "comment": ""}).status_code == 403
    assert not Feedback.objects.exists()


@pytest.mark.parametrize(
    "body",
    [
        {"path": "/docs/welcome", "helpful": True},
        {"path": "/docs/welcome", "helpful": "yes", "comment": ""},
        {"path": "docs/welcome", "helpful": True, "comment": ""},
        {"path": "/docs/welcome", "helpful": True, "comment": "x" * 2001},
        {"path": "/docs/welcome", "helpful": True, "comment": "", "extra": 1},
        ["not", "an", "object"],
    ],
)
def test_invalid_bodies_are_400(body):
    client = _client()
    response = _post(client, body, _token(client))
    assert response.status_code == 400
    assert response.json()["error"]["code"] == "invalid_request"
    assert not Feedback.objects.exists()


def test_get_is_405():
    assert _client().get("/_portal/feedback").status_code == 405


def test_repeat_votes_are_rate_limited():
    client = _client()
    token = _token(client)
    statuses = [
        _post(client, {"path": "/docs/welcome", "helpful": True, "comment": ""}, token).status_code for _ in range(21)
    ]
    assert statuses[:20] == [201] * 20
    assert statuses[20] == 429
