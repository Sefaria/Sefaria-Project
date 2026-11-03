"""Tests for build/ci/merge_release_backfill.py.

No network calls, no `git`/`gh` calls: this script is a plain, deterministic
JSON merge with no I/O beyond reading --shipped-stories-out /
--reconcile-report and writing --out.

All story ids used below (11111, 22222, ...) are placeholders, not real
Shortcut story ids.
"""

import json

import pytest

import merge_release_backfill as mrb

SHIPPED_STORIES_BASE = {
    "version": "6.111.0-prod.2",
    "chart_version": "0.87.5-prod.1",
    "release_date": "2026-08-31T07:17:36Z",
    "story_ids": ["11111"],
    "stories": [{"id": 11111, "name": "Found by shipped_stories.py's own scan"}],
}


def _hydrated_story(story_id, name="Backfilled Story"):
    return {
        "id": story_id,
        "name": name,
        "description": "A description",
        "url": f"https://app.shortcut.com/org/story/{story_id}",
        "workflow_id": 500000005,
        "workflow_state_id": 500000045,
        "story_type": "feature",
    }


def _reconcile_report(shipped):
    return {"prod_tag": "prod/6.111.0-prod.2+chart.0.87.5-prod.1", "applied": True,
            "counts": {"total": len(shipped), "shipped": len(shipped), "pending": 0, "triage": 0},
            "shipped": shipped, "pending": [], "triage": []}


# --- backfill_stories_from_report: trusts hydrated_story's presence only -

def test_backfill_stories_from_report_returns_only_entries_with_hydrated_story():
    report = _reconcile_report([
        {"id": 22222, "hydrated_story": _hydrated_story(22222)},
        {"id": 33333, "shipping_release_tag": "prod/earlier"},  # no hydrated_story -- earlier release
        {"id": 44444},  # unresolvable release -- also no hydrated_story
    ])
    backfill = mrb.backfill_stories_from_report(report)
    assert [s["id"] for s in backfill] == [22222]


def test_backfill_stories_from_report_empty_shipped_bucket():
    report = _reconcile_report([])
    assert mrb.backfill_stories_from_report(report) == []


def test_backfill_stories_from_report_missing_shipped_key_degrades_to_empty():
    assert mrb.backfill_stories_from_report({"prod_tag": "prod/1.0"}) == []


# --- merge: dedup, additive, provenance -----------------------------------

def test_merge_adds_a_story_whose_derived_release_is_the_current_tag():
    data = dict(SHIPPED_STORIES_BASE, story_ids=list(SHIPPED_STORIES_BASE["story_ids"]),
                stories=list(SHIPPED_STORIES_BASE["stories"]))
    backfill = [_hydrated_story(22222)]
    merged, added_ids = mrb.merge(data, backfill)
    assert added_ids == ["22222"]
    assert merged["story_ids"] == ["11111", "22222"]
    assert [s["id"] for s in merged["stories"]] == [11111, 22222]
    assert merged["stories_from_reconciliation_backfill"] == ["22222"]


def test_merge_does_not_add_a_story_from_an_earlier_release():
    """The merge function itself only ever sees what backfill_stories_from_
    report already filtered down to -- this test drives that filtering
    step too, confirming an earlier-release entry never reaches merge()."""
    data = dict(SHIPPED_STORIES_BASE, story_ids=list(SHIPPED_STORIES_BASE["story_ids"]),
                stories=list(SHIPPED_STORIES_BASE["stories"]))
    report = _reconcile_report([{"id": 22222, "shipping_release_tag": "prod/6.100.0-prod.1+chart.0.85.8-prod.1"}])
    backfill = mrb.backfill_stories_from_report(report)
    merged, added_ids = mrb.merge(data, backfill)
    assert added_ids == []
    assert merged["story_ids"] == ["11111"]


def test_merge_does_not_add_a_story_with_unresolvable_release():
    data = dict(SHIPPED_STORIES_BASE, story_ids=list(SHIPPED_STORIES_BASE["story_ids"]),
                stories=list(SHIPPED_STORIES_BASE["stories"]))
    report = _reconcile_report([{"id": 22222, "shipping_release_tag": None}])
    backfill = mrb.backfill_stories_from_report(report)
    merged, added_ids = mrb.merge(data, backfill)
    assert added_ids == []
    assert merged["story_ids"] == ["11111"]


def test_merge_no_duplicates_when_both_discovery_paths_find_the_same_story():
    """A story shipped_stories.py's own git-range/RC1 discovery ALSO
    found (already present in story_ids/stories) must not be duplicated
    when the reconciliation sweep independently finds it too."""
    data = dict(SHIPPED_STORIES_BASE, story_ids=list(SHIPPED_STORIES_BASE["story_ids"]),
                stories=list(SHIPPED_STORIES_BASE["stories"]))
    backfill = [_hydrated_story(11111, name="Same story, found twice")]
    merged, added_ids = mrb.merge(data, backfill)
    assert added_ids == []
    assert merged["story_ids"] == ["11111"]
    assert len(merged["stories"]) == 1
    # The pre-existing entry (shipped_stories.py's own hydration) wins --
    # never overwritten by the backfill's version of the same story.
    assert merged["stories"][0]["name"] == "Found by shipped_stories.py's own scan"


def test_merge_multiple_backfill_stories_all_added():
    data = dict(SHIPPED_STORIES_BASE, story_ids=list(SHIPPED_STORIES_BASE["story_ids"]),
                stories=list(SHIPPED_STORIES_BASE["stories"]))
    backfill = [_hydrated_story(22222), _hydrated_story(33333)]
    merged, added_ids = mrb.merge(data, backfill)
    assert added_ids == ["22222", "33333"]
    assert merged["story_ids"] == ["11111", "22222", "33333"]


def test_merge_empty_backfill_is_a_no_op():
    data = dict(SHIPPED_STORIES_BASE, story_ids=list(SHIPPED_STORIES_BASE["story_ids"]),
                stories=list(SHIPPED_STORIES_BASE["stories"]))
    merged, added_ids = mrb.merge(data, [])
    assert added_ids == []
    assert merged["story_ids"] == ["11111"]
    assert merged["stories_from_reconciliation_backfill"] == []


def test_merge_preserves_other_shipped_stories_json_fields():
    """version/chart_version/release_date and any other existing field
    must survive the merge untouched -- this script only ever touches
    story_ids/stories/stories_from_reconciliation_backfill."""
    data = dict(SHIPPED_STORIES_BASE, story_ids=list(SHIPPED_STORIES_BASE["story_ids"]),
                stories=list(SHIPPED_STORIES_BASE["stories"]))
    merged, _ = mrb.merge(data, [_hydrated_story(22222)])
    assert merged["version"] == "6.111.0-prod.2"
    assert merged["chart_version"] == "0.87.5-prod.1"
    assert merged["release_date"] == "2026-08-31T07:17:36Z"


# --- main(): end to end, reads two files, writes merged result -----------

def test_main_merges_current_release_backfill_end_to_end(tmp_path):
    shipped_path = tmp_path / "shipped-stories.json"
    shipped_path.write_text(json.dumps(SHIPPED_STORIES_BASE), encoding="utf-8")

    report_path = tmp_path / "reconcile-report.json"
    report_path.write_text(json.dumps(_reconcile_report([
        {"id": 22222, "hydrated_story": _hydrated_story(22222)},
        {"id": 33333, "shipping_release_tag": "prod/earlier"},
    ])), encoding="utf-8")

    out_path = tmp_path / "shipped-stories.json"  # default: overwrite in place

    import sys
    old_argv = sys.argv
    try:
        sys.argv = [
            "merge_release_backfill.py",
            "--shipped-stories-out", str(shipped_path),
            "--reconcile-report", str(report_path),
        ]
        mrb.main()
    finally:
        sys.argv = old_argv

    merged = json.loads(out_path.read_text(encoding="utf-8"))
    assert merged["story_ids"] == ["11111", "22222"]
    assert 33333 not in [s.get("id") for s in merged["stories"]]


def test_main_writes_to_explicit_out_path_when_given(tmp_path):
    shipped_path = tmp_path / "shipped-stories.json"
    shipped_path.write_text(json.dumps(SHIPPED_STORIES_BASE), encoding="utf-8")
    report_path = tmp_path / "reconcile-report.json"
    report_path.write_text(json.dumps(_reconcile_report([])), encoding="utf-8")
    explicit_out = tmp_path / "merged.json"

    import sys
    old_argv = sys.argv
    try:
        sys.argv = [
            "merge_release_backfill.py",
            "--shipped-stories-out", str(shipped_path),
            "--reconcile-report", str(report_path),
            "--out", str(explicit_out),
        ]
        mrb.main()
    finally:
        sys.argv = old_argv

    assert explicit_out.exists()
    # The original --shipped-stories-out is untouched when --out is given.
    original = json.loads(shipped_path.read_text(encoding="utf-8"))
    assert original == SHIPPED_STORIES_BASE


def test_main_missing_shipped_stories_file_dies_cleanly(tmp_path):
    report_path = tmp_path / "reconcile-report.json"
    report_path.write_text(json.dumps(_reconcile_report([])), encoding="utf-8")

    import sys
    old_argv = sys.argv
    try:
        sys.argv = [
            "merge_release_backfill.py",
            "--shipped-stories-out", str(tmp_path / "does-not-exist.json"),
            "--reconcile-report", str(report_path),
        ]
        with pytest.raises(SystemExit):
            mrb.main()
    finally:
        sys.argv = old_argv


def test_main_missing_reconcile_report_dies_cleanly(tmp_path):
    shipped_path = tmp_path / "shipped-stories.json"
    shipped_path.write_text(json.dumps(SHIPPED_STORIES_BASE), encoding="utf-8")

    import sys
    old_argv = sys.argv
    try:
        sys.argv = [
            "merge_release_backfill.py",
            "--shipped-stories-out", str(shipped_path),
            "--reconcile-report", str(tmp_path / "does-not-exist.json"),
        ]
        with pytest.raises(SystemExit):
            mrb.main()
    finally:
        sys.argv = old_argv


# --- isolation guarantee: this module never touches the reconcile ---------
# --- report's shipped/pending/triage wholesale, and never imports --------
# --- anything that could reach the network or Shortcut -------------------

def test_merge_release_backfill_module_never_imports_network_or_subprocess():
    """This script only ever reads two JSON files and writes one -- it
    must never import urllib, requests, or subprocess. It has no business
    calling out to anything; if it ever needed to, that would be a sign
    the isolation this script exists to preserve had already broken."""
    import ast
    import inspect

    tree = ast.parse(inspect.getsource(mrb))
    imported_names = set()
    for node in ast.walk(tree):
        if isinstance(node, ast.Import):
            imported_names.update(alias.name.split(".")[0] for alias in node.names)
        elif isinstance(node, ast.ImportFrom) and node.module:
            imported_names.add(node.module.split(".")[0])

    forbidden = {"urllib", "requests", "subprocess", "socket", "http"}
    assert not (imported_names & forbidden), imported_names & forbidden
