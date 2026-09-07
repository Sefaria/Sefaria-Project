#!/usr/bin/env python3
"""
Reconcile "Deploy Ready" Shortcut stories against what has actually reached
prod, regardless of which release shipped them (RC2 in the incident
writeup).

`shipped_stories.py` + `mark_stories_deployed.py` only ever look at the
commit range for ONE release (prev-tag..cur-tag). A story whose PR merged
and shipped in an EARLIER release -- or before this pipeline existed at all
-- never gets revisited: nothing ever walks backward and asks "is this
Deploy Ready story actually done?". Of 20 stories stuck in Deploy Ready when
this was diagnosed, 10 were this class of bug versus 1 for the git-only
discovery gap (RC1, fixed in shipped_stories.py) -- this is the dominant
defect.

This script is a standalone, org-wide sweep: it enumerates EVERY
non-archived Deploy Ready story (not just stories that happen to fall in
some git range), resolves each one's linked, merged PR(s), and checks
whether any of those PRs' merge commits actually landed in the current prod
tag. It classifies every story into exactly one of three buckets:

  - shipped  -- at least one qualifying PR is an ancestor of the prod tag.
                Transitioned Deploy Ready -> Done (500000045 -> 500000010).
  - pending  -- has a qualifying merged PR, but none of them are in prod
                yet. Left alone -- this is the CORRECT state, not a bug.
  - triage   -- no qualifying PR at all (nothing merged, wrong repo, a
                promotion PR instead of the real one, ...), or the story
                lives in a non-Standard Shortcut workflow where the Deploy
                Ready/Done state ids used here don't even apply. Left
                alone and reported for a human to look at -- this is the
                part of the output that actually needs eyes on it.

Four guards apply before a linked PR counts as evidence a story shipped --
each one caught a real false positive while this script was being built
against live data:

  1. repository_id must be Sefaria-Project's (500000103). A story can link
     a PR from a DIFFERENT repo (e.g. a docs or infra repo); resolving that
     PR number against Sefaria-Project instead finds an unrelated, often
     much older, PR that happens to share the number -- and that PR can
     easily already be in prod. Skipping this guard silently reports "in
     prod" for a story that never shipped anything to Sefaria-Project at
     all.
  2. target_branch_name must be "master". Some stories link a PROMOTION PR
     (preprod -> prod, or master -> preprod) instead of, or alongside, the
     actual feature PR. A promotion PR merges constantly and proves nothing
     about whether THIS story's own change reached prod.
  3. merged must be true. An open or closed-without-merging PR is not
     evidence of anything having shipped.
  4. workflow_id must be Sefaria's "Standard" workflow (500000005), and
     workflow_state_id must be exactly the numeric Deploy Ready state id
     (500000045) within it. The Shortcut state named "Deploy Ready" (note:
     the real name carries a trailing space, "Deploy Ready ") is
     workflow-specific -- 500000045 does not exist as a concept in, say,
     the Content workflow (500000061). A story living in a different
     workflow that the search endpoint still matched by state NAME must
     never be transitioned using Standard's state ids; it's routed to
     triage with its actual workflow/state ids reported instead, mirroring
     mark_stories_deployed.py's skipped_different_workflow handling.

Enumeration uses the token'd search endpoint
(`search/stories?query=state:"Deploy Ready" !is:archived`), paginated via
its `next` cursor -- NOT `iterations-get-active`, which is silently scoped
to the calling token's own teams and has already produced an incomplete
picture for this team once. The search endpoint returned all 20 stuck
stories across 4 different teams in testing; iterations-get-active would
have missed most of them.

For each qualifying PR, its merge commit SHA is resolved via
`gh pr view --json mergeCommit` and tested with
`git merge-base --is-ancestor <sha> <prod-tag>` against the newest `prod/*`
tag (by `--sort=-creatordate`) unless `--prod-tag` overrides it. This is the
same ancestry check verified against live data to correctly discriminate
merged-but-not-yet-promoted PRs (not an ancestor) from ones that already
reached prod (an ancestor) -- `git log --grep="(#N)"` was tried and
rejected: it misses squash-merge subjects and can't tell a real promotion
merge apart from an unrelated one.

--dry-run is the default (matching mark_stories_deployed.py's posture, only
stricter): this is a bulk mutation of shared team state across potentially
many stories and several different teams, and unlike a single release's
handful of stories, there's no natural moment (a deploy) that makes running
it low-risk. Nothing is ever transitioned without an explicit --apply.

Emits a JSON report (--out) with all three buckets in full, plus a readable
stdout summary. CRITICAL: this script never reads or writes
shipped-stories.json and never feeds the release-notes prose step -- the
stories it backfills shipped in EARLIER releases, and leaking them into
today's release announcement would have Slack claim a dozen old features
shipped today. Reconciliation transitions Shortcut state only; it has no
opinion about what today's release notes should say.

Immediately after a story is ACTUALLY transitioned by this run, a short
write-back comment is posted on it via `POST /stories/{id}/comments`
(shortcut_comment.py, shared with mark_stories_deployed.py's own
write-back) -- but the SAME "old features shipped today" mistake this
script's whole shipped-stories.json separation exists to avoid can just as
easily happen inside a single Shortcut comment, so the comment text is
built differently here than in mark_stories_deployed.py. That script knows
the current release's own version/chart/date directly (it's reading that
release's own shipped-stories.json); this script does NOT -- a story it
backfills shipped in some EARLIER release, and naming the CURRENT prod tag
in its comment would tell a reader it shipped TODAY, which is false. So
this script instead asks git for the TRUE release: `git tag --list
'prod/*' --contains <merge-oid> --sort=creatordate | head -1` -- the
first (earliest-created) prod/* tag that actually contains the winning
PR's merge commit, i.e. the release that really carried it. If that can't
be resolved for any reason (shallow checkout, tag history gap, ...), the
comment degrades HONESTLY: it says only that the story was detected as
already present in production as of the current prod tag, and names the
PR -- it never guesses or implies a specific release.

A comment is posted ONLY for a story this run actually transitioned --
never for pending/triage, and never merely because a dry-run run
classified it as shipped. A comment failure is logged and recorded in
`comment_failed` but never fails the run or rolls back the transition.
Posting is skipped entirely in dry-run (which instead reports what WOULD
be posted) and with --no-comment.

Usage:
    python3 reconcile_deploy_ready.py [--dry-run]
    python3 reconcile_deploy_ready.py --apply
    python3 reconcile_deploy_ready.py --apply --prod-tag prod/6.111.0-prod.2+chart.0.87.5-prod.1 --out reconcile-report.json

Requires `git` and `gh` on PATH (same as shipped_stories.py) and
SHORTCUT_API_TOKEN -- required even for --dry-run, since enumeration and
the PR<->story evidence both come from the Shortcut API, not from git.

All story ids shown in this file's docstring and comments (e.g. 11111,
22222) are placeholders, not real Shortcut story ids. The repo/workflow/
state ids (500000103, 500000005, 500000045, 500000010, 500000061) are real
Shortcut/GitHub ids, not story ids, and are not covered by that placeholder
rule -- same convention as shipped_stories.py and mark_stories_deployed.py.
"""

import argparse
import concurrent.futures
import json
import os
import subprocess
import sys
import urllib.error
import urllib.parse
import urllib.request

# The PR-level shipping-evidence guards (merged / right repo / right target
# branch) are shared with shipped_stories.py's RC1 PR-link fallback -- see
# shortcut_pr_guards.py's own docstring for why a single shared
# implementation matters here (a promotion PR is exactly as good at fooling
# either script, and the two must never silently drift apart on what counts
# as evidence). build/ci is not a package (see tests/conftest.py), but a
# plain sibling-module import works both when this file is run directly
# (python3 puts its own directory on sys.path[0]) and under pytest (the test
# conftest adds build/ci to sys.path the same way).
import shortcut_pr_guards

# The story-comment POST mechanics are shared with mark_stories_deployed.py
# -- see shortcut_comment.py's own docstring for why (and for why the
# comment TEXT itself is deliberately NOT shared -- this script and
# mark_stories_deployed.py know different things about which release
# actually shipped a story).
import shortcut_comment

SHORTCUT_API_BASE = "https://api.app.shortcut.com/api/v3"
SHORTCUT_API_ROOT = "https://api.app.shortcut.com"

# Sefaria's "Standard" Shortcut workflow -- same ids mark_stories_deployed.py
# defaults to. Kept as separate constants here (not imported) because these
# CI scripts are deliberately standalone, single-file tools -- see the
# existing die()/warn() duplication between shipped_stories.py and
# mark_stories_deployed.py, which follows the same convention. (The PR-level
# guard constants/functions are the one deliberate exception -- see the
# shortcut_pr_guards import above.)
STANDARD_WORKFLOW_ID = 500000005
DEPLOY_READY_STATE_ID = 500000045
DONE_STATE_ID = 500000010

# Guard #1/#2 defaults -- re-exported from shortcut_pr_guards so the rest of
# this file (and its tests) can keep referring to them by their existing
# names here.
SEFARIA_PROJECT_REPO_ID = shortcut_pr_guards.SEFARIA_PROJECT_REPO_ID
DEFAULT_TARGET_BRANCH = shortcut_pr_guards.DEFAULT_TARGET_BRANCH
DEFAULT_REPO = "Sefaria/Sefaria-Project"

# `branch:"..."` and `pull-request:N` do NOT resolve a PR to its story on
# this Shortcut org -- verified empirically. `pr:N` is the only search
# operator that works, both here and in shipped_stories.fetch_story_by_pr_link.
DEPLOY_READY_SEARCH_QUERY = 'state:"Deploy Ready" !is:archived'


def die(message: str) -> None:
    print(f"ERROR: {message}", file=sys.stderr)
    sys.exit(1)


def warn(message: str) -> None:
    print(f"WARNING: {message}", file=sys.stderr)


def run_git(args):
    """Run a git subcommand, returning stdout. Exits the process on failure.
    Mirrors shipped_stories.run_git -- used here only for the plain,
    always-expected-to-succeed prod-tag listing; the ancestry check below
    needs its own non-fatal handling of git's exit codes, so it does not go
    through this helper."""
    proc = subprocess.run(["git", *args], capture_output=True, text=True)
    if proc.returncode != 0:
        die(f"git {' '.join(args)} failed: {proc.stderr.strip()}")
    return proc.stdout


def resolve_default_prod_tag():
    """Newest prod/* tag by creation date, the same ordering
    shipped_stories.py uses for --version resolution. Dies if there are no
    prod/* tags at all -- with none, there's no prod state to reconcile
    against, and --prod-tag can be passed explicitly if that's ever wrong."""
    tags = [t for t in run_git(["tag", "--list", "prod/*", "--sort=-creatordate"]).splitlines() if t.strip()]
    if not tags:
        die("No 'prod/*' tags found in this checkout; pass --prod-tag explicitly.")
    return tags[0]


def search_deploy_ready_stories(token):
    """Enumerate ALL non-archived Deploy Ready stories via the token'd
    search endpoint, paginated via its `next` cursor. Deliberately NOT
    `iterations-get-active`: that endpoint is silently scoped to the
    calling token's own teams, while `search/stories` returned all 20
    stuck stories across 4 different teams when this was verified live --
    org-wide is exactly what "every Deploy Ready story" requires."""
    stories = []
    next_path = f"/api/v3/search/stories?query={urllib.parse.quote(DEPLOY_READY_SEARCH_QUERY)}"
    while next_path:
        url = next_path if next_path.startswith("http") else SHORTCUT_API_ROOT + next_path
        req = urllib.request.Request(url, headers={"Shortcut-Token": token, "Accept": "application/json"})
        with urllib.request.urlopen(req, timeout=20) as resp:
            body = json.loads(resp.read().decode("utf-8"))
        stories.extend(body.get("data", []))
        next_path = body.get("next")
    return stories


# gather_linked_prs / qualifying_prs (guards #1-3) now live in
# shortcut_pr_guards.py, shared with shipped_stories.py's RC1 fallback --
# re-exported here under their existing names so nothing else in this file
# (or its tests) needs to change. Guard #4 (workflow/state) is a
# story-level check specific to the Deploy Ready sweep and stays local to
# classify_stories below.
gather_linked_prs = shortcut_pr_guards.gather_linked_prs
qualifying_prs = shortcut_pr_guards.qualifying_prs


def fetch_pr_merge_oid(pr_number, repo):
    """Resolve a merged PR's merge commit SHA via `gh pr view --json
    mergeCommit`. Mirrors shipped_stories.fetch_pr_branch's error posture: a
    failed lookup is logged and returns None rather than raising -- one
    story's PR being unreachable must never abort the whole sweep."""
    proc = subprocess.run(
        ["gh", "pr", "view", str(pr_number), "--repo", repo, "--json", "mergeCommit"],
        capture_output=True,
        text=True,
    )
    if proc.returncode != 0:
        warn(f"gh pr view {pr_number} --repo {repo} failed: {proc.stderr.strip()}")
        return pr_number, None
    try:
        data = json.loads(proc.stdout)
    except json.JSONDecodeError as e:
        warn(f"gh pr view {pr_number} --repo {repo} returned invalid JSON: {e}")
        return pr_number, None
    oid = (data.get("mergeCommit") or {}).get("oid")
    return pr_number, oid


def fetch_merge_oids(pr_numbers, repo, max_workers=8):
    """Batch-resolve fetch_pr_merge_oid across every qualifying PR in this
    sweep concurrently -- same pattern as shipped_stories.fetch_branches."""
    oid_by_pr = {}
    if not pr_numbers:
        return oid_by_pr
    with concurrent.futures.ThreadPoolExecutor(max_workers=max_workers) as executor:
        futures = [executor.submit(fetch_pr_merge_oid, n, repo) for n in pr_numbers]
        for future in concurrent.futures.as_completed(futures):
            try:
                pr_number, oid = future.result()
            except FileNotFoundError:
                # Every other in-flight lookup will hit the same error --
                # fail fast with one clear message instead of N tracebacks.
                die("`gh` was not found on PATH. Install the GitHub CLI "
                    "(https://cli.github.com/) or ensure it's available in "
                    "this environment; PR merge-commit lookups cannot proceed without it.")
            if oid:
                oid_by_pr[pr_number] = oid
    return oid_by_pr


def is_ancestor_of_prod(oid, prod_tag):
    """True if commit `oid` reached prod (is an ancestor of `prod_tag`),
    False if git can definitively say it did not. Returns None if the check
    itself couldn't run (e.g. a shallow checkout that never fetched `oid`)
    -- that's a local-repo problem, not proof either way, and must not be
    conflated with a confirmed "not in prod" (which would misclassify a
    story that may well have shipped as merely pending)."""
    proc = subprocess.run(
        ["git", "merge-base", "--is-ancestor", oid, prod_tag],
        capture_output=True,
        text=True,
    )
    if proc.returncode == 0:
        return True
    if proc.returncode == 1:
        return False
    warn(f"git merge-base --is-ancestor {oid} {prod_tag} could not run (rc={proc.returncode}): {proc.stderr.strip()}")
    return None


def resolve_shipping_release_tag(oid):
    """The TRUE release that shipped commit `oid`: the first (earliest
    created) `prod/*` tag that actually contains it. Used ONLY for the
    write-back comment's text -- see the module docstring for why this
    script cannot just name the current `--prod-tag` the way
    mark_stories_deployed.py names its own release: a story backfilled by
    this sweep almost never shipped in the CURRENT release, and a comment
    claiming otherwise would be actively misleading, not just imprecise.

    `--sort=creatordate` (ascending, oldest first) is deliberate and the
    OPPOSITE of resolve_default_prod_tag's `-creatordate` above -- that one
    wants the newest tag (today's release); this one wants the OLDEST tag
    that still contains the commit, i.e. the first release it ever
    reached. Returns None if the lookup fails outright (non-fatal --
    logged and the caller degrades the comment text honestly) or if no
    prod/* tag contains it at all (e.g. a shallow checkout, or a genuine
    gap in tag history) -- both cases must never be guessed past."""
    proc = subprocess.run(
        ["git", "tag", "--list", "prod/*", "--contains", oid, "--sort=creatordate"],
        capture_output=True,
        text=True,
    )
    if proc.returncode != 0:
        warn(f"git tag --list --contains {oid} failed: {proc.stderr.strip()}")
        return None
    tags = [t for t in proc.stdout.splitlines() if t.strip()]
    return tags[0] if tags else None


def _reconcile_comment_text(story_entry, oid_by_pr, prod_tag, repo):
    """Write-back comment text for a story THIS SWEEP actually transitioned.
    See resolve_shipping_release_tag and the module docstring for why this
    resolves the TRUE shipping release from git rather than naming the
    current --prod-tag: naming the current release for a backfilled story
    would be exactly the "old features shipped today" mistake this whole
    script's two-output separation (never touching shipped-stories.json)
    exists to prevent -- just showing up in a Shortcut comment instead of a
    Slack post."""
    pr_numbers = story_entry.get("shipped_via_prs") or []
    if pr_numbers:
        pr_line = "PR(s): " + ", ".join(f"https://github.com/{repo}/pull/{n}" for n in pr_numbers)
    else:
        pr_line = "PR(s): unavailable."

    shipping_tag = None
    if pr_numbers:
        oid = oid_by_pr.get(pr_numbers[0])
        if oid:
            shipping_tag = resolve_shipping_release_tag(oid)

    if shipping_tag:
        headline = (
            f"Detected as shipped in {shipping_tag} — found while reconciling the Deploy "
            "Ready backlog (not part of today's release)."
        )
    else:
        headline = (
            f"Detected as already present in production as of {prod_tag} — found while "
            "reconciling the Deploy Ready backlog; the exact shipping release could not be "
            "determined."
        )

    return (
        "\U0001F916 Automated update — posted by the Deploy Ready reconciliation sweep; no reply expected.\n"
        f"{headline}\n"
        f"{pr_line}"
    )


def transition_story(story_id, done_state_id, token):
    """PUT a workflow_state_id update to Shortcut. Mirrors
    mark_stories_deployed.transition_story exactly (kept as its own copy
    here rather than imported, for the same standalone-script reason the
    die()/warn() duplication above follows)."""
    url = f"{SHORTCUT_API_BASE}/stories/{story_id}"
    body = json.dumps({"workflow_state_id": done_state_id}).encode("utf-8")
    req = urllib.request.Request(url, data=body, method="PUT")
    req.add_header("Shortcut-Token", token)
    req.add_header("Content-Type", "application/json")
    try:
        with urllib.request.urlopen(req, timeout=20) as resp:
            resp.read()
        return story_id, True, None
    except urllib.error.HTTPError as e:
        return story_id, False, f"HTTP {e.code} {e.reason}"
    except Exception as e:  # noqa: BLE001 - a per-story failure must never abort the run
        return story_id, False, str(e)


def transition_stories(story_ids, done_state_id, token, max_workers=8):
    transitioned = []
    failed = []
    if not story_ids:
        return transitioned, failed
    with concurrent.futures.ThreadPoolExecutor(max_workers=max_workers) as executor:
        futures = [executor.submit(transition_story, sid, done_state_id, token) for sid in story_ids]
        for future in concurrent.futures.as_completed(futures):
            sid, ok, err = future.result()
            if ok:
                transitioned.append(sid)
            else:
                warn(f"Failed to transition story {sid}: {err}")
                failed.append((sid, err))
    return transitioned, failed


def _story_summary(story):
    return {"id": story.get("id"), "name": story.get("name"), "url": story.get("app_url")}


def _triage_context(story):
    """Extra context for a TRIAGE story only, already sitting in the same
    Shortcut search response that produced `story` -- adds no extra API
    calls ("cheap", as opposed to e.g. an extra `gh pr view` round trip
    per triage story, which this deliberately avoids). This is the raw
    material a human (or the opt-in triage-explainer workflow step
    downstream -- see build/ci/triage_explainer.py) needs to propose why a
    story is stuck, without re-deriving it from scratch."""
    return {
        "description": story.get("description"),
        "comments": [c.get("text") for c in (story.get("comments") or []) if c.get("text")],
    }


def _diagnose_linked_pr(pr, repo_id, target_branch):
    """Which of the three PR-level guards (see qualifying_prs /
    shortcut_pr_guards.passes_pr_guards) this specific linked PR fails, if
    any. Diagnostic ONLY -- classification itself never reads this; it
    exists purely so a triage story's report entry can say WHY a linked PR
    didn't count instead of just listing its bare number."""
    failed = []
    if pr.get("merged") is not True:
        failed.append("not merged")
    if pr.get("repository_id") != repo_id:
        failed.append(f"wrong repo (repository_id={pr.get('repository_id')}, expected {repo_id})")
    if pr.get("target_branch_name") != target_branch:
        failed.append(f"wrong target branch ({pr.get('target_branch_name')!r}, expected {target_branch!r})")
    return failed


def classify_stories(stories, repo_id, target_branch):
    """Pure classification, no I/O beyond what's already embedded in the
    Shortcut story payloads: split into (triage, candidates), where
    candidates is a list of (story, qualifying_prs) pairs still needing a
    prod-ancestry check. Guard #4 (workflow + numeric state id) is applied
    first and unconditionally routes to triage -- a story on any workflow
    other than Standard, or sitting at any state id other than the numeric
    Deploy Ready id (500000045) despite matching the "Deploy Ready" state
    NAME search, must never reach the PR guards or a transition at all.

    Every triage entry also carries _triage_context (description, comment
    text) -- shipped/pending entries deliberately do NOT, so they stay as
    lean as before this was added; only a triage story's own report entry
    ever needs to answer "why is this one stuck"."""
    triage = []
    candidates = []
    for story in stories:
        if story.get("workflow_id") != STANDARD_WORKFLOW_ID or story.get("workflow_state_id") != DEPLOY_READY_STATE_ID:
            entry = _story_summary(story)
            entry["reason"] = "non_standard_workflow_or_state"
            entry["workflow_id"] = story.get("workflow_id")
            entry["workflow_state_id"] = story.get("workflow_state_id")
            entry.update(_triage_context(story))
            triage.append(entry)
            warn(
                f"Story {story.get('id')} matched the Deploy Ready search but is on "
                f"workflow_id={story.get('workflow_id')} / workflow_state_id={story.get('workflow_state_id')} "
                f"(expected workflow_id={STANDARD_WORKFLOW_ID}, workflow_state_id={DEPLOY_READY_STATE_ID}); "
                "routing to triage, not transitioning."
            )
            continue

        linked = gather_linked_prs(story)
        qualifying = qualifying_prs(linked, repo_id=repo_id, target_branch=target_branch)
        if not qualifying:
            entry = _story_summary(story)
            entry["reason"] = "no_qualifying_pr"
            entry["linked_pr_numbers"] = sorted(
                pr.get("number") for pr in linked if pr.get("number") is not None
            )
            # Full per-PR diagnostic, sorted the same way as
            # linked_pr_numbers above for a stable, readable report --
            # linked_pr_numbers stays as-is (existing consumers rely on
            # it); this is additive.
            entry["linked_prs"] = [
                {"number": pr.get("number"), "failed_guards": _diagnose_linked_pr(pr, repo_id, target_branch)}
                for pr in sorted(linked, key=lambda p: (p.get("number") is None, p.get("number")))
            ]
            entry.update(_triage_context(story))
            triage.append(entry)
            continue

        candidates.append((story, qualifying))
    return triage, candidates


def classify_candidates(candidates, oid_by_pr, prod_tag):
    """For each (story, qualifying_prs) candidate, check every qualifying
    PR's merge commit for prod ancestry and split into shipped / pending.
    A PR whose merge oid never resolved, or whose ancestry check itself
    couldn't run, counts as inconclusive -- never as "in prod" -- so a
    resolution failure can only ever push a story toward pending (leave it
    alone), never wrongly toward shipped (a mutation)."""
    shipped = []
    pending = []
    for story, prs in candidates:
        shipped_via = []
        for pr in prs:
            oid = oid_by_pr.get(pr["number"])
            if not oid:
                continue
            if is_ancestor_of_prod(oid, prod_tag) is True:
                shipped_via.append(pr["number"])

        entry = _story_summary(story)
        entry["qualifying_prs"] = sorted(pr["number"] for pr in prs)
        if shipped_via:
            entry["shipped_via_prs"] = sorted(shipped_via)
            shipped.append(entry)
        else:
            pending.append(entry)
    return shipped, pending


def print_summary(report):
    """Readable stdout summary. The triage list is printed in FULL, not
    just counted -- it's the part of this report a human actually has to
    act on."""
    counts = report["counts"]
    print(f"Prod tag: {report['prod_tag']}")
    print(f"Mode: {'APPLY (mutating)' if report['applied'] else 'dry-run (no mutation)'}")
    print(
        f"shipped={counts['shipped']} pending={counts['pending']} "
        f"triage={counts['triage']} (total Deploy Ready stories seen: {counts['total']})"
    )
    print()

    print(f"--- shipped ({len(report['shipped'])}) ---")
    for s in report["shipped"]:
        if not report["applied"]:
            status = "would transition"
        elif s.get("transitioned"):
            status = "transitioned"
        else:
            status = f"FAILED: {s.get('transition_error')}"
        print(f"  {s['id']}  {s.get('name', '')!r}  via PR(s) {s.get('shipped_via_prs')}  [{status}]")
        if s.get("would_comment"):
            preview = "\n".join(f"      {line}" for line in s["would_comment"].splitlines())
            print(f"    would post comment:\n{preview}")
        elif s.get("comment_posted"):
            print("    comment posted")
        elif s.get("comment_error"):
            print(f"    comment FAILED: {s['comment_error']}")

    print(f"--- pending ({len(report['pending'])}) ---")
    for s in report["pending"]:
        print(f"  {s['id']}  {s.get('name', '')!r}  qualifying PR(s) {s.get('qualifying_prs')} not yet in prod")

    print(f"--- triage ({len(report['triage'])}) ---")
    for s in report["triage"]:
        if s["reason"] == "non_standard_workflow_or_state":
            print(
                f"  {s['id']}  {s.get('name', '')!r}  reason=non_standard_workflow_or_state "
                f"workflow_id={s.get('workflow_id')} workflow_state_id={s.get('workflow_state_id')}"
            )
        else:
            print(
                f"  {s['id']}  {s.get('name', '')!r}  reason=no_qualifying_pr "
                f"linked_pr_numbers={s.get('linked_pr_numbers')}"
            )


def build_arg_parser():
    parser = argparse.ArgumentParser(
        description="Reconcile Deploy Ready Shortcut stories against what has actually reached prod.",
    )
    parser.add_argument(
        "--apply", action="store_true",
        help="Actually transition qualifying stories Deploy Ready -> Done. Without this, "
             "the sweep only classifies and reports; nothing is mutated.",
    )
    parser.add_argument(
        "--dry-run", action="store_true",
        help="Explicit no-op flag for symmetry with mark_stories_deployed.py: classify and "
             "report, mutate nothing. This is already the default without --apply, and "
             "always wins if both are passed.",
    )
    parser.add_argument(
        "--prod-tag",
        help="Prod tag to check ancestry against (default: newest 'prod/*' tag by creation date).",
    )
    parser.add_argument("--repo", default=DEFAULT_REPO, help=f"GitHub repo for `gh pr view` lookups, default {DEFAULT_REPO}")
    parser.add_argument(
        "--target-branch", default=DEFAULT_TARGET_BRANCH,
        help=f"Required PR target branch for a linked PR to count as shipping evidence (guard #2), "
             f"default {DEFAULT_TARGET_BRANCH!r}",
    )
    parser.add_argument("--out", help="Write the machine-readable JSON report to this path")
    parser.add_argument(
        "--no-comment", action="store_true",
        help="Transition stories but skip posting the write-back release comment.",
    )
    parser.add_argument("--max-workers", type=int, default=8)
    return parser


def main():
    args = build_arg_parser().parse_args()

    token = os.environ.get("SHORTCUT_API_TOKEN")
    if not token:
        die(
            "SHORTCUT_API_TOKEN is not set. Required even for --dry-run: enumerating Deploy "
            "Ready stories and resolving their linked PRs both come from the Shortcut API, "
            "not from git."
        )

    prod_tag = args.prod_tag or resolve_default_prod_tag()

    try:
        stories = search_deploy_ready_stories(token)
    except (urllib.error.URLError, urllib.error.HTTPError, json.JSONDecodeError, OSError) as e:
        die(f"Failed to enumerate Deploy Ready stories from Shortcut: {e}")

    triage, candidates = classify_stories(stories, SEFARIA_PROJECT_REPO_ID, args.target_branch)

    all_qualifying_pr_numbers = sorted(
        {pr["number"] for _, prs in candidates for pr in prs if pr.get("number") is not None}
    )
    oid_by_pr = fetch_merge_oids(all_qualifying_pr_numbers, args.repo, args.max_workers)

    shipped, pending = classify_candidates(candidates, oid_by_pr, prod_tag)

    # --dry-run always wins over --apply if somehow both are passed -- a
    # bulk mutation of shared team state should never be one flag-typo away
    # from firing.
    apply_mutations = args.apply and not args.dry_run

    failed_transitions = []
    comment_posted = []
    comment_failed = []
    if apply_mutations:
        transitioned_ids, failed_transitions = transition_stories(
            [s["id"] for s in shipped], DONE_STATE_ID, token, args.max_workers
        )
        transitioned_set = set(transitioned_ids)
        failed_by_id = dict(failed_transitions)
        for s in shipped:
            s["transitioned"] = s["id"] in transitioned_set
            if s["id"] in failed_by_id:
                s["transition_error"] = failed_by_id[s["id"]]

        # Comment ONLY on a story THIS RUN actually transitioned -- never a
        # candidate whose PUT itself failed, and never pending/triage.
        # Re-runs never re-post: a transitioned story leaves Deploy Ready,
        # so it's simply absent from the NEXT run's search results -- no
        # separate dedupe index is needed.
        if not args.no_comment:
            for s in shipped:
                if not s["transitioned"]:
                    continue
                comment_text = _reconcile_comment_text(s, oid_by_pr, prod_tag, args.repo)
                sid, ok, err = shortcut_comment.post_story_comment(s["id"], comment_text, token)
                if ok:
                    comment_posted.append(sid)
                    s["comment_posted"] = True
                else:
                    warn(f"Failed to post release comment on story {sid}: {err}")
                    comment_failed.append({"id": sid, "error": err})
                    s["comment_error"] = err
    else:
        for s in shipped:
            s["transitioned"] = None  # not attempted -- dry-run
            # Preview-only: never calls Shortcut, but DOES shell out to git
            # (resolve_shipping_release_tag) -- read-only local introspection,
            # not a live mutation, so it's safe to compute even in dry-run.
            if not args.no_comment:
                s["would_comment"] = _reconcile_comment_text(s, oid_by_pr, prod_tag, args.repo)

    report = {
        "prod_tag": prod_tag,
        "applied": apply_mutations,
        "counts": {
            "total": len(stories),
            "shipped": len(shipped),
            "pending": len(pending),
            "triage": len(triage),
            "comment_posted": len(comment_posted),
            "comment_failed": len(comment_failed),
        },
        "shipped": shipped,
        "pending": pending,
        "triage": triage,
        "comment_posted": sorted(comment_posted),
        "comment_failed": sorted(comment_failed, key=lambda d: (d["id"] is None, d["id"])),
    }

    print_summary(report)

    if args.out:
        with open(args.out, "w", encoding="utf-8") as f:
            json.dump(report, f, indent=2, ensure_ascii=False)
            f.write("\n")

    if failed_transitions:
        warn(
            f"{len(failed_transitions)} stor{'y' if len(failed_transitions) == 1 else 'ies'} "
            f"failed to transition: {failed_transitions}"
        )
        sys.exit(1)


if __name__ == "__main__":
    main()
