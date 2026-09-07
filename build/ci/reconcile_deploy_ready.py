#!/usr/bin/env python3
"""
Reconciles "Deploy Ready" Shortcut stories against what has actually
reached prod, org-wide and regardless of which release shipped them.

Enumerates every non-archived Deploy Ready story, resolves each one's
linked, merged PR(s), and checks whether any of those PRs' merge commits
landed in the current prod tag. Classifies each story as shipped
(transitioned Deploy Ready -> Done), pending (qualifying PR not yet in
prod), or triage (no qualifying PR, or a non-Standard workflow/state).

Usage:
    python3 reconcile_deploy_ready.py [--dry-run]
    python3 reconcile_deploy_ready.py --apply
    python3 reconcile_deploy_ready.py --apply --prod-tag prod/6.111.0-prod.2+chart.0.87.5-prod.1 --out reconcile-report.json

Requires `git` and `gh` on PATH, and SHORTCUT_API_TOKEN (required even for --dry-run).
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

# build/ci is not a package (see tests/conftest.py); a plain sibling-module
# import works both run directly and under pytest.
import shortcut_pr_guards

SHORTCUT_API_BASE = "https://api.app.shortcut.com/api/v3"
SHORTCUT_API_ROOT = "https://api.app.shortcut.com"

# Sefaria's "Standard" Shortcut workflow.
STANDARD_WORKFLOW_ID = 500000005
DEPLOY_READY_STATE_ID = 500000045
DONE_STATE_ID = 500000010

SEFARIA_PROJECT_REPO_ID = shortcut_pr_guards.SEFARIA_PROJECT_REPO_ID
DEFAULT_TARGET_BRANCH = shortcut_pr_guards.DEFAULT_TARGET_BRANCH
DEFAULT_REPO = "Sefaria/Sefaria-Project"

DEPLOY_READY_SEARCH_QUERY = 'state:"Deploy Ready" !is:archived'


def die(message: str) -> None:
    print(f"ERROR: {message}", file=sys.stderr)
    sys.exit(1)


def warn(message: str) -> None:
    print(f"WARNING: {message}", file=sys.stderr)


def run_git(args):
    """Run a git subcommand, returning stdout. Exits the process on failure."""
    proc = subprocess.run(["git", *args], capture_output=True, text=True)
    if proc.returncode != 0:
        die(f"git {' '.join(args)} failed: {proc.stderr.strip()}")
    return proc.stdout


def resolve_default_prod_tag():
    """Newest prod/* tag by creation date. Dies if there are no prod/* tags at all."""
    tags = [t for t in run_git(["tag", "--list", "prod/*", "--sort=-creatordate"]).splitlines() if t.strip()]
    if not tags:
        die("No 'prod/*' tags found in this checkout; pass --prod-tag explicitly.")
    return tags[0]


def search_deploy_ready_stories(token):
    """Enumerate all non-archived Deploy Ready stories via the token'd search endpoint, paginated via its `next` cursor. Deliberately not `iterations-get-active`, which is scoped to the calling token's own teams."""
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


gather_linked_prs = shortcut_pr_guards.gather_linked_prs
qualifying_prs = shortcut_pr_guards.qualifying_prs


def fetch_pr_merge_oid(pr_number, repo):
    """Resolve a merged PR's merge commit SHA via `gh pr view --json mergeCommit`. A failed lookup is logged and returns None."""
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
    """Batch-resolve fetch_pr_merge_oid across every qualifying PR concurrently."""
    oid_by_pr = {}
    if not pr_numbers:
        return oid_by_pr
    with concurrent.futures.ThreadPoolExecutor(max_workers=max_workers) as executor:
        futures = [executor.submit(fetch_pr_merge_oid, n, repo) for n in pr_numbers]
        for future in concurrent.futures.as_completed(futures):
            try:
                pr_number, oid = future.result()
            except FileNotFoundError:
                die("`gh` was not found on PATH. Install the GitHub CLI "
                    "(https://cli.github.com/) or ensure it's available in "
                    "this environment; PR merge-commit lookups cannot proceed without it.")
            if oid:
                oid_by_pr[pr_number] = oid
    return oid_by_pr


def is_ancestor_of_prod(oid, prod_tag):
    """True if commit `oid` is an ancestor of `prod_tag`, False if git can definitively say it is not, None if the check itself couldn't run (a local-repo problem, not proof either way)."""
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
    """The first (earliest created) `prod/*` tag that contains commit `oid` -- the release that actually shipped it.

    `--sort=creatordate` (ascending) is deliberate and the opposite of
    resolve_default_prod_tag's `-creatordate` above: that one wants the
    newest tag, this one wants the oldest tag that still contains the
    commit. Returns None if the lookup fails or no prod/* tag contains it."""
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


def transition_story(story_id, done_state_id, token):
    """PUT a workflow_state_id update to Shortcut."""
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
    """Extra context for a triage story only, already present in the search response (no extra API call)."""
    return {
        "description": story.get("description"),
        "comments": [c.get("text") for c in (story.get("comments") or []) if c.get("text")],
    }


def _diagnose_linked_pr(pr, repo_id, target_branch):
    """Which PR-level guards this linked PR fails, if any. Diagnostic only -- classification never reads this."""
    failed = []
    if pr.get("merged") is not True:
        failed.append("not merged")
    if pr.get("repository_id") != repo_id:
        failed.append(f"wrong repo (repository_id={pr.get('repository_id')}, expected {repo_id})")
    if pr.get("target_branch_name") != target_branch:
        failed.append(f"wrong target branch ({pr.get('target_branch_name')!r}, expected {target_branch!r})")
    if pr.get("branch_name") in shortcut_pr_guards.LONG_LIVED_ENV_BRANCHES:
        failed.append(f"promotion PR (head branch {pr.get('branch_name')!r} is a long-lived environment branch)")
    return failed


def classify_stories(stories, repo_id, target_branch):
    """Split stories into (triage, candidates), where candidates is a list of (story, qualifying_prs) pairs still needing a prod-ancestry check. A story not on the Standard workflow/state routes straight to triage."""
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
            entry["linked_prs"] = [
                {"number": pr.get("number"), "failed_guards": _diagnose_linked_pr(pr, repo_id, target_branch)}
                for pr in sorted(linked, key=lambda p: (p.get("number") is None, p.get("number")))
            ]
            entry.update(_triage_context(story))
            triage.append(entry)
            continue

        candidates.append((story, qualifying))
    return triage, candidates


def _story_for_release_notes(story):
    """Build a story entry in shipped_stories.py's own hydrated-story shape, from data already fetched (no extra API call)."""
    return {
        "id": story.get("id"),
        "name": story.get("name"),
        "description": story.get("description"),
        "url": story.get("app_url"),
        "workflow_id": story.get("workflow_id"),
        "workflow_state_id": story.get("workflow_state_id"),
        "story_type": story.get("story_type"),
    }


def classify_candidates(candidates, oid_by_pr, prod_tag):
    """For each (story, qualifying_prs) candidate, check every qualifying PR's merge commit for prod ancestry and split into shipped / pending.
    A PR whose merge oid never resolved, or whose ancestry check couldn't run, counts as inconclusive, never as "in prod".

    Every shipped entry carries `shipping_release_tag`, the true release that shipped it, computed unconditionally regardless of
    --apply/--dry-run. Only when it equals the current `prod_tag` does the entry also carry `hydrated_story` -- the only signal
    merge_release_backfill.py uses to fold a backfilled story into shipped-stories.json."""
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
            shipped_via_sorted = sorted(shipped_via)
            entry["shipped_via_prs"] = shipped_via_sorted
            shipping_tag = resolve_shipping_release_tag(oid_by_pr[shipped_via_sorted[0]])
            entry["shipping_release_tag"] = shipping_tag
            if shipping_tag == prod_tag:
                entry["hydrated_story"] = _story_for_release_notes(story)
            shipped.append(entry)
        else:
            pending.append(entry)
    return shipped, pending


def print_summary(report):
    """Readable stdout summary. The triage list is printed in full, not just counted."""
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
        release_note = (
            "belongs in THIS release's notes" if s.get("hydrated_story")
            else f"shipped in {s.get('shipping_release_tag')}" if s.get("shipping_release_tag")
            else "shipping release could not be determined"
        )
        print(
            f"  {s['id']}  {s.get('name', '')!r}  via PR(s) {s.get('shipped_via_prs')}  "
            f"[{status}]  ({release_note})"
        )

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
    else:
        for s in shipped:
            s["transitioned"] = None  # not attempted -- dry-run

    report = {
        "prod_tag": prod_tag,
        "applied": apply_mutations,
        "counts": {
            "total": len(stories),
            "shipped": len(shipped),
            "pending": len(pending),
            "triage": len(triage),
        },
        "shipped": shipped,
        "pending": pending,
        "triage": triage,
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
