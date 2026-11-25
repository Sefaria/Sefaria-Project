# -*- coding: utf-8 -*-
from unittest.mock import MagicMock, patch

from sefaria.client.wrapper import get_links
from sefaria.sheets import get_sheets_for_ref


def _run_get_sheets_for_ref(**kwargs):
    """Runs get_sheets_for_ref against a mocked db and returns the mocked sheets cursor."""
    cursor = MagicMock()
    cursor.__iter__.return_value = iter([])
    with patch("sefaria.sheets.db") as db, patch("sefaria.sheets.User"):
        db.sheets.find.return_value = cursor
        db.profiles.find.return_value = []
        get_sheets_for_ref("Genesis 1:1", **kwargs)
    return cursor


class Test_get_sheets_for_ref_hint():

    def test_user_sheets_are_not_forced_onto_an_index(self):
        cursor = _run_get_sheets_for_ref(uid=1)
        cursor.hint.assert_not_called()

    def test_public_sheets_are_not_forced_onto_an_index(self):
        cursor = _run_get_sheets_for_ref()
        cursor.hint.assert_not_called()


def _sheet(sheet_id):
    return {
        "id": str(sheet_id),
        "title": "Sheet %d" % sheet_id,
        "anchorRef": "Exodus 1:12",
        "anchorRefExpanded": ["Exodus 1:12"],
        "collectionTOC": {"categories": ["Tanakh"], "dependence": "Commentary", "title": "Coll", "heTitle": "Coll"},
    }


@patch("sefaria.client.wrapper.library.get_collections_in_library", return_value=["coll"])
@patch("sefaria.client.wrapper.CollectionSet.sheet_ids", return_value={5})
class Test_get_links_collection_sheets():

    @patch("sefaria.client.wrapper.get_sheets_for_ref")
    def test_collection_sheets_taken_from_public_sheets(self, mock_get_sheets, mock_ids, mock_collections):
        public_sheets = [_sheet(5), _sheet(6)]
        links = get_links("Exodus 1:12", with_text=False, with_sheet_links=True, public_sheets=public_sheets)

        mock_get_sheets.assert_not_called()
        sheet_links = [l for l in links if l.get("isSheet")]
        assert [l["id"] for l in sheet_links] == ["5"]
        assert sheet_links[0]["category"] == "Commentary"
        # The public sheets themselves are returned to the client as is.
        assert all("isSheet" not in s for s in public_sheets)

    @patch("sefaria.client.wrapper.get_sheets_for_ref", return_value=[_sheet(5)])
    def test_collection_sheets_queried_without_public_sheets(self, mock_get_sheets, mock_ids, mock_collections):
        links = get_links("Exodus 1:12", with_text=False, with_sheet_links=True)

        mock_get_sheets.assert_called_once_with("Exodus 1:12", in_collection=["coll"])
        assert [l["id"] for l in links if l.get("isSheet")] == ["5"]
