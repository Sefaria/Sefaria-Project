#!/usr/bin/env python3
"""
Deterministically transition shipped Shortcut stories from "Deploy Ready" to "Done".

Reads a shipped-stories JSON file (as produced by shipped_stories.py) and, for
each entry in its "stories" list whose workflow_id equals --workflow-id AND
workflow_state_id equals --from-state-id, PUTs a workflow_state_id update to
--done-state-id via the Shortcut API. Stories already at the done state are
skipped and logged. Stories sitting in any other state of --workflow-id are
skipped and logged. Stories belonging to a DIFFERENT workflow than
--workflow-id are skipped and logged separately, because --from-state-id and
--done-state-id are workflow-specific: the Sefaria org has roughly ten
Shortcut workflows, and a state id that means "Deploy Ready" in one workflow
can be meaningless (or mean something else entirely) in another. Silently
lumping those stories into "skipped, some other state" is exactly the
unattended-run failure mode this script exists to avoid — a shipped story in
a non-Standard workflow must never look indistinguishable from "nothing
needed moving". No story is ever mutated in any of these three skip cases.

Usage:
    python3 mark_stories_deployed.py --input shipped-stories.json [--dry-run] \
        [--workflow-id 500000005] [--from-state-id 500000045] [--done-state-id 500000010]

--dry-run prints exactly what would be transitioned and mutates nothing; it
does not require SHORTCUT_API_TOKEN. Without --dry-run, a missing
SHORTCUT_API_TOKEN is a hard error (exit 1) raised before any story is
touched. A per-story API failure is logged and never aborts the loop and
never fails the process as a whole — the deploy already happened, so this
script must never be the thing that turns a green rollout red.

Prints a summary JSON at the end with counts and ids for each bucket:
transitioned, already_done, skipped_other_state, skipped_different_workflow,
failed — plus a skipped_detail list carrying each skipped story's id,
workflow_id, workflow_state_id and the reason it was skipped, and hydrated /
unresolved_story_ids echoed straight from the input file so stage 3 doesn't
silently lose stories that shipped but that shipped_stories.py could not
look up.

Immediately after a story is ACTUALLY transitioned by this run (never for
already_done/skipped stories, and never merely because it was a candidate),
a short write-back comment is posted on it via
`POST /stories/{id}/comments` (shortcut_comment.py, shared with
reconcile_deploy_ready.py's own write-back) naming the release that shipped
it: this run's own --input JSON already carries `version`, `chart_version`
and `release_date` for exactly that release, so there's no ambiguity to
guard against here the way reconcile_deploy_ready.py's backfill sweep has
to (see that script's own docstring). The PR(s) that carried the story, if
resolvable from --input's `commits` list, are included as GitHub links.
A comment failure is logged and recorded in `comment_failed` but never
fails the run or rolls back the transition -- the state change is the
valuable, already-durable part; the comment is a best-effort annotation on
top of it. Posting is skipped entirely in --dry-run (which instead prints
what WOULD be posted) and with --no-comment.

Whenever the input's "stories" list is non-empty and at least one story was
skipped for a reason other than already being Done, this script prints a
WARNING to stderr naming those stories -- even in a MIXED release where some
other stories transitioned fine, so a partial skip is never invisible just
because the run "worked". If, in addition, NOTHING was transitioned at all,
that combination is a silent no-op -- the exact failure mode this script
exists to prevent -- and, unless --dry-run was passed, the process exits
non-zero so an unattended run can't look successful when it silently did
nothing. (--dry-run never exits non-zero for this: it is a preview, and
dry-run "transitioned" is inherently just a list of candidates, not evidence
anything actually happened or failed to.)

All ids shown in this file's docstring and comments (e.g. story id 22222)
are placeholders, not real Shortcut story ids. The workflow and state ids
(500000005, 500000045, 500000010, 500000728) are real Shortcut workflow/
state ids, not story ids, and are not covered by that placeholder rule.
"""

import argparse
import concurrent.futures
import json
import os
import sys
import urllib.error
import urllib.request

# The story-comment POST mechanics are shared with reconcile_deploy_ready.py
# -- see shortcut_comment.py's own docstring for why. build/ci is not a
# package (see tests/conftest.py), but a plain sibling-module import works
# both when this file is run directly (python3 puts its own directory on
# sys.path[0]) and under pytest (the test conftest adds build/ci to
# sys.path the same way).
import shortcut_comment

SHORTCUT_API_BASE = "https://api.app.shortcut.com/api/v3"

# Sefaria's "Standard" Shortcut workflow: "Deploy Ready" -> "Done". These are
# used as defaults so the script is runnable without extra flags in the
# common case; pass --workflow-id/--from-state-id/--done-state-id explicitly
# to override for a different workflow. The org has roughly ten workflows,
# each with its own state ids — e.g. at least one other workflow has its own
# Done state, 500000728, which is NOT the same as DEFAULT_DONE_STATE_ID.
DEFAULT_WORKFLOW_ID = 500000005
DEFAULT_FROM_STATE_ID = 500000045
DEFAULT_DONE_STATE_ID = 500000010

# Used only to build a GitHub PR link in the write-back comment -- this
# script never calls `gh` or the GitHub API itself.
DEFAULT_REPO = "Sefaria/Sefaria-Project"


def die(message: str) -> None:
    print(f"ERROR: {message}", file=sys.stderr)
    sys.exit(1)


def warn(message: str) -> None:
    print(f"WARNING: {message}", file=sys.stderr)


def classify_stories(stories, workflow_id, from_state_id, done_state_id):
    """Split stories into (to_transition, already_done, skipped_other_state,
    skipped_different_workflow) buckets. Pure function, no I/O.

    Workflow membership is checked BEFORE state, so a story sitting at a
    different workflow's own Done state (e.g. 500000728) is classified as
    skipped_different_workflow, not already_done — those state ids are not
    interchangeable across workflows. A story with no workflow_id on record
    (e.g. from a shipped-stories.json produced before this field existed)
    falls through to the state-only checks instead of being flagged as a
    mismatch, so older input files don't spuriously warn on every story.
    """
    to_transition = []
    already_done = []
    skipped_other_state = []
    skipped_different_workflow = []

    for story in stories:
        story_workflow_id = story.get("workflow_id")
        state = story.get("workflow_state_id")

        if story_workflow_id is not None and story_workflow_id != workflow_id:
            skipped_different_workflow.append(story)
        elif state == done_state_id:
            already_done.append(story)
        elif state == from_state_id:
            to_transition.append(story)
        else:
            skipped_other_state.append(story)

    return to_transition, already_done, skipped_other_state, skipped_different_workflow


def transition_story(story, done_state_id, token):
    sid = story.get("id")
    url = f"{SHORTCUT_API_BASE}/stories/{sid}"
    body = json.dumps({"workflow_state_id": done_state_id}).encode("utf-8")
    req = urllib.request.Request(url, data=body, method="PUT")
    req.add_header("Shortcut-Token", token)
    req.add_header("Content-Type", "application/json")
    try:
        with urllib.request.urlopen(req, timeout=20) as resp:
            resp.read()
        return sid, True, None
    except urllib.error.HTTPError as e:
        return sid, False, f"HTTP {e.code} {e.reason}"
    except Exception as e:  # noqa: BLE001 - a per-story failure must never abort the run
        return sid, False, str(e)


def transition_stories(to_transition, done_state_id, token, max_workers=8):
    transitioned = []
    failed = []
    if not to_transition:
        return transitioned, failed
    with concurrent.futures.ThreadPoolExecutor(max_workers=max_workers) as executor:
        futures = [executor.submit(transition_story, s, done_state_id, token) for s in to_transition]
        for future in concurrent.futures.as_completed(futures):
            sid, ok, err = future.result()
            if ok:
                transitioned.append(sid)
            else:
                warn(f"Failed to transition story {sid}: {err}")
                failed.append(sid)
    return transitioned, failed


def _pr_numbers_for_story(story_id, commits):
    """PR numbers of every commit in this release's own `commits` list
    (from --input's shipped-stories.json) that carried this story id, in
    the order they appear there. A story can ship via more than one
    commit/PR in the same release (e.g. a same-day fix-up), so this
    collects all of them rather than just the first match. Returns []
    (not an error) when none are resolvable -- an older shipped-stories.json
    without a `commits` key, or a story whose only carrying commit had no
    PR number, both degrade to "no PR reference available" in the comment
    text rather than raising."""
    sid = str(story_id)
    numbers = []
    seen = set()
    for c in commits:
        pr_number = c.get("pr_number")
        if pr_number and sid in (c.get("story_ids") or []) and pr_number not in seen:
            seen.add(pr_number)
            numbers.append(pr_number)
    return numbers


def _release_comment_text(story, data, repo):
    """Write-back comment text for a story THIS RUN actually transitioned.
    Unlike reconcile_deploy_ready.py's backfill sweep, there's no release
    ambiguity to resolve here: --input IS this release's own
    shipped-stories.json, so `version`/`chart_version`/`release_date` are
    exactly the release this story just shipped in -- state that fact
    directly rather than re-deriving it from git the way the sweep has to
    for stories it didn't just observe shipping in real time."""
    version = data.get("version") or "an unresolved version"
    chart_version = data.get("chart_version")
    release_date = data.get("release_date")
    # Human-readable date only (no time-of-day/timezone noise) -- release_date
    # is an ISO 8601 timestamp like "2026-08-31T07:17:36Z".
    release_date_human = release_date.split("T")[0] if release_date else "an unresolved date"

    pr_numbers = _pr_numbers_for_story(story.get("id"), data.get("commits") or [])
    if pr_numbers:
        pr_line = "PR(s): " + ", ".join(f"https://github.com/{repo}/pull/{n}" for n in pr_numbers)
    else:
        pr_line = "PR(s): not available in this release's shipped-stories data."

    chart_part = f" (chart {chart_version})" if chart_version else ""

    return (
        "\U0001F916 Automated update — posted by the prod release pipeline; no reply expected.\n"
        f"Shipped in prod release {version}{chart_part}, released {release_date_human}.\n"
        f"{pr_line}"
    )


def _ids(stories):
    return sorted((s.get("id") for s in stories), key=lambda x: (x is None, x))


def _skipped_detail(skipped_other_state, skipped_different_workflow):
    """Build the human-readable detail list for every skipped (non-already-done)
    story: id, workflow_id, workflow_state_id and why it was skipped."""
    detail = []
    for story in skipped_different_workflow:
        detail.append({
            "id": story.get("id"),
            "workflow_id": story.get("workflow_id"),
            "workflow_state_id": story.get("workflow_state_id"),
            "reason": "different_workflow",
        })
    for story in skipped_other_state:
        detail.append({
            "id": story.get("id"),
            "workflow_id": story.get("workflow_id"),
            "workflow_state_id": story.get("workflow_state_id"),
            "reason": "other_state",
        })
    detail.sort(key=lambda d: (d["id"] is None, d["id"]))
    return detail


def build_arg_parser():
    parser = argparse.ArgumentParser(
        description='Transition shipped Shortcut stories from "Deploy Ready" to "Done".',
    )
    parser.add_argument("--input", required=True, help="Path to a shipped-stories JSON file")
    parser.add_argument("--dry-run", action="store_true", help="Print what would change; mutate nothing")
    parser.add_argument("--workflow-id", type=int, default=DEFAULT_WORKFLOW_ID)
    parser.add_argument("--from-state-id", type=int, default=DEFAULT_FROM_STATE_ID)
    parser.add_argument("--done-state-id", type=int, default=DEFAULT_DONE_STATE_ID)
    parser.add_argument("--repo", default=DEFAULT_REPO, help=f"GitHub repo for the comment's PR link(s), default {DEFAULT_REPO}")
    parser.add_argument(
        "--no-comment", action="store_true",
        help="Transition stories but skip posting the write-back release comment.",
    )
    parser.add_argument("--max-workers", type=int, default=8)
    return parser


def main():
    args = build_arg_parser().parse_args()

    try:
        with open(args.input, encoding="utf-8") as f:
            data = json.load(f)
    except (OSError, json.JSONDecodeError) as e:
        die(f"Could not read/parse --input {args.input!r}: {e}")

    stories = data.get("stories", [])
    hydrated = data.get("hydrated")
    unresolved_story_ids = data.get("unresolved_story_ids", [])

    if unresolved_story_ids:
        warn(
            f"{len(unresolved_story_ids)} story id(s) shipped but could not be looked up "
            f"in Shortcut (unresolved_story_ids): {sorted(unresolved_story_ids)}"
        )

    token = os.environ.get("SHORTCUT_API_TOKEN")
    if not args.dry_run and not token:
        die("SHORTCUT_API_TOKEN is not set. Refusing to mutate Shortcut stories without it. "
            "Use --dry-run to preview without a token.")

    to_transition, already_done, skipped_other_state, skipped_different_workflow = classify_stories(
        stories, args.workflow_id, args.from_state_id, args.done_state_id,
    )

    comment_posted = []
    comment_failed = []

    if args.dry_run:
        for story in to_transition:
            print(
                f"DRY RUN: would transition story {story.get('id')} "
                f"({story.get('name', '')!r}) from workflow_state_id "
                f"{args.from_state_id} to {args.done_state_id}",
                file=sys.stderr,
            )
            # Preview-only: never calls Shortcut. Shown so a --dry-run run
            # says what it WOULD post, matching how it already says what it
            # would transition.
            if not args.no_comment:
                preview = "\n".join(f"DRY RUN:   {line}" for line in _release_comment_text(story, data, args.repo).splitlines())
                print(f"DRY RUN: would post comment on story {story.get('id')}:\n{preview}", file=sys.stderr)
        transitioned = _ids(to_transition)
        failed = []
    else:
        transitioned, failed = transition_stories(to_transition, args.done_state_id, token, args.max_workers)

        # Comment ONLY on a story THIS RUN actually transitioned -- never
        # already_done/skipped (those paths never reach to_transition at
        # all), and never a story that was a to_transition CANDIDATE but
        # whose PUT itself failed (excluded via transitioned_ids below).
        # transitions are naturally once-only (a transitioned story leaves
        # Deploy Ready, so classify_stories routes it to already_done on any
        # re-run) -- no separate dedupe index is needed to keep a re-run
        # from re-posting.
        if not args.no_comment:
            transitioned_ids = set(transitioned)
            for story in to_transition:
                if story.get("id") not in transitioned_ids:
                    continue
                comment_text = _release_comment_text(story, data, args.repo)
                sid, ok, err = shortcut_comment.post_story_comment(story.get("id"), comment_text, token)
                if ok:
                    comment_posted.append(sid)
                else:
                    warn(f"Failed to post release comment on story {sid}: {err}")
                    comment_failed.append({"id": sid, "error": err})

    skipped_detail = _skipped_detail(skipped_other_state, skipped_different_workflow)

    summary = {
        "dry_run": args.dry_run,
        "counts": {
            "transitioned": len(transitioned),
            "already_done": len(already_done),
            "skipped_other_state": len(skipped_other_state),
            "skipped_different_workflow": len(skipped_different_workflow),
            "failed": len(failed),
            "comment_posted": len(comment_posted),
            "comment_failed": len(comment_failed),
        },
        "transitioned": sorted(transitioned, key=lambda x: (x is None, x)),
        "already_done": _ids(already_done),
        "skipped_other_state": _ids(skipped_other_state),
        "skipped_different_workflow": _ids(skipped_different_workflow),
        "skipped_detail": skipped_detail,
        "failed": sorted(failed, key=lambda x: (x is None, x)),
        "comment_posted": sorted(comment_posted, key=lambda x: (x is None, x)),
        "comment_failed": sorted(comment_failed, key=lambda d: (d["id"] is None, d["id"])),
        "hydrated": hydrated,
        "unresolved_story_ids": sorted(unresolved_story_ids),
    }

    print(json.dumps(summary, indent=2))

    # Make silent skips impossible: any story skipped for a reason other than
    # already being Done must be visible, whether or not anything else in
    # this run transitioned. A MIXED release -- some stories transition
    # fine, others get skipped for a different workflow/state -- used to
    # produce no WARNING at all as long as `transitioned` was non-empty; that
    # silently lost visibility into exactly the stories this script exists
    # to flag. Only the "nothing happened at all" case is fatal.
    if stories and skipped_detail:
        skipped_ids_and_context = [
            f"{d['id']} (workflow_id={d['workflow_id']}, workflow_state_id={d['workflow_state_id']}, "
            f"reason={d['reason']})"
            for d in skipped_detail
        ]
        if transitioned:
            warn(
                f"{len(skipped_detail)} shipped stor{'y was' if len(skipped_detail) == 1 else 'ies were'} "
                f"skipped (not already Done) alongside {len(transitioned)} that DID transition: "
                f"{skipped_ids_and_context}. Verify these are intentionally on a different "
                "workflow/state before assuming they're covered."
            )
        else:
            warn(
                "Nothing was transitioned, but "
                f"{len(skipped_detail)} shipped stor{'y was' if len(skipped_detail) == 1 else 'ies were'} "
                f"skipped for a reason other than already being Done: {skipped_ids_and_context}. "
                "This looks like a silent no-op — check --workflow-id/--from-state-id/--done-state-id "
                "against the workflow these stories actually live in."
            )
            if not args.dry_run:
                sys.exit(2)


if __name__ == "__main__":
    main()
