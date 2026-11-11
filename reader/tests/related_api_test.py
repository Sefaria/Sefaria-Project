"""
/api/related/<ref> (reader/views.py related_api): the two lighter modes the new reader asks for.

- `?with_links=0` leaves the links out (the client has them from /api/links);
- `?sheets=count` answers the sheets with only id + anchors (sefaria/sheets.py get_sheet_anchors_for_ref), enough to count them
  per verse; the full sheet records, owner profiles and collections are not loaded.
- Without either parameter the answer is exactly what it was (every other caller, and their Varnish keys, unchanged).

The library lookups are replaced by stubs: the test Mongo has no library data. Needs Postgres for the middleware only.
"""

import json
import re
from pathlib import Path
from unittest.mock import MagicMock, patch
from urllib.parse import urlparse

import pytest
from django.conf import settings
from django.test import Client, TestCase

URL = "/api/related/Genesis.1"
# The Voices host is whatever this deployment's DOMAIN_MODULES says it is (sefaria/hosts.py routes on it at import).
VOICES_HOST = urlparse(settings.DOMAIN_MODULES["en"]["voices"]).netloc
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

    # Varnish keys /api/related on the URL alone, so an answer must not depend on the host: a request to the Voices host for
    # the same URL would otherwise fill the cache entry the Library reader reads.
    def test_same_answer_on_both_hosts_for_the_lighter_modes(self):
        for query in ("?with_links=0&sheets=count", "?with_links=0", "?sheets=count"):
            library = self.client.get(URL + query)
            voices = self.client.get(URL + query, HTTP_HOST=VOICES_HOST)
            self.assertEqual(library.status_code, 200)
            self.assertEqual(voices.status_code, 200)
            self.assertEqual(voices.content, library.content, query)
        body = json.loads(voices.content)
        self.assertEqual(body["sheets"], [ANCHOR])

    def test_voices_host_default_is_unchanged(self):
        response = self.client.get(URL, HTTP_HOST=VOICES_HOST)
        self.assertEqual(response.status_code, 200)
        body = json.loads(response.content)
        self.assertEqual(list(body), ["links", "sheets", "notes", "topics", "manuscripts", "media", "guides"])
        self.assertEqual(body["sheets"], [FULL_SHEET])
        self.stubs["get_sheet_anchors_for_ref"].assert_not_called()
        self.assertEqual(self.stubs["get_links"].call_args.kwargs["public_sheets"], [FULL_SHEET])

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

    def test_same_ids_and_anchors_as_the_full_answer(self):
        """S2: one stub sheets collection and one stub Ref through both functions give the same (id, anchor, expanded) items."""
        from sefaria import sheets as sheets_module

        def ref(name):
            r = MagicMock()
            r.normal.return_value = name
            return r

        oref = MagicMock()
        oref.all_segment_refs.return_value = [ref("Genesis 1:1"), ref("Genesis 1:2"), ref("Genesis 1:3")]
        anchors = {
            42: (
                [ref("Genesis 1:1"), ref("Genesis 1:2-3")],
                [[ref("Genesis 1:1")], [ref("Genesis 1:2"), ref("Genesis 1:3")]],
            ),
            43: ([ref("Genesis 1:3")], [[ref("Genesis 1:3")]]),
            44: ([], []),
        }
        docs = [
            {
                "_id": f"oid{n}",
                "id": n,
                "title": f"<b>Sheet {n}</b>",
                "owner": 7,
                "status": "public",
                "views": 1,
                "options": {},
                "includedRefs": [f"inc{n}"],
                "expandedRefs": [f"exp{n}"],
            }
            for n in anchors
        ]
        oref.get_all_anchor_refs.side_effect = lambda segs, included, expanded: anchors[int(included[0][3:])]
        fake_db = MagicMock()
        fake_db.sheets.find.side_effect = lambda query, projection: [dict(d) for d in docs]
        fake_db.profiles.find.return_value = []
        with (
            patch.object(sheets_module.model, "Ref", return_value=oref),
            patch.object(sheets_module, "db", fake_db),
            patch.object(sheets_module, "add_langs_to_topics", return_value=[]),
        ):
            full = sheets_module.get_sheets_for_ref("Genesis 1")
            light = sheets_module.get_sheet_anchors_for_ref("Genesis 1")

        key = lambda s: (s["id"], s["anchorRef"], tuple(s["anchorRefExpanded"]))  # noqa: E731
        self.assertEqual(len(full), 3)
        self.assertEqual([key(s) for s in full], [key(s) for s in light])
        self.assertEqual({s["id"] for s in full}, {"42", "43"})


CLIENT_URLS = json.loads(
    (Path(__file__).resolve().parents[2] / "reader-next/fixtures/varnish/related-client-urls.json").read_text(
        encoding="utf-8"
    )
)["urls"]


def _ban_pattern(section_ref):
    """What invalidate_ref bans for an edit of `section_ref`, as Varnish reads it (the hyper-slashing undone)."""
    from sefaria.system.varnish.wrapper import client_url_regex

    return re.compile("/api/related/" + client_url_regex([section_ref]).replace("\\\\", "\\"))


@pytest.mark.parametrize("section_ref", list(CLIENT_URLS))
def test_varnish_ban_matches_exactly_the_url_the_new_reader_sends(section_ref):
    """S1: the URL comes from reader-next/fixtures/varnish/related-client-urls.json, which src/lib/connections/related.test.ts
    checks against the request the client really makes."""
    pattern = _ban_pattern(section_ref)
    assert pattern.search(CLIENT_URLS[section_ref])
    for other, url in CLIENT_URLS.items():
        if other != section_ref:
            assert not pattern.search(url), f"an edit of {section_ref} must not ban {url}"


def test_varnish_ban_covers_more_specific_refs_and_the_purged_url():
    from sefaria.system.varnish.wrapper import encode_uri_component

    pattern = _ban_pattern("Genesis 1")
    assert pattern.search("/api/related/Genesis%201%3A3?with_links=0&sheets=count")
    assert pattern.search(f"/api/related/{encode_uri_component('Genesis 1')}?with_links=0&sheets=count")
    assert not pattern.search("/api/related/Genesis%2010")
    assert not pattern.search("/api/related/Exodus%201")
