"""
Sheet topics saved without a slug used to stop the weekly topic recalculation
(`recalculate_secondary_topic_data.py`) with KeyError: 'slug'. These tests cover the
guards on every reader of sheet topic slugs and the save path that must never store such topics.
"""
from types import SimpleNamespace
from unittest.mock import MagicMock, patch

import pytest

from sefaria import sheets
from sefaria.helper import topic as topic_helper
from sefaria.model import topic as topic_model


SLUGLESS_SHEET = {"id": 1, "topics": [{"asTyped": "Veil"}, {"asTyped": "Light", "slug": "light"}]}


@pytest.mark.parametrize("bad_topic", [{"asTyped": "Veil"}, {"asTyped": "Veil", "slug": None}, {"asTyped": "Veil", "slug": ""}])
def test_sheet_topics_with_slugs_skips_slugless_topics(bad_topic):
    sheet = {"id": 1, "topics": [bad_topic, {"asTyped": "Light", "slug": "light"}]}
    assert topic_helper._sheet_topics_with_slugs(sheet) == [{"asTyped": "Light", "slug": "light"}]


@pytest.mark.parametrize("sheet", [{"id": 1}, {"id": 1, "topics": None}, {"id": 1, "topics": []}])
def test_sheet_topics_with_slugs_tolerates_missing_topics(sheet):
    assert topic_helper._sheet_topics_with_slugs(sheet) == []


def test_generate_sheet_topic_links_survives_slugless_topics():
    with patch.object(topic_helper, "db") as db:
        db.sheets.find.return_value = [SLUGLESS_SHEET]
        links = topic_helper.generate_sheet_topic_links()
    assert [l["toTopic"] for l in links] == ["light"]


def test_generate_all_topic_links_from_sheets_survives_slugless_topics():
    sheet = {"id": 1, "owner": 1, "expandedRefs": ["Genesis 1:1"],
             "topics": [{"asTyped": "Veil"}, {"asTyped": "Light", "slug": "light"}, {"asTyped": "Dark", "slug": "dark"}]}
    with patch.object(topic_helper, "db") as db, patch.object(topic_helper, "get_ref_safely", return_value=None):
        db.sheets.find.return_value = [sheet]
        source_links, related_links, sheet_links = topic_helper.generate_all_topic_links_from_sheets()
    assert [l.toTopic for l in sheet_links] == ["light", "dark"]
    assert source_links == [] and related_links == []


def test_update_ref_topic_link_orders_survives_slugless_topics():
    """The recalculation's next step reads every topic on each linked sheet."""
    sheet = dict(SLUGLESS_SHEET, includedRefs=[], dateCreated="t0")
    sheet_link = SimpleNamespace(is_sheet=True, toTopic="light", ref="Sheet 1")
    with patch.object(topic_helper, "db") as db, \
            patch.object(topic_helper, "calculate_mean_tfidf", return_value=({}, {})), \
            patch.object(topic_helper, "calculate_other_ref_scores", return_value=({}, {}, {}, {})), \
            patch.object(topic_helper, "calculate_pagerank_scores", return_value=({}, {})):
        db.sheets.find_one.return_value = sheet
        links = topic_helper.update_ref_topic_link_orders([], [sheet_link])
    assert links[0].order["avg_topic_tfidf"] == 1


def test_get_top_topic_ignores_slugless_topics():
    sheet = {"id": 1, "topics": [{"asTyped": "Veil"}, {"asTyped": "Light", "slug": "light"}, {"asTyped": "Dark", "slug": None}]}
    with patch.object(topic_helper, "Topic") as topic_cls:
        topic_helper.get_top_topic(sheet)
    topic_cls.init.assert_called_once_with("light")


def test_process_topic_delete_survives_slugless_topics():
    sheet = {"_id": "x", "id": 1, "topics": [{"asTyped": "Veil"}, {"asTyped": "Light", "slug": "light"}]}
    with patch.object(topic_model, "db") as db, \
            patch.object(topic_model, "RefTopicLinkSet"), \
            patch.object(topic_model, "IntraTopicLinkSet"), \
            patch.object(topic_model, "DjangoTopic"):
        db.sheets.find.return_value = [sheet]
        topic_model.process_topic_delete(SimpleNamespace(slug="light"))
    assert db.sheets.replace_one.call_args[0][1]["topics"] == [{"asTyped": "Veil"}]


def test_normalize_sheet_topics_fills_missing_slugs_and_keeps_order():
    existing = MagicMock(slug="veil")
    with patch.object(sheets, "choose_existing_topic_for_title", return_value=existing), \
            patch.object(sheets, "create_topic_from_title") as create:
        topics = sheets.normalize_sheet_topics([
            {"asTyped": "zebra", "slug": "zebra"},
            {"asTyped": "veil"},
            {"asTyped": "apple", "slug": None},
            {"asTyped": "zebra", "slug": "zebra"},
        ])
    assert [t["slug"] for t in topics] == ["zebra", "veil", "veil"]
    create.assert_not_called()


def test_save_sheet_stores_slugs_even_if_later_step_fails():
    """The sheet is written before scoring and topic links run; a failure there must not leave slugless topics behind."""
    new_sheet = {"title": "A sheet", "status": "public", "sources": [], "topics": [{"asTyped": "veil"}]}
    with patch.object(sheets, "db") as db, \
            patch.object(sheets, "choose_existing_topic_for_title", return_value=MagicMock(slug="veil")), \
            patch.object(sheets, "generate_and_save_sheet_scoring", side_effect=RuntimeError("scoring failed")):
        with pytest.raises(RuntimeError):
            sheets.save_sheet(new_sheet, user_id=1)
    stored = db.sheets.insert_one.call_args[0][0]
    assert stored["topics"] == [{"asTyped": "Veil", "slug": "veil"}]


def _resave(stored, update):
    """Saves `update` over a copy of the stored sheet; returns (written sheet, normalize mock, link-sync mock)."""
    existing = dict(stored)
    if stored.get("topics"):
        existing["topics"] = [dict(t) for t in stored["topics"]]
    with patch.object(sheets, "db") as db, \
            patch.object(sheets, "choose_existing_topic_for_title", return_value=MagicMock(slug="veil")), \
            patch.object(sheets, "generate_and_save_sheet_scoring"), \
            patch.object(sheets, "normalize_sheet_topics", wraps=sheets.normalize_sheet_topics) as normalize, \
            patch.object(sheets, "update_sheet_topic_links") as sync_links:
        db.sheets.find_one.return_value = existing
        sheets.save_sheet(dict(update, id=stored["id"], lastModified=stored["dateModified"]), user_id=1, search_override=True)
    return db.sheets.find_one_and_replace.call_args[0][1], normalize, sync_links


STORED_SHEET = {"id": 7, "status": "public", "dateModified": "t0", "views": 1, "owner": 1, "likes": [],
                "dateCreated": "t0", "sources": []}


def test_save_sheet_syncs_links_when_repairing_stored_slugless_topics():
    """An update that doesn't send topics reuses the stored list; repairing it must still count as a topic change."""
    stored = dict(STORED_SHEET, topics=[{"asTyped": "veil"}])
    written, _, sync_links = _resave(stored, {"status": "public", "sources": []})
    assert written["topics"] == [{"asTyped": "Veil", "slug": "veil"}]
    sync_links.assert_called_once_with(7, [{"asTyped": "Veil", "slug": "veil"}], [{"asTyped": "veil"}])


@pytest.mark.parametrize("update", [
    {"status": "public", "sources": []},  # metadata-only resave: no topics sent
    {"status": "public", "sources": [], "topics": [{"asTyped": "veil", "slug": "veil"}]},  # same topics sent back
])
def test_save_sheet_resave_leaves_stored_topics_untouched(update):
    """Legacy un-normalized asTyped must not be rewritten (or its link churned) by a save that doesn't change topics."""
    stored = dict(STORED_SHEET, topics=[{"asTyped": "veil", "slug": "veil"}])
    written, normalize, sync_links = _resave(stored, update)
    assert written["topics"] == [{"asTyped": "veil", "slug": "veil"}]
    normalize.assert_not_called()
    sync_links.assert_not_called()


def test_save_sheet_without_topics_does_not_add_topics_field():
    stored = dict(STORED_SHEET)
    written, normalize, _ = _resave(stored, {"status": "public", "sources": []})
    assert "topics" not in written
    normalize.assert_not_called()


def test_save_sheet_stores_explicit_null_topics_as_empty_and_resaves():
    with patch.object(sheets, "db") as db, patch.object(sheets, "generate_and_save_sheet_scoring"):
        sheets.save_sheet({"title": "A sheet", "status": "unlisted", "sources": [], "topics": None}, user_id=1, search_override=True)
    assert db.sheets.insert_one.call_args[0][0]["topics"] == []

    written, normalize, _ = _resave(dict(STORED_SHEET, topics=None), {"status": "public", "sources": []})
    assert written["topics"] == []
    normalize.assert_not_called()
