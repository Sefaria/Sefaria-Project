"""
Tests for the lexicon bulk-upload API used by scripts/move_draft_lexicon.py (api/lexicon_admin_views.py):
GET/POST /api/lexicons/<name>, POST /api/lexicons/<name>/entries, POST /api/lexicons/<name>/word-forms.

Uses a made-up lexicon: it isn't in LexiconEntrySubClassMapping (so entries are plain LexiconEntry) and
has no index_title (so LexiconEntry._validate()'s headword-uniqueness check doesn't apply).
"""
import json
from urllib.parse import quote

import pytest
from bson import ObjectId
from django.test import Client
from django.contrib.auth.models import User

from sefaria.model.lexicon import Lexicon, LexiconEntry, LexiconEntrySet, WordForm, WordFormSet
from sefaria.system.database import db


LEXICON = "lexuploadtest Lexicon"
OTHER_LEXICON = "lexuploadtest Other Lexicon"
LEXICON_DATA = {"name": LEXICON, "language": "heb.biblical", "to_language": "eng", "text_categories": []}
API_KEY = "lexuploadtest-key"


def url(suffix=""):
    return f"/api/lexicons/{quote(LEXICON)}{suffix}"


def post(client, suffix, payload, apikey=None):
    data = {"json": json.dumps(payload)}
    if apikey:
        data["apikey"] = apikey
    response = client.post(url(suffix), data)
    return response.status_code, json.loads(response.content)


def entry(_id, headword, **attrs):
    return {"_id": str(_id), "headword": headword, "parent_lexicon": LEXICON, **attrs}


def word_form(_id, form, lookups):
    return {"_id": str(_id), "form": form, "lookups": lookups}


def lookup(headword, lexicon=LEXICON):
    return {"headword": headword, "parent_lexicon": lexicon}


def make_user(username, is_staff):
    return User.objects.create_user(username=username, email=f"{username}@sefaria.org",
                                    password="testpass123", is_staff=is_staff)


@pytest.fixture
def staff_client(db):
    client = Client()
    client.force_login(make_user("lexuploadtest_staff", True))
    return client


@pytest.fixture
def lexicon(db):
    Lexicon(dict(LEXICON_DATA)).save()


@pytest.fixture(autouse=True)
def clean():
    def wipe():
        for name in (LEXICON, OTHER_LEXICON):
            db.lexicon.delete_many({"name": name})
            LexiconEntrySet({"parent_lexicon": name}).delete()
        db.word_form.delete_many({"lookups.parent_lexicon": {"$in": [LEXICON, OTHER_LEXICON]}})
        db.apikeys.delete_many({"key": API_KEY})
    wipe()
    yield
    wipe()


class TestAuth:
    @pytest.mark.django_db
    def test_anonymous_and_non_staff_rejected(self):
        regular = Client()
        regular.force_login(make_user("lexuploadtest_user", False))
        for client in (Client(), regular):
            status, data = post(client, "", LEXICON_DATA)
            assert status == 403
        assert not Lexicon().load({"name": LEXICON})

    @pytest.mark.django_db
    def test_api_key(self):
        user = make_user("lexuploadtest_keyuser", False)
        db.apikeys.insert_one({"key": API_KEY, "uid": user.id})
        status, data = post(Client(), "", LEXICON_DATA, apikey=API_KEY)
        assert status == 403 and "Moderators" in data["error"]
        user.is_staff = True
        user.save()
        status, data = post(Client(), "", LEXICON_DATA, apikey=API_KEY)
        assert (status, data) == (200, {"status": "created"})

    @pytest.mark.django_db
    def test_unknown_api_key(self):
        status, data = post(Client(), "", LEXICON_DATA, apikey=API_KEY)
        assert status == 403 and data["error"] == "Unrecognized API key."


class TestLexicon:
    @pytest.mark.django_db
    def test_get_missing(self):
        response = Client().get(url())
        assert response.status_code == 404

    @pytest.mark.django_db
    def test_create_then_replace(self, staff_client):
        assert post(staff_client, "", {**LEXICON_DATA, "title": "T"}) == (200, {"status": "created"})
        # Fields left out of an update are removed, not kept.
        assert post(staff_client, "", {**LEXICON_DATA, "source": "S"}) == (200, {"status": "updated"})
        lex = Lexicon().load({"name": LEXICON})
        assert lex.source == "S" and not hasattr(lex, "title")
        data = json.loads(Client().get(url()).content)
        assert data["lexicon"]["name"] == LEXICON
        assert (data["entry_count"], data["word_form_count"]) == (0, 0)

    @pytest.mark.django_db
    def test_rejects_bad_body(self, staff_client):
        assert post(staff_client, "", {**LEXICON_DATA, "name": "other"})[0] == 400
        status, data = post(staff_client, "", {**LEXICON_DATA, "bogus": 1})
        assert status == 400 and "bogus" in data["error"]
        assert post(staff_client, "", [LEXICON_DATA])[0] == 400


class TestEntries:
    @pytest.mark.django_db
    def test_needs_lexicon(self, staff_client):
        status, data = post(staff_client, "/entries", [entry(ObjectId(), "a")])
        assert status == 404

    @pytest.mark.django_db
    def test_create_unchanged_update_keep_id(self, staff_client, lexicon):
        _id = ObjectId()
        status, data = post(staff_client, "/entries", [entry(_id, "a", notes="n")])
        assert data["created"] == 1 and data["errors"] == 0
        assert LexiconEntry().load({"_id": _id}).headword == "a"

        assert post(staff_client, "/entries", [entry(_id, "a", notes="n")])[1]["unchanged"] == 1

        # A headword rename updates the same record instead of adding a second one.
        assert post(staff_client, "/entries", [entry(_id, "b")])[1]["updated"] == 1
        saved = LexiconEntry().load({"_id": _id})
        assert saved.headword == "b" and not hasattr(saved, "notes")
        assert LexiconEntrySet({"parent_lexicon": LEXICON}).count() == 1

    @pytest.mark.django_db
    def test_same_headword_different_ids(self, staff_client, lexicon):
        """Duplicate headwords (e.g. BDB Augmented Strong) stay separate entries."""
        ids = [ObjectId(), ObjectId()]
        data = post(staff_client, "/entries", [entry(ids[0], "a", number="1"), entry(ids[1], "a", number="2")])[1]
        assert data["created"] == 2
        assert post(staff_client, "/entries", [entry(ids[1], "a", number="3")])[1]["updated"] == 1
        assert LexiconEntry().load({"_id": ids[0]}).number == "1"

    @pytest.mark.django_db
    def test_bad_records_reported_rest_saved(self, staff_client, lexicon):
        Lexicon({**LEXICON_DATA, "name": OTHER_LEXICON}).save()
        other_id = LexiconEntry({"headword": "x", "parent_lexicon": OTHER_LEXICON}).save()._id
        good = ObjectId()
        status, data = post(staff_client, "/entries", [
            entry(ObjectId(), "a", bogus=1),
            {**entry(ObjectId(), "a"), "parent_lexicon": OTHER_LEXICON},
            entry(other_id, "x"),
            {"headword": "no id", "parent_lexicon": LEXICON},
            "not an object",
            entry(good, "ok"),
        ])
        assert status == 200
        assert (data["created"], data["errors"]) == (1, 5)
        assert "bogus" in data["error_details"][0]["error"]
        assert LexiconEntry().load({"_id": good})
        assert LexiconEntry().load({"_id": other_id}).parent_lexicon == OTHER_LEXICON


class TestWordForms:
    @pytest.mark.django_db
    def test_create_keeps_id(self, staff_client, lexicon):
        _id = ObjectId()
        data = post(staff_client, "/word-forms", [word_form(_id, "f", [lookup("a")])])[1]
        assert data["created"] == 1
        assert WordForm().load({"_id": _id}).lookups == [lookup("a")]
        assert post(staff_client, "/word-forms", [word_form(_id, "f", [lookup("a")])])[1]["unchanged"] == 1
        assert json.loads(Client().get(url()).content)["word_form_count"] == 1

    @pytest.mark.django_db
    def test_merge_keeps_other_lexicons_lookups(self, staff_client, lexicon):
        _id = WordForm({"form": "f", "c_form": "f", "lookups": [
            lookup("x", OTHER_LEXICON), lookup("a"), lookup("b"), lookup("y", OTHER_LEXICON)]}).save()._id
        data = post(staff_client, "/word-forms", [word_form(_id, "f", [lookup("c")])])[1]
        assert data["updated"] == 1
        saved = WordForm().load({"_id": _id})
        assert saved.lookups == [lookup("x", OTHER_LEXICON), lookup("c"), lookup("y", OTHER_LEXICON)]
        assert not hasattr(saved, "c_form")

    @pytest.mark.django_db
    def test_rejects_other_lexicons_lookups(self, staff_client, lexicon):
        data = post(staff_client, "/word-forms", [
            word_form(ObjectId(), "f", [lookup("a"), lookup("x", OTHER_LEXICON)]),
            word_form(ObjectId(), "f", []),
        ])[1]
        assert (data["created"], data["errors"]) == (0, 2)
        assert WordFormSet({"form": "f", "lookups.parent_lexicon": LEXICON}).count() == 0
