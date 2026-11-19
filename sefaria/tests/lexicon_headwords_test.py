"""
Tests for GET /api/lexicon/<lexicon>/headwords (api/lexicon_admin_views.py LexiconHeadwordsView).

Uses "Halachic Terminology", a real lexicon in the test DB whose entries map to plain LexiconEntry (see
lexicon_admin_test.py for why); `rid` is an optional LexiconEntry attribute. Only this file's own entries
("lexheadwordstest-") are asserted on, since the lexicon has real entries too.
"""

import json
from urllib.parse import quote

import pytest
from django.test import Client

from sefaria.model.lexicon import LexiconEntry, LexiconEntrySet

LEXICON = "Halachic Terminology"
PREFIX = "lexheadwordstest-"


def url(lexicon):
    return f"/api/lexicon/{quote(lexicon)}/headwords"


@pytest.fixture(autouse=True)
def clean_entries():
    def wipe():
        LexiconEntrySet({"parent_lexicon": LEXICON, "headword": {"$regex": f"^{PREFIX}"}}).delete()

    wipe()
    yield
    wipe()


def ours(response):
    return [row for row in json.loads(response.content) if row["headword"].startswith(PREFIX)]


class TestLexiconHeadwords:
    @pytest.mark.django_db
    def test_print_order_by_rid_then_entries_without_one(self):
        for headword, rid in [
            ("c", "ET-0003"),
            ("z-norid", None),
            ("a", "ET-0001"),
            ("b", "ET-0002"),
            ("y-norid", None),
        ]:
            attrs = {"headword": PREFIX + headword, "parent_lexicon": LEXICON}
            if rid:
                attrs["rid"] = rid
            LexiconEntry(attrs).save()
        response = Client().get(url(LEXICON))
        assert response.status_code == 200
        assert response["Cache-Control"] == "public, max-age=600"
        assert ours(response) == [
            {"headword": PREFIX + "a", "rid": "ET-0001"},
            {"headword": PREFIX + "b", "rid": "ET-0002"},
            {"headword": PREFIX + "c", "rid": "ET-0003"},
            {"headword": PREFIX + "y-norid", "rid": None},
            {"headword": PREFIX + "z-norid", "rid": None},
        ]

    @pytest.mark.django_db
    def test_headwords_only_no_content(self):
        LexiconEntry({"headword": PREFIX + "x", "parent_lexicon": LEXICON, "rid": "ET-0009", "notes": "secret"}).save()
        rows = ours(Client().get(url(LEXICON)))
        assert rows == [{"headword": PREFIX + "x", "rid": "ET-0009"}]

    @pytest.mark.django_db
    def test_unknown_lexicon(self):
        response = Client().get(url("No Such Lexicon"))
        assert response.status_code == 404
        assert json.loads(response.content) == {"error": "Lexicon not found."}
