# coding=utf-8
"""
Tests for staff-only (`admin_only`) records: Categories, Indexes, Versions, Links and their History
are invisible unless SHOW_ADMIN_ONLY_BOOKS is True.
Fixture records are inserted straight into Mongo so that no save hooks (search, TOC, cache) fire.
"""
import pytest
from django.conf import settings

from sefaria.model import *
from sefaria.model import text as text_module
from sefaria.model.abstract import merge_queries, public_query
from sefaria.model.history import _is_admin_only_change
from sefaria.model.marked_up_text_chunk import CitationMUTCSpan
from sefaria.system.database import db
from sefaria.system.exceptions import InputError

HIDDEN = "Zzz Hidden Test Book"
HIDDEN_ALT = "Zzz Hidden Alt Title"
HIDDEN_CATEGORY = ["Tanakh", "Zzz Hidden Category"]


def bare_index(**attrs):
    """An Index with only the given attributes: the Index constructor demands a full schema."""
    index = Index.__new__(Index)
    index.__dict__.update(attrs)
    return index


@pytest.fixture
def staff_mode(monkeypatch):
    monkeypatch.setattr(settings, "SHOW_ADMIN_ONLY_BOOKS", True, raising=False)


@pytest.fixture
def public_mode(monkeypatch):
    monkeypatch.setattr(settings, "SHOW_ADMIN_ONLY_BOOKS", False, raising=False)


def _delete_fixture_records():
    db.index.delete_many({"title": HIDDEN})
    db.texts.delete_many({"title": HIDDEN})
    db.vstate.delete_many({"title": HIDDEN})
    db.links.delete_many({"generated_by": "zzz_test"})
    db.category.delete_many({"path": HIDDEN_CATEGORY})
    db.history.delete_many({"method": "zzz_test"})


@pytest.fixture
def hidden_book():
    _delete_fixture_records()  # leftovers of an interrupted run
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
        "text": db.texts.insert_one({"title": HIDDEN, "versionTitle": "Zzz Version", "language": "en", "admin_only": True,
                                     "actualLanguage": "en", "chapter": [["hidden text"]]}).inserted_id,
        "vstate": db.vstate.insert_one({"title": HIDDEN, "content": {}}).inserted_id,
        "link": db.links.insert_one({"refs": [HIDDEN + " 1:1", "Genesis 1:1"], "type": "quotation", "admin_only": True,
                                     "generated_by": "zzz_test"}).inserted_id,
        "category": db.category.insert_one({"path": HIDDEN_CATEGORY, "lastPath": HIDDEN_CATEGORY[-1], "depth": 2,
                                            "admin_only": True}).inserted_id,
        "history": db.history.insert_one({"rev_type": "add text", "user": 0, "ref": HIDDEN + " 1:1",
                                          "admin_only": True, "method": "zzz_test"}).inserted_id,
    }
    yield ids
    _delete_fixture_records()


@pytest.fixture
def hidden_genesis_version():
    """A staff-only version of a public book."""
    _id = db.texts.insert_one({"title": "Genesis", "versionTitle": "Zzz Hidden Genesis", "language": "en", "admin_only": True,
                               "actualLanguage": "en", "chapter": [["hidden translation"]]}).inserted_id
    yield _id
    db.texts.delete_one({"_id": _id})


def test_merge_queries_does_not_overwrite_keys():
    assert merge_queries({"title": "Genesis"}, {"title": {"$nin": ["X"]}}) == \
        {"$and": [{"title": "Genesis"}, {"title": {"$nin": ["X"]}}]}
    assert merge_queries({"a": 1}, None) == {"a": 1}
    assert merge_queries(None, {"b": 2}) == {"b": 2}


def test_public_query(public_mode):
    assert public_query({"title": "Genesis"}) == {"$and": [{"title": "Genesis"}, {"admin_only": {"$ne": True}}]}


def test_public_query_in_staff_mode(staff_mode):
    assert public_query({"title": "Genesis"}) == {"title": "Genesis"}


def test_public_mode_hides_flagged_records(hidden_book, public_mode):
    assert Index().load({"title": HIDDEN}) is None
    assert Index().load_by_id(hidden_book["index"]) is None
    assert HIDDEN not in IndexSet().distinct("title")
    assert IndexSet({"title": HIDDEN}).count() == 0
    assert len(VersionSet({"title": HIDDEN})) == 0
    assert Version().load({"title": HIDDEN}) is None
    assert len(LinkSet({"generated_by": "zzz_test"})) == 0
    assert Category().load({"path": HIDDEN_CATEGORY}) is None
    assert History().load({"method": "zzz_test"}) is None
    assert db.texts.count_documents(public_query({"title": HIDDEN})) == 0
    assert db.links.count_documents(public_query({"generated_by": "zzz_test"})) == 0
    assert db.history.count_documents(public_query({"method": "zzz_test"})) == 0


def test_staff_mode_shows_flagged_records(hidden_book, staff_mode):
    assert Index().load_by_id(hidden_book["index"]).is_admin_only()
    assert IndexSet({"title": HIDDEN}).count() == 1
    assert VersionSet({"title": HIDDEN}).count() == 1
    assert len(LinkSet({"generated_by": "zzz_test"})) == 1
    assert Category().load({"path": HIDDEN_CATEGORY}).is_admin_only()
    assert History().load({"method": "zzz_test"}) is not None


def test_hidden_version_of_public_book(hidden_genesis_version, public_mode):
    titles = [v.versionTitle for v in VersionSet({"title": "Genesis"})]
    assert titles and "Zzz Hidden Genesis" not in titles


def test_raw_lookups_work_in_public_mode(hidden_book, public_mode):
    assert text_module.admin_only_index_titles([HIDDEN, "Genesis"]) == {HIDDEN}
    assert text_module.is_admin_only_title(HIDDEN_ALT)
    assert not text_module.is_admin_only_title("Genesis")
    assert text_module.admin_only_category_path(HIDDEN_CATEGORY + ["Sub"]) == HIDDEN_CATEGORY
    assert text_module.admin_only_category_path(["Tanakh", "Torah"]) is None


# ---- dependency rule: a child of a staff-only parent must be staff-only ---- #

def test_new_version_of_hidden_book_is_stamped(hidden_book, staff_mode):
    v = Version({"title": HIDDEN, "versionTitle": "New", "language": "en"})
    v._apply_admin_only_rules(is_new_obj=True)
    assert v.admin_only is True


def test_version_of_hidden_book_can_not_be_public(hidden_book, staff_mode):
    v = Version({"title": HIDDEN, "versionTitle": "New", "language": "en", "admin_only": False})
    with pytest.raises(InputError):
        v._apply_admin_only_rules(is_new_obj=True)


def test_new_version_of_public_book_stays_public(staff_mode):
    v = Version({"title": "Genesis", "versionTitle": "New", "language": "en"})
    v._apply_admin_only_rules(is_new_obj=True)
    assert not hasattr(v, "admin_only")


def test_public_record_can_not_become_staff_only(staff_mode):
    existing = db.texts.find_one({"title": "Genesis", "admin_only": {"$ne": True}}, {"_id": 1})
    v = Version({"_id": existing["_id"], "title": "Genesis", "versionTitle": "X", "language": "en", "admin_only": True})
    with pytest.raises(InputError):
        v._apply_admin_only_rules(is_new_obj=False)


def test_staff_only_record_can_be_published(hidden_genesis_version, staff_mode):
    v = Version({"_id": hidden_genesis_version, "title": "Genesis", "versionTitle": "Zzz Hidden Genesis",
                 "language": "en", "admin_only": False})
    v._apply_admin_only_rules(is_new_obj=False)
    assert not hasattr(v, "admin_only")  # only True is ever stored


def test_index_under_hidden_category_is_stamped(hidden_book, staff_mode):
    i = bare_index(title="Zzz Other", categories=HIDDEN_CATEGORY + ["Sub"])
    assert "Zzz Hidden Category" in i._admin_only_parent()
    i._apply_admin_only_rules(is_new_obj=True)
    assert i.admin_only is True


def test_commentary_on_hidden_book_is_stamped(hidden_book, staff_mode):
    i = bare_index(title="Zzz Commentary", categories=["Tanakh"], base_text_titles=[HIDDEN])
    i._apply_admin_only_rules(is_new_obj=True)
    assert i.admin_only is True


def test_category_under_hidden_category_is_stamped(hidden_book, staff_mode):
    c = Category({"path": HIDDEN_CATEGORY + ["Sub"], "lastPath": "Sub"})
    c._apply_admin_only_rules(is_new_obj=True)
    assert c.admin_only is True


def test_link_touching_hidden_book_is_stamped(monkeypatch, staff_mode):
    monkeypatch.setattr(Index, "is_admin_only", lambda self: self.title == "Exodus")
    link = Link({"refs": ["Genesis 1:1", "Exodus 1:1"], "type": "quotation"})
    link._apply_admin_only_rules(is_new_obj=True)
    assert link.admin_only is True

    public_link = Link({"refs": ["Genesis 1:1", "Leviticus 1:1"], "type": "quotation"})
    public_link._apply_admin_only_rules(is_new_obj=True)
    assert not hasattr(public_link, "admin_only")


# ---- history ---- #

def test_history_stamp_follows_state_after_change():
    assert _is_admin_only_change(None, {"admin_only": True})
    assert not _is_admin_only_change({"admin_only": True}, {"title": "published"})  # a publish is public
    assert _is_admin_only_change({"admin_only": True}, None)  # deleting a hidden record
    assert not _is_admin_only_change(None, {"title": "x"})


def test_text_edit_history_is_stamped(hidden_genesis_version, staff_mode):
    log_text(0, "edit", Ref("Genesis 1:1"), "en", "Zzz Hidden Genesis", "a", "b", method="zzz_test")
    try:
        assert db.history.find_one({"method": "zzz_test"})["admin_only"] is True
    finally:
        db.history.delete_many({"method": "zzz_test"})


# ---- guards ---- #

def test_public_cleanup_does_not_delete_hidden_state(hidden_book, public_mode):
    from sefaria.clean import remove_old_counts
    remove_old_counts()
    assert db.vstate.count_documents({"_id": hidden_book["vstate"]}) == 1
    assert db.links.count_documents({"_id": hidden_book["link"]}) == 1


def test_unresolvable_citation_renders_as_text():
    span = CitationMUTCSpan({"charRange": [0, 5], "text": "Zzz 1", "ref": "Zzz Not A Book 1:1"})
    assert span.ref is None
    assert span.wrap_span_in_a_tag() == "Zzz 1"


def test_publish_requires_staff_site(public_mode):
    from sefaria.helper import staff_only
    with pytest.raises(InputError):
        staff_only.publish_links(0, {"index": "Genesis"})


def test_publish_links_skips_links_to_hidden_books(hidden_book, monkeypatch, staff_mode):
    from sefaria.helper import staff_only
    monkeypatch.setattr(Index, "is_admin_only", lambda self: self.title == "Exodus")
    ready = db.links.insert_one({"refs": ["Genesis 1:1", "Leviticus 1:1"], "type": "quotation", "admin_only": True,
                                 "generated_by": "zzz_publish"}).inserted_id
    blocked = db.links.insert_one({"refs": ["Exodus 1:1", "Genesis 1:1"], "type": "quotation", "admin_only": True,
                                   "generated_by": "zzz_publish"}).inserted_id
    try:
        result = staff_only.publish_links(0, {"ids": [str(ready), str(blocked)]})
        assert result["published"] == 1
        assert [s["id"] for s in result["skipped"]] == [str(blocked)]
        assert "admin_only" not in db.links.find_one({"_id": ready})
        assert db.links.find_one({"_id": blocked})["admin_only"] is True
    finally:
        db.links.delete_many({"generated_by": "zzz_publish"})
