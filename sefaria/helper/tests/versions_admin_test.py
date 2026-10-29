"""Staff routes for version metadata, cache purges and lookups (sefaria/helper/versions_admin.py, api/admin_mcp_views.py)."""
import json
from unittest.mock import patch

import pytest
from django.test import Client

from sefaria.helper import versions_admin as va
from sefaria.model import Version, VersionSet
from sefaria.system.exceptions import InputError
from sefaria.utils.chatbot import build_chatbot_user_token, MCP_TOKEN_AUDIENCE

TITLE = "Genesis"
VT = "Admin MCP Test Version"
SECRET = "test-mcp-secret"
HOST = "www.modularization.testing.sefaria.org"
DOMAIN_MODULES = {lang: {"library": f"https://{HOST}", "voices": f"https://voices.{HOST}"} for lang in ("en", "he")}

pytestmark = pytest.mark.django_db


@pytest.fixture
def version():
    def wipe():
        VersionSet({"title": TITLE, "versionTitle": {"$in": [VT, VT + " Renamed"]}}).delete()
    wipe()
    v = Version({"title": TITLE, "language": "en", "versionTitle": VT, "versionSource": "https://example.org", "chapter": [["In the beginning"]], "license": "CC-BY"})
    v.save()
    yield v
    wipe()


def test_read_then_edit_with_dry_run_and_conflict(version):
    read = va.get_version(TITLE, "en", VT)
    assert read["metadata"]["license"] == "CC-BY" and "chapter" not in read["metadata"]
    dry = va.update_version(TITLE, "en", VT, {"versionNotes": "Checked", "status": "locked"}, read["version"], uid=1, dry_run=True)
    assert dry["after"]["status"] == "locked"
    assert not hasattr(Version().load({"title": TITLE, "versionTitle": VT}), "status")
    with patch.object(va.tracker, "update_version_metadata", wraps=va.tracker.update_version_metadata) as tracked:
        done = va.update_version(TITLE, "en", VT, {"versionNotes": "Checked", "status": "locked", "license": ""}, read["version"], uid=1)
    tracked.assert_called_once()
    assert done["after"]["status"] == "locked" and done["after"]["versionNotes"] == "Checked" and "license" not in done["after"]
    with pytest.raises(va.VersionConflict):
        va.update_version(TITLE, "en", VT, {"versionNotes": "Again"}, read["version"], uid=1)
    unlocked = va.update_version(TITLE, "en", VT, {"status": None}, done["version"], uid=1)
    assert "status" not in unlocked["after"]


def test_rename_and_bad_input(version):
    v = va.get_version(TITLE, "en", VT)["version"]
    with pytest.raises(InputError, match="Unknown fields"):
        va.update_version(TITLE, "en", VT, {"title": "Exodus"}, v, uid=1)
    with pytest.raises(InputError, match="status"):
        va.update_version(TITLE, "en", VT, {"status": "frozen"}, v, uid=1)
    with pytest.raises(InputError, match="base_version"):
        va.update_version(TITLE, "en", VT, {"versionNotes": "x"}, None, uid=1)
    with pytest.raises(va.VersionNotFound):
        va.get_version(TITLE, "en", "No Such Version")
    renamed = va.update_version(TITLE, "en", VT, {"newVersionTitle": VT + " Renamed"}, v, uid=1)
    assert renamed["after"]["versionTitle"] == VT + " Renamed"


def test_lookups_and_purge(version):
    found = va.find_versions(VT, "en")
    assert found["indices"] == [TITLE] and "Tanakh" in found["metadata"][TITLE]["categories"]
    deps = va.index_dependencies(TITLE)
    assert deps["title"] == TITLE and deps["version_count"] >= 1 and deps["has_dependencies"]
    with patch.object(va, "USE_VARNISH", True), patch("sefaria.system.varnish.wrapper.invalidate_ref") as inv:
        assert va.purge_cache("Genesis 1:1") == {"ref": "Genesis 1:1", "book_level": False, "purged": ["varnish (ref)"]}
    inv.assert_called_once()
    with pytest.raises(InputError):
        va.find_versions("")


class TestEndpoints:

    @pytest.fixture(autouse=True)
    def _settings(self, settings):
        settings.MCP_TOKEN_SECRET = SECRET
        settings.DOMAIN_MODULES = DOMAIN_MODULES
        settings.ALLOWED_HOSTS = [HOST]

    def test_by_token(self, django_user_model, version):
        staff = django_user_model.objects.create_user(username="versions-mcp-staff", password="pass", is_staff=True)
        h = {"HTTP_X_SESSION_ID": build_chatbot_user_token(staff.id, SECRET, ttl_hours=5 / 60, aud=MCP_TOKEN_AUDIENCE)}
        client = Client(enforce_csrf_checks=True, HTTP_HOST=HOST)
        url = f"/api/admin/versions/{TITLE}/en/{VT}"
        read = client.get(url, **h)
        assert read.status_code == 200, read.content
        r = client.patch(url, json.dumps({"fields": {"priority": 2}, "base_version": read.json()["version"]}), content_type="application/json", **h)
        assert r.status_code == 200 and r.json()["after"]["priority"] == 2, r.content
        stale = client.patch(url, json.dumps({"fields": {"priority": 3}, "base_version": read.json()["version"]}), content_type="application/json", **h)
        assert stale.status_code == 409 and stale.json()["current"]["metadata"]["priority"] == 2
        assert client.get(f"/api/admin/versions/{TITLE}/en/Nope", **h).status_code == 404
        assert client.get("/api/admin/versions", {"versionTitle": VT}, **h).json()["indices"] == [TITLE]
        assert client.get(f"/api/admin/index-dependencies/{TITLE}", **h).json()["title"] == TITLE
        assert client.get("/api/admin/index-dependencies/Not A Book", **h).status_code == 404
        with patch("sefaria.helper.versions_admin.USE_VARNISH", False):
            purge = client.post("/api/admin/cache/purge", json.dumps({"ref": "Genesis 1"}), content_type="application/json", **h)
        assert purge.status_code == 200 and purge.json()["ref"] == "Genesis 1"
