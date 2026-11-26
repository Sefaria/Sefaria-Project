"""Standalone checker regression tests: stdlib only, no external requests."""

import importlib.util
import json
import unittest
from pathlib import Path
from unittest.mock import patch

spec = importlib.util.spec_from_file_location(
    "checker", Path(__file__).resolve().parents[1] / "check_semantic_search.py"
)
checker = importlib.util.module_from_spec(spec)
spec.loader.exec_module(checker)


def result(**changes):
    return dict(
        {
            "ref": "Genesis 1:1",
            "url": "Genesis.1.1",
            "index_title": "Genesis",
            "language": "en",
            "version_title": "Test",
            "text": "Test text",
            "primary_category": "Tanakh",
            "all_categories": ["Tanakh"],
        },
        **changes,
    )


class CheckerTests(unittest.TestCase):
    def test_token_environment_precedence(self):
        with patch.dict(
            checker.os.environ, {"SEFARIA_KNN_AUTH_TOKEN": "checker", "SEMANTIC_SEARCH_API_TOKEN": "server"}, clear=True
        ):
            self.assertEqual(checker.load_token(), "checker")
        with patch.dict(checker.os.environ, {"SEMANTIC_SEARCH_API_TOKEN": "server"}, clear=True):
            self.assertEqual(checker.load_token(), "server")

    def test_local_token_is_parsed_without_executing_settings(self):
        import tempfile

        with tempfile.TemporaryDirectory() as directory, patch.dict(checker.os.environ, {}, clear=True):
            path = Path(directory) / "local_settings.py"
            path.write_text(
                "raise RuntimeError('must never execute')\n"
                "SEMANTIC_SEARCH_API_TOKEN = os.environ.get('SEMANTIC_SEARCH_API_TOKEN') or 'fake-token'\n"
            )
            self.assertEqual(checker.load_token(path), "fake-token")
            path.write_text("SEMANTIC_SEARCH_API_TOKEN = dangerous_function()\n")
            self.assertIsNone(checker.load_token(path))
            path.write_text("SEMANTIC_SEARCH_API_TOKEN = ''\n")
            self.assertIsNone(checker.load_token(path))

    def test_missing_or_legacy_header_fails_new_expectation(self):
        for backend in (None, "legacy"):
            with self.subTest(backend=backend), self.assertRaises(ValueError):
                checker.validate(
                    {"results": [result()]}, checker.payload_for(checker.CASES[0]), 200, 200, backend, "new"
                )

    def test_old_baseline_can_be_captured_without_header(self):
        checker.validate({"results": [result()]}, checker.payload_for(checker.CASES[0]), 200, 200, None, "any")

    def test_empty_results_and_filter_violation_fail(self):
        payload = checker.payload_for({"query": "x", "filters": {"language": "he"}})
        for rows in ([], [result()]):
            with self.assertRaises(ValueError):
                checker.validate({"results": rows}, payload, 200, 200, "new", "new")

    def test_metadata_only_rejects_text(self):
        payload = checker.payload_for({"query": "x", "include_text": False})
        with self.assertRaises(ValueError):
            checker.validate({"results": [result()]}, payload, 200, 200, "new", "new")
        row = result()
        del row["text"]
        checker.validate({"results": [row]}, payload, 200, 200, "new", "new")

    def test_limit_and_malformed_linked_chunks_fail(self):
        with self.assertRaises(ValueError):
            checker.validate(
                {"results": [result(), result()]},
                checker.payload_for({"query": "x", "result_limit": 1}),
                200,
                200,
                "new",
                "new",
            )
        with self.assertRaises(ValueError):
            checker.validate(
                {
                    "results": [result()],
                    "linked_refs": [
                        {
                            "ref": "Avot 1:1",
                            "text": "text",
                            "text_source": "linked_ref_semantic_chunk",
                            "linked_ref_parent": "Avot 1",
                            "linked_ref_chunk_number": 3,
                            "linked_ref_chunk_count": 2,
                        }
                    ],
                },
                checker.payload_for({"query": "x", "include_linked_refs": True}),
                200,
                200,
                "new",
                "new",
            )

    def test_negative_cases_require_expected_status_and_error_body(self):
        checker.validate({"error": "Unauthorized"}, {}, 401, 401, None, "new")
        for body, status in [({}, 401), ({"error": "oops"}, 500)]:
            with self.assertRaises(ValueError):
                checker.validate(body, {}, status, 401, None, "new")

    def test_complete_run_and_before_after_changes(self):
        calls = []

        def send(url, payload, token, timeout, api_key=None):
            calls.append((payload, token))
            if token is None:
                return 401, None, {"error": "Unauthorized"}
            if not payload["query"]:
                return 400, None, {"error": "Empty query"}
            row = result(**payload.get("filters", {}))
            if not payload["include_text"]:
                del row["text"]
            return 200, "new", {"results": [row], "linked_refs": []}

        checks = checker.run_checks("https://example.test", "fake", "new", 1, 30, send=send)
        self.assertEqual(len(checks), 10)
        self.assertTrue(all(c["ok"] for c in checks))
        self.assertIsNone(calls[-1][1])
        comparison = checker.compare({"checks": checks}, checks)
        self.assertTrue(all(c["same_order_and_text"] for c in comparison))
        import copy

        changed = copy.deepcopy(checks)
        changed[0]["results"][0]["text_sha256"] = "different"
        self.assertFalse(checker.compare({"checks": checks}, changed)[0]["same_order_and_text"])

    def test_budget_exhaustion_fails_unexecuted_cases(self):
        with patch.object(checker.time, "monotonic", side_effect=[0] + [2] * 10):
            checks = checker.run_checks(
                "https://example.test", "fake", "new", 1, 1, send=lambda *a: self.fail("Must not send")
            )
        self.assertTrue(all(not c["ok"] for c in checks))

    def test_api_key_goes_with_the_bearer_on_authenticated_cases_only(self):
        sent = []

        def send(url, payload, token, timeout, api_key=None):
            sent.append((token, api_key))
            if token is None:
                return 401, None, {"error": "Unauthorized"}
            if not payload["query"]:
                return 400, None, {"error": "Empty query"}
            row = result(**payload.get("filters", {}))
            if not payload["include_text"]:
                del row["text"]
            return 200, "new", {"results": [row], "linked_refs": []}

        checks = checker.run_checks("https://example.test", "fake", "new", 1, 30, send=send, api_key="sfr_fake")
        self.assertTrue(all(c["ok"] for c in checks))
        self.assertEqual(sent[-1], (None, None))
        self.assertTrue(all(pair == ("fake", "sfr_fake") for pair in sent[:-1]))

    def test_request_sends_api_key_header_only_when_given(self):
        import io

        captured = []

        class Response(io.BytesIO):
            code = 200
            headers = {}

        class Opener:
            def open(self, request, timeout):
                captured.append(request)
                return Response(b"{}")

        with patch.object(checker.urllib.request, "build_opener", return_value=Opener()):
            checker.request_json("https://www.sefaria.org/api/knn-search", {}, "fake", 1, api_key="sfr_fake")
            checker.request_json("https://www.sefaria.org/api/knn-search", {}, "fake", 1)
        self.assertEqual(captured[0].get_header("X-api-key"), "sfr_fake")
        self.assertEqual(captured[0].get_header("Authorization"), "Bearer fake")
        self.assertIsNone(captured[1].get_header("X-api-key"))

    def test_sefaria_hosts(self):
        for host in ("www.sefaria.org", "sefaria.org.il", "www.sefariapreprod-il.org", "x.cauldron.sefaria.org"):
            self.assertTrue(checker.is_sefaria_host(host), host)
        for host in ("example.test", "sefaria.org.evil.test", "notsefaria.org", "localhost", None):
            self.assertFalse(checker.is_sefaria_host(host), host)

    def test_api_key_is_not_sent_to_other_hosts(self):
        import tempfile

        seen = {}

        def fake_run_checks(url, token, expected_backend, timeout, budget, api_key=None):
            seen["api_key"] = api_key
            return []

        with (
            tempfile.TemporaryDirectory() as directory,
            patch.dict(
                checker.os.environ, {"SEMANTIC_SEARCH_API_TOKEN": "fake", "SEFARIA_API_KEY": "sfr_fake"}, clear=True
            ),
            patch.object(checker, "run_checks", fake_run_checks),
        ):
            for url, expected in (
                ("https://www.sefaria.org/api/knn-search", "sfr_fake"),
                ("http://localhost:8000/api/knn-search", None),
                ("https://example.test/api/knn-search", None),
            ):
                output = Path(directory) / f"{len(seen)}-{expected}.json"
                checker.main(["--api-url", url, "--label", "t", "--output", str(output)])
                self.assertEqual(seen["api_key"], expected, url)
                self.assertEqual(json.loads(output.read_text())["api_key_sent"], expected is not None)
                output.unlink()

    def test_redirect_is_not_followed(self):
        self.assertIsNone(checker.NoRedirect().redirect_request(None, None, 302, "", {}, "https://other.test"))


if __name__ == "__main__":
    unittest.main()
