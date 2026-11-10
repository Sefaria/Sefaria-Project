#!/usr/bin/env python3
"""Tests of the env file reader in release_lib.py (env-get, env-flag-off, env-images, auth-service-enabled): every read
fails closed. Run by tests/run-tests.sh with the suite's Python (PyYAML needed); no cluster.
    python3 tests/test_env_reader.py [PATH_TO_release_lib.py [PATH_TO_envs/prod/helmrelease.yaml]]
"""

import subprocess
import sys
import unittest
from pathlib import Path

HERE = Path(__file__).resolve().parent
LIB = Path(sys.argv[1]) if len(sys.argv) > 1 else HERE.parent / "release_lib.py"
REAL_ENV = Path(sys.argv[2]) if len(sys.argv) > 2 else None
del sys.argv[1:]


def doc(values="", chart_version='"0.92.4"'):
    """A minimal HelmRelease whose spec.values is the indented `values` text."""
    return (
        "apiVersion: helm.toolkit.fluxcd.io/v2\nkind: HelmRelease\nmetadata:\n  name: x\n"
        f"spec:\n  chart:\n    spec:\n      version: {chart_version}\n  values:\n{values}"
    )


def run(args, text):
    p = subprocess.run([sys.executable, str(LIB), *args], input=text, capture_output=True, text=True)
    return p.returncode, p.stdout.rstrip("\n"), p.stderr.strip()


def get(path, kind, text):
    return run(["env-get", path, "--type", kind], text)


def flag(text, path="spec.values.localSettings.DEVELOPER_SETTINGS_ENABLED"):
    return run(["env-flag-off", path], text)


def auth(enabled_line):
    return doc(f"    authService:\n      {enabled_line}\n")


class Booleans(unittest.TestCase):
    def read(self, line):
        return run(["auth-service-enabled"], auth(line))

    def test_yaml_true_and_false(self):
        self.assertEqual(self.read("enabled: true"), (0, "true", ""))
        self.assertEqual(self.read("enabled: false"), (0, "false", ""))

    def test_case_variants_yaml_allows(self):
        for text, want in (("True", "true"), ("TRUE", "true"), ("False", "false"), ("FALSE", "false")):
            self.assertEqual(self.read(f"enabled: {text}")[:2], (0, want), text)

    def test_trailing_comment(self):
        self.assertEqual(self.read("enabled: true  # flip at the prod switch")[:2], (0, "true"))

    def test_quoted_strings_are_an_error_not_a_guess(self):
        for line in ('enabled: "true"', "enabled: 'false'", 'enabled: "True"'):
            rc, out, err = self.read(line)
            self.assertEqual((rc, out), (2, ""), line)
            self.assertIn("expected bool", err)

    def test_other_non_booleans_are_an_error(self):
        for line in ("enabled: 1", "enabled: 0", "enabled:", "enabled: [true]", 'enabled: ""'):
            self.assertEqual(self.read(line)[0], 2, line)

    def test_missing_key_or_section_is_an_error(self):
        rc, _, err = run(["auth-service-enabled"], doc("    authService:\n      image: {}\n"))
        self.assertEqual(rc, 2)
        self.assertIn("spec.values.authService.enabled is missing", err)
        self.assertEqual(run(["auth-service-enabled"], doc("    web:\n      enabled: true\n"))[0], 2)

    def test_the_value_of_another_section_is_not_mistaken_for_it(self):
        text = doc("    web:\n      enabled: true\n    authService:\n      enabled: false\n")
        self.assertEqual(run(["auth-service-enabled"], text)[:2], (0, "false"))


class Unreadable(unittest.TestCase):
    def test_invalid_yaml(self):
        rc, _, err = get("spec.chart.spec.version", "str", "spec:\n  chart: [unclosed\n  : :\n\t- x")
        self.assertEqual(rc, 2)
        self.assertIn("not valid YAML", err)

    def test_empty_input(self):
        for text in ("", "   \n"):
            self.assertEqual(get("spec.chart.spec.version", "str", text)[0], 2)

    def test_not_a_helmrelease(self):
        self.assertEqual(get("spec.a", "str", "kind: ConfigMap\nspec:\n  a: b\n")[0], 2)
        self.assertEqual(get("spec.a", "str", "- just\n- a list\n")[0], 2)

    def test_two_helmreleases_are_an_error(self):
        text = doc("    a: b\n") + "---\n" + doc("    a: c\n")
        self.assertEqual(get("spec.values.a", "str", text)[0], 2)

    def test_a_duplicate_key_is_an_error_not_the_last_one(self):
        rc, _, err = get("spec.values.a", "str", doc("    a: one\n    a: two\n"))
        self.assertEqual(rc, 2)
        self.assertIn("duplicate key", err)

    def test_missing_path(self):
        rc, _, err = get("spec.values.nope.deeper", "str", doc("    a: b\n"))
        self.assertEqual(rc, 2)
        self.assertIn("spec.values.nope is missing", err)

    def test_path_through_a_scalar(self):
        self.assertEqual(get("spec.values.a.b", "str", doc("    a: b\n"))[0], 2)


class Strings(unittest.TestCase):
    def tag(self, line, kind="str"):
        return get(
            "spec.values.web.containerImage.tag", kind, doc(f"    web:\n      containerImage:\n        {line}\n")
        )

    def test_plain_double_and_single_quoted(self):
        for line in ("tag: v7.11.3", 'tag: "v7.11.3"', "tag: 'v7.11.3'"):
            self.assertEqual(self.tag(line), (0, "v7.11.3", ""), line)

    def test_trailing_comment(self):
        for line in ('tag: "v7.11.3" # staging', "tag: 'v7.11.3'  # staging", "tag: v7.11.3 # staging"):
            self.assertEqual(self.tag(line), (0, "v7.11.3", ""), line)

    def test_a_hash_inside_quotes_is_part_of_the_value(self):
        self.assertEqual(self.tag('tag: "v1#2"'), (0, "v1#2", ""))

    def test_empty_is_an_error_unless_allowed(self):
        self.assertEqual(self.tag('tag: ""')[0], 2)
        self.assertEqual(self.tag('tag: ""', "str-or-empty"), (0, "", ""))

    def test_a_number_or_null_is_not_a_string(self):
        for line in ("tag: 7.11", "tag: 7", "tag:", "tag: true"):
            for kind in ("str", "str-or-empty"):
                self.assertEqual(self.tag(line, kind)[0], 2, (line, kind))

    def test_chart_version(self):
        self.assertEqual(get("spec.chart.spec.version", "str", doc(chart_version="0.92"))[0], 2)  # a float
        self.assertEqual(get("spec.chart.spec.version", "str", doc(chart_version='"0.92.4"')), (0, "0.92.4", ""))

    def test_unknown_type(self):
        self.assertEqual(run(["env-get", "spec.values", "--type", "int"], doc("    a: b\n"))[0], 2)


class DeveloperSettings(unittest.TestCase):
    def read(self, line):
        return flag(doc(f"    localSettings:\n      {line}\n"))

    def test_explicit_false_is_off(self):
        for line in (
            'DEVELOPER_SETTINGS_ENABLED: "False"',
            'DEVELOPER_SETTINGS_ENABLED: "false"',
            'DEVELOPER_SETTINGS_ENABLED: "0"',
            "DEVELOPER_SETTINGS_ENABLED: false",
            "DEVELOPER_SETTINGS_ENABLED: False",
            "DEVELOPER_SETTINGS_ENABLED: 0",
            "DEVELOPER_SETTINGS_ENABLED: 'False'",
            'DEVELOPER_SETTINGS_ENABLED: "False"  # off until prod runs it',
        ):
            self.assertEqual(self.read(line)[0], 0, line)

    def test_anything_else_is_not_off(self):
        for line in (
            'DEVELOPER_SETTINGS_ENABLED: "True"',
            "DEVELOPER_SETTINGS_ENABLED: true",
            "DEVELOPER_SETTINGS_ENABLED: 'True'",
            'DEVELOPER_SETTINGS_ENABLED: "1"',
            "DEVELOPER_SETTINGS_ENABLED: 1",
            'DEVELOPER_SETTINGS_ENABLED: ""',
            'DEVELOPER_SETTINGS_ENABLED: "no"',
            'DEVELOPER_SETTINGS_ENABLED: "off"',
        ):
            self.assertEqual(self.read(line)[0], 1, line)

    def test_missing_null_or_unreadable_is_an_error(self):
        self.assertEqual(self.read("OTHER: x")[0], 2)
        self.assertEqual(self.read("DEVELOPER_SETTINGS_ENABLED:")[0], 2)
        self.assertEqual(self.read("# DEVELOPER_SETTINGS_ENABLED: False")[0], 2)
        self.assertEqual(flag("")[0], 2)
        self.assertEqual(flag("not: [valid")[0], 2)

    def test_a_comment_is_not_an_entry(self):
        text = doc(
            "    localSettings:\n      # DEVELOPER_SETTINGS_ENABLED: False\n      DEVELOPER_SETTINGS_ENABLED: true\n"
        )
        self.assertEqual(flag(text)[:2], (1, "True"))


class Images(unittest.TestCase):
    def values(self, web_tag='"v1"', auth_tag='""'):
        return doc(
            "    web:\n      containerImage:\n        imageRegistry: reg/web\n        tag: " + web_tag + "\n"
            "    nodejs:\n      containerImage:\n        imageRegistry: reg/node\n        tag: 'v2' # node\n"
            '    nginx:\n      containerImage:\n        imageRegistry: "reg/nginx"\n        tag: v3\n'
            "    authService:\n      image:\n        repository: reg/auth\n        tag: " + auth_tag + "\n"
        )

    def test_every_component_with_comments_and_quotes(self):
        rc, out, _ = run(["env-images"], self.values())
        self.assertEqual(rc, 0)
        self.assertEqual(
            out.splitlines(),
            ["web\treg/web\tv1", "nodejs\treg/node\tv2", "nginx\treg/nginx\tv3", "authService\treg/auth\t"],
        )

    def test_an_empty_tag_is_an_empty_field(self):
        self.assertEqual(run(["env-images"], self.values(web_tag='""'))[1].splitlines()[0], "web\treg/web\t")

    def test_a_missing_or_non_string_tag_is_an_error_and_prints_nothing(self):
        text = self.values().replace('        tag: "v1"\n', "")
        self.assertEqual(run(["env-images"], text)[:2], (2, ""))
        self.assertEqual(run(["env-images"], self.values(web_tag="7.1"))[:2], (2, ""))
        self.assertEqual(run(["env-images"], "kind: HelmRelease\nspec: {}\n")[:2], (2, ""))

    @unittest.skipUnless(REAL_ENV and REAL_ENV.exists(), "no real env file given")
    def test_the_real_prod_env_file(self):
        rc, out, _ = run(["env-images"], REAL_ENV.read_text())
        self.assertEqual(rc, 0)
        rows = {line.split("\t")[0]: line.split("\t")[1:] for line in out.splitlines()}
        self.assertTrue(all(rows[c][0] and rows[c][1] for c in ("web", "nodejs", "nginx")), rows)
        self.assertEqual(run(["auth-service-enabled"], REAL_ENV.read_text())[0], 0)


if __name__ == "__main__":
    unittest.main(verbosity=2)
