"""
/api/related/<ref> (reader/views.py related_api): the two lighter modes the new reader asks for (SB-03, lane D R1).

- `?with_links=0` leaves the links out (the client has them from /api/links);
- `?sheets=count` answers the sheets with only id + anchors (sefaria/sheets.py get_sheet_anchors_for_ref), enough to count them
  per verse; the full sheet records, owner profiles and collections are not loaded.
- Without either parameter the answer is exactly what it was (every other caller, and their Varnish keys, unchanged).

The library lookups are replaced by stubs: the test Mongo has no library data. Needs Postgres for the middleware only.
"""

import json
from unittest.mock import MagicMock, patch

from django.test import Client, TestCase

URL = "/api/related/Genesis.1"
FULL_SHEET = {
    "id": "7",
    "title": "A sheet",
    "owner": 1,
    "anchorRef": "Genesis 1:1",
    "anchorRefExpanded": ["Genesis 1:1"],
}
ANCHOR = {"id": "7", "anchorRef": "Genesis 1:1", "anchorRefExpanded": ["Genesis 1:1"]}
LINK = {"_id": "l1", "ref": "Rashi on Genesis 1:1:1", "anchorRef": "Genesis 1:1"}


class RelatedApiModesTestCase(TestCase):
    databases = "__all__"

    def setUp(self):
        self.client = Client()
        stubs = {
            "get_links": MagicMock(return_value=[dict(LINK)]),
            "get_sheets_for_ref": MagicMock(return_value=[dict(FULL_SHEET)]),
            "get_sheet_anchors_for_ref": MagicMock(return_value=[dict(ANCHOR)]),
            "get_topics_for_ref": MagicMock(return_value=[]),
            "get_media_for_ref": MagicMock(return_value=[]),
        }
        self.stubs = {}
        for name, stub in stubs.items():
            p = patch(f"reader.views.{name}", stub)
            self.stubs[name] = p.start()
            self.addCleanup(p.stop)
        for cls in ("ManuscriptPageSet", "GuideSet"):
            p = patch(f"reader.views.{cls}.load_set_for_client", MagicMock(return_value=[]))
            p.start()
            self.addCleanup(p.stop)

    def get(self, query=""):
        response = self.client.get(URL + query)
        self.assertEqual(response.status_code, 200)
        return json.loads(response.content)

    def test_default_is_unchanged(self):
        body = self.get()
        self.assertEqual(list(body), ["links", "sheets", "notes", "topics", "manuscripts", "media", "guides"])
        self.assertEqual(body["links"], [LINK])
        self.assertEqual(body["sheets"], [FULL_SHEET])
        self.stubs["get_sheet_anchors_for_ref"].assert_not_called()
        # the sheets found once are handed to get_links (the old coupling stays)
        self.assertEqual(self.stubs["get_links"].call_args.kwargs["public_sheets"], [FULL_SHEET])
        self.assertFalse(self.stubs["get_links"].call_args.kwargs["with_sheet_links"])

    def test_with_sheet_links_still_passed(self):
        self.get("?with_sheet_links=1")
        self.assertTrue(self.stubs["get_links"].call_args.kwargs["with_sheet_links"])

    def test_with_links_0_leaves_links_out(self):
        body = self.get("?with_links=0")
        self.assertNotIn("links", body)
        self.stubs["get_links"].assert_not_called()
        self.assertEqual(body["sheets"], [FULL_SHEET])

    def test_with_links_1_is_the_default(self):
        self.assertIn("links", self.get("?with_links=1"))

    def test_sheets_count_answers_ids_and_anchors_only(self):
        body = self.get("?with_links=0&sheets=count")
        self.assertEqual(body["sheets"], [ANCHOR])
        self.assertNotIn("links", body)
        self.stubs["get_sheets_for_ref"].assert_not_called()
        self.stubs["get_sheet_anchors_for_ref"].assert_called_once_with("Genesis.1")

    def test_sheets_count_with_links_lets_get_links_find_its_own_sheets(self):
        body = self.get("?sheets=count&with_sheet_links=1")
        self.assertEqual(body["links"], [LINK])
        self.assertIsNone(self.stubs["get_links"].call_args.kwargs["public_sheets"])

    def test_unknown_sheets_value_is_the_default(self):
        self.assertEqual(self.get("?sheets=all")["sheets"], [FULL_SHEET])


class SheetAnchorsTestCase(TestCase):
    """sefaria/sheets.py get_sheet_anchors_for_ref with a stub Ref and a stub sheets collection."""

    databases = "__all__"

    def test_one_item_per_anchor_public_only_minimal_projection(self):
        from sefaria import sheets as sheets_module

        def ref(name):
            r = MagicMock()
            r.normal.return_value = name
            return r

        oref = MagicMock()
        oref.all_segment_refs.return_value = [ref("Genesis 1:1"), ref("Genesis 1:2"), ref("Genesis 1:3")]
        oref.get_all_anchor_refs.return_value = (
            [ref("Genesis 1:1"), ref("Genesis 1:2-3")],
            [[ref("Genesis 1:1")], [ref("Genesis 1:2"), ref("Genesis 1:3")]],
        )
        fake_db = MagicMock()
        fake_db.sheets.find.return_value = [
            {"id": 42, "includedRefs": ["Genesis 1:1", "Genesis 1:2-3"], "expandedRefs": ["Genesis 1:1", "Genesis 1:2"]}
        ]
        with patch.object(sheets_module.model, "Ref", return_value=oref), patch.object(sheets_module, "db", fake_db):
            out = sheets_module.get_sheet_anchors_for_ref("Genesis 1")

        self.assertEqual(
            out,
            [
                {"id": "42", "anchorRef": "Genesis 1:1", "anchorRefExpanded": ["Genesis 1:1"]},
                {"id": "42", "anchorRef": "Genesis 1:2-3", "anchorRefExpanded": ["Genesis 1:2", "Genesis 1:3"]},
            ],
        )
        query, projection = fake_db.sheets.find.call_args.args
        self.assertEqual(
            query, {"expandedRefs": {"$in": ["Genesis 1:1", "Genesis 1:2", "Genesis 1:3"]}, "status": "public"}
        )
        self.assertEqual(projection, {"id": 1, "includedRefs": 1, "expandedRefs": 1})
        oref.get_all_anchor_refs.assert_called_once_with(
            ["Genesis 1:1", "Genesis 1:2", "Genesis 1:3"],
            ["Genesis 1:1", "Genesis 1:2-3"],
            ["Genesis 1:1", "Genesis 1:2"],
        )
