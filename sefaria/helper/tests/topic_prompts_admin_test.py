import json
import threading
from unittest.mock import patch

import pytest
from bson import ObjectId
from django.test import Client

from sefaria.model.topic import Topic, RefTopicLink
from sefaria.helper import topic_prompts_admin as tpa
from sefaria.system.database import db
from sefaria.system.exceptions import InputError
from sefaria.utils.chatbot import build_chatbot_user_token, MCP_TOKEN_AUDIENCE

MCP_SECRET = "test-mcp-secret"
HOST = "www.modularization.testing.sefaria.org"
TEST_DOMAIN_MODULES = {lang: {"library": f"https://{HOST}", "voices": f"https://voices.{HOST}"} for lang in ("en", "he")}


pytestmark = pytest.mark.django_db


@pytest.fixture(autouse=True, scope="module")
def skip_topic_pool_updates():
    # RefTopicLink.save() updates the topic's Postgres pools, which aren't seeded in the test DB
    with patch.object(Topic, "update_after_link_change", lambda self, pool: None):
        yield


@pytest.fixture(scope="module")
def prompt_topic(django_db_setup, django_db_blocker, skip_topic_pool_updates):
    with django_db_blocker.unblock():
        t = Topic({"slug": "", "data_source": "sefaria", "numSources": 0})
        t.add_primary_titles("Admin MCP Prompt Test Topic", "נושא בדיקה")
        t.set_slug_to_primary_title()
        t.save()
        yield t
        t.delete()


@pytest.fixture
def ai_link(prompt_topic):
    link = RefTopicLink({
        "toTopic": prompt_topic.slug, "ref": "Genesis 1:1", "linkType": "about", "dataSource": "learning-team",
        "descriptions": {"en": {
            "title": "AI title", "ai_title": "AI title", "prompt": "AI prompt", "ai_prompt": "AI prompt",
            "ai_context": "context", "published": False, "review_state": "not reviewed",
        }},
    })
    link.save()
    yield link
    db.topic_links.delete_one({"_id": link._id})
    db[tpa.AUDIT_COLLECTION].delete_many({"link_id": link._id})


@pytest.fixture
def human_link(prompt_topic):
    link = RefTopicLink({
        "toTopic": prompt_topic.slug, "ref": "Exodus 20:8", "linkType": "about", "dataSource": "learning-team",
        "descriptions": {"en": {"title": "Remember the day", "prompt": "Human written prompt"}},
    })
    link.save()
    yield link
    db.topic_links.delete_one({"_id": link._id})
    db[tpa.AUDIT_COLLECTION].delete_many({"link_id": link._id})


def _list(prompt_topic, **kwargs):
    return tpa.list_prompts(topics=[prompt_topic.slug], **kwargs)


@pytest.mark.needs_corpus  # prompt_topic save cascades a slug change via arrayFilters, which mongomock lacks
class TestListPrompts:

    def test_lists_prompts_for_topic(self, prompt_topic, ai_link, human_link):
        results = _list(prompt_topic)["results"]
        by_ref = {r["ref"]: r for r in results}
        assert set(by_ref) == {"Genesis 1:1", "Exodus 20:8"}
        ai = by_ref["Genesis 1:1"]
        assert ai["id"] == str(ai_link._id)
        assert ai["published"] is False
        assert ai["review_state"] == "not reviewed"
        assert ai["topic_title"]["en"] == "Admin MCP Prompt Test Topic"
        assert by_ref["Exodus 20:8"]["published"] is True

    def test_filters(self, prompt_topic, ai_link, human_link):
        refs = lambda **kw: {r["ref"] for r in _list(prompt_topic, **kw)["results"]}
        assert refs(review_state="not reviewed") == {"Genesis 1:1"}
        assert refs(review_state="none") == {"Exodus 20:8"}
        assert refs(published="false") == {"Genesis 1:1"}
        assert refs(published="true") == {"Exodus 20:8"}
        assert refs(ai_generated="true") == {"Genesis 1:1"}
        assert refs(ai_generated="false") == {"Exodus 20:8"}
        assert refs(ref="Exodus") == {"Exodus 20:8"}
        assert refs(q="human WRITTEN") == {"Exodus 20:8"}
        assert refs(link_id=str(ai_link._id)) == {"Genesis 1:1"}
        assert refs(lang="he") == set()

    def test_pagination(self, prompt_topic, ai_link, human_link):
        first = _list(prompt_topic, limit=1)
        assert len(first["results"]) == 1 and first["next_cursor"]
        second = _list(prompt_topic, limit=1, cursor=first["next_cursor"])
        assert len(second["results"]) == 1 and second["next_cursor"] is None
        assert first["results"][0]["id"] != second["results"][0]["id"]

    def test_bad_input(self, prompt_topic):
        for kwargs in ({"lang": "fr"}, {"review_state": "bogus"}, {"link_id": "not-an-id"}, {"published": "maybe"}):
            with pytest.raises(InputError):
                _list(prompt_topic, **kwargs)


@pytest.mark.needs_corpus  # prompt_topic save cascades a slug change via arrayFilters, which mongomock lacks
class TestUpdatePrompt:

    def _version(self, link):
        return tpa.list_prompts(link_id=str(link._id))["results"][0]["version"]

    def test_updates_prompt_marks_edited_and_audits(self, ai_link):
        out = tpa.update_prompt(str(ai_link._id), "en", {"prompt": "Better prompt"}, self._version(ai_link), uid=42)
        assert out["dry_run"] is False
        assert out["before"]["prompt"] == "AI prompt"
        assert out["result"]["prompt"] == "Better prompt"
        assert out["result"]["review_state"] == "edited"
        assert out["result"]["version"] != out["before"]["version"]

        stored = RefTopicLink().load({"_id": ai_link._id}).descriptions["en"]
        assert stored["prompt"] == "Better prompt"
        assert stored["ai_prompt"] == "AI prompt"
        assert stored["published"] is False  # never publishes
        audit = db[tpa.AUDIT_COLLECTION].find_one({"link_id": ai_link._id})
        assert audit["uid"] == 42 and audit["after"]["prompt"] == "Better prompt"
        assert audit["status"] == "applied" and audit["after"]["version"] == out["result"]["version"]
        assert out["warnings"] == []

    def test_review_state_never_decreases(self, ai_link):
        version = self._version(ai_link)
        tpa.update_prompt(str(ai_link._id), "en", {"title": "T", "review_state": "reviewed"}, version, uid=1)
        out = tpa.update_prompt(str(ai_link._id), "en", {"title": "T2"}, self._version(ai_link), uid=1)
        assert out["result"]["review_state"] == "reviewed"

    def test_dry_run_does_not_save(self, ai_link):
        out = tpa.update_prompt(str(ai_link._id), "en", {"title": "Preview"}, self._version(ai_link), uid=1, dry_run=True)
        assert out["dry_run"] is True and out["result"]["title"] == "Preview"
        assert RefTopicLink().load({"_id": ai_link._id}).descriptions["en"]["title"] == "AI title"
        assert db[tpa.AUDIT_COLLECTION].count_documents({"link_id": ai_link._id}) == 0

    def test_stale_version_conflicts(self, ai_link):
        with pytest.raises(tpa.TopicPromptConflict) as e:
            tpa.update_prompt(str(ai_link._id), "en", {"prompt": "x"}, "stale", uid=1)
        assert e.value.current["prompt"] == "AI prompt"

    def test_unknown_id_and_missing_lang_are_not_found(self, ai_link):
        with pytest.raises(tpa.TopicPromptNotFound):
            tpa.update_prompt(str(ObjectId()), "en", {"prompt": "x"}, "v", uid=1)
        with pytest.raises(tpa.TopicPromptNotFound):
            tpa.update_prompt(str(ai_link._id), "he", {"prompt": "x"}, "v", uid=1)

    def test_human_prompt_gets_no_review_state(self, human_link):
        out = tpa.update_prompt(str(human_link._id), "en", {"prompt": "Edited"}, self._version(human_link), uid=1)
        assert out["result"]["review_state"] is None

    @pytest.mark.parametrize("fields", [{}, {"ref": "Genesis 2:1"}, {"prompt": 5}, {"prompt": "x" * 6000},
                                        {"prompt": "x", "review_state": "not reviewed"}])
    def test_invalid_fields(self, ai_link, fields):
        with pytest.raises(InputError):
            tpa.update_prompt(str(ai_link._id), "en", fields, self._version(ai_link), uid=1)


def _version(link, lang="en"):
    return tpa.list_prompts(link_id=str(link._id), lang=lang)["results"][0]["version"]


def _stored(link):
    return db.topic_links.find_one({"_id": link._id})["descriptions"]


def _during_write_window(action):
    """Patch so `action` runs after update_prompt's version check but before its write."""
    original = tpa._prepare_description

    def wrapped(*args, **kwargs):
        result = original(*args, **kwargs)
        action()
        return result
    return patch.object(tpa, "_prepare_description", wrapped)


@pytest.mark.needs_corpus  # prompt_topic save cascades a slug change via arrayFilters, which mongomock lacks
class TestUpdatePromptConcurrency:

    def test_simultaneous_updates_only_one_wins(self, ai_link):
        version = _version(ai_link)
        barrier = threading.Barrier(2, timeout=10)
        outcomes = {}

        def run(name):
            try:
                tpa.update_prompt(str(ai_link._id), "en", {"prompt": f"from {name}"}, version, uid=1)
                outcomes[name] = "ok"
            except tpa.TopicPromptConflict:
                outcomes[name] = "conflict"

        # both requests pass the version check before either writes
        with _during_write_window(barrier.wait):
            threads = [threading.Thread(target=run, args=(n,)) for n in ("a", "b")]
            [t.start() for t in threads]
            [t.join() for t in threads]

        assert sorted(outcomes.values()) == ["conflict", "ok"]
        winner = next(n for n, o in outcomes.items() if o == "ok")
        assert _stored(ai_link)["en"]["prompt"] == f"from {winner}"
        statuses = sorted(a["status"] for a in db[tpa.AUDIT_COLLECTION].find({"link_id": ai_link._id}))
        assert statuses == ["applied", "conflict"]

    def test_concurrent_edit_to_other_language_is_preserved(self, ai_link):
        concurrent_he = {"title": "כותרת", "prompt": "הנחיה"}
        set_he = lambda: db.topic_links.update_one({"_id": ai_link._id}, {"$set": {"descriptions.he": concurrent_he}})
        with _during_write_window(set_he):
            tpa.update_prompt(str(ai_link._id), "en", {"prompt": "English edit"}, _version(ai_link), uid=1)

        stored = _stored(ai_link)
        assert stored["en"]["prompt"] == "English edit"
        assert stored["he"] == concurrent_he

    def test_concurrent_publish_of_same_language_conflicts(self, ai_link):
        publish = lambda: db.topic_links.update_one({"_id": ai_link._id}, {"$set": {"descriptions.en.published": True}})
        with _during_write_window(publish):
            with pytest.raises(tpa.TopicPromptConflict) as e:
                tpa.update_prompt(str(ai_link._id), "en", {"prompt": "x"}, _version(ai_link), uid=1)

        assert e.value.current["published"] is True
        assert _stored(ai_link)["en"]["prompt"] == "AI prompt"
        assert _stored(ai_link)["en"]["published"] is True

    def test_link_deleted_mid_edit_is_not_found(self, ai_link):
        delete = lambda: db.topic_links.delete_one({"_id": ai_link._id})
        with _during_write_window(delete):
            with pytest.raises(tpa.TopicPromptNotFound):
                tpa.update_prompt(str(ai_link._id), "en", {"prompt": "x"}, _version(ai_link), uid=1)
        assert db.topic_links.find_one({"_id": ai_link._id}) is None


@pytest.mark.needs_corpus  # prompt_topic save cascades a slug change via arrayFilters, which mongomock lacks
class TestUpdatePromptFailureSafety:

    def test_audit_insert_failure_leaves_content_unchanged(self, ai_link):
        version = _version(ai_link)
        with patch.object(tpa.db[tpa.AUDIT_COLLECTION].__class__, "insert_one", side_effect=RuntimeError("audit down")):
            with pytest.raises(RuntimeError):
                tpa.update_prompt(str(ai_link._id), "en", {"prompt": "x"}, version, uid=1)
        assert _stored(ai_link)["en"]["prompt"] == "AI prompt"

    def test_write_failure_marks_audit_failed(self, ai_link):
        version = _version(ai_link)
        with patch.object(tpa.db[RefTopicLink.collection].__class__, "update_one",
                          autospec=True, side_effect=_fail_only_for(RefTopicLink.collection)):
            with pytest.raises(RuntimeError):
                tpa.update_prompt(str(ai_link._id), "en", {"prompt": "x"}, version, uid=1)
        assert _stored(ai_link)["en"]["prompt"] == "AI prompt"
        assert db[tpa.AUDIT_COLLECTION].find_one({"link_id": ai_link._id})["status"] == "failed"

    def test_post_write_failures_still_succeed_with_warnings(self, ai_link):
        version = _version(ai_link)
        with patch.object(tpa, "notify", side_effect=RuntimeError("callback boom")), \
                patch.object(tpa.db[tpa.AUDIT_COLLECTION].__class__, "update_one",
                             autospec=True, side_effect=_fail_only_for(tpa.AUDIT_COLLECTION)):
            out = tpa.update_prompt(str(ai_link._id), "en", {"prompt": "Saved anyway"}, version, uid=1)

        assert out["result"]["prompt"] == "Saved anyway"
        assert len(out["warnings"]) == 2
        assert _stored(ai_link)["en"]["prompt"] == "Saved anyway"
        audit = db[tpa.AUDIT_COLLECTION].find_one({"link_id": ai_link._id})
        # left pending, but reconcilable: its after.version matches the stored description
        assert audit["status"] == "pending"
        assert audit["after"]["version"] == tpa.description_version(_stored(ai_link)["en"])


@pytest.mark.needs_corpus  # prompt_topic save cascades a slug change via arrayFilters, which mongomock lacks
class TestDryRunMatchesSave:

    def test_html_input_preview_equals_saved_result(self, ai_link):
        version = _version(ai_link)
        fields = {"title": "Bold <b>title</b><script>alert(1)</script>", "prompt": "<img src=x onerror=y>Text <i>it</i>"}
        preview = tpa.update_prompt(str(ai_link._id), "en", fields, version, uid=1, dry_run=True)["result"]
        assert _stored(ai_link)["en"]["prompt"] == "AI prompt"
        # sanitized like a real save: disallowed tags are escaped, allowed ones kept
        assert "<script" not in preview["title"] and "<img" not in preview["prompt"]
        assert "<b>title</b>" in preview["title"] and preview["title"] != fields["title"]

        saved = tpa.update_prompt(str(ai_link._id), "en", fields, version, uid=1)["result"]
        assert preview == saved
        assert saved["version"] == tpa.description_version(_stored(ai_link)["en"])


def _fail_only_for(collection_name):
    """side_effect for a patched Collection.update_one that fails for one collection only."""
    original = _ORIGINAL_UPDATE_ONE

    def side_effect(self, *args, **kwargs):
        if self.name == collection_name:
            raise RuntimeError(f"{collection_name} write failed")
        return original(self, *args, **kwargs)
    return side_effect


_ORIGINAL_UPDATE_ONE = tpa.db[tpa.AUDIT_COLLECTION].__class__.update_one


class TestAdminMCPEndpoints:

    @pytest.fixture(autouse=True)
    def _settings(self, settings):
        settings.MCP_TOKEN_SECRET = MCP_SECRET
        settings.DOMAIN_MODULES = TEST_DOMAIN_MODULES
        settings.ALLOWED_HOSTS = [HOST]

    def _token(self, user):
        return build_chatbot_user_token(user.id, MCP_SECRET, ttl_hours=5 / 60, aud=MCP_TOKEN_AUDIENCE)

    def _client(self):
        return Client(enforce_csrf_checks=True, HTTP_HOST=HOST)

    @pytest.mark.needs_corpus  # needs prompt_topic (arrayFilters slug cascade)
    def test_token_patch_succeeds_with_csrf_enforced(self, django_user_model, ai_link):
        staff = django_user_model.objects.create_user(username="mcp-staff", password="pass", is_staff=True)
        client = self._client()
        headers = {"HTTP_X_SESSION_ID": self._token(staff)}
        listed = client.get("/api/admin/topic-prompts", {"id": str(ai_link._id)}, **headers)
        assert listed.status_code == 200
        version = listed.json()["results"][0]["version"]

        response = client.patch(f"/api/admin/topic-prompts/{ai_link._id}",
                                json.dumps({"lang": "en", "base_version": version, "prompt": "Via MCP"}),
                                content_type="application/json", **headers)
        assert response.status_code == 200, response.content
        assert response.json()["result"]["prompt"] == "Via MCP"
        audit = db[tpa.AUDIT_COLLECTION].find_one({"link_id": ai_link._id}, sort=[("date", -1)])
        assert audit["via"] == MCP_TOKEN_AUDIENCE and audit["uid"] == staff.id

        stale = client.patch(f"/api/admin/topic-prompts/{ai_link._id}",
                             json.dumps({"lang": "en", "base_version": version, "prompt": "Again"}),
                             content_type="application/json", **headers)
        assert stale.status_code == 409 and stale.json()["current"]["prompt"] == "Via MCP"

    def test_no_token_is_401_and_non_staff_is_403(self, django_user_model):
        client = self._client()
        assert client.get("/api/admin/topic-prompts").status_code == 401
        user = django_user_model.objects.create_user(username="mcp-nonstaff", password="pass")
        client.force_login(user)
        assert client.get("/api/admin/topic-prompts").status_code == 403

    def test_mcp_token_of_non_staff_is_401(self, django_user_model):
        user = django_user_model.objects.create_user(username="mcp-nonstaff-endpoint", password="pass")
        response = self._client().get("/api/admin/topic-prompts", HTTP_X_SESSION_ID=self._token(user))
        assert response.status_code == 401
