"""
Legacy (Mongo, non-sfr_) API keys still authenticate the write endpoints that read them from the POST body. The
auth service passes these requests through, so Django's own check is the only one; nothing in the API keys work may
consume the body or strip the field before the view reads it. POST /api/collections stands in for the endpoints that
read request.POST["apikey"]: it is CSRF-exempt like them, writes only to Mongo, and needs no text data.
"""

import json
import secrets

import pytest
from django.test import Client

from reader.conftest import create_test_user, purge_test_profiles
from sefaria.system.database import db


@pytest.fixture
def legacy_key():
    """A legacy key in Mongo for a synthetic user, and a collection name only this test uses."""
    user = create_test_user("legacykey")
    purge_test_profiles(user)
    key = "legacy-test-" + secrets.token_hex(16)
    name = "Legacy key test " + secrets.token_hex(6)
    db.apikeys.insert_one({"key": key, "uid": user.id})
    yield user, key, name
    db.apikeys.delete_many({"key": key})
    db.groups.delete_many({"name": name})
    purge_test_profiles(user)


def post_collection(name, **body):
    # A client with no session that enforces CSRF, like an outside API caller.
    client = Client(enforce_csrf_checks=True)
    response = client.post("/api/collections", {"json": json.dumps({"name": name}), **body})
    assert response.status_code == 200
    return json.loads(response.content)


@pytest.mark.django_db
def test_a_legacy_key_in_the_post_body_authenticates_a_write(legacy_key):
    user, key, name = legacy_key

    data = post_collection(name, apikey=key)

    assert data.get("status") == "ok", data
    saved = db.groups.find_one({"name": name})
    assert saved is not None
    assert saved["admins"] == [user.id]


@pytest.mark.django_db
def test_an_unknown_key_in_the_post_body_is_refused(legacy_key):
    _, _, name = legacy_key

    assert post_collection(name, apikey="legacy-test-unknown") == {"error": "Unrecognized API key."}
    assert db.groups.find_one({"name": name}) is None


@pytest.mark.django_db
def test_a_write_without_a_key_or_session_is_refused(legacy_key):
    _, _, name = legacy_key

    assert "error" in post_collection(name)
    assert db.groups.find_one({"name": name}) is None
