"""
POST /api/refs/expand (api/ref_expand.py): validate refs and expand each into section and segment refs.

The test Mongo has no library data, so `Ref` is replaced by a small fake that behaves like the real one
for the calls the view makes (normal, he_normal, all_segment_refs, section_ref). The last test uses the
real library and skips itself when Genesis is not loaded. Needs Postgres for the middleware only.
"""

import json
from unittest.mock import patch

from django.test import Client, TestCase

from api import ref_expand
from sefaria.system.exceptions import BookNameError, InputError

URL = "/api/refs/expand"


class FakeRef:
    """Genesis 1 has 31 verses, Genesis 2 has 25; 'Genesis' (the book) expands past the cap; 'Boom 1' raises."""

    VERSES = {1: 31, 2: 25}

    def __init__(self, tref):
        tref = tref.replace(".", " ")
        if tref.startswith("Boom"):
            raise RuntimeError("kaboom")
        if tref == "Genesis":
            self._segments = [("Genesis", c, v) for c in range(1, 51) for v in range(1, 51)]  # 2,500: over the cap
            self._normal = "Genesis"
            return
        if not tref.startswith("Genesis "):
            raise BookNameError(f"Could not find title in reference: {tref}")
        address = tref[len("Genesis ") :]
        start, _, end = address.partition("-")
        chapter, _, verse = start.partition(":")
        chapter = int(chapter)
        if chapter not in self.VERSES:
            raise InputError("Genesis ends at Chapter 50.")
        if verse:
            first = int(verse)
            last = int(end) if end else first
            # Like the real Ref, segment numbers are not checked here (all_subrefs catches them).
            self._segments = [("Genesis", chapter, v) for v in range(first, last + 1)]
        else:
            last_chapter = int(end) if end else chapter
            self._segments = [
                ("Genesis", c, v) for c in range(chapter, last_chapter + 1) for v in range(1, self.VERSES[c] + 1)
            ]
        self._normal = f"Genesis {address}"

    @classmethod
    def segment(cls, book, chapter, verse):
        ref = cls.__new__(cls)
        ref._normal = f"{book} {chapter}:{verse}"
        ref._chapter = f"{book} {chapter}"
        return ref

    def normal(self):
        return self._normal

    def he_normal(self):
        return "בראשית " + self._normal.split(" ", 1)[-1]

    def all_segment_refs(self):
        return [FakeRef.segment(*s) for s in self._segments]

    def section_ref(self):
        section = FakeRef.__new__(FakeRef)
        section._normal = self._chapter
        return section

    def is_segment_level(self):
        return self._normal.count(":") == 1 and "-" not in self._normal

    def all_subrefs(self):
        chapter = int(self._normal.split(" ")[1])
        return [FakeRef.segment("Genesis", chapter, v) for v in range(1, self.VERSES[chapter] + 1)]


def post(body, raw=False):
    data = body if raw else json.dumps(body)
    return Client(enforce_csrf_checks=True).post(URL, data=data, content_type="application/json")


@patch.object(ref_expand, "Ref", FakeRef)
class RefsExpandApiTest(TestCase):
    databases = "__all__"

    def test_expands_a_range_to_its_sections_and_segments(self):
        res = post({"refs": ["Genesis 1:1-3"]})
        self.assertEqual(res.status_code, 200)
        self.assertEqual(
            res.json(),
            {
                "results": [
                    {
                        "input": "Genesis 1:1-3",
                        "ok": True,
                        "ref": "Genesis 1:1-3",
                        "heRef": "בראשית 1:1-3",
                        "sectionRefs": ["Genesis 1"],
                        "segmentRefs": ["Genesis 1:1", "Genesis 1:2", "Genesis 1:3"],
                    }
                ]
            },
        )

    def test_a_range_across_chapters_lists_each_section_once_in_order(self):
        result = post({"refs": ["Genesis 1-2"]}).json()["results"][0]
        self.assertEqual(result["sectionRefs"], ["Genesis 1", "Genesis 2"])
        self.assertEqual(len(result["segmentRefs"]), 31 + 25)
        self.assertEqual(result["segmentRefs"][0], "Genesis 1:1")
        self.assertEqual(result["segmentRefs"][-1], "Genesis 2:25")

    def test_a_bad_ref_gets_its_own_error_and_the_others_still_answer(self):
        results = post({"refs": ["Genesis 1:1", "Genesis 1:40", "Gnesis 1:1", "Genesis 1:2"]}).json()["results"]
        self.assertEqual([r["input"] for r in results], ["Genesis 1:1", "Genesis 1:40", "Gnesis 1:1", "Genesis 1:2"])
        self.assertEqual([r["ok"] for r in results], [True, False, False, True])
        self.assertEqual(
            results[1]["error"],
            "'Genesis 1:40' does not exist: Genesis 1 has 31 segments. Check the verse or line number.",
        )
        self.assertIn("'Gnesis 1:1' is not a valid ref", results[2]["error"])
        self.assertEqual(set(results[1]), {"input", "ok", "error"})

    def test_a_range_running_past_the_end_of_a_section_is_refused(self):
        result = post({"refs": ["Genesis 2:20-30"]}).json()["results"][0]
        self.assertFalse(result["ok"])
        self.assertIn("'Genesis 2:26' does not exist: Genesis 2 has 25 segments", result["error"])

    def test_an_unexpected_error_is_a_per_ref_error_not_a_500(self):
        res = post({"refs": ["Boom 1", "Genesis 1:1"]})
        self.assertEqual(res.status_code, 200)
        results = res.json()["results"]
        self.assertEqual(results[0], {"input": "Boom 1", "ok": False, "error": "'Boom 1' could not be expanded."})
        self.assertTrue(results[1]["ok"])

    def test_non_string_and_empty_refs_are_per_ref_errors(self):
        results = post({"refs": [3, "", "  ", None]}).json()["results"]
        self.assertEqual([r["ok"] for r in results], [False] * 4)
        self.assertEqual(results[0]["input"], 3)

    def test_a_whole_book_over_the_segment_cap_is_refused_with_advice(self):
        result = post({"refs": ["Genesis"]}).json()["results"][0]
        self.assertFalse(result["ok"])
        self.assertIn("more than 2000", result["error"])
        self.assertIn("Cite a chapter or a range", result["error"])

    def test_empty_list_is_fine(self):
        self.assertEqual(post({"refs": []}).json(), {"results": []})

    def test_at_most_200_refs(self):
        self.assertEqual(post({"refs": ["Genesis 1:1"] * 200}).status_code, 200)
        res = post({"refs": ["Genesis 1:1"] * 201})
        self.assertEqual(res.status_code, 400)
        self.assertEqual(res.json(), {"error": "Too many refs: 201. Send at most 200 per request."})

    def test_bad_bodies_are_400(self):
        for body in ("not json", json.dumps(["Genesis 1:1"]), json.dumps({"refs": "Genesis 1:1"}), json.dumps({})):
            with self.subTest(body=body):
                res = post(body, raw=True)
                self.assertEqual(res.status_code, 400)
                self.assertIn("error", res.json())

    def test_no_csrf_token_or_sign_in_needed(self):
        # post() uses a client that enforces CSRF and is signed out.
        self.assertEqual(post({"refs": ["Genesis 1:1"]}).status_code, 200)

    def test_post_only(self):
        self.assertEqual(Client().get(URL).status_code, 405)


class RefsExpandRealLibraryTest(TestCase):
    """Runs only where the library is loaded (a local dev database), not in CI's empty Mongo."""

    databases = "__all__"

    def setUp(self):
        from sefaria.model.text import Ref

        try:
            Ref("Genesis 1:1")
        except Exception:
            self.skipTest("library data not loaded")

    def test_genesis_and_rashi(self):
        results = post(
            {"refs": ["Genesis 1:1-3", "Rashi on Genesis 1:1:1", "Genesis 1:99", "Not A Book 1", "Genesis 1:30-40"]}
        ).json()["results"]
        self.assertEqual(results[0]["sectionRefs"], ["Genesis 1"])
        self.assertEqual(results[0]["segmentRefs"], ["Genesis 1:1", "Genesis 1:2", "Genesis 1:3"])
        self.assertTrue(results[0]["heRef"])
        self.assertEqual(results[1]["sectionRefs"], ["Rashi on Genesis 1:1"])
        self.assertEqual(results[1]["segmentRefs"], ["Rashi on Genesis 1:1:1"])
        self.assertFalse(results[2]["ok"])
        self.assertFalse(results[3]["ok"])
        self.assertIn("'Genesis 1:32' does not exist", results[4]["error"])
