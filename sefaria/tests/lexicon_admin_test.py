"""
Tests for the lexicon entry admin API endpoints (api/lexicon_admin_views.py):
GET/PATCH /api/lexicon-entry/<lexicon>/<headword>, and
PATCH /api/lexicon-entry/headword/<lexicon>/<headword>.

Uses real lexicons already present in the test DB rather than a fabricated one:
LexiconEntry.contents() looks up a real Lexicon document for parent_lexicon_details, which
would crash for a made-up name. "Halachic Terminology" has a Lexicon doc, maps to plain
LexiconEntry (LexiconEntrySubClassMapping's default -- it isn't in that map), and its
Lexicon doc has no index_title, so LexiconEntry._validate()'s headword-uniqueness check
(scoped to lexicons rendered as sequential text) doesn't apply -- several tests below rely
on that to construct duplicate/colliding headwords directly, the same way real ambiguous
duplicates actually arise (imported data, not the admin API). "BDB Augmented Strong" (also
no index_title) is used for the one test needing DictionaryEntry's content-shape
validation, since that only applies to DictionaryEntry subclasses, not plain LexiconEntry.

Every successful headword-rename test patches out sefaria.helper.schema.library, matching
the model-level tests for change_lexicon_headword -- a real rename calls library.rebuild()
by default, which is unrelated to what's being tested here.
"""
import json
from urllib.parse import quote
from unittest.mock import patch

import pytest
from django.test import Client
from django.contrib.auth.models import User

from sefaria.model.lexicon import LexiconEntry, StrongsDictionaryEntry, LexiconEntrySet


NO_INDEX_LEXICON = "Halachic Terminology"
SHAPE_VALIDATED_LEXICON = "BDB Augmented Strong"


def entry_url(lexicon, headword):
    return f"/api/lexicon-entry/{quote(lexicon)}/{quote(headword)}"


def headword_url(lexicon, headword):
    return f"/api/lexicon-entry/headword/{quote(lexicon)}/{quote(headword)}"


def patch_json(client, url, body):
    return client.patch(url, data=json.dumps(body), content_type="application/json")


@pytest.fixture
def staff_client(db):
    user = User.objects.create_user(username="lexadmintest_staff", email="lexadmintest_staff@sefaria.org",
                                     password="testpass123", is_staff=True)
    client = Client()
    client.force_login(user)
    return client


@pytest.fixture
def regular_client(db):
    user = User.objects.create_user(username="lexadmintest_user", email="lexadmintest_user@sefaria.org",
                                     password="testpass123", is_staff=False)
    client = Client()
    client.force_login(user)
    return client


@pytest.fixture
def anon_client():
    return Client()


@pytest.fixture(autouse=True)
def clean_lexicon_entries():
    def wipe():
        LexiconEntrySet({"parent_lexicon": {"$in": [NO_INDEX_LEXICON, SHAPE_VALIDATED_LEXICON]},
                          "headword": {"$regex": "^lexadmintest-"}}).delete()
    wipe()
    yield
    wipe()


class TestLexiconEntryGet:
    @pytest.mark.django_db
    def test_returns_entry(self, anon_client):
        """GET is public -- no staff check."""
        LexiconEntry({"headword": "lexadmintest-get1", "parent_lexicon": NO_INDEX_LEXICON, "notes": "n"}).save()
        response = anon_client.get(entry_url(NO_INDEX_LEXICON, "lexadmintest-get1"))
        assert response.status_code == 200
        data = json.loads(response.content)
        assert data["entry"]["headword"] == "lexadmintest-get1"
        assert data["entry"]["notes"] == "n"
        assert isinstance(data["content_attr_names"], list)

    @pytest.mark.django_db
    def test_not_found(self, anon_client):
        response = anon_client.get(entry_url(NO_INDEX_LEXICON, "lexadmintest-nonexistent"))
        assert response.status_code == 404
        assert json.loads(response.content) == {"error": "Entry not found."}

    @pytest.mark.django_db
    def test_ambiguous_duplicate(self, anon_client):
        LexiconEntry({"headword": "lexadmintest-dupe", "parent_lexicon": NO_INDEX_LEXICON}).save()
        LexiconEntry({"headword": "lexadmintest-dupe", "parent_lexicon": NO_INDEX_LEXICON}).save()
        response = anon_client.get(entry_url(NO_INDEX_LEXICON, "lexadmintest-dupe"))
        assert response.status_code == 409
        assert "one entry" in json.loads(response.content)["error"]


class TestLexiconEntryPatch:
    @pytest.mark.django_db
    def test_requires_staff(self, anon_client, regular_client):
        LexiconEntry({"headword": "lexadmintest-perm", "parent_lexicon": NO_INDEX_LEXICON}).save()
        for client in (anon_client, regular_client):
            response = patch_json(client, entry_url(NO_INDEX_LEXICON, "lexadmintest-perm"), {"content": {}})
            assert response.status_code == 403
            assert "Moderators" in json.loads(response.content)["error"]

    @pytest.mark.django_db
    def test_rejects_excluded_attr(self, staff_client):
        LexiconEntry({"headword": "lexadmintest-excl", "parent_lexicon": NO_INDEX_LEXICON}).save()
        response = patch_json(staff_client, entry_url(NO_INDEX_LEXICON, "lexadmintest-excl"),
                               {"content": {"headword": "hijacked"}})
        assert response.status_code == 400
        assert "headword" in json.loads(response.content)["error"]

    @pytest.mark.django_db
    def test_success_replaces_content(self, staff_client):
        LexiconEntry({"headword": "lexadmintest-ok", "parent_lexicon": NO_INDEX_LEXICON, "notes": "old"}).save()
        response = patch_json(staff_client, entry_url(NO_INDEX_LEXICON, "lexadmintest-ok"),
                               {"content": {"notes": "new"}})
        assert response.status_code == 200
        data = json.loads(response.content)
        assert data["status"] == "ok"
        assert data["entry"]["notes"] == "new"
        reloaded = LexiconEntry().load({"parent_lexicon": NO_INDEX_LEXICON, "headword": "lexadmintest-ok"})
        assert reloaded.notes == "new"

    @pytest.mark.django_db
    def test_not_found(self, staff_client):
        response = patch_json(staff_client, entry_url(NO_INDEX_LEXICON, "lexadmintest-nonexistent"), {"content": {}})
        assert response.status_code == 404

    @pytest.mark.django_db
    def test_ambiguous_duplicate(self, staff_client):
        LexiconEntry({"headword": "lexadmintest-dupe2", "parent_lexicon": NO_INDEX_LEXICON}).save()
        LexiconEntry({"headword": "lexadmintest-dupe2", "parent_lexicon": NO_INDEX_LEXICON}).save()
        response = patch_json(staff_client, entry_url(NO_INDEX_LEXICON, "lexadmintest-dupe2"), {"content": {}})
        assert response.status_code == 409

    @pytest.mark.django_db
    def test_rejects_bad_content_shape(self, staff_client):
        """DictionaryEntry.attr_schemas rejects a non-dict content -- exercised end-to-end
        through the real HTTP PATCH, not just the model layer."""
        StrongsDictionaryEntry({"headword": "lexadmintest-shape", "parent_lexicon": SHAPE_VALIDATED_LEXICON,
                                 "content": {"senses": []}, "strong_number": "H1"}).save()
        response = patch_json(staff_client, entry_url(SHAPE_VALIDATED_LEXICON, "lexadmintest-shape"),
                               {"content": {"strong_number": "H1", "content": "not a dict"}})
        assert response.status_code == 400
        assert "content" in json.loads(response.content)["error"]


class TestLexiconEntryHeadwordPatch:
    @pytest.mark.django_db
    def test_requires_staff(self, anon_client, regular_client):
        LexiconEntry({"headword": "lexadmintest-hwperm", "parent_lexicon": NO_INDEX_LEXICON}).save()
        for client in (anon_client, regular_client):
            response = patch_json(client, headword_url(NO_INDEX_LEXICON, "lexadmintest-hwperm"),
                                   {"new_headword": "lexadmintest-hwperm2"})
            assert response.status_code == 403
            assert json.loads(response.content) == {"error": "Staff only."}

    @pytest.mark.django_db
    def test_rejects_missing_new_headword(self, staff_client):
        LexiconEntry({"headword": "lexadmintest-hwmissing", "parent_lexicon": NO_INDEX_LEXICON}).save()
        response = patch_json(staff_client, headword_url(NO_INDEX_LEXICON, "lexadmintest-hwmissing"), {})
        assert response.status_code == 400

    @pytest.mark.django_db
    def test_rejects_non_string_new_headword(self, staff_client):
        LexiconEntry({"headword": "lexadmintest-hwnonstr", "parent_lexicon": NO_INDEX_LEXICON}).save()
        response = patch_json(staff_client, headword_url(NO_INDEX_LEXICON, "lexadmintest-hwnonstr"),
                               {"new_headword": 123})
        assert response.status_code == 400

    @pytest.mark.django_db
    def test_noop_when_unchanged(self, staff_client):
        """Same headword as already stored -- a legitimate no-op, not a rename, so this
        doesn't even reach change_lexicon_headword (no library mock needed)."""
        LexiconEntry({"headword": "lexadmintest-hwsame", "parent_lexicon": NO_INDEX_LEXICON}).save()
        response = patch_json(staff_client, headword_url(NO_INDEX_LEXICON, "lexadmintest-hwsame"),
                               {"new_headword": "lexadmintest-hwsame"})
        assert response.status_code == 200
        assert json.loads(response.content) == {"status": "ok", "headword": "lexadmintest-hwsame"}

    @pytest.mark.django_db
    def test_rename_success(self, staff_client):
        LexiconEntry({"headword": "lexadmintest-hwold", "parent_lexicon": NO_INDEX_LEXICON}).save()
        with patch("sefaria.helper.schema.library"):
            response = patch_json(staff_client, headword_url(NO_INDEX_LEXICON, "lexadmintest-hwold"),
                                   {"new_headword": "lexadmintest-hwnew"})
        assert response.status_code == 200
        data = json.loads(response.content)
        assert data == {"status": "ok", "headword": "lexadmintest-hwnew"}
        assert LexiconEntry().load({"parent_lexicon": NO_INDEX_LEXICON, "headword": "lexadmintest-hwold"}) is None
        assert LexiconEntry().load({"parent_lexicon": NO_INDEX_LEXICON, "headword": "lexadmintest-hwnew"})

    @pytest.mark.django_db
    def test_rename_resolves_collision_with_superscript(self, staff_client):
        LexiconEntry({"headword": "lexadmintest-hwtaken", "parent_lexicon": NO_INDEX_LEXICON}).save()
        LexiconEntry({"headword": "lexadmintest-hwmover", "parent_lexicon": NO_INDEX_LEXICON}).save()
        with patch("sefaria.helper.schema.library"):
            response = patch_json(staff_client, headword_url(NO_INDEX_LEXICON, "lexadmintest-hwmover"),
                                   {"new_headword": "lexadmintest-hwtaken"})
        assert response.status_code == 200
        assert json.loads(response.content)["headword"] == "lexadmintest-hwtaken²"

    @pytest.mark.django_db
    def test_rename_self_collision_after_disambiguation_conflicts(self, staff_client):
        """Renaming "...clash²" to "...clash³": stripping the requested superscript and
        re-numbering from the taken base collides right back with this entry's own current
        headword -- a real conflict, not a no-op, so this must not silently succeed."""
        LexiconEntry({"headword": "lexadmintest-clash", "parent_lexicon": NO_INDEX_LEXICON}).save()
        LexiconEntry({"headword": "lexadmintest-clash²", "parent_lexicon": NO_INDEX_LEXICON}).save()
        response = patch_json(staff_client, headword_url(NO_INDEX_LEXICON, "lexadmintest-clash²"),
                               {"new_headword": "lexadmintest-clash³"})
        assert response.status_code == 409
        assert "own current headword" in json.loads(response.content)["error"]

    @pytest.mark.django_db
    def test_rename_not_found(self, staff_client):
        response = patch_json(staff_client, headword_url(NO_INDEX_LEXICON, "lexadmintest-nonexistent"),
                               {"new_headword": "lexadmintest-x"})
        assert response.status_code == 404

    @pytest.mark.django_db
    def test_rename_ambiguous_duplicate(self, staff_client):
        LexiconEntry({"headword": "lexadmintest-dupe3", "parent_lexicon": NO_INDEX_LEXICON}).save()
        LexiconEntry({"headword": "lexadmintest-dupe3", "parent_lexicon": NO_INDEX_LEXICON}).save()
        response = patch_json(staff_client, headword_url(NO_INDEX_LEXICON, "lexadmintest-dupe3"),
                               {"new_headword": "lexadmintest-dupe3-renamed"})
        assert response.status_code == 409

    @pytest.mark.django_db
    def test_rename_race_returns_409_not_500(self, staff_client):
        """get_available_lexicon_headword already confirmed the resolved value was free --
        forcing it to return an already-taken one simulates another write winning the race
        in between, which change_lexicon_headword's own check then catches."""
        LexiconEntry({"headword": "lexadmintest-race-src", "parent_lexicon": NO_INDEX_LEXICON}).save()
        LexiconEntry({"headword": "lexadmintest-race-taken", "parent_lexicon": NO_INDEX_LEXICON}).save()
        with patch("api.lexicon_admin_views.get_available_lexicon_headword",
                   return_value="lexadmintest-race-taken"):
            response = patch_json(staff_client, headword_url(NO_INDEX_LEXICON, "lexadmintest-race-src"),
                                   {"new_headword": "irrelevant-disambiguation-already-happened"})
        assert response.status_code == 409
        assert "please retry" in json.loads(response.content)["error"]

    @pytest.mark.django_db
    def test_rename_corrupted_pointer_returns_500_not_409(self, staff_client):
        """A next_hw pointing at no real entry is pre-existing bad data, unrelated to this
        request -- retrying would fail again forever, so this must not read as a 409 race."""
        LexiconEntry({"headword": "lexadmintest-badptr", "parent_lexicon": NO_INDEX_LEXICON,
                      "next_hw": "lexadmintest-ghost-neighbor"}).save()
        response = patch_json(staff_client, headword_url(NO_INDEX_LEXICON, "lexadmintest-badptr"),
                               {"new_headword": "lexadmintest-badptr-renamed"})
        assert response.status_code == 500
        assert "next_hw" in json.loads(response.content)["error"]
