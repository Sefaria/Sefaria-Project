"""Tests for build/ci/triage_explainer.py.

No network calls, no `git`/`gh` calls: this script is a plain, deterministic
JSON transform with no I/O beyond reading --report and writing --out.

All story ids used below (11111, 22222, ...) are placeholders, not real
Shortcut story ids.
"""

import json

import pytest

import triage_explainer as te

FULL_REPORT = {
    "prod_tag": "prod/7.1.3-prod.1+chart.0.88.2-prod.1",
    "applied": False,
    "counts": {"total": 3, "shipped": 1, "pending": 1, "triage": 1},
    "shipped": [
        {"id": 11111, "name": "Shipped story", "url": "https://app.shortcut.com/org/story/11111",
         "shipped_via_prs": [3606], "qualifying_prs": [3606], "transitioned": True,
         "shipping_release_tag": "prod/7.1.3-prod.1+chart.0.88.2-prod.1",
         "hydrated_story": {"id": 11111, "name": "Shipped story", "description": "should never leak",
                             "url": "https://app.shortcut.com/org/story/11111"}},
    ],
    "pending": [
        {"id": 22222, "name": "Pending story", "url": "https://app.shortcut.com/org/story/22222",
         "qualifying_prs": [3670]},
    ],
    "triage": [
        {"id": 33333, "name": "Triage story", "url": "https://app.shortcut.com/org/story/33333",
         "reason": "no_qualifying_pr", "linked_pr_numbers": [3698],
         "linked_prs": [{"number": 3698, "failed_guards": ["wrong target branch ('preprod', expected 'master')"]}],
         "description": "A story description", "comments": ["why is this stuck?"]},
    ],
}


# --- extract_triage_only: the structural isolation guarantee ------------

def test_extract_triage_only_excludes_shipped_and_pending_entirely():
    result = te.extract_triage_only(FULL_REPORT)
    assert "shipped" not in result
    assert "pending" not in result
    # Not just absent as top-level keys -- the shipped/pending story data
    # itself (ids, names, hydrated_story text) must not appear anywhere in
    # the serialized output.
    serialized = json.dumps(result)
    assert "11111" not in serialized
    assert "22222" not in serialized
    assert "should never leak" not in serialized


def test_extract_triage_only_excludes_applied_and_counts():
    result = te.extract_triage_only(FULL_REPORT)
    assert "applied" not in result
    assert "counts" not in result  # counts.shipped/pending would otherwise leak bucket sizes


def test_extract_triage_only_includes_triage_verbatim_with_full_context():
    result = te.extract_triage_only(FULL_REPORT)
    assert result["triage"] == FULL_REPORT["triage"]
    assert result["triage"][0]["description"] == "A story description"
    assert result["triage"][0]["comments"] == ["why is this stuck?"]
    assert result["triage"][0]["linked_prs"][0]["failed_guards"] == [
        "wrong target branch ('preprod', expected 'master')"
    ]


def test_extract_triage_only_includes_prod_tag_and_triage_count():
    result = te.extract_triage_only(FULL_REPORT)
    assert result["prod_tag"] == "prod/7.1.3-prod.1+chart.0.88.2-prod.1"
    assert result["triage_count"] == 1


def test_extract_triage_only_empty_triage_bucket():
    report = {**FULL_REPORT, "triage": []}
    result = te.extract_triage_only(report)
    assert result["triage"] == []
    assert result["triage_count"] == 0


def test_extract_triage_only_missing_triage_key_degrades_to_empty():
    """A report from a hypothetical older/different reconcile run without a
    'triage' key at all must not crash -- it's just zero triage stories."""
    report = {"prod_tag": "prod/1.0"}
    result = te.extract_triage_only(report)
    assert result["triage"] == []
    assert result["triage_count"] == 0


# --- main(): reads --report, writes --out ---------------------------------

def test_main_reads_report_and_writes_triage_only_document(tmp_path, monkeypatch):
    report_path = tmp_path / "reconcile-deploy-ready-report.json"
    report_path.write_text(json.dumps(FULL_REPORT), encoding="utf-8")
    out_path = tmp_path / "triage-only.json"

    monkeypatch.setattr(
        "sys.argv",
        ["triage_explainer.py", "extract", "--report", str(report_path), "--out", str(out_path)],
    )
    te.main()

    data = json.loads(out_path.read_text(encoding="utf-8"))
    assert "shipped" not in data
    assert "pending" not in data
    assert data["triage_count"] == 1
    assert data["triage"][0]["id"] == 33333


def test_main_missing_report_file_dies_cleanly(tmp_path, monkeypatch):
    monkeypatch.setattr(
        "sys.argv",
        ["triage_explainer.py", "extract", "--report", str(tmp_path / "does-not-exist.json"),
         "--out", str(tmp_path / "out.json")],
    )
    with pytest.raises(SystemExit):
        te.main()


def test_main_malformed_report_json_dies_cleanly(tmp_path, monkeypatch):
    report_path = tmp_path / "bad.json"
    report_path.write_text("not valid json{{{", encoding="utf-8")
    monkeypatch.setattr(
        "sys.argv",
        ["triage_explainer.py", "extract", "--report", str(report_path), "--out", str(tmp_path / "out.json")],
    )
    with pytest.raises(SystemExit):
        te.main()


# --- resolve_enabled: the opt-in decision, single-sourced and tested ----
# --- ("disabled path" coverage) -------------------------------------------

def test_resolve_enabled_defaults_to_disabled_with_no_input_at_all():
    assert te.resolve_enabled("workflow_dispatch", "", "") is False
    assert te.resolve_enabled("repository_dispatch", "", "") is False


def test_resolve_enabled_workflow_dispatch_true_input_enables():
    assert te.resolve_enabled("workflow_dispatch", "true", "") is True


def test_resolve_enabled_workflow_dispatch_ignores_the_repo_variable():
    """A workflow_dispatch run opts in via ITS OWN input only -- the
    repo-level variable is for the repository_dispatch path and must never
    leak in and silently enable a manual run that didn't ask for it."""
    assert te.resolve_enabled("workflow_dispatch", "", "true") is False


def test_resolve_enabled_repository_dispatch_true_var_enables():
    assert te.resolve_enabled("repository_dispatch", "", "true") is True


def test_resolve_enabled_repository_dispatch_ignores_the_workflow_dispatch_input():
    """The real automatic trigger carries no explain_triage input at all
    (it's a repository_dispatch, not a workflow_dispatch) -- even if that
    field were somehow non-empty, it must never be read on this path."""
    assert te.resolve_enabled("repository_dispatch", "true", "") is False


@pytest.mark.parametrize("value", ["false", "1", "yes", "True ", " true", "TRUE", "truex", None])
def test_resolve_enabled_only_exact_true_enables(value):
    # "TRUE" / "True " / " true" are still accepted (case/whitespace
    # tolerant); everything else in this list is not.
    result = te.resolve_enabled("workflow_dispatch", value, "")
    if value is not None and value.strip().lower() == "true":
        assert result is True
    else:
        assert result is False


def test_resolve_enabled_cli_prints_true_or_false(capsys, monkeypatch):
    monkeypatch.setattr(
        "sys.argv",
        ["triage_explainer.py", "resolve-enabled", "--event-name", "workflow_dispatch",
         "--explain-triage-input", "true", "--enable-var", ""],
    )
    te.main()
    assert capsys.readouterr().out.strip() == "true"


def test_resolve_enabled_cli_prints_false_when_disabled(capsys, monkeypatch):
    monkeypatch.setattr(
        "sys.argv",
        ["triage_explainer.py", "resolve-enabled", "--event-name", "repository_dispatch",
         "--explain-triage-input", "", "--enable-var", ""],
    )
    te.main()
    assert capsys.readouterr().out.strip() == "false"


# --- structural no-mutation / no-network guarantee ("NO mutation occurs --
# --- on any path" coverage for the Python side of this feature) ----------

def test_triage_explainer_module_never_imports_network_or_subprocess():
    """Architectural guarantee, not just a convention: this script is a
    pure JSON transform plus a pure string-comparison decision function. It
    must never import urllib, requests, subprocess, or anything else that
    could reach a network or mutate external/process state -- the actual
    LLM call (a `claude -p` CLI invocation) and any Shortcut mutation stay
    entirely in the opt-in workflow step and the deterministic
    reconcile_deploy_ready.py / mark_stories_deployed.py scripts, never
    here. Checked by inspecting this module's own top-level imports
    directly, not the source text (so a forbidden name appearing inside a
    string or comment can't cause a false failure)."""
    import ast
    import inspect

    tree = ast.parse(inspect.getsource(te))
    imported_names = set()
    for node in ast.walk(tree):
        if isinstance(node, ast.Import):
            imported_names.update(alias.name.split(".")[0] for alias in node.names)
        elif isinstance(node, ast.ImportFrom) and node.module:
            imported_names.add(node.module.split(".")[0])

    forbidden = {"urllib", "requests", "subprocess", "socket", "http"}
    assert not (imported_names & forbidden), imported_names & forbidden
