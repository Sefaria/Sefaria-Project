from types import SimpleNamespace
from unittest.mock import MagicMock, patch

from sefaria.client.wrapper import get_links
from sefaria.sheets import annotate_displayed_collections, get_sheets_for_ref


def _run_get_sheets_for_ref(**kwargs):
    """Runs get_sheets_for_ref against a mocked db and returns the mocked sheets cursor."""
    cursor = MagicMock()
    cursor.__iter__.return_value = iter([])
    with patch("sefaria.sheets.db") as db, patch("sefaria.sheets.User"):
        db.sheets.find.return_value = cursor
        db.profiles.find.return_value = []
        get_sheets_for_ref("Genesis 1:1", **kwargs)
    return cursor


class Test_get_sheets_for_ref_hint:
    def test_user_sheets_are_not_forced_onto_an_index(self):
        cursor = _run_get_sheets_for_ref(uid=1)
        cursor.hint.assert_not_called()

    def test_public_sheets_are_not_forced_onto_an_index(self):
        cursor = _run_get_sheets_for_ref()
        cursor.hint.assert_not_called()


def _stored_sheet(sheet_id, **fields):
    return {
        "_id": sheet_id,
        "id": sheet_id,
        "title": f"Sheet {sheet_id}",
        "owner": 1,
        "status": "public",
        "options": {},
        "views": 0,
        "includedRefs": ["Genesis 1:1"],
        "expandedRefs": ["Genesis 1:1"],
        **fields,
    }


class Test_get_sheets_for_ref_collections:
    def _run(self, stored_sheets, stored_collections=()):
        with (
            patch("sefaria.sheets.db") as db,
            patch("sefaria.sheets.User"),
            patch("sefaria.sheets.calculate_combined_score", side_effect=lambda sheets, tref: sheets),
            patch("sefaria.sheets.CollectionSet", return_value=list(stored_collections)) as collection_set,
        ):
            db.sheets.find.return_value = iter(stored_sheets)
            db.profiles.find.return_value = []
            results = get_sheets_for_ref("Genesis 1:1")
        return collection_set, {result["id"]: result["collectionTOC"] for result in results}

    def test_displayed_collections_are_read_in_one_query(self):
        toc_a, toc_b = {"title": "A"}, {"title": "B"}
        collection_set, tocs = self._run(
            [
                _stored_sheet(1, displayedCollection="a"),
                _stored_sheet(2, displayedCollection="b"),
                _stored_sheet(3, displayedCollection="a"),
                _stored_sheet(4),
            ],
            [SimpleNamespace(slug="a", toc=toc_a), SimpleNamespace(slug="b", toc=toc_b)],
        )

        collection_set.assert_called_once()
        query = collection_set.call_args.args[0]
        assert sorted(query["slug"]["$in"]) == ["a", "b"]
        assert collection_set.call_args.kwargs["proj"] == {"slug": 1, "toc": 1}
        assert tocs == {"1": toc_a, "2": toc_b, "3": toc_a, "4": None}

    def test_a_collection_without_toc_or_not_found_gives_none(self):
        _, tocs = self._run(
            [_stored_sheet(1, displayedCollection="no-toc"), _stored_sheet(2, displayedCollection="deleted")],
            [SimpleNamespace(slug="no-toc")],
        )

        assert tocs == {"1": None, "2": None}

    def test_empty_displayed_collections_are_not_queried(self):
        """Spam quarantine sets displayedCollection to None, deleting a collection sets it to ""."""
        collection_set, tocs = self._run(
            [_stored_sheet(1, displayedCollection=None), _stored_sheet(2, displayedCollection=""), _stored_sheet(3)]
        )

        collection_set.assert_not_called()
        assert tocs == {"1": None, "2": None, "3": None}


class Test_annotate_displayed_collections:
    def test_names_come_from_one_query_and_empty_values_are_skipped(self):
        sheets = [
            {"displayedCollection": "a"},
            {"displayedCollection": "a"},
            {"displayedCollection": ""},
            {"displayedCollection": None},
            {},
        ]
        with patch(
            "sefaria.sheets.CollectionSet", return_value=[SimpleNamespace(slug="a", name="A")]
        ) as collection_set:
            annotate_displayed_collections(sheets)

        collection_set.assert_called_once()
        assert collection_set.call_args.args[0] == {"slug": {"$in": ["a"]}}
        assert collection_set.call_args.kwargs["proj"] == {"slug": 1, "name": 1}
        assert [sheet.get("displayedCollectionName") for sheet in sheets] == ["A", "A", None, None, None]


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
class Test_get_links_collection_sheets:
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
