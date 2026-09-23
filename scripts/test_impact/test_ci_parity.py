"""Plain pytest, no Django. Run with:
./venv/bin/python -m pytest -q -p no:django -c /dev/null scripts/test_impact/test_ci_parity.py
"""
from __future__ import annotations

import json
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

import ci_parity  # noqa: E402

import yaml  # noqa: E402


SAMPLE_WORKFLOW_YAML = """
name: Continuous
jobs:
  pytest-no-mongo-job:
    name: "Continuous Testing: PyTest (no Mongo)"
    env:
      SEFARIA_MOCK_MONGO: "1"
      LOCAL_TEST_MONGO_PORT: "27099"
    steps:
      - name: Checkout
        uses: actions/checkout@v4
      - name: Run no-Mongo pytest tests
        run: >
          python -m pytest -q --reuse-db
          -m "not deep and not failing and not needs_mongo"
          ./sefaria/datatype
          ./sso
  pytest-job:
    name: "Continuous Testing: PyTest"
    env:
      SEFARIA_MOCK_MONGO: "1"
    steps:
      - name: Checkout
        uses: actions/checkout@v4
      - name: Install dependencies
        run: pip install -r requirements.txt
      - name: Run mocked Mongo pytest tests
        env:
          EXTRA_STEP_VAR: "step-value"
        run: >
          python -m pytest -q --reuse-db
          -m "not deep and not failing and needs_mongo"
          ./sefaria ./sso ./reader ./powered_by
  excluded-job:
    name: "Should be excludable"
    steps:
      - name: Run pytest
        run: python -m pytest -q -m "needs_linker" ./sefaria
  ending-notification:
    name: "Not a pytest job"
    steps:
      - name: Checkout
        uses: actions/checkout@v4
      - run: node notifyEnd.js
"""


def load_sample():
    return yaml.safe_load(SAMPLE_WORKFLOW_YAML)


# ---------------------------------------------------------------------------
# YAML extraction
# ---------------------------------------------------------------------------

class TestExtractPytestJobs:
    def test_extracts_all_pytest_jobs_by_default(self):
        workflow = load_sample()
        jobs = ci_parity.extract_pytest_jobs(workflow)
        assert set(jobs.keys()) == {"pytest-no-mongo-job", "pytest-job", "excluded-job"}

    def test_ignores_non_pytest_steps(self):
        workflow = load_sample()
        jobs = ci_parity.extract_pytest_jobs(workflow)
        # ending-notification has no pytest step at all
        assert "ending-notification" not in jobs

    def test_exclude_job_flag_drops_named_job(self):
        workflow = load_sample()
        jobs = ci_parity.extract_pytest_jobs(workflow, exclude_jobs={"excluded-job"})
        assert "excluded-job" not in jobs
        assert "pytest-job" in jobs

    def test_job_and_step_env_are_merged(self):
        workflow = load_sample()
        jobs = ci_parity.extract_pytest_jobs(workflow)
        env = jobs["pytest-job"]["env"]
        assert env["SEFARIA_MOCK_MONGO"] == "1"
        assert env["EXTRA_STEP_VAR"] == "step-value"

    def test_folded_run_block_parsed_and_marker_expr_kept_intact(self):
        workflow = load_sample()
        jobs = ci_parity.extract_pytest_jobs(workflow)
        argv = jobs["pytest-no-mongo-job"]["argv"]
        assert "-m" in argv
        expr_idx = argv.index("-m") + 1
        assert argv[expr_idx] == "not deep and not failing and not needs_mongo"
        assert "./sefaria/datatype" in argv
        assert "./sso" in argv

    def test_no_mongo_job_env_isolated_from_other_jobs(self):
        workflow = load_sample()
        jobs = ci_parity.extract_pytest_jobs(workflow)
        assert "LOCAL_TEST_MONGO_PORT" not in jobs["pytest-job"]["env"]


# ---------------------------------------------------------------------------
# nodeid parsing
# ---------------------------------------------------------------------------

class TestParseNodeids:
    def test_parses_realistic_collect_only_output(self):
        stdout = (
            "sefaria/tests/foo_test.py::TestFoo::test_one\n"
            "sefaria/tests/foo_test.py::TestFoo::test_two\n"
            "sefaria/tests/bar_test.py::test_bar\n"
            "\n"
            "3 tests collected in 0.45s\n"
        )
        nodeids = ci_parity.parse_nodeids(stdout)
        assert nodeids == {
            "sefaria/tests/foo_test.py::TestFoo::test_one",
            "sefaria/tests/foo_test.py::TestFoo::test_two",
            "sefaria/tests/bar_test.py::test_bar",
        }

    def test_excludes_summary_and_warnings_lines(self):
        stdout = (
            "sefaria/tests/foo_test.py::test_one\n"
            "\n"
            "=============== warnings summary ===============\n"
            "sefaria/tests/foo_test.py::test_one\n"
            "  /path/to/site-packages/pkg/mod.py:12: DeprecationWarning: blah\n"
            "\n"
            "1 test collected in 0.12s\n"
        )
        nodeids = ci_parity.parse_nodeids(stdout)
        assert nodeids == {"sefaria/tests/foo_test.py::test_one"}

    def test_excludes_no_tests_ran_line(self):
        stdout = "\nno tests ran in 0.01s\n"
        nodeids = ci_parity.parse_nodeids(stdout)
        assert nodeids == set()

    def test_indented_continuation_lines_are_ignored(self):
        stdout = (
            "sefaria/tests/foo_test.py::test_one\n"
            "    some::indented::looking::line::that::is::actually::a::traceback\n"
        )
        nodeids = ci_parity.parse_nodeids(stdout)
        assert nodeids == {"sefaria/tests/foo_test.py::test_one"}


# ---------------------------------------------------------------------------
# diff / exit codes, with collect() monkeypatched
# ---------------------------------------------------------------------------

def _fake_collect_factory(mapping, calls=None):
    def _fake_collect(argv, env, root):
        if calls is not None:
            calls.append((tuple(argv), dict(env), root))
        key = tuple(argv)
        if key in mapping:
            result = mapping[key]
            if isinstance(result, Exception):
                raise result
            return set(result)
        raise AssertionError(f"unexpected collect() call with argv={argv!r}")

    return _fake_collect


def _write_workflow(tmp_path, yaml_text):
    workflow_dir = tmp_path / ".github" / "workflows"
    workflow_dir.mkdir(parents=True)
    path = workflow_dir / "continuous.yaml"
    path.write_text(yaml_text)
    (tmp_path / "pytest.ini").write_text("[pytest]\n")
    return path


SIMPLE_WORKFLOW = """
jobs:
  job-a:
    env:
      FOO: "1"
    steps:
      - run: python -m pytest -q -m "not deep" ./sefaria
"""


class TestDiffAndExitCodes:
    def test_missing_tests_yield_exit_1(self, tmp_path, monkeypatch):
        _write_workflow(tmp_path, SIMPLE_WORKFLOW)
        job_argv = ("-q", "-m", "not deep", "./sefaria")
        baseline_argv = ("-m", ci_parity.DEFAULT_BASELINE_EXPR, "./sefaria", "./sso", "./reader", "./powered_by")
        mapping = {
            job_argv: {"sefaria/tests/a_test.py::test_a"},
            baseline_argv: {
                "sefaria/tests/a_test.py::test_a",
                "sefaria/tests/b_test.py::test_b",  # left behind
            },
        }
        monkeypatch.setattr(ci_parity, "collect", _fake_collect_factory(mapping))
        rc = ci_parity.main([
            "--root", str(tmp_path),
            "--baseline-paths", "./sefaria", "./sso", "./reader", "./powered_by",
            "--baseline-env", "FOO=1",
        ])
        assert rc == 1

    def test_no_missing_tests_yield_exit_0(self, tmp_path, monkeypatch):
        _write_workflow(tmp_path, SIMPLE_WORKFLOW)
        job_argv = ("-q", "-m", "not deep", "./sefaria")
        baseline_argv = ("-m", ci_parity.DEFAULT_BASELINE_EXPR, "./sefaria", "./sso", "./reader", "./powered_by")
        both = {"sefaria/tests/a_test.py::test_a", "sefaria/tests/b_test.py::test_b"}
        mapping = {job_argv: set(both), baseline_argv: set(both)}
        monkeypatch.setattr(ci_parity, "collect", _fake_collect_factory(mapping))
        rc = ci_parity.main([
            "--root", str(tmp_path),
            "--baseline-paths", "./sefaria", "./sso", "./reader", "./powered_by",
            "--baseline-env", "FOO=1",
        ])
        assert rc == 0

    def test_allow_list_subtracts_from_missing(self, tmp_path, monkeypatch):
        _write_workflow(tmp_path, SIMPLE_WORKFLOW)
        job_argv = ("-q", "-m", "not deep", "./sefaria")
        baseline_argv = ("-m", ci_parity.DEFAULT_BASELINE_EXPR, "./sefaria", "./sso", "./reader", "./powered_by")
        mapping = {
            job_argv: {"sefaria/tests/a_test.py::test_a"},
            baseline_argv: {
                "sefaria/tests/a_test.py::test_a",
                "sefaria/tests/b_test.py::test_b",
            },
        }
        monkeypatch.setattr(ci_parity, "collect", _fake_collect_factory(mapping))
        allow_path = tmp_path / "allow.json"
        allow_path.write_text(json.dumps([
            {"nodeid": "sefaria/tests/b_test.py::test_b", "reason": "covered by nightly workflow"},
        ]))
        rc = ci_parity.main([
            "--root", str(tmp_path),
            "--baseline-paths", "./sefaria", "./sso", "./reader", "./powered_by",
            "--baseline-env", "FOO=1",
            "--allow", str(allow_path),
        ])
        assert rc == 0

    def test_stale_allow_entry_is_reported_not_fatal(self, tmp_path, monkeypatch, capsys):
        _write_workflow(tmp_path, SIMPLE_WORKFLOW)
        job_argv = ("-q", "-m", "not deep", "./sefaria")
        baseline_argv = ("-m", ci_parity.DEFAULT_BASELINE_EXPR, "./sefaria", "./sso", "./reader", "./powered_by")
        mapping = {
            job_argv: {"sefaria/tests/a_test.py::test_a"},
            baseline_argv: {"sefaria/tests/a_test.py::test_a"},
        }
        monkeypatch.setattr(ci_parity, "collect", _fake_collect_factory(mapping))
        allow_path = tmp_path / "allow.json"
        allow_path.write_text(json.dumps([
            {"nodeid": "sefaria/tests/gone_test.py::test_gone", "reason": "no longer exists"},
        ]))
        rc = ci_parity.main([
            "--root", str(tmp_path),
            "--baseline-paths", "./sefaria", "./sso", "./reader", "./powered_by",
            "--baseline-env", "FOO=1",
            "--allow", str(allow_path),
        ])
        assert rc == 0  # nothing missing; stale entry is a warning only
        captured = capsys.readouterr()
        assert "stale" in captured.err.lower()

    def test_collection_error_yields_exit_2(self, tmp_path, monkeypatch):
        _write_workflow(tmp_path, SIMPLE_WORKFLOW)
        job_argv = ("-q", "-m", "not deep", "./sefaria")

        def _fake_collect(argv, env, root):
            if tuple(argv) == job_argv:
                raise ci_parity.CollectionError("pytest ...", 1, "some stdout", "ImportError: boom")
            raise AssertionError("baseline should not be reached before job collection error")

        monkeypatch.setattr(ci_parity, "collect", _fake_collect)
        rc = ci_parity.main([
            "--root", str(tmp_path),
            "--baseline-paths", "./sefaria",
            "--baseline-env", "FOO=1",
        ])
        assert rc == 2

    def test_json_output_shape(self, tmp_path, monkeypatch, capsys):
        _write_workflow(tmp_path, SIMPLE_WORKFLOW)
        job_argv = ("-q", "-m", "not deep", "./sefaria")
        baseline_argv = ("-m", ci_parity.DEFAULT_BASELINE_EXPR, "./sefaria")
        mapping = {
            job_argv: {"sefaria/tests/a_test.py::test_a"},
            baseline_argv: {
                "sefaria/tests/a_test.py::test_a",
                "sefaria/tests/b_test.py::test_b",
            },
        }
        monkeypatch.setattr(ci_parity, "collect", _fake_collect_factory(mapping))
        rc = ci_parity.main([
            "--root", str(tmp_path),
            "--baseline-paths", "./sefaria",
            "--baseline-env", "FOO=1",
            "--json",
        ])
        assert rc == 1
        captured = capsys.readouterr()
        data = json.loads(captured.out)
        assert data["baseline"] == 2
        assert data["jobs"] == {"job-a": 1}
        assert data["union"] == 1
        assert data["missing"] == ["sefaria/tests/b_test.py::test_b"]
        assert data["allowed"] == []
        assert data["stale_allow_entries"] == []

    def test_exclude_job_flag_removes_job_from_union(self, tmp_path, monkeypatch):
        workflow_yaml = """
jobs:
  job-a:
    steps:
      - run: python -m pytest -q -m "not deep" ./sefaria
  job-b:
    steps:
      - run: python -m pytest -q -m "needs_linker" ./sefaria
"""
        _write_workflow(tmp_path, workflow_yaml)
        job_a_argv = ("-q", "-m", "not deep", "./sefaria")
        baseline_argv = ("-m", ci_parity.DEFAULT_BASELINE_EXPR, "./sefaria")
        calls = []
        mapping = {
            job_a_argv: {"sefaria/tests/a_test.py::test_a"},
            baseline_argv: {"sefaria/tests/a_test.py::test_a"},
        }
        monkeypatch.setattr(ci_parity, "collect", _fake_collect_factory(mapping, calls))
        rc = ci_parity.main([
            "--root", str(tmp_path),
            "--baseline-paths", "./sefaria",
            "--baseline-env", "FOO=1",
            "--exclude-job", "job-b",
        ])
        assert rc == 0
        # only job-a and baseline should have been collected -- job-b excluded
        assert len(calls) == 2


# ---------------------------------------------------------------------------
# collect() nodeid-filtering and CollectionError plumbing
# ---------------------------------------------------------------------------

class TestCollectHelpers:
    def test_parse_env_kv_rejects_missing_equals(self):
        import pytest

        with pytest.raises(Exception):
            ci_parity.parse_env_kv(["NOVALUE"])

    def test_parse_env_kv_builds_dict(self):
        env = ci_parity.parse_env_kv(["A=1", "B=two"])
        assert env == {"A": "1", "B": "two"}

    def test_load_allowlist_reads_json_list(self, tmp_path):
        p = tmp_path / "allow.json"
        p.write_text(json.dumps([{"nodeid": "x::y", "reason": "z"}]))
        entries = ci_parity.load_allowlist(str(p))
        assert entries == [{"nodeid": "x::y", "reason": "z"}]
