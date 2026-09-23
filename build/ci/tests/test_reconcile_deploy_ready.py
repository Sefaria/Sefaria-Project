"""Tests for build/ci/reconcile_deploy_ready.py.

No network, no real `git`/`gh` calls: anything that would call
urllib.request.urlopen, subprocess.run, or the module's own run_git is
monkeypatched, matching the style of test_shipped_stories.py and
test_mark_stories_deployed.py.

All story ids used below (11111, 22222, ...) are placeholders, not real
Shortcut story ids. The repo/workflow/state ids (500000103, 500000005,
500000045, 500000010, 500000061) are real Shortcut/GitHub ids, not story
ids, and are not covered by that placeholder rule -- same convention as the
two existing test files.
"""

import json

import pytest

import reconcile_deploy_ready as rdr

STANDARD_WORKFLOW_ID = 500000005
DEPLOY_READY_STATE_ID = 500000045
DONE_STATE_ID = 500000010
SEFARIA_REPO_ID = 500000103
OTHER_REPO_ID = 500000124  # some other Shortcut-linked repo, not Sefaria-Project
# A non-Standard workflow (e.g. "Content") that also has some state it
# reports as workflow_state_id -- deliberately NOT 500000045, since that id
# means something else (or nothing) outside the Standard workflow.
OTHER_WORKFLOW_ID = 500000061
OTHER_WORKFLOW_STATE_ID = 500000900


def _pr(number, merged=True, repository_id=SEFARIA_REPO_ID, target_branch_name="master",
        branch_name="feature/some-branch"):
    return {
        "number": number,
        "merged": merged,
        "repository_id": repository_id,
        "target_branch_name": target_branch_name,
        "branch_name": branch_name,
    }


def _story(story_id, name="Story", workflow_id=STANDARD_WORKFLOW_ID, workflow_state_id=DEPLOY_READY_STATE_ID,
           pull_requests=None, branches=None, description=None, comments=None, story_type="feature"):
    return {
        "id": story_id,
        "name": name,
        "app_url": f"https://app.shortcut.com/org/story/{story_id}",
        "workflow_id": workflow_id,
        "workflow_state_id": workflow_state_id,
        "pull_requests": pull_requests or [],
        "branches": branches or [],
        "description": description,
        "comments": comments or [],
        "story_type": story_type,
    }


# --- gather_linked_prs: dedup across pull_requests and branches[].pull_requests --

def test_gather_linked_prs_dedups_across_both_sources():
    """Shortcut duplicates the same PR object in story.pull_requests AND
    story.branches[*].pull_requests -- the same PR number appearing in both
    must not be double-counted."""
    pr = _pr(100)
    story = _story(11111, pull_requests=[pr], branches=[{"pull_requests": [pr]}])
    prs = rdr.gather_linked_prs(story)
    assert [p["number"] for p in prs] == [100]


def test_gather_linked_prs_collects_from_both_sources_when_numbers_differ():
    story = _story(11111, pull_requests=[_pr(100)], branches=[{"pull_requests": [_pr(200)]}])
    prs = rdr.gather_linked_prs(story)
    assert sorted(p["number"] for p in prs) == [100, 200]


def test_gather_linked_prs_empty_story_returns_empty():
    story = _story(11111)
    assert rdr.gather_linked_prs(story) == []


def test_gather_linked_prs_ignores_prs_with_no_number():
    story = _story(11111, pull_requests=[{"merged": True}])
    assert rdr.gather_linked_prs(story) == []


# --- qualifying_prs: the four PR-level guards (shortcut_pr_guards.py) ----

def test_qualifying_prs_wrong_repo_guard():
    """Guard: a PR linked from a DIFFERENT repo must never count as
    evidence a Sefaria-Project story shipped, even if it's merged and
    targets 'master' -- resolving it against Sefaria-Project would find an
    unrelated PR that happens to share the number."""
    prs = [_pr(224, repository_id=OTHER_REPO_ID)]
    assert rdr.qualifying_prs(prs) == []


def test_qualifying_prs_promotion_pr_target_branch_guard():
    """Guard: a PR targeting anything other than 'master' (e.g. a
    preprod->prod or master->preprod promotion PR some stories link instead
    of the real feature PR) must not qualify."""
    prs = [_pr(3551, target_branch_name="prod")]
    assert rdr.qualifying_prs(prs) == []
    prs2 = [_pr(3550, target_branch_name="preprod")]
    assert rdr.qualifying_prs(prs2) == []


def test_qualifying_prs_promotion_pr_head_branch_guard_preprod_to_master():
    """Guard (regression): a promotion PR merging preprod INTO master
    passes the repo/merged/target-branch guards cleanly -- its target
    really is 'master'. Only the HEAD branch (branch_name) reveals it's a
    promotion merge, not a feature PR. This is the exact live false
    positive that was found and fixed: a story was classified `shipped` on
    the strength of a PR shaped exactly like this."""
    prs = [_pr(3677, target_branch_name="master", branch_name="preprod")]
    assert rdr.qualifying_prs(prs) == []


def test_qualifying_prs_promotion_pr_head_branch_guard_master_to_preprod():
    """The other promotion direction is already caught by the target-branch
    guard, but the head-branch guard must reject it too, independently."""
    prs = [_pr(3698, target_branch_name="preprod", branch_name="master")]
    assert rdr.qualifying_prs(prs) == []


def test_qualifying_prs_unmerged_pr_guard():
    """Guard: an open or closed-without-merging PR proves nothing."""
    prs = [_pr(3397, merged=False)]
    assert rdr.qualifying_prs(prs) == []


def test_qualifying_prs_accepts_a_normal_feature_pr_passing_all_four_guards():
    prs = [_pr(3606, branch_name="feature/some-fix")]
    assert rdr.qualifying_prs(prs) == prs


def test_qualifying_prs_filters_mixed_list_keeping_only_the_valid_one():
    prs = [
        _pr(224, repository_id=OTHER_REPO_ID),
        _pr(3551, target_branch_name="prod"),
        _pr(3397, merged=False),
        _pr(3677, target_branch_name="master", branch_name="preprod"),
        _pr(3606, branch_name="feature/some-fix"),
    ]
    assert [p["number"] for p in rdr.qualifying_prs(prs)] == [3606]


def test_qualifying_prs_custom_repo_and_target_branch_args():
    """--repo/--target-branch overrides are threaded through, not hardcoded."""
    prs = [_pr(1, repository_id=999, target_branch_name="main", branch_name="feature/some-fix")]
    assert rdr.qualifying_prs(prs, repo_id=999, target_branch="main") == prs
    assert rdr.qualifying_prs(prs, repo_id=SEFARIA_REPO_ID, target_branch="master") == []


# --- classify_stories: guard #4 (workflow/state) + guard-filtered triage --

def test_classify_stories_non_standard_workflow_routes_to_triage_not_transition():
    """Guard #4: a story on a non-Standard workflow must be routed to
    triage with its actual workflow/state ids reported -- never treated as
    a shipping candidate, since 500000045/500000010 mean nothing there."""
    story = _story(11111, workflow_id=OTHER_WORKFLOW_ID, workflow_state_id=OTHER_WORKFLOW_STATE_ID,
                   pull_requests=[_pr(1)])
    triage, candidates = rdr.classify_stories([story], SEFARIA_REPO_ID, "master")
    assert candidates == []
    assert len(triage) == 1
    assert triage[0]["id"] == 11111
    assert triage[0]["reason"] == "non_standard_workflow_or_state"
    assert triage[0]["workflow_id"] == OTHER_WORKFLOW_ID
    assert triage[0]["workflow_state_id"] == OTHER_WORKFLOW_STATE_ID


def test_classify_stories_unexpected_state_within_standard_workflow_routes_to_triage():
    """Guard #4 also keys on the NUMERIC state id, not just the workflow --
    a story on the Standard workflow but at some other state id must not
    be treated as Deploy Ready just because it matched the search by name."""
    story = _story(11111, workflow_id=STANDARD_WORKFLOW_ID, workflow_state_id=500000099,
                   pull_requests=[_pr(1)])
    triage, candidates = rdr.classify_stories([story], SEFARIA_REPO_ID, "master")
    assert candidates == []
    assert triage[0]["reason"] == "non_standard_workflow_or_state"


def test_classify_stories_no_qualifying_pr_routes_to_triage():
    story = _story(11111, pull_requests=[_pr(3397, merged=False)])
    triage, candidates = rdr.classify_stories([story], SEFARIA_REPO_ID, "master")
    assert candidates == []
    assert triage[0]["reason"] == "no_qualifying_pr"
    assert triage[0]["linked_pr_numbers"] == [3397]


# --- triage enrichment: description/comments/per-PR guard diagnostics ---
# --- (raw material for the opt-in triage-explainer step) -----------------

def test_diagnose_linked_pr_reports_every_failed_guard():
    pr = {"number": 1, "merged": False, "repository_id": 999, "target_branch_name": "preprod"}
    failed = rdr._diagnose_linked_pr(pr, SEFARIA_REPO_ID, "master")
    assert "not merged" in failed
    assert any("wrong repo" in f for f in failed)
    assert any("wrong target branch" in f for f in failed)


def test_diagnose_linked_pr_reports_no_failures_for_a_qualifying_pr():
    pr = _pr(3606)
    assert rdr._diagnose_linked_pr(pr, SEFARIA_REPO_ID, "master") == []


def test_diagnose_linked_pr_reports_only_the_specific_guard_that_failed():
    pr = _pr(3698, target_branch_name="preprod")  # merged + right repo, wrong branch only
    failed = rdr._diagnose_linked_pr(pr, SEFARIA_REPO_ID, "master")
    assert failed == ["wrong target branch ('preprod', expected 'master')"]


def test_diagnose_linked_pr_reports_promotion_head_branch_guard():
    """A promotion PR (preprod -> master) passes merged/repo/target-branch
    but must be flagged for its head branch -- the diagnostic must surface
    the SAME reason qualifying_prs silently rejects it for."""
    pr = _pr(3677, target_branch_name="master", branch_name="preprod")
    failed = rdr._diagnose_linked_pr(pr, SEFARIA_REPO_ID, "master")
    assert failed == ["promotion PR (head branch 'preprod' is a long-lived environment branch)"]


def test_triage_context_extracts_description_and_comment_text():
    story = _story(
        11111, description="Some story description",
        comments=[{"text": "first comment"}, {"text": "second comment"}, {"author_id": "x"}],
    )
    ctx = rdr._triage_context(story)
    assert ctx["description"] == "Some story description"
    assert ctx["comments"] == ["first comment", "second comment"]


def test_triage_context_handles_missing_description_and_comments():
    story = {"id": 11111}
    ctx = rdr._triage_context(story)
    assert ctx["description"] is None
    assert ctx["comments"] == []


def test_classify_stories_no_qualifying_pr_entry_carries_full_context(monkeypatch):
    """The raw material the opt-in explainer needs: description, comment
    text, and -- per linked PR -- exactly which guard(s) it failed, not
    just a bare number."""
    story = _story(
        11111,
        pull_requests=[_pr(3698, target_branch_name="preprod"), _pr(3397, merged=False)],
        description="A story description",
        comments=[{"text": "why is this stuck?"}],
    )
    triage, _ = rdr.classify_stories([story], SEFARIA_REPO_ID, "master")
    entry = triage[0]
    assert entry["description"] == "A story description"
    assert entry["comments"] == ["why is this stuck?"]
    assert entry["linked_pr_numbers"] == [3397, 3698]
    by_number = {p["number"]: p["failed_guards"] for p in entry["linked_prs"]}
    assert by_number[3698] == ["wrong target branch ('preprod', expected 'master')"]
    assert by_number[3397] == ["not merged"]


def test_classify_stories_non_standard_workflow_entry_also_carries_context():
    story = _story(
        11111, workflow_id=500000061, workflow_state_id=500000900,
        description="Lives on a different workflow", comments=[{"text": "not ours"}],
    )
    triage, _ = rdr.classify_stories([story], SEFARIA_REPO_ID, "master")
    entry = triage[0]
    assert entry["description"] == "Lives on a different workflow"
    assert entry["comments"] == ["not ours"]


def test_classify_stories_shipped_pending_candidates_do_not_carry_triage_context(monkeypatch):
    """Shipped/pending stories must stay as lean as before this was added
    -- _triage_context is triage-only, both by name and by application.
    classify_stories only returns the raw (story, prs) pair for a
    candidate; classify_candidates builds its own lean entry via
    _story_summary, which never includes description/comments."""
    story = _story(11111, pull_requests=[_pr(3606)], description="should never appear")
    triage, candidates = rdr.classify_stories([story], SEFARIA_REPO_ID, "master")
    assert triage == []
    assert len(candidates) == 1

    monkeypatch.setattr(rdr, "is_ancestor_of_prod", lambda oid, tag: True)
    shipped, pending = rdr.classify_candidates(candidates, {3606: "abc"}, "prod/1.0")
    assert "description" not in shipped[0]
    assert "comments" not in shipped[0]


def test_classify_stories_story_with_no_linked_prs_at_all_routes_to_triage():
    story = _story(11111)
    triage, candidates = rdr.classify_stories([story], SEFARIA_REPO_ID, "master")
    assert triage[0]["reason"] == "no_qualifying_pr"
    assert triage[0]["linked_pr_numbers"] == []


def test_classify_stories_qualifying_story_becomes_a_candidate():
    story = _story(11111, pull_requests=[_pr(3606)])
    triage, candidates = rdr.classify_stories([story], SEFARIA_REPO_ID, "master")
    assert triage == []
    assert len(candidates) == 1
    assert candidates[0][0]["id"] == 11111
    assert [p["number"] for p in candidates[0][1]] == [3606]


# --- classify_candidates: ancestor true vs false, unresolved oid ---------

def test_classify_candidates_ancestor_true_is_shipped(monkeypatch):
    monkeypatch.setattr(rdr, "is_ancestor_of_prod", lambda oid, tag: True)
    monkeypatch.setattr(rdr, "resolve_shipping_release_tag", lambda oid: None)
    story = _story(11111, pull_requests=[_pr(3606)])
    candidates = [(story, [_pr(3606)])]
    shipped, pending = rdr.classify_candidates(candidates, {3606: "abc123"}, "prod/1.0")
    assert pending == []
    assert len(shipped) == 1
    assert shipped[0]["id"] == 11111
    assert shipped[0]["shipped_via_prs"] == [3606]
    assert shipped[0]["qualifying_prs"] == [3606]


def test_classify_candidates_ancestor_false_is_pending(monkeypatch):
    monkeypatch.setattr(rdr, "is_ancestor_of_prod", lambda oid, tag: False)
    story = _story(11111, pull_requests=[_pr(3670)])
    candidates = [(story, [_pr(3670)])]
    shipped, pending = rdr.classify_candidates(candidates, {3670: "def456"}, "prod/1.0")
    assert shipped == []
    assert len(pending) == 1
    assert pending[0]["id"] == 11111
    assert pending[0]["qualifying_prs"] == [3670]


def test_classify_candidates_unresolved_oid_never_counts_as_shipped(monkeypatch):
    """A PR whose merge oid never resolved (gh lookup failed) must push a
    story toward pending, never toward shipped -- a resolution failure must
    never cause a wrong transition."""
    def _boom(oid, tag):
        raise AssertionError("is_ancestor_of_prod must not be called for an unresolved oid")

    monkeypatch.setattr(rdr, "is_ancestor_of_prod", _boom)
    story = _story(11111, pull_requests=[_pr(3606)])
    candidates = [(story, [_pr(3606)])]
    shipped, pending = rdr.classify_candidates(candidates, {}, "prod/1.0")  # oid_by_pr empty: unresolved
    assert shipped == []
    assert len(pending) == 1


def test_classify_candidates_inconclusive_ancestry_check_never_counts_as_shipped(monkeypatch):
    """is_ancestor_of_prod returning None (the check itself couldn't run)
    must also never be treated as "in prod"."""
    monkeypatch.setattr(rdr, "is_ancestor_of_prod", lambda oid, tag: None)
    story = _story(11111, pull_requests=[_pr(3606)])
    candidates = [(story, [_pr(3606)])]
    shipped, pending = rdr.classify_candidates(candidates, {3606: "abc"}, "prod/1.0")
    assert shipped == []
    assert len(pending) == 1


def test_classify_candidates_any_qualifying_pr_in_prod_is_enough(monkeypatch):
    """A story with two qualifying PRs, only one of which is in prod, still
    ships -- 'at least one' per the spec."""
    monkeypatch.setattr(rdr, "is_ancestor_of_prod", lambda oid, tag: oid == "in-prod-oid")
    monkeypatch.setattr(rdr, "resolve_shipping_release_tag", lambda oid: None)

    story = _story(11111, pull_requests=[_pr(1), _pr(2)])
    candidates = [(story, [_pr(1), _pr(2)])]
    oid_by_pr = {1: "not-in-prod-oid", 2: "in-prod-oid"}
    shipped, pending = rdr.classify_candidates(candidates, oid_by_pr, "prod/1.0")
    assert len(shipped) == 1
    assert shipped[0]["shipped_via_prs"] == [2]
    assert shipped[0]["qualifying_prs"] == [1, 2]


# --- classify_candidates: shipping_release_tag / hydrated_story ----------
# --- (the "backfilled story that shipped in THIS release" fix) -----------

def test_classify_candidates_shipping_release_tag_equal_to_current_attaches_hydrated_story(monkeypatch):
    """When the derived TRUE shipping release equals the CURRENT prod tag,
    the entry gets a hydrated_story sub-object -- the ONLY signal
    merge_release_backfill.py uses to fold a backfilled story into
    shipped-stories.json."""
    monkeypatch.setattr(rdr, "is_ancestor_of_prod", lambda oid, tag: True)
    monkeypatch.setattr(rdr, "resolve_shipping_release_tag", lambda oid: "prod/1.0")
    story = _story(11111, name="Some Story", pull_requests=[_pr(3606)], description="A description")
    candidates = [(story, [_pr(3606)])]
    shipped, pending = rdr.classify_candidates(candidates, {3606: "abc"}, "prod/1.0")
    assert shipped[0]["shipping_release_tag"] == "prod/1.0"
    hydrated = shipped[0]["hydrated_story"]
    assert hydrated == {
        "id": 11111,
        "name": "Some Story",
        "description": "A description",
        "url": f"https://app.shortcut.com/org/story/11111",
        "workflow_id": STANDARD_WORKFLOW_ID,
        "workflow_state_id": DEPLOY_READY_STATE_ID,
        "story_type": "feature",
    }


def test_classify_candidates_shipping_release_tag_earlier_than_current_excludes_hydrated_story(monkeypatch):
    """A story that shipped in an EARLIER release must never carry
    hydrated_story -- that's exactly the 'old features shipped today'
    leak this whole design rejects."""
    monkeypatch.setattr(rdr, "is_ancestor_of_prod", lambda oid, tag: True)
    monkeypatch.setattr(rdr, "resolve_shipping_release_tag", lambda oid: "prod/0.9-earlier")
    story = _story(11111, pull_requests=[_pr(3606)])
    candidates = [(story, [_pr(3606)])]
    shipped, pending = rdr.classify_candidates(candidates, {3606: "abc"}, "prod/1.0")
    assert shipped[0]["shipping_release_tag"] == "prod/0.9-earlier"
    assert "hydrated_story" not in shipped[0]


def test_classify_candidates_unresolvable_shipping_release_excludes_hydrated_story(monkeypatch):
    """resolve_shipping_release_tag returning None (unresolvable) must
    also never attach hydrated_story -- fail closed, never guess a story
    into the announcement."""
    monkeypatch.setattr(rdr, "is_ancestor_of_prod", lambda oid, tag: True)
    monkeypatch.setattr(rdr, "resolve_shipping_release_tag", lambda oid: None)
    story = _story(11111, pull_requests=[_pr(3606)])
    candidates = [(story, [_pr(3606)])]
    shipped, pending = rdr.classify_candidates(candidates, {3606: "abc"}, "prod/1.0")
    assert shipped[0]["shipping_release_tag"] is None
    assert "hydrated_story" not in shipped[0]


def test_classify_candidates_pending_entries_never_carry_shipping_release_tag(monkeypatch):
    """shipping_release_tag/hydrated_story are shipped-only concepts -- a
    pending story (nothing in prod yet) has no shipping release to derive
    at all."""
    monkeypatch.setattr(rdr, "is_ancestor_of_prod", lambda oid, tag: False)

    def _boom(oid):
        raise AssertionError("resolve_shipping_release_tag must not be called for a pending story")

    monkeypatch.setattr(rdr, "resolve_shipping_release_tag", _boom)
    story = _story(11111, pull_requests=[_pr(3670)])
    candidates = [(story, [_pr(3670)])]
    shipped, pending = rdr.classify_candidates(candidates, {3670: "def"}, "prod/1.0")
    assert shipped == []
    assert "shipping_release_tag" not in pending[0]
    assert "hydrated_story" not in pending[0]


def test_story_for_release_notes_matches_shipped_stories_hydrated_shape():
    story = _story(11111, name="A Story", description="Desc", story_type="bug")
    hydrated = rdr._story_for_release_notes(story)
    assert set(hydrated.keys()) == {
        "id", "name", "description", "url", "workflow_id", "workflow_state_id", "story_type",
    }
    assert hydrated["url"] == story["app_url"]


# --- is_ancestor_of_prod: exit-code interpretation -----------------------

def test_is_ancestor_of_prod_true_on_exit_code_0(monkeypatch):
    class _Proc:
        returncode = 0
        stderr = ""

    monkeypatch.setattr(rdr.subprocess, "run", lambda *a, **k: _Proc())
    assert rdr.is_ancestor_of_prod("abc", "prod/1.0") is True


def test_is_ancestor_of_prod_false_on_exit_code_1(monkeypatch):
    class _Proc:
        returncode = 1
        stderr = ""

    monkeypatch.setattr(rdr.subprocess, "run", lambda *a, **k: _Proc())
    assert rdr.is_ancestor_of_prod("abc", "prod/1.0") is False


def test_is_ancestor_of_prod_none_on_other_exit_code(monkeypatch, capsys):
    class _Proc:
        returncode = 128
        stderr = "fatal: not a valid object name abc"

    monkeypatch.setattr(rdr.subprocess, "run", lambda *a, **k: _Proc())
    assert rdr.is_ancestor_of_prod("abc", "prod/1.0") is None
    assert "WARNING" in capsys.readouterr().err


# --- search_deploy_ready_stories: pagination ------------------------------

class _FakeSearchResponse:
    def __init__(self, payload):
        self._body = json.dumps(payload).encode("utf-8")

    def __enter__(self):
        return self

    def __exit__(self, *exc):
        return False

    def read(self):
        return self._body


def test_search_deploy_ready_stories_paginates_via_next_cursor(monkeypatch):
    """Two pages, exactly as verified live (20 stories, 10 per page): must
    not assume a single page."""
    pages = [
        {"data": [{"id": 1}, {"id": 2}], "next": "/api/v3/search/stories?query=x&next=CURSOR1"},
        {"data": [{"id": 3}], "next": None},
    ]
    calls = []

    def _fake_urlopen(req, timeout=None):
        calls.append(req.full_url)
        return _FakeSearchResponse(pages[len(calls) - 1])

    monkeypatch.setattr(rdr.urllib.request, "urlopen", _fake_urlopen)
    stories = rdr.search_deploy_ready_stories("fake-token-for-tests")
    assert [s["id"] for s in stories] == [1, 2, 3]
    assert len(calls) == 2
    # The second call must follow the `next` cursor, not repeat page one.
    assert "CURSOR1" in calls[1]


def test_search_deploy_ready_stories_single_page_stops_when_next_is_none(monkeypatch):
    def _fake_urlopen(req, timeout=None):
        return _FakeSearchResponse({"data": [{"id": 1}], "next": None})

    monkeypatch.setattr(rdr.urllib.request, "urlopen", _fake_urlopen)
    stories = rdr.search_deploy_ready_stories("fake-token-for-tests")
    assert [s["id"] for s in stories] == [1]


# --- fetch_merge_oids: gh missing must not surface as a raw traceback ----

def test_fetch_merge_oids_dies_clearly_when_gh_is_missing(monkeypatch):
    def _raise_missing_gh(*args, **kwargs):
        raise FileNotFoundError("[Errno 2] No such file or directory: 'gh'")

    monkeypatch.setattr(rdr.subprocess, "run", _raise_missing_gh)
    with pytest.raises(SystemExit):
        rdr.fetch_merge_oids([3606], "Sefaria/Sefaria-Project")


def test_fetch_merge_oids_empty_input_makes_no_calls(monkeypatch):
    def _boom(*args, **kwargs):
        raise AssertionError("subprocess.run must not be called with no PR numbers")

    monkeypatch.setattr(rdr.subprocess, "run", _boom)
    assert rdr.fetch_merge_oids([], "Sefaria/Sefaria-Project") == {}


def test_fetch_pr_merge_oid_failed_gh_call_returns_none(monkeypatch, capsys):
    class _Proc:
        returncode = 1
        stdout = ""
        stderr = "PR not found"

    monkeypatch.setattr(rdr.subprocess, "run", lambda *a, **k: _Proc())
    pr_number, oid = rdr.fetch_pr_merge_oid(9999, "Sefaria/Sefaria-Project")
    assert oid is None
    assert "WARNING" in capsys.readouterr().err


# --- End-to-end main(): dry-run is the default and mutates nothing -------

def _make_main_env(monkeypatch, tmp_path, stories, prod_tag="prod/1.0", oid_by_pr=None,
                    ancestor_result=True, argv_extra=None, shipping_tag=None):
    """Wire main() end-to-end with every I/O boundary mocked: Shortcut
    search, gh merge-commit lookup, git ancestry, and the git-based
    shipping-release lookup -- mirroring _run_main_with_commits in
    test_shipped_stories.py. resolve_shipping_release_tag defaults to a
    plain lambda returning `shipping_tag` (None unless overridden) rather
    than shelling out to real git, so tests that don't care about that
    specific behavior stay hermetic; the dedicated tests for it below
    monkeypatch it themselves when they need to exercise its own
    git-shelling logic."""
    monkeypatch.setenv("SHORTCUT_API_TOKEN", "fake-token-for-tests")
    monkeypatch.setattr(rdr, "search_deploy_ready_stories", lambda token: stories)
    monkeypatch.setattr(rdr, "resolve_default_prod_tag", lambda: prod_tag)
    oid_map = oid_by_pr or {}
    monkeypatch.setattr(
        rdr, "fetch_merge_oids",
        lambda pr_numbers, repo, max_workers=8: {n: oid_map[n] for n in pr_numbers if n in oid_map},
    )
    monkeypatch.setattr(rdr, "is_ancestor_of_prod", lambda oid, tag: ancestor_result)
    monkeypatch.setattr(rdr, "resolve_shipping_release_tag", lambda oid: shipping_tag)

    argv = ["reconcile_deploy_ready.py"] + (argv_extra or [])
    monkeypatch.setattr("sys.argv", argv)


def test_main_dry_run_is_the_default_and_never_calls_transition(monkeypatch, tmp_path, capsys):
    story = _story(11111, pull_requests=[_pr(3606)])
    _make_main_env(monkeypatch, tmp_path, [story], oid_by_pr={3606: "abc"}, ancestor_result=True)

    def _boom(*args, **kwargs):
        raise AssertionError("transition_story must never be called without --apply")

    monkeypatch.setattr(rdr, "transition_story", _boom)
    rdr.main()  # must not raise, must not exit non-zero

    out = capsys.readouterr().out
    assert "shipped=1" in out
    assert "would transition" in out


def test_main_apply_transitions_shipped_stories(monkeypatch, tmp_path, capsys):
    story = _story(11111, pull_requests=[_pr(3606)])
    _make_main_env(
        monkeypatch, tmp_path, [story], oid_by_pr={3606: "abc"}, ancestor_result=True,
        argv_extra=["--apply"],
    )

    calls = []

    def _fake_transition(story_id, done_state_id, token):
        calls.append((story_id, done_state_id))
        return story_id, True, None

    monkeypatch.setattr(rdr, "transition_story", _fake_transition)
    rdr.main()

    assert calls == [(11111, DONE_STATE_ID)]


def test_main_dry_run_flag_overrides_apply(monkeypatch, tmp_path, capsys):
    """--dry-run always wins if somehow both --apply and --dry-run are
    passed -- a bulk mutation across the whole org must never be one
    flag-typo away from firing."""
    story = _story(11111, pull_requests=[_pr(3606)])
    _make_main_env(
        monkeypatch, tmp_path, [story], oid_by_pr={3606: "abc"}, ancestor_result=True,
        argv_extra=["--apply", "--dry-run"],
    )

    def _boom(*args, **kwargs):
        raise AssertionError("transition_story must never be called when --dry-run is also passed")

    monkeypatch.setattr(rdr, "transition_story", _boom)
    rdr.main()  # must not raise


def test_main_writes_out_json_report(monkeypatch, tmp_path):
    story_shipped = _story(11111, pull_requests=[_pr(3606)])
    story_triage = _story(22222)  # no linked PRs at all
    out_path = tmp_path / "report.json"
    _make_main_env(
        monkeypatch, tmp_path, [story_shipped, story_triage],
        oid_by_pr={3606: "abc"}, ancestor_result=True,
        argv_extra=["--out", str(out_path)],
    )
    rdr.main()

    report = json.loads(out_path.read_text(encoding="utf-8"))
    assert report["counts"] == {"total": 2, "shipped": 1, "pending": 0, "triage": 1}
    assert report["applied"] is False
    assert [s["id"] for s in report["shipped"]] == [11111]
    assert [s["id"] for s in report["triage"]] == [22222]


def test_main_pending_bucket_when_qualifying_pr_not_yet_in_prod(monkeypatch, tmp_path):
    story = _story(11111, pull_requests=[_pr(3670)])
    out_path = tmp_path / "report.json"
    _make_main_env(
        monkeypatch, tmp_path, [story], oid_by_pr={3670: "def"}, ancestor_result=False,
        argv_extra=["--out", str(out_path)],
    )
    rdr.main()
    report = json.loads(out_path.read_text(encoding="utf-8"))
    assert report["counts"] == {"total": 1, "shipped": 0, "pending": 1, "triage": 0}
    assert report["pending"][0]["id"] == 11111


def test_main_missing_token_exits_before_any_shortcut_call(monkeypatch, tmp_path):
    monkeypatch.delenv("SHORTCUT_API_TOKEN", raising=False)

    def _boom(*args, **kwargs):
        raise AssertionError("no Shortcut call should happen without a token")

    monkeypatch.setattr(rdr, "search_deploy_ready_stories", _boom)
    monkeypatch.setattr("sys.argv", ["reconcile_deploy_ready.py"])
    with pytest.raises(SystemExit):
        rdr.main()


def test_main_failed_transition_exits_non_zero_and_is_reported(monkeypatch, tmp_path, capsys):
    """A story that fails to transition must be reported, not swallowed --
    and the process must exit non-zero so an unattended run can't look
    successful."""
    story = _story(11111, pull_requests=[_pr(3606)])
    _make_main_env(
        monkeypatch, tmp_path, [story], oid_by_pr={3606: "abc"}, ancestor_result=True,
        argv_extra=["--apply"],
    )
    monkeypatch.setattr(rdr, "transition_story", lambda sid, done, token: (sid, False, "HTTP 500 Internal Server Error"))

    with pytest.raises(SystemExit) as exc_info:
        rdr.main()
    assert exc_info.value.code != 0
    err = capsys.readouterr().err
    assert "11111" in err


def test_main_apply_all_triage_no_shipped_warns_and_exits_nonzero(monkeypatch, tmp_path, capsys):
    """Every story routes to triage, none shipped -- must not exit 0 as if
    the backlog were clean."""
    story = _story(11111)  # no linked PRs -> triage
    _make_main_env(monkeypatch, tmp_path, [story], argv_extra=["--apply"])

    with pytest.raises(SystemExit) as exc_info:
        rdr.main()
    assert exc_info.value.code != 0
    assert "WARNING" in capsys.readouterr().err


def test_main_dry_run_all_triage_no_shipped_does_not_exit_nonzero(monkeypatch, tmp_path):
    story = _story(11111)
    _make_main_env(monkeypatch, tmp_path, [story])  # dry-run default, no --apply

    rdr.main()  # must not raise


def test_main_apply_all_triage_but_no_stories_at_all_does_not_exit_nonzero(monkeypatch, tmp_path):
    """Empty backlog is not a silent no-op -- there's nothing to be silent about."""
    _make_main_env(monkeypatch, tmp_path, [], argv_extra=["--apply"])
    rdr.main()  # must not raise


def test_main_prod_tag_override_is_used_instead_of_default(monkeypatch, tmp_path):
    story = _story(11111, pull_requests=[_pr(3606)])
    out_path = tmp_path / "report.json"

    def _boom_default_tag():
        raise AssertionError("resolve_default_prod_tag must not be called when --prod-tag is given")

    monkeypatch.setenv("SHORTCUT_API_TOKEN", "fake-token-for-tests")
    monkeypatch.setattr(rdr, "search_deploy_ready_stories", lambda token: [story])
    monkeypatch.setattr(rdr, "resolve_default_prod_tag", _boom_default_tag)
    monkeypatch.setattr(rdr, "fetch_merge_oids", lambda pr_numbers, repo, max_workers=8: {3606: "abc"})
    monkeypatch.setattr(rdr, "is_ancestor_of_prod", lambda oid, tag: tag == "prod/explicit-tag")
    monkeypatch.setattr(rdr, "resolve_shipping_release_tag", lambda oid: None)
    monkeypatch.setattr(
        "sys.argv",
        ["reconcile_deploy_ready.py", "--prod-tag", "prod/explicit-tag", "--out", str(out_path)],
    )
    rdr.main()
    report = json.loads(out_path.read_text(encoding="utf-8"))
    assert report["prod_tag"] == "prod/explicit-tag"
    assert report["counts"]["shipped"] == 1


def test_workflow_passes_prod_tag_to_reconcile_step():
    """reconcile_deploy_ready.py's own --prod-tag handling is correct
    (tested above), but nothing at that level can catch the workflow
    itself forgetting to pass the flag -- assert the step's run block
    actually does."""
    import pathlib

    workflow = pathlib.Path(__file__).resolve().parents[3] / ".github" / "workflows" / "prod-release-notes.yaml"
    text = workflow.read_text(encoding="utf-8")
    start = text.index("Reconcile Deploy Ready backlog")
    end = text.index("- name:", start + 1)
    assert "--prod-tag" in text[start:end]


# --- resolve_default_prod_tag: newest by creation date -------------------

def test_resolve_default_prod_tag_picks_newest(monkeypatch):
    monkeypatch.setattr(
        rdr, "run_git",
        lambda args: "prod/2.0+chart.1\nprod/1.0+chart.1\n",
    )
    assert rdr.resolve_default_prod_tag() == "prod/2.0+chart.1"


def test_resolve_default_prod_tag_dies_with_no_tags(monkeypatch):
    monkeypatch.setattr(rdr, "run_git", lambda args: "")
    with pytest.raises(SystemExit):
        rdr.resolve_default_prod_tag()


# --- resolve_shipping_release_tag: the TRUE (earliest) release, not the --
# --- current --prod-tag -- see the module docstring for why this matters --

def test_resolve_shipping_release_tag_picks_earliest_containing_tag(monkeypatch):
    """--sort=creatordate (ascending) here is the OPPOSITE of
    resolve_default_prod_tag's -creatordate -- this wants the FIRST release
    that ever contained the commit, not the newest tag overall."""
    class _Proc:
        returncode = 0
        stdout = "prod/6.100.0-prod.1+chart.0.85.8-prod.1\nprod/6.111.0-prod.2+chart.0.87.5-prod.1\n"
        stderr = ""

    captured_args = {}

    def _fake_run(args, **kwargs):
        captured_args["args"] = args
        return _Proc()

    monkeypatch.setattr(rdr.subprocess, "run", _fake_run)
    tag = rdr.resolve_shipping_release_tag("abc123")
    assert tag == "prod/6.100.0-prod.1+chart.0.85.8-prod.1"
    assert "--contains" in captured_args["args"]
    assert "abc123" in captured_args["args"]
    assert "--sort=creatordate" in captured_args["args"]  # ascending, not -creatordate


def test_resolve_shipping_release_tag_returns_none_when_no_tag_contains_it(monkeypatch):
    class _Proc:
        returncode = 0
        stdout = ""
        stderr = ""

    monkeypatch.setattr(rdr.subprocess, "run", lambda *a, **k: _Proc())
    assert rdr.resolve_shipping_release_tag("abc123") is None


def test_resolve_shipping_release_tag_returns_none_and_warns_on_git_failure(monkeypatch, capsys):
    class _Proc:
        returncode = 128
        stdout = ""
        stderr = "fatal: malformed object name abc123"

    monkeypatch.setattr(rdr.subprocess, "run", lambda *a, **k: _Proc())
    assert rdr.resolve_shipping_release_tag("abc123") is None
    assert "WARNING" in capsys.readouterr().err



# --- main(): shipping_release_tag / hydrated_story end-to-end ------------

def test_main_report_attaches_hydrated_story_when_shipping_release_matches_current(monkeypatch, tmp_path):
    """End-to-end: a shipped story whose derived release equals the
    CURRENT prod tag gets a hydrated_story entry in the report -- the
    signal a separate merge step uses to fold it into today's release
    notes."""
    story = _story(11111, name="Some Story", pull_requests=[_pr(3606)], description="A description")
    out_path = tmp_path / "report.json"
    _make_main_env(
        monkeypatch, tmp_path, [story], oid_by_pr={3606: "abc"}, ancestor_result=True,
        prod_tag="prod/1.0", shipping_tag="prod/1.0",
        argv_extra=["--out", str(out_path)],
    )
    rdr.main()
    report = json.loads(out_path.read_text(encoding="utf-8"))
    entry = report["shipped"][0]
    assert entry["shipping_release_tag"] == "prod/1.0"
    assert entry["hydrated_story"]["id"] == 11111
    assert entry["hydrated_story"]["name"] == "Some Story"


def test_main_report_excludes_hydrated_story_for_an_earlier_release(monkeypatch, tmp_path):
    story = _story(11111, pull_requests=[_pr(3606)])
    out_path = tmp_path / "report.json"
    _make_main_env(
        monkeypatch, tmp_path, [story], oid_by_pr={3606: "abc"}, ancestor_result=True,
        prod_tag="prod/9.9.9-prod.1+chart.9.9.9-prod.1", shipping_tag="prod/6.100.0-prod.1+chart.0.85.8-prod.1",
        argv_extra=["--out", str(out_path)],
    )
    rdr.main()
    report = json.loads(out_path.read_text(encoding="utf-8"))
    entry = report["shipped"][0]
    assert entry["shipping_release_tag"] == "prod/6.100.0-prod.1+chart.0.85.8-prod.1"
    assert "hydrated_story" not in entry


def test_main_report_excludes_hydrated_story_when_release_unresolvable(monkeypatch, tmp_path):
    story = _story(11111, pull_requests=[_pr(3606)])
    out_path = tmp_path / "report.json"
    _make_main_env(
        monkeypatch, tmp_path, [story], oid_by_pr={3606: "abc"}, ancestor_result=True,
        prod_tag="prod/9.9.9-prod.1+chart.9.9.9-prod.1", shipping_tag=None,
        argv_extra=["--out", str(out_path)],
    )
    rdr.main()
    report = json.loads(out_path.read_text(encoding="utf-8"))
    entry = report["shipped"][0]
    assert entry["shipping_release_tag"] is None
    assert "hydrated_story" not in entry


def test_main_never_posts_to_shortcut_beyond_the_state_transition(monkeypatch, tmp_path):
    """Regression guard for the removed write-back comment feature: even
    on a real --apply run, the only Shortcut mutation this script performs
    is the workflow_state_id PUT (transition_story) -- nothing else calls
    out to Shortcut."""
    story = _story(11111, pull_requests=[_pr(3606)])
    _make_main_env(
        monkeypatch, tmp_path, [story], oid_by_pr={3606: "abc"}, ancestor_result=True,
        argv_extra=["--apply"],
    )
    calls = []
    monkeypatch.setattr(
        rdr, "transition_story",
        lambda sid, done, token: (calls.append(sid), sid, True, None)[1:],
    )
    rdr.main()
    assert calls == [11111]
    assert not hasattr(rdr, "shortcut_comment")
