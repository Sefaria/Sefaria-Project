"""
The staff lexicon routes for the admin MCP (api/admin_mcp_views.AdminLexiconEntryView / AdminLexiconHeadwordView):
an MCP token for a staff member, read-before-write with a version, dry runs, and delegation to the moderators'
lexicon editor (#3730). Uses "Halachic Terminology" as sefaria/tests/lexicon_admin_test.py does.
"""
import json
from urllib.parse import quote
from unittest.mock import patch

import pytest
from django.test import Client

from sefaria.model.lexicon import LexiconEntry, LexiconEntrySet
from sefaria.utils.chatbot import build_chatbot_user_token, MCP_TOKEN_AUDIENCE

LEXICON = "Halachic Terminology"
SECRET = "test-mcp-secret"
HOST = "www.modularization.testing.sefaria.org"
DOMAIN_MODULES = {lang: {"library": f"https://{HOST}", "voices": f"https://voices.{HOST}"} for lang in ("en", "he")}

pytestmark = pytest.mark.django_db


@pytest.fixture(autouse=True)
def _settings(settings):
    settings.MCP_TOKEN_SECRET = SECRET
    settings.DOMAIN_MODULES = DOMAIN_MODULES
    settings.ALLOWED_HOSTS = [HOST]


@pytest.fixture(autouse=True)
def clean():
    def wipe():
        LexiconEntrySet({"parent_lexicon": LEXICON, "headword": {"$regex": "^lexmcptest-"}}).delete()
    wipe()
    yield
    wipe()


def _headers(user):
    return {"HTTP_X_SESSION_ID": build_chatbot_user_token(user.id, SECRET, ttl_hours=5 / 60, aud=MCP_TOKEN_AUDIENCE)}


def _url(headword, rename=False):
    return f"/api/admin/lexicon-entries/{'headword/' if rename else ''}{quote(LEXICON)}/{quote(headword)}"


@pytest.fixture
def staff(django_user_model):
    return django_user_model.objects.create_user(username="lexmcp-staff", password="pass", is_staff=True)


def test_read_then_edit_with_version_and_dry_run(staff):
    LexiconEntry({"headword": "lexmcptest-a", "parent_lexicon": LEXICON, "notes": "old"}).save()
    client, h = Client(enforce_csrf_checks=True, HTTP_HOST=HOST), _headers(staff)
    read = client.get(_url("lexmcptest-a"), **h)
    assert read.status_code == 200, read.content
    version = read.json()["version"]
    assert read.json()["entry"]["notes"] == "old"

    preview = client.patch(_url("lexmcptest-a"), json.dumps({"content": {"notes": "new"}, "base_version": version, "dry_run": True}), content_type="application/json", **h)
    assert preview.status_code == 200 and preview.json()["after"]["notes"] == "new"
    assert LexiconEntry().load({"parent_lexicon": LEXICON, "headword": "lexmcptest-a"}).notes == "old"

    saved = client.patch(_url("lexmcptest-a"), json.dumps({"content": {"notes": "new"}, "base_version": version}), content_type="application/json", **h)
    assert saved.status_code == 200, saved.content
    assert saved.json()["entry"]["notes"] == "new" and saved.json()["version"] != version

    stale = client.patch(_url("lexmcptest-a"), json.dumps({"content": {"notes": "again"}, "base_version": version}), content_type="application/json", **h)
    assert stale.status_code == 409 and stale.json()["current"]["entry"]["notes"] == "new"


def test_edit_needs_a_version_and_known_fields(staff):
    LexiconEntry({"headword": "lexmcptest-b", "parent_lexicon": LEXICON}).save()
    client, h = Client(enforce_csrf_checks=True, HTTP_HOST=HOST), _headers(staff)
    assert client.patch(_url("lexmcptest-b"), json.dumps({"content": {"notes": "x"}}), content_type="application/json", **h).status_code == 400
    version = client.get(_url("lexmcptest-b"), **h).json()["version"]
    bad = client.patch(_url("lexmcptest-b"), json.dumps({"content": {"headword": "x"}, "base_version": version}), content_type="application/json", **h)
    assert bad.status_code == 400 and "Unknown content fields" in bad.json()["error"]
    assert client.get(_url("lexmcptest-missing"), **h).status_code == 404


def test_rename_dry_run_then_rename(staff):
    LexiconEntry({"headword": "lexmcptest-old", "parent_lexicon": LEXICON}).save()
    client, h = Client(enforce_csrf_checks=True, HTTP_HOST=HOST), _headers(staff)
    dry = client.patch(_url("lexmcptest-old", rename=True), json.dumps({"new_headword": "lexmcptest-new", "dry_run": True}), content_type="application/json", **h)
    assert dry.status_code == 200 and dry.json() == {"dry_run": True, "headword": "lexmcptest-old", "new_headword": "lexmcptest-new"}
    with patch("sefaria.helper.schema.library"):
        done = client.patch(_url("lexmcptest-old", rename=True), json.dumps({"new_headword": "lexmcptest-new"}), content_type="application/json", **h)
    assert done.status_code == 200, done.content
    assert done.json()["headword"] == "lexmcptest-new"
    assert LexiconEntry().load({"parent_lexicon": LEXICON, "headword": "lexmcptest-new"})


def test_non_staff_is_refused(django_user_model):
    user = django_user_model.objects.create_user(username="lexmcp-user", password="pass")
    LexiconEntry({"headword": "lexmcptest-c", "parent_lexicon": LEXICON}).save()
    client = Client(enforce_csrf_checks=True, HTTP_HOST=HOST)
    assert client.get(_url("lexmcptest-c"), **_headers(user)).status_code == 401
    client.force_login(user)
    assert client.get(_url("lexmcptest-c")).status_code == 403
