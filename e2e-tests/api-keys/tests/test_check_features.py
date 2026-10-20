"""Unit tests for check_features.py.

Run from the repository root:
    python3 -m unittest discover -s e2e-tests/api-keys/tests -t .

Every test builds a miniature repository (and, for POC scope, a real git repo) in a temp dir.
"""
import json
import os
import shutil
import subprocess
import sys
import tempfile
import unittest

TESTS_DIR = os.path.dirname(os.path.abspath(__file__))
API_DIR = os.path.dirname(TESTS_DIR)
sys.path.insert(0, API_DIR)

import check_features as cf  # noqa: E402

SCRIPT = os.path.join(API_DIR, "check_features.py")
POC_GLOB = "origin/feature/*/auth-service-poc-monthly-quota"
GIT_IDENTITY = {
    "GIT_AUTHOR_NAME": "t", "GIT_AUTHOR_EMAIL": "t@example.com",
    "GIT_COMMITTER_NAME": "t", "GIT_COMMITTER_EMAIL": "t@example.com",
}


def make_edge(eid, checks=None, **extra):
    edge = {"id": eid, "scenario": "a scenario", "expected": "an outcome", "severity": "P1",
            "checks": checks or []}
    edge.update(extra)
    return edge


def make_feature(fid, edges, status="on_branch", area="model"):
    return {"id": fid, "area": area, "title": "A feature", "status": status, "edge_cases": edges}


def make_doc(features, **extra):
    doc = {"schema_version": 1, "features": features}
    doc.update(extra)
    return doc


def git(cwd, *args):
    env = dict(os.environ, **GIT_IDENTITY)
    return subprocess.run(
        ["git", "-C", cwd, "-c", "commit.gpgsign=false", *args],
        stdout=subprocess.PIPE, stderr=subprocess.PIPE, env=env, encoding="utf-8", check=True,
    ).stdout


class RepoCase(unittest.TestCase):
    def setUp(self):
        self.root = tempfile.mkdtemp(prefix="check-features-")
        self.addCleanup(shutil.rmtree, self.root, True)

    def write(self, rel, text):
        path = os.path.join(self.root, rel)
        os.makedirs(os.path.dirname(path), exist_ok=True)
        with open(path, "w", encoding="utf-8") as handle:
            handle.write(text)
        return rel

    def evaluate(self, doc, **ctx_kwargs):
        return cf.evaluate(doc, cf.Context(self.root, **ctx_kwargs))

    def messages(self, findings):
        return [cf.format_finding(f) for f in findings]

    def init_git(self):
        git(self.root, "init", "-q")
        git(self.root, "add", "-A")
        git(self.root, "commit", "-q", "-m", "snapshot")


PYTEST_OK = "def test_tier_rejects_unknown():\n    assert True\n"


class EdgeRuleTests(RepoCase):
    def setUp(self):
        super().setUp()
        self.write("powered_by/tests/test_tier.py", PYTEST_OK + (
            "\n\nclass ApiKeyTierTest:\n"
            "    def test_check_constraint(self):\n        assert True\n"
            "\n\n@pytest.mark.failing\ndef test_gap_rate_limit():\n    assert False\n"
            "\n\ndef test_known_gap_drift():\n    assert False\n"
        ))
        self.ok_ref = "powered_by/tests/test_tier.py::test_tier_rejects_unknown"

    def test_valid_minimal_file_passes(self):
        doc = make_doc([make_feature("F-MODEL-01", [
            make_edge("F-MODEL-01.e1", [{"kind": "pytest", "ref": self.ok_ref}]),
        ])])
        failures, warnings, stats = self.evaluate(doc)
        self.assertEqual(failures, [])
        self.assertEqual(warnings, [])
        self.assertEqual(stats["edges"], 1)
        self.assertEqual(stats["checks_ok"], 1)

    def test_case_without_checks_fails(self):
        doc = make_doc([make_feature("F-MODEL-01", [make_edge("F-MODEL-01.e1")])])
        failures, _, _ = self.evaluate(doc)
        self.assertEqual(len(failures), 1)
        self.assertEqual(failures[0].edge, "F-MODEL-01.e1")
        self.assertIn("no resolvable check", failures[0].reason)

    def test_unknown_pytest_ref_fails(self):
        doc = make_doc([make_feature("F-MODEL-01", [
            make_edge("F-MODEL-01.e1", [{"kind": "pytest",
                                         "ref": "powered_by/tests/test_tier.py::test_gone"}]),
        ])])
        failures, _, _ = self.evaluate(doc)
        self.assertIn("MISSING F-MODEL-01.e1 pytest powered_by/tests/test_tier.py::test_gone: "
                      "no test test_gone in powered_by/tests/test_tier.py", self.messages(failures))

    def test_pytest_ref_in_class_resolves(self):
        ref = "powered_by/tests/test_tier.py::ApiKeyTierTest::test_check_constraint"
        doc = make_doc([make_feature("F-MODEL-01", [
            make_edge("F-MODEL-01.e1", [{"kind": "pytest", "ref": ref}]),
        ])])
        failures, _, _ = self.evaluate(doc)
        self.assertEqual(failures, [])

    def test_pytest_ref_to_wrong_class_fails(self):
        ref = "powered_by/tests/test_tier.py::OtherTest::test_check_constraint"
        doc = make_doc([make_feature("F-MODEL-01", [
            make_edge("F-MODEL-01.e1", [{"kind": "pytest", "ref": ref}]),
        ])])
        failures, _, _ = self.evaluate(doc)
        self.assertEqual(len(failures), 1)
        self.assertIn("no class OtherTest", failures[0].reason)

    def test_known_gap_test_cannot_prove_a_normal_case(self):
        ref = "powered_by/tests/test_tier.py::test_gap_rate_limit"
        doc = make_doc([make_feature("F-MODEL-01", [
            make_edge("F-MODEL-01.e1", [{"kind": "pytest", "ref": ref}]),
        ])])
        failures, _, _ = self.evaluate(doc)
        self.assertEqual(len(failures), 1)
        self.assertIn("only known-gap tests resolve", failures[0].reason)

    def test_unverified_wiki_check_does_not_rescue_a_known_gap_only_normal_case(self):
        gap = {"kind": "pytest", "ref": "powered_by/tests/test_tier.py::test_gap_rate_limit"}
        wiki = {"kind": "checks_json", "ref": "B10"}
        doc = make_doc([make_feature("F-MODEL-01", [make_edge("F-MODEL-01.e1", [gap, wiki])])])
        failures, _, _ = self.evaluate(doc, wiki_path=os.path.join(self.root, "absent.json"))
        self.assertEqual(len(failures), 1)
        self.assertIn("only known-gap tests resolve", failures[0].reason)

    def test_known_gap_case_must_cite_a_known_gap_test(self):
        normal = {"kind": "pytest", "ref": self.ok_ref}
        gap = {"kind": "pytest", "ref": "powered_by/tests/test_tier.py::test_known_gap_drift"}
        doc = make_doc([make_feature("F-MODEL-01", [
            make_edge("F-MODEL-01.e1", [normal], known_gap=True),
            make_edge("F-MODEL-01.e2", [gap], known_gap=True),
        ])])
        failures, _, _ = self.evaluate(doc)
        self.assertEqual([f.edge for f in failures], ["F-MODEL-01.e1"])
        self.assertIn("known-gap test", failures[0].reason)

    def test_on_branch_check_scoped_to_poc_does_not_prove(self):
        self.init_git()
        doc = make_doc([make_feature("F-MODEL-01", [
            make_edge("F-MODEL-01.e1", [{"kind": "pytest", "ref": self.ok_ref, "scope": "poc"}]),
        ])])
        failures, _, _ = self.evaluate(doc, poc_ref="HEAD")
        self.assertEqual(len(failures), 1)
        self.assertIn("poc-scope checks do not count", failures[0].reason)

    def test_schema_rejects_bad_shapes(self):
        base = make_edge("F-MODEL-01.e1", [{"kind": "pytest", "ref": self.ok_ref}])
        cases = {
            "unknown top key": make_doc([make_feature("F-MODEL-01", [base])], extra=1),
            "bad feature id": make_doc([make_feature("MODEL-1", [base])]),
            "bad status": make_doc([make_feature("F-MODEL-01", [base], status="later")]),
            "bad edge prefix": make_doc([make_feature("F-MODEL-01", [make_edge("F-OTHER-01.e1")])]),
            "unknown check kind": make_doc([make_feature("F-MODEL-01", [
                make_edge("F-MODEL-01.e1", [{"kind": "curl", "ref": "x"}])])]),
            "file check without contains": make_doc([make_feature("F-MODEL-01", [
                make_edge("F-MODEL-01.e1", [{"kind": "file", "ref": "README.md"}])])]),
            "contains on gotest": make_doc([make_feature("F-MODEL-01", [
                make_edge("F-MODEL-01.e1", [{"kind": "gotest", "ref": "d::TestX", "contains": "x"}])])]),
            "pytest ref too deep": make_doc([make_feature("F-MODEL-01", [
                make_edge("F-MODEL-01.e1", [{"kind": "pytest", "ref": "a::b::c::d"}])])]),
        }
        for label, doc in cases.items():
            with self.subTest(label):
                self.assertTrue(cf.validate_schema(doc), "expected a schema error")

    def test_duplicate_ids_fail(self):
        edge = make_edge("F-MODEL-01.e1", [{"kind": "pytest", "ref": self.ok_ref}])
        doc = make_doc([make_feature("F-MODEL-01", [edge]), make_feature("F-MODEL-01", [edge])])
        failures, _, _ = self.evaluate(doc)
        self.assertTrue(any("duplicate" in f.reason for f in failures))

    def test_planned_case_needs_tracking_and_is_counted(self):
        planned = make_edge("F-OUT-01.e2", tracking="FU-OUT-2", planned_check="outage drill in CI")
        doc = make_doc([make_feature("F-OUT-01", [planned], status="planned", area="outage")])
        failures, _, stats = self.evaluate(doc)
        self.assertEqual(failures, [])
        self.assertEqual(stats["planned"], {"FU-OUT-2": ["F-OUT-01.e2"]})
        bare = make_edge("F-OUT-01.e3")
        failures, _, _ = self.evaluate(make_doc([make_feature("F-OUT-01", [bare], status="planned")]))
        self.assertIn("needs tracking and planned_check", failures[0].reason)

    def test_no_planned_flag_fails_planned(self):
        planned = make_edge("F-OUT-01.e2", tracking="FU-OUT-2", planned_check="outage drill")
        doc = make_doc([make_feature("F-OUT-01", [planned], status="planned")])
        failures, _, _ = self.evaluate(doc, no_planned=True)
        self.assertEqual([f.reason for f in failures], ["planned case not allowed with --no-planned"])

    def test_must_map_orphan_test_fails(self):
        self.write("powered_by/tests/api_key_tier_model_test.py",
                   "def test_a():\n    pass\n\n\nclass TestTier:\n    def test_b(self):\n        pass\n")
        doc = make_doc([make_feature("F-MODEL-01", [make_edge("F-MODEL-01.e1", [
            {"kind": "pytest", "ref": "powered_by/tests/api_key_tier_model_test.py::test_a"}])])],
            must_map=["powered_by/tests/api_key_tier_*_test.py"])
        self.assertEqual(cf.must_map(doc, self.root), [
            "powered_by/tests/api_key_tier_model_test.py::test_a",
            "powered_by/tests/api_key_tier_model_test.py::test_b",
        ])
        failures, _, _ = self.evaluate(doc)
        self.assertEqual(len(failures), 1)
        self.assertIn("test_b", failures[0].ref)


class ResolverTests(RepoCase):
    def test_go_test_ref_resolves_and_build_tag_is_detected(self):
        self.write("auth-service/registry/registry_test.go", "package registry\n\nfunc TestRegistryLoads(t *testing.T) {}\n")
        self.write("auth-service/registry/gaps_test.go", "//go:build knowngaps\n\npackage registry\n\nfunc TestGapLimit(t *testing.T) {}\n")
        src = cf.LocalSource(self.root)
        owner = ("F-REG-01", "F-REG-01.e1")
        self.assertEqual(cf.resolve_gotest({"ref": "auth-service/registry::TestRegistryLoads"}, src, owner),
                         (True, "", False))
        self.assertEqual(cf.resolve_gotest({"ref": "auth-service/registry::TestGapLimit"}, src, owner),
                         (True, "", True))
        ok, reason, _ = cf.resolve_gotest({"ref": "auth-service/registry::TestMissing"}, src, owner)
        self.assertFalse(ok)
        self.assertIn("no func TestMissing", reason)

    def test_go_subtest_ref_needs_func_and_string_literal(self):
        self.write("auth-service/registry/sub_test.go",
                   'package registry\n\nfunc TestTiers(t *testing.T) {\n\tt.Run("partner tier", func(t *testing.T) {})\n}\n')
        src = cf.LocalSource(self.root)
        owner = ("F-REG-01", "F-REG-01.e1")
        self.assertEqual(cf.resolve_gotest({"ref": "auth-service/registry::TestTiers/partner tier"}, src, owner),
                         (True, "", False))
        ok, reason, _ = cf.resolve_gotest({"ref": "auth-service/registry::TestTiers/ghost"}, src, owner)
        self.assertFalse(ok)
        self.assertIn("no subtest", reason)
        ok, reason, _ = cf.resolve_gotest({"ref": "auth-service/registry::TestNope/partner tier"}, src, owner)
        self.assertFalse(ok)
        self.assertIn("no func TestNope", reason)

    def test_playwright_skip_and_only_calls_resolve(self):
        self.write("e2e-tests/api-keys/ui/skips.spec.ts",
                   "test.skip('Skipped title', async () => {});\n"
                   "test.only('Only title', async () => {});\n"
                   "test.skip('Gap title @known-gap', async () => {});\n")
        src = cf.LocalSource(self.root)
        owner = ("F-WRITE-01", "F-WRITE-01.e1")
        path = "e2e-tests/api-keys/ui/skips.spec.ts"
        self.assertEqual(cf.resolve_playwright({"ref": path + "::Skipped title"}, src, owner), (True, "", False))
        self.assertEqual(cf.resolve_playwright({"ref": path + "::Only title"}, src, owner)[0], True)
        self.assertEqual(cf.resolve_playwright({"ref": path + "::Gap title"}, src, owner)[2], True)

    def test_default_demo_script_is_checked_even_when_uncited(self):
        self.write("auth-service/scripts/demo.sh", DEMO_SCRIPT.replace(
            "  prove F-MODEL-01.e1\n", "  prove F-MODEL-01.e1\n  prove F-GHOST-01.e9\n", 1).replace("section_quota\n", "", 1))
        self.write("powered_by/tests/test_tier.py", PYTEST_OK)
        doc = make_doc([make_feature("F-MODEL-01", [make_edge("F-MODEL-01.e1", [
            {"kind": "pytest", "ref": "powered_by/tests/test_tier.py::test_tier_rejects_unknown"}])])])
        failures, _, _ = self.evaluate(doc)
        messages = self.messages(failures)
        self.assertTrue(any("F-GHOST-01.e9 names no feature" in m for m in messages), messages)
        self.assertTrue(any("--list-sections printed" in m for m in messages), messages)

    def test_playwright_title_prefix_resolves(self):
        self.write("e2e-tests/api-keys/ui/keys.spec.ts",
                   "test('Admin can create a key', async () => {});\n"
                   "test.fixme(`Tier ${tier} shows a badge`, async () => {});\n"
                   "test('Gateway rate limit @known-gap', async () => {});\n")
        src = cf.LocalSource(self.root)
        owner = ("F-WRITE-01", "F-WRITE-01.e1")
        path = "e2e-tests/api-keys/ui/keys.spec.ts"
        self.assertEqual(cf.resolve_playwright({"ref": path + "::Admin can create"}, src, owner)[0], True)
        self.assertEqual(cf.resolve_playwright({"ref": path + "::Tier "}, src, owner)[0], True)
        self.assertEqual(cf.resolve_playwright({"ref": path + "::Gateway rate limit"}, src, owner)[2], True)
        self.assertFalse(cf.resolve_playwright({"ref": path + "::Admin deletes"}, src, owner)[0])

    def test_drill_marker_and_known_gap_tag(self):
        self.write("auth-service/drills/outage.sh", "#!/usr/bin/env bash\necho ready\n")
        self.write("auth-service/drills/redis_known.sh", "#!/usr/bin/env bash\n")
        src = cf.LocalSource(self.root)
        owner = ("F-OUT-01", "F-OUT-01.e1")
        self.assertEqual(cf.resolve_drill({"ref": "auth-service/drills/outage.sh#ready"}, src, owner),
                         (True, "", False))
        self.assertFalse(cf.resolve_drill({"ref": "auth-service/drills/outage.sh#absent"}, src, owner)[0])
        self.assertTrue(cf.resolve_drill({"ref": "auth-service/drills/redis_known.sh"}, src, owner)[2])

    def test_shell_check_needs_bash_shebang_or_executable_bit(self):
        self.write("scripts/run.sh", "#!/usr/bin/env bash\n")
        self.write("scripts/notes.txt", "not a script\n")
        src = cf.LocalSource(self.root)
        owner = ("F-DEMO-01", "F-DEMO-01.e1")
        self.assertTrue(cf.resolve_shell({"ref": "scripts/run.sh"}, src, owner)[0])
        self.assertFalse(cf.resolve_shell({"ref": "scripts/notes.txt"}, src, owner)[0])

    def test_file_check_and_generic_contains_must_match(self):
        self.write("docs/api.md", "The tier column is restricted.\n")
        doc = make_doc([make_feature("F-LIST-01", [
            make_edge("F-LIST-01.e1", [{"kind": "file", "ref": "docs/api.md", "contains": "tier column"}]),
            make_edge("F-LIST-01.e2", [{"kind": "file", "ref": "docs/api.md", "contains": "^gold$"}]),
        ])])
        failures, _, _ = self.evaluate(doc)
        self.assertEqual([f.edge for f in failures], ["F-LIST-01.e2"])

    def test_demo_section_must_prove_the_id(self):
        self.write("auth-service/scripts/demo.sh", DEMO_SCRIPT)
        doc = make_doc([
            make_feature("F-MODEL-01", [make_edge("F-MODEL-01.e1", [
                {"kind": "demo", "ref": "auth-service/scripts/demo.sh::section_model"}])]),
            make_feature("F-QUOTA-01", [make_edge("F-QUOTA-01.e1", [
                {"kind": "demo", "ref": "auth-service/scripts/demo.sh::section_model"}])]),
        ])
        failures, _, _ = self.evaluate(doc)
        self.assertEqual([f.edge for f in failures], ["F-QUOTA-01.e1"])
        self.assertIn("does not prove F-QUOTA-01.e1", failures[0].reason)

    def test_demo_section_proving_only_the_feature_id_does_not_prove_an_edge(self):
        self.write("auth-service/scripts/demo.sh", DEMO_SCRIPT.replace("prove F-MODEL-01.e1", "prove F-MODEL-01"))
        doc = make_doc([make_feature("F-MODEL-01", [make_edge("F-MODEL-01.e1", [
            {"kind": "demo", "ref": "auth-service/scripts/demo.sh::section_model"}])]),
            make_feature("F-QUOTA-01", [make_edge("F-QUOTA-01.e1", [
                {"kind": "demo", "ref": "auth-service/scripts/demo.sh::section_quota"}])])])
        failures, _, _ = self.evaluate(doc)
        self.assertEqual([f.edge for f in failures], ["F-MODEL-01.e1"])
        self.assertIn("does not prove F-MODEL-01.e1", failures[0].reason)

    def test_demo_prove_of_unknown_id_fails(self):
        self.write("auth-service/scripts/demo.sh", DEMO_SCRIPT.replace(
            "  prove F-MODEL-01.e1\n", "  prove F-MODEL-01.e1\n  prove F-GHOST-01.e9\n", 1))
        doc = make_doc([make_feature("F-MODEL-01", [make_edge("F-MODEL-01.e1", [
            {"kind": "demo", "ref": "auth-service/scripts/demo.sh::section_model"}])])])
        failures, _, _ = self.evaluate(doc)
        self.assertIn("MISSING - demo auth-service/scripts/demo.sh: prove F-GHOST-01.e9 names no feature or edge id",
                      self.messages(failures))

    def test_demo_list_sections_must_agree_with_parsed_sections(self):
        self.write("auth-service/scripts/demo.sh", DEMO_SCRIPT.replace("section_quota\n", "", 1))
        doc = make_doc([make_feature("F-MODEL-01", [make_edge("F-MODEL-01.e1", [
            {"kind": "demo", "ref": "auth-service/scripts/demo.sh::section_model"}])])])
        failures, _, _ = self.evaluate(doc)
        self.assertTrue(any("--list-sections printed" in f.reason for f in failures))

    def test_demo_prove_outside_a_section_is_ignored(self):
        text = "prove F-MODEL-01.e1\nsection_model() {\n  echo hi\n}\nsection_quota() {\n  prove F-QUOTA-01.e1\n}\n"
        self.assertEqual(cf.demo_sections(text), {"section_model": [], "section_quota": ["F-QUOTA-01.e1"]})
        self.assertEqual(cf.demo_prove_ids(text), {"F-QUOTA-01.e1"})

    def test_wiki_check_ref_warns_when_file_missing(self):
        self.write("powered_by/tests/test_tier.py", PYTEST_OK)
        doc = make_doc([make_feature("F-MODEL-01", [make_edge("F-MODEL-01.e1", [
            {"kind": "pytest", "ref": "powered_by/tests/test_tier.py::test_tier_rejects_unknown"},
            {"kind": "checks_json", "ref": "B10"},
        ])])])
        wiki = os.path.join(self.root, "absent.json")
        failures, warnings, _ = self.evaluate(doc, wiki_path=wiki)
        self.assertEqual(failures, [])
        self.assertEqual(len(warnings), 1)
        self.assertIn("wiki checks.json absent", warnings[0].reason)

    def test_wiki_check_ref_fails_with_require_wiki(self):
        doc = make_doc([make_feature("F-MODEL-01", [make_edge("F-MODEL-01.e1", [
            {"kind": "checks_json", "ref": "B10"}])])])
        failures, _, _ = self.evaluate(doc, wiki_path=os.path.join(self.root, "absent.json"),
                                       require_wiki=True)
        self.assertIn("wiki checks.json not found", failures[0].reason)

    def test_wiki_check_ref_resolves_from_file(self):
        wiki = self.write("checks.json", json.dumps({"checks": [{"id": "B10"}, {"id": "B13", "known_gap": True}]}))
        self.assertEqual(cf.resolve_checks_json({"ref": "B10"}, os.path.join(self.root, wiki), False),
                         (True, "", False))
        self.assertFalse(cf.resolve_checks_json({"ref": "B99"}, os.path.join(self.root, wiki), False)[0])


DEMO_SCRIPT = """#!/usr/bin/env bash
if [ "${1:-}" = "--list-sections" ]; then
  printf '%s\\n' section_model section_quota
  exit 0
fi
section_model() {
  prove F-MODEL-01.e1
}
section_quota() {
  prove F-QUOTA-01.e1
}
"""


class PocScopeTests(RepoCase):
    def setUp(self):
        super().setUp()
        self.write("powered_by/tests/test_tier.py", PYTEST_OK)
        self.init_git()
        self.write("powered_by/tests/test_local_only.py", PYTEST_OK)

    def poc_doc(self, poc_ref_path):
        return make_doc([make_feature("F-QUOTA-01", [
            make_edge("F-QUOTA-01.e1", [{"kind": "pytest", "ref": poc_ref_path, "scope": "poc"}]),
        ], status="poc_only")])

    def test_poc_scope_ref_resolves_via_git(self):
        committed = "powered_by/tests/test_tier.py::test_tier_rejects_unknown"
        failures, _, _ = self.evaluate(self.poc_doc(committed), poc_ref="HEAD")
        self.assertEqual(failures, [])
        uncommitted = "powered_by/tests/test_local_only.py::test_tier_rejects_unknown"
        failures, _, _ = self.evaluate(self.poc_doc(uncommitted), poc_ref="HEAD")
        self.assertIn("file not found", failures[0].reason)

    def test_poc_scope_missing_ref_fails_and_offline_poc_downgrades(self):
        doc = self.poc_doc("powered_by/tests/test_tier.py::test_tier_rejects_unknown")
        failures, _, _ = self.evaluate(doc, poc_ref="no-such-ref")
        self.assertIn("POC ref unavailable", failures[0].reason)
        failures, warnings, stats = self.evaluate(doc, poc_ref="no-such-ref", offline_poc=True)
        self.assertEqual(failures, [])
        self.assertEqual(len(warnings), 1)
        self.assertEqual(stats["checks_unverified"], 1)

    def test_poc_ref_from_glob_needs_exactly_one_branch(self):
        self.assertEqual(cf.resolve_poc_ref(self.root, None, POC_GLOB)[0], None)
        feature_a = "origin/feature/branch-a/auth-service-poc-monthly-quota"
        git(self.root, "update-ref", "refs/remotes/" + feature_a, "HEAD")
        self.assertEqual(cf.resolve_poc_ref(self.root, None, POC_GLOB), (feature_a, ""))
        git(self.root, "update-ref", "refs/remotes/origin/feature/branch-b/auth-service-poc-monthly-quota", "HEAD")
        ref, reason = cf.resolve_poc_ref(self.root, None, POC_GLOB)
        self.assertIsNone(ref)
        self.assertIn("2 remote branches", reason)

    def test_explicit_poc_ref_wins_over_glob(self):
        ref, _ = cf.resolve_poc_ref(self.root, "HEAD", POC_GLOB)
        self.assertEqual(ref, "HEAD")


class CliTests(RepoCase):
    def run_cli(self, *args):
        env = {k: v for k, v in os.environ.items() if k not in ("API_KEYS_POC_REF", "API_KEY_CHECKS_JSON")}
        env["API_KEY_CHECKS_JSON"] = os.path.join(self.root, "no-wiki.json")
        return subprocess.run(
            [sys.executable, SCRIPT, "--root", self.root, *args],
            stdout=subprocess.PIPE, stderr=subprocess.PIPE, encoding="utf-8", env=env, check=False,
        )

    def write_features(self, doc, name="features.json"):
        return self.write(name, json.dumps(doc))

    def test_cli_exit_codes_and_missing_refs_are_listed(self):
        self.write("powered_by/tests/test_tier.py", PYTEST_OK)
        ok_ref = "powered_by/tests/test_tier.py::test_tier_rejects_unknown"
        gone_ref = "powered_by/tests/test_tier.py::test_gone"
        doc = make_doc([make_feature("F-MODEL-01", [
            make_edge("F-MODEL-01.e1", [{"kind": "pytest", "ref": ok_ref}]),
            make_edge("F-MODEL-01.e2", [{"kind": "pytest", "ref": gone_ref}]),
        ])])
        path = self.write_features(doc)
        proc = self.run_cli("--features", os.path.join(self.root, path), "--strict")
        self.assertEqual(proc.returncode, 1, proc.stderr)
        self.assertIn(f"MISSING F-MODEL-01.e2 pytest {gone_ref}: no test test_gone", proc.stdout)

        doc["features"][0]["edge_cases"].pop()
        path = self.write_features(doc)
        proc = self.run_cli("--features", os.path.join(self.root, path), "--strict")
        self.assertEqual(proc.returncode, 0, proc.stdout + proc.stderr)

        proc = self.run_cli("--features", os.path.join(self.root, "missing.json"))
        self.assertEqual(proc.returncode, 2)

        bad = self.write("broken.json", "{not json")
        proc = self.run_cli("--features", os.path.join(self.root, bad))
        self.assertEqual(proc.returncode, 2)

    def test_strict_keeps_offline_poc_warnings_as_warnings(self):
        self.write("powered_by/tests/test_tier.py", PYTEST_OK)
        self.init_git()
        doc = make_doc([make_feature("F-QUOTA-01", [make_edge("F-QUOTA-01.e1", [
            {"kind": "pytest", "ref": "powered_by/tests/test_tier.py::test_tier_rejects_unknown",
             "scope": "poc"}])], status="poc_only")])
        path = os.path.join(self.root, self.write_features(doc))
        proc = self.run_cli("--features", path, "--strict", "--offline-poc", "--poc-ref", "no-such-ref", "--summary")
        self.assertEqual(proc.returncode, 0, proc.stdout + proc.stderr)
        self.assertIn("WARN", proc.stdout)
        self.assertIn("0 error(s), 1 warning(s)", proc.stdout)
        self.assertIn("unverified: 1", proc.stdout)

    def test_strict_does_not_escalate_missing_wiki_but_require_wiki_does(self):
        doc = make_doc([make_feature("F-MODEL-01", [make_edge("F-MODEL-01.e1", [
            {"kind": "checks_json", "ref": "B10"}])])])
        path = os.path.join(self.root, self.write_features(doc))
        self.assertEqual(self.run_cli("--features", path, "--strict").returncode, 0)
        strict = self.run_cli("--features", path, "--strict", "--require-wiki")
        self.assertEqual(strict.returncode, 1)
        self.assertIn("wiki checks.json not found", strict.stdout)

    def test_poc_ref_env_var_is_used_by_main(self):
        self.write("powered_by/tests/test_tier.py", PYTEST_OK)
        self.init_git()
        doc = make_doc([make_feature("F-QUOTA-01", [make_edge("F-QUOTA-01.e1", [
            {"kind": "pytest", "ref": "powered_by/tests/test_tier.py::test_tier_rejects_unknown",
             "scope": "poc"}])], status="poc_only")])
        path = os.path.join(self.root, self.write_features(doc))
        env = dict(os.environ, API_KEYS_POC_REF="HEAD", API_KEY_CHECKS_JSON=os.path.join(self.root, "none.json"))
        proc = subprocess.run([sys.executable, SCRIPT, "--root", self.root, "--features", path],
                              stdout=subprocess.PIPE, stderr=subprocess.PIPE, encoding="utf-8", env=env, check=False)
        self.assertEqual(proc.returncode, 0, proc.stdout + proc.stderr)
        env["API_KEYS_POC_REF"] = "no-such-ref"
        proc = subprocess.run([sys.executable, SCRIPT, "--root", self.root, "--features", path],
                              stdout=subprocess.PIPE, stderr=subprocess.PIPE, encoding="utf-8", env=env, check=False)
        self.assertEqual(proc.returncode, 1)
        self.assertIn("POC ref unavailable", proc.stdout)

    def test_json_report_flag(self):
        doc = make_doc([make_feature("F-MODEL-01", [make_edge("F-MODEL-01.e1")])])
        path = self.write_features(doc)
        proc = self.run_cli("--features", os.path.join(self.root, path), "--json")
        self.assertEqual(proc.returncode, 1)
        payload = json.loads(proc.stdout)
        self.assertEqual(payload["failures"][0]["edge"], "F-MODEL-01.e1")
        self.assertEqual(payload["stats"]["edges"], 1)

    def test_summary_lists_planned_by_tracking_id(self):
        doc = make_doc([
            make_feature("F-MODEL-01", [make_edge("F-MODEL-01.e1", [
                {"kind": "checks_json", "ref": "B10"}, {"kind": "pytest", "ref": "x.py::test_y"}])]),
            make_feature("F-OUT-01", [make_edge("F-OUT-01.e2", tracking="FU-OUT-2",
                                                planned_check="outage drill")], status="planned", area="outage"),
        ])
        path = self.write_features(doc)
        proc = self.run_cli("--features", os.path.join(self.root, path), "--summary")
        self.assertIn("FU-OUT-2: F-OUT-01.e2", proc.stdout)
        self.assertIn("planned=1", proc.stdout)


if __name__ == "__main__":
    unittest.main()
