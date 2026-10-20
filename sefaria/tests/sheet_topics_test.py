"""
Sheet topics saved without a slug used to stop the weekly topic recalculation
(`recalculate_secondary_topic_data.py`) with KeyError: 'slug'. These tests cover the
guard in the recalculation and the save path that must never store such topics.
"""
from unittest.mock import MagicMock, patch

import pytest

from sefaria import sheets
from sefaria.helper import topic as topic_helper


SLUGLESS_SHEET = {"id": 1, "topics": [{"asTyped": "Veil"}, {"asTyped": "Light", "slug": "light"}]}


def test_sheet_topics_with_slugs_skips_slugless_topics():
    sheet = {"id": 1, "topics": [{"asTyped": "Veil"}, {"asTyped": "Empty", "slug": ""}, {"asTyped": "Light", "slug": "light"}]}
    assert topic_helper._sheet_topics_with_slugs(sheet) == [{"asTyped": "Light", "slug": "light"}]


def test_generate_sheet_topic_links_survives_slugless_topics():
    with patch.object(topic_helper, "db") as db:
        db.sheets.find.return_value = [SLUGLESS_SHEET]
        links = topic_helper.generate_sheet_topic_links()
    assert [l["toTopic"] for l in links] == ["light"]


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
    assert all(t["slug"] for t in topics)
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


def test_save_sheet_syncs_links_when_repairing_stored_slugless_topics():
    """An update that doesn't send topics reuses the stored list; repairing it must still count as a topic change."""
    existing = {"id": 7, "status": "public", "dateModified": "t0", "views": 1, "owner": 1, "likes": [],
                "dateCreated": "t0", "sources": [], "topics": [{"asTyped": "veil"}]}
    update = {"id": 7, "status": "public", "lastModified": "t0", "sources": []}
    with patch.object(sheets, "db") as db, \
            patch.object(sheets, "choose_existing_topic_for_title", return_value=MagicMock(slug="veil")), \
            patch.object(sheets, "generate_and_save_sheet_scoring"), \
            patch.object(sheets, "update_sheet_topic_links") as sync_links:
        db.sheets.find_one.return_value = existing
        sheets.save_sheet(update, user_id=1, search_override=True)
    sync_links.assert_called_once_with(7, [{"asTyped": "Veil", "slug": "veil"}], [{"asTyped": "veil"}])
