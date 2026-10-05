# coding=utf-8
"""
Tests for `admin_only` (staff-only) books: invisible unless SHOW_ADMIN_ONLY_BOOKS is True.
Records are inserted straight into Mongo so that no save hooks (search, TOC, cache) fire.
"""
import pytest
from django.conf import settings

from sefaria.model import *
from sefaria.model import text as text_module
from sefaria.model.abstract import merge_queries
from sefaria.system.database import db

HIDDEN = "Zzz Hidden Test Book"
HIDDEN_ALT = "Zzz Hidden Alt Title"


@pytest.fixture
def hidden_book():
    index = {
        "title": HIDDEN,
        "categories": ["Tanakh"],
        "admin_only": True,
        "schema": {
            "nodeType": "JaggedArrayNode", "key": HIDDEN, "depth": 2, "addressTypes": ["Integer", "Integer"],
            "sectionNames": ["Chapter", "Verse"],
            "titles": [{"lang": "en", "text": HIDDEN, "primary": True}, {"lang": "en", "text": HIDDEN_ALT},
                       {"lang": "he", "text": "ספר נסתר", "primary": True}],
        },
    }
    ids = {
        "index": db.index.insert_one(index).inserted_id,
        "text": db.texts.insert_one({"title": HIDDEN, "versionTitle": "Zzz Version", "language": "en",
                                     "actualLanguage": "en", "chapter": [["hidden text"]]}).inserted_id,
        "vstate": db.vstate.insert_one({"title": HIDDEN, "content": {}}).inserted_id,
        "link": db.links.insert_one({"refs": [HIDDEN + " 1:1", "Genesis 1:1"], "type": "quotation",
                                     "generated_by": "zzz_test"}).inserted_id,
    }
    text_module.admin_only_titles(force_refresh=True)
    yield ids
    db.index.delete_one({"_id": ids["index"]})
    db.texts.delete_one({"_id": ids["text"]})
    db.vstate.delete_one({"_id": ids["vstate"]})
    db.links.delete_one({"_id": ids["link"]})
    text_module.admin_only_titles(force_refresh=True)


@pytest.fixture
def staff_mode(monkeypatch):
    monkeypatch.setattr(settings, "SHOW_ADMIN_ONLY_BOOKS", True, raising=False)


@pytest.fixture
def public_mode(monkeypatch):
    monkeypatch.setattr(settings, "SHOW_ADMIN_ONLY_BOOKS", False, raising=False)


def test_merge_queries_does_not_overwrite_keys():
    assert merge_queries({"title": "Genesis"}, {"title": {"$nin": ["X"]}}) == \
        {"$and": [{"title": "Genesis"}, {"title": {"$nin": ["X"]}}]}
    assert merge_queries({"a": 1}, None) == {"a": 1}
    assert merge_queries(None, {"b": 2}) == {"b": 2}


def test_admin_only_titles_include_alternates(hidden_book, public_mode):
    titles = text_module.admin_only_titles()
    assert HIDDEN in titles and HIDDEN_ALT in titles and "ספר נסתר" in titles


def test_public_mode_hides_book(hidden_book, public_mode):
    assert Index().load({"title": HIDDEN}) is None
    assert Index().load_by_id(hidden_book["index"]) is None
    assert HIDDEN not in IndexSet().distinct("title")
    assert IndexSet({"title": HIDDEN}).count() == 0
    assert len(VersionSet({"title": HIDDEN})) == 0
    assert VersionSet({"title": HIDDEN}).count() == 0
    assert Version().load({"title": HIDDEN}) is None
    assert VersionState().load({"title": HIDDEN}) is None
    assert len(LinkSet({"refs": {"$regex": "^Genesis 1:1$"}, "generated_by": "zzz_test"})) == 0
    assert db.texts.count_documents(text_module.public_query({"title": HIDDEN}, title_fields=("title",))) == 0
    assert db.links.count_documents(text_module.public_query({"generated_by": "zzz_test"}, ref_fields=("refs",))) == 0


def test_staff_mode_shows_book(hidden_book, staff_mode):
    assert Index().load({"title": HIDDEN}) is not None
    assert Index().load_by_id(hidden_book["index"]).is_admin_only()
    assert IndexSet({"title": HIDDEN}).count() == 1
    assert VersionSet({"title": HIDDEN}).count() == 1
    assert len(LinkSet({"generated_by": "zzz_test"})) == 1


def test_filter_keeps_other_title_keys(hidden_book, public_mode):
    # a query that already has a "title" key must not have it overwritten by the $nin filter
    assert VersionSet({"title": "Genesis"}).count() > 0
    assert VersionSet({"title": HIDDEN}).count() == 0


def test_public_cleanup_does_not_delete_hidden_state(hidden_book, public_mode):
    from sefaria.clean import remove_old_counts
    remove_old_counts()
    assert db.vstate.count_documents({"_id": hidden_book["vstate"]}) == 1
    assert db.links.count_documents({"_id": hidden_book["link"]}) == 1
