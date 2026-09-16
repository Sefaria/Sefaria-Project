"""Tests for build/ci/mark_stories_deployed.py.

No network calls: anything that would call urllib.request.urlopen is either
not exercised (dry-run) or monkeypatched.

All story ids used below (11111, 22222, ...) are placeholders, not real
Shortcut story ids. The workflow and state ids (500000005, 500000045,
500000010, 500000006, 500000728) are real Shortcut workflow/state ids, not
story ids, and are not covered by that placeholder rule.
"""

import json

import pytest

import mark_stories_deployed as msd

WORKFLOW_ID = 500000005  # "Standard" workflow
FROM_STATE = 500000045  # "Deploy Ready" (Standard workflow)
DONE_STATE = 500000010  # "Done" (Standard workflow)

# A second, non-Standard workflow with its own, DIFFERENT Done state id.
# This is the exact case finding #1 is about: a state id that means "Done"
# in one workflow is not interchangeable with another workflow's Done state.
OTHER_WORKFLOW_ID = 500000006
OTHER_WORKFLOW_DONE_STATE = 500000728

STORY_DEPLOY_READY_1 = {"id": 11111, "name": "Story A", "workflow_id": WORKFLOW_ID, "workflow_state_id": FROM_STATE}
STORY_DEPLOY_READY_2 = {"id": 22222, "name": "Story B", "workflow_id": WORKFLOW_ID, "workflow_state_id": FROM_STATE}
STORY_ALREADY_DONE = {"id": 33333, "name": "Story C", "workflow_id": WORKFLOW_ID, "workflow_state_id": DONE_STATE}
STORY_OTHER_STATE = {"id": 44444, "name": "Story D", "workflow_id": WORKFLOW_ID, "workflow_state_id": 500000099}
# Shipped, but lives in a different workflow entirely -- sitting at THAT
# workflow's own Done state. Must never be classified as already_done: our
# --done-state-id (500000010) has no meaning in this story's workflow.
STORY_DIFFERENT_WORKFLOW = {
    "id": 55555,
    "name": "Story E",
    "workflow_id": OTHER_WORKFLOW_ID,
    "workflow_state_id": OTHER_WORKFLOW_DONE_STATE,
}

ALL_STORIES = [
    STORY_DEPLOY_READY_1,
    STORY_DEPLOY_READY_2,
    STORY_ALREADY_DONE,
    STORY_OTHER_STATE,
    STORY_DIFFERENT_WORKFLOW,
]


# --- classify_stories: pure state-filtering logic -----------------------

def test_classify_stories_buckets_by_workflow_state():
    to_transition, already_done, skipped_other_state, skipped_different_workflow = msd.classify_stories(
        ALL_STORIES, WORKFLOW_ID, FROM_STATE, DONE_STATE,
    )
    assert to_transition == [STORY_DEPLOY_READY_1, STORY_DEPLOY_READY_2]
    assert already_done == [STORY_ALREADY_DONE]
    assert skipped_other_state == [STORY_OTHER_STATE]
    assert skipped_different_workflow == [STORY_DIFFERENT_WORKFLOW]


def test_classify_stories_empty_input():
    to_transition, already_done, skipped_other_state, skipped_different_workflow = msd.classify_stories(
        [], WORKFLOW_ID, FROM_STATE, DONE_STATE,
    )
    assert to_transition == already_done == skipped_other_state == skipped_different_workflow == []


def test_classify_stories_all_already_done():
    to_transition, already_done, skipped_other_state, skipped_different_workflow = msd.classify_stories(
        [STORY_ALREADY_DONE], WORKFLOW_ID, FROM_STATE, DONE_STATE,
    )
    assert to_transition == []
    assert already_done == [STORY_ALREADY_DONE]
    assert skipped_other_state == []
    assert skipped_different_workflow == []


def test_classify_stories_different_workflow_at_its_own_done_state_is_not_already_done():
    """A story in a different workflow, sitting at THAT workflow's Done state
    (500000728), must be reported as skipped_different_workflow -- NOT
    already_done. Our --done-state-id only means "Done" inside --workflow-id."""
    to_transition, already_done, skipped_other_state, skipped_different_workflow = msd.classify_stories(
        [STORY_DIFFERENT_WORKFLOW], WORKFLOW_ID, FROM_STATE, DONE_STATE,
    )
    assert already_done == []
    assert skipped_other_state == []
    assert skipped_different_workflow == [STORY_DIFFERENT_WORKFLOW]


def test_classify_stories_missing_workflow_id_falls_through_to_state_check():
    """A story hydrated before shipped_stories.py captured workflow_id (or
    from an older shipped-stories.json) has no workflow_id key at all. It
    must fall through to the ordinary state-based classification instead of
    being flagged as a workflow mismatch on every single run."""
    legacy_story = {"id": 66666, "name": "Legacy", "workflow_state_id": FROM_STATE}
    to_transition, already_done, skipped_other_state, skipped_different_workflow = msd.classify_stories(
        [legacy_story], WORKFLOW_ID, FROM_STATE, DONE_STATE,
    )
    assert to_transition == [legacy_story]
    assert skipped_different_workflow == []


# --- --dry-run: never touches urllib, mutates nothing -------------------

def test_dry_run_never_calls_urlopen(monkeypatch, tmp_path, capsys):
    def _boom(*args, **kwargs):
        raise AssertionError("urlopen must never be called in --dry-run")

    monkeypatch.setattr(msd.urllib.request, "urlopen", _boom)
    monkeypatch.delenv("SHORTCUT_API_TOKEN", raising=False)

    input_path = tmp_path / "shipped-stories.json"
    input_path.write_text(json.dumps({"stories": ALL_STORIES}), encoding="utf-8")

    monkeypatch.setattr(
        "sys.argv",
        ["mark_stories_deployed.py", "--input", str(input_path), "--dry-run",
         "--workflow-id", str(WORKFLOW_ID),
         "--from-state-id", str(FROM_STATE), "--done-state-id", str(DONE_STATE)],
    )
    msd.main()

    out = json.loads(capsys.readouterr().out)
    assert out["dry_run"] is True
    assert sorted(out["transitioned"]) == [11111, 22222]
    assert out["already_done"] == [33333]
    assert out["skipped_other_state"] == [44444]
    assert out["skipped_different_workflow"] == [55555]
    assert out["failed"] == []
    assert out["counts"] == {
        "transitioned": 2,
        "already_done": 1,
        "skipped_other_state": 1,
        "skipped_different_workflow": 1,
        "failed": 0,
    }


def test_dry_run_does_not_require_token(monkeypatch, tmp_path):
    """--dry-run must work even with no SHORTCUT_API_TOKEN set."""
    monkeypatch.delenv("SHORTCUT_API_TOKEN", raising=False)

    input_path = tmp_path / "shipped-stories.json"
    input_path.write_text(json.dumps({"stories": []}), encoding="utf-8")

    monkeypatch.setattr("sys.argv", ["mark_stories_deployed.py", "--input", str(input_path), "--dry-run"])
    # Should not raise / exit.
    msd.main()


# --- Without --dry-run: missing token is a hard error before any work ---

def test_missing_token_without_dry_run_exits_before_any_work(monkeypatch, tmp_path):
    def _boom(*args, **kwargs):
        raise AssertionError("urlopen must never be called when the token check fails")

    monkeypatch.setattr(msd.urllib.request, "urlopen", _boom)
    monkeypatch.delenv("SHORTCUT_API_TOKEN", raising=False)

    input_path = tmp_path / "shipped-stories.json"
    input_path.write_text(json.dumps({"stories": ALL_STORIES}), encoding="utf-8")

    monkeypatch.setattr("sys.argv", ["mark_stories_deployed.py", "--input", str(input_path)])
    with pytest.raises(SystemExit):
        msd.main()


# --- Live run (mocked urllib): transitions only the Deploy Ready bucket -

def test_live_run_transitions_only_deploy_ready_stories(monkeypatch, tmp_path):
    monkeypatch.setenv("SHORTCUT_API_TOKEN", "fake-token-for-tests")

    calls = []

    class _FakeResponse:
        def __enter__(self):
            return self

        def __exit__(self, *exc):
            return False

        def read(self):
            return b"{}"

    def _fake_urlopen(req, timeout=None):
        calls.append(req.full_url)
        assert req.get_method() == "PUT"
        return _FakeResponse()

    monkeypatch.setattr(msd.urllib.request, "urlopen", _fake_urlopen)

    input_path = tmp_path / "shipped-stories.json"
    input_path.write_text(json.dumps({"stories": ALL_STORIES}), encoding="utf-8")

    monkeypatch.setattr(
        "sys.argv",
        ["mark_stories_deployed.py", "--input", str(input_path),
         "--workflow-id", str(WORKFLOW_ID),
         "--from-state-id", str(FROM_STATE), "--done-state-id", str(DONE_STATE)],
    )
    msd.main()

    assert sorted(calls) == [
        f"{msd.SHORTCUT_API_BASE}/stories/11111",
        f"{msd.SHORTCUT_API_BASE}/stories/22222",
    ]


def test_live_run_per_story_failure_does_not_abort_or_fail_process(monkeypatch, tmp_path, capsys):
    monkeypatch.setenv("SHORTCUT_API_TOKEN", "fake-token-for-tests")

    import urllib.error

    def _fake_urlopen(req, timeout=None):
        if "11111" in req.full_url:
            raise urllib.error.HTTPError(req.full_url, 500, "Internal Server Error", None, None)
        return _OKResponse()

    class _OKResponse:
        def __enter__(self):
            return self

        def __exit__(self, *exc):
            return False

        def read(self):
            return b"{}"

    monkeypatch.setattr(msd.urllib.request, "urlopen", _fake_urlopen)

    input_path = tmp_path / "shipped-stories.json"
    input_path.write_text(json.dumps({"stories": [STORY_DEPLOY_READY_1, STORY_DEPLOY_READY_2]}), encoding="utf-8")

    monkeypatch.setattr(
        "sys.argv",
        ["mark_stories_deployed.py", "--input", str(input_path),
         "--workflow-id", str(WORKFLOW_ID),
         "--from-state-id", str(FROM_STATE), "--done-state-id", str(DONE_STATE)],
    )
    # main() must return normally (no SystemExit) even with a per-story failure.
    msd.main()

    out = json.loads(capsys.readouterr().out)
    assert out["failed"] == [11111]
    assert out["transitioned"] == [22222]
    assert out["counts"]["failed"] == 1
    assert out["counts"]["transitioned"] == 1


# --- skipped_detail: human-readable workflow/state context per skip -----

def test_skipped_detail_includes_workflow_and_state_context(monkeypatch, tmp_path, capsys):
    monkeypatch.delenv("SHORTCUT_API_TOKEN", raising=False)

    input_path = tmp_path / "shipped-stories.json"
    input_path.write_text(json.dumps({"stories": ALL_STORIES}), encoding="utf-8")

    monkeypatch.setattr(
        "sys.argv",
        ["mark_stories_deployed.py", "--input", str(input_path), "--dry-run",
         "--workflow-id", str(WORKFLOW_ID),
         "--from-state-id", str(FROM_STATE), "--done-state-id", str(DONE_STATE)],
    )
    msd.main()

    out = json.loads(capsys.readouterr().out)
    detail_by_id = {d["id"]: d for d in out["skipped_detail"]}
    assert detail_by_id[44444] == {
        "id": 44444, "workflow_id": WORKFLOW_ID, "workflow_state_id": 500000099, "reason": "other_state",
    }
    assert detail_by_id[55555] == {
        "id": 55555, "workflow_id": OTHER_WORKFLOW_ID, "workflow_state_id": OTHER_WORKFLOW_DONE_STATE,
        "reason": "different_workflow",
    }
    # already_done stories are not "skipped" in the sense this detail list
    # is about -- they don't appear here at all.
    assert 33333 not in detail_by_id


# --- hydrated / unresolved_story_ids are echoed from the input file -----

def test_hydrated_and_unresolved_story_ids_are_echoed_into_summary(monkeypatch, tmp_path, capsys):
    monkeypatch.delenv("SHORTCUT_API_TOKEN", raising=False)

    input_path = tmp_path / "shipped-stories.json"
    input_path.write_text(json.dumps({
        "stories": [STORY_DEPLOY_READY_1],
        "hydrated": True,
        "unresolved_story_ids": ["77777"],
    }), encoding="utf-8")

    monkeypatch.setattr(
        "sys.argv",
        ["mark_stories_deployed.py", "--input", str(input_path), "--dry-run",
         "--workflow-id", str(WORKFLOW_ID),
         "--from-state-id", str(FROM_STATE), "--done-state-id", str(DONE_STATE)],
    )
    msd.main()

    captured = capsys.readouterr()
    out = json.loads(captured.out)
    assert out["hydrated"] is True
    assert out["unresolved_story_ids"] == ["77777"]
    assert "unresolved_story_ids" in captured.err
    assert "77777" in captured.err


def test_missing_hydrated_and_unresolved_keys_default_sanely(monkeypatch, tmp_path, capsys):
    """An input file predating this field (no `hydrated` / `unresolved_story_ids`
    keys at all) must not blow up -- and must not spuriously warn."""
    monkeypatch.delenv("SHORTCUT_API_TOKEN", raising=False)

    input_path = tmp_path / "shipped-stories.json"
    input_path.write_text(json.dumps({"stories": []}), encoding="utf-8")

    monkeypatch.setattr("sys.argv", ["mark_stories_deployed.py", "--input", str(input_path), "--dry-run"])
    msd.main()

    captured = capsys.readouterr()
    out = json.loads(captured.out)
    assert out["hydrated"] is None
    assert out["unresolved_story_ids"] == []
    assert "unresolved_story_ids" not in captured.err


# --- Silent no-op guard: the whole point of finding #1 ------------------

def test_silent_no_op_warns_and_exits_nonzero_when_not_dry_run(monkeypatch, tmp_path, capsys):
    """stories is non-empty, nothing gets transitioned, and the only reason
    is a skip that is NOT already_done -- this must be loud and must fail
    the process so an unattended run can't look successful."""
    monkeypatch.setenv("SHORTCUT_API_TOKEN", "fake-token-for-tests")

    def _boom(*args, **kwargs):
        raise AssertionError("nothing should be transitioned, so urlopen must never be called")

    monkeypatch.setattr(msd.urllib.request, "urlopen", _boom)

    input_path = tmp_path / "shipped-stories.json"
    # Only a different-workflow story shipped -- our state ids are simply
    # the wrong workflow's, so nothing can be transitioned.
    input_path.write_text(json.dumps({"stories": [STORY_DIFFERENT_WORKFLOW]}), encoding="utf-8")

    monkeypatch.setattr(
        "sys.argv",
        ["mark_stories_deployed.py", "--input", str(input_path),
         "--workflow-id", str(WORKFLOW_ID),
         "--from-state-id", str(FROM_STATE), "--done-state-id", str(DONE_STATE)],
    )
    with pytest.raises(SystemExit) as exc_info:
        msd.main()

    assert exc_info.value.code != 0
    err = capsys.readouterr().err
    assert "WARNING" in err
    assert "55555" in err
    assert str(OTHER_WORKFLOW_ID) in err
    assert str(OTHER_WORKFLOW_DONE_STATE) in err


def test_silent_no_op_warns_but_does_not_exit_nonzero_in_dry_run(monkeypatch, tmp_path, capsys):
    monkeypatch.delenv("SHORTCUT_API_TOKEN", raising=False)

    input_path = tmp_path / "shipped-stories.json"
    input_path.write_text(json.dumps({"stories": [STORY_DIFFERENT_WORKFLOW]}), encoding="utf-8")

    monkeypatch.setattr(
        "sys.argv",
        ["mark_stories_deployed.py", "--input", str(input_path), "--dry-run",
         "--workflow-id", str(WORKFLOW_ID),
         "--from-state-id", str(FROM_STATE), "--done-state-id", str(DONE_STATE)],
    )
    # --dry-run is a preview: it must warn (visibility) but never sys.exit.
    msd.main()

    err = capsys.readouterr().err
    assert "WARNING" in err
    assert "55555" in err


def test_empty_stories_does_not_warn_or_exit_nonzero(monkeypatch, tmp_path, capsys):
    """The exact VERIFY-step scenario: hydration was skipped (no token), so
    `stories` is empty. That must never be treated as a silent no-op."""
    monkeypatch.setenv("SHORTCUT_API_TOKEN", "fake-token-for-tests")

    def _boom(*args, **kwargs):
        raise AssertionError("urlopen must never be called with zero stories")

    monkeypatch.setattr(msd.urllib.request, "urlopen", _boom)

    input_path = tmp_path / "shipped-stories.json"
    input_path.write_text(json.dumps({"stories": [], "hydrated": False, "unresolved_story_ids": []}),
                           encoding="utf-8")

    monkeypatch.setattr("sys.argv", ["mark_stories_deployed.py", "--input", str(input_path)])
    # Should not raise / exit -- must return normally.
    msd.main()

    err = capsys.readouterr().err
    assert "silent no-op" not in err


def test_partial_skip_in_mixed_release_warns_but_exits_zero(monkeypatch, tmp_path, capsys):
    """Finding #10: the OLD guard only fired when `transitioned` was empty,
    so a mixed release -- some stories transition fine, others get skipped
    for a different workflow/state -- produced no WARNING at all and exited
    0. That's a silent no-op on the skipped stories specifically. The fix
    must warn whenever skipped_detail is non-empty, but still exit 0 since
    something DID move (this is not the "nothing happened" case)."""
    monkeypatch.setenv("SHORTCUT_API_TOKEN", "fake-token-for-tests")

    class _OKResponse:
        def __enter__(self):
            return self

        def __exit__(self, *exc):
            return False

        def read(self):
            return b"{}"

    monkeypatch.setattr(msd.urllib.request, "urlopen", lambda req, timeout=None: _OKResponse())

    input_path = tmp_path / "shipped-stories.json"
    # One story transitions cleanly; one is shipped but sits in a different
    # workflow entirely and can't be touched by this run's ids.
    input_path.write_text(
        json.dumps({"stories": [STORY_DEPLOY_READY_1, STORY_DIFFERENT_WORKFLOW]}), encoding="utf-8"
    )

    monkeypatch.setattr(
        "sys.argv",
        ["mark_stories_deployed.py", "--input", str(input_path),
         "--workflow-id", str(WORKFLOW_ID),
         "--from-state-id", str(FROM_STATE), "--done-state-id", str(DONE_STATE)],
    )
    # Must return normally: a partial skip alongside a real transition is not
    # the fatal "nothing happened" case, so this must not raise SystemExit.
    msd.main()

    captured = capsys.readouterr()
    out = json.loads(captured.out)
    assert out["counts"]["transitioned"] == 1
    assert out["counts"]["skipped_different_workflow"] == 1
    assert "WARNING" in captured.err
    assert "55555" in captured.err


def test_all_already_done_does_not_warn_or_exit_nonzero(monkeypatch, tmp_path, capsys):
    """Nothing transitioned, but the only 'skip' is already_done -- that IS
    the legitimately successful case (nothing needed moving) and must stay
    quiet and exit 0."""
    monkeypatch.setenv("SHORTCUT_API_TOKEN", "fake-token-for-tests")

    def _boom(*args, **kwargs):
        raise AssertionError("urlopen must never be called when everything is already done")

    monkeypatch.setattr(msd.urllib.request, "urlopen", _boom)

    input_path = tmp_path / "shipped-stories.json"
    input_path.write_text(json.dumps({"stories": [STORY_ALREADY_DONE]}), encoding="utf-8")

    monkeypatch.setattr(
        "sys.argv",
        ["mark_stories_deployed.py", "--input", str(input_path),
         "--workflow-id", str(WORKFLOW_ID),
         "--from-state-id", str(FROM_STATE), "--done-state-id", str(DONE_STATE)],
    )
    # Should not raise / exit -- must return normally.
    msd.main()

    err = capsys.readouterr().err
    assert "silent no-op" not in err
