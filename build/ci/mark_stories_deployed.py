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

If the input's "stories" list is non-empty, nothing was transitioned, and at
least one story was skipped for a reason other than already being Done, that
is a silent no-op — the exact failure mode this script exists to prevent.
This script prints a WARNING to stderr naming those stories and, unless
--dry-run was passed, exits non-zero so an unattended run cannot look
successful when it silently did nothing. (--dry-run never exits non-zero
for this: it is a preview, and dry-run "transitioned" is inherently just a
list of candidates, not evidence anything actually happened or failed to.)

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

    if args.dry_run:
        for story in to_transition:
            print(
                f"DRY RUN: would transition story {story.get('id')} "
                f"({story.get('name', '')!r}) from workflow_state_id "
                f"{args.from_state_id} to {args.done_state_id}",
                file=sys.stderr,
            )
        transitioned = _ids(to_transition)
        failed = []
    else:
        transitioned, failed = transition_stories(to_transition, args.done_state_id, token, args.max_workers)

    skipped_detail = _skipped_detail(skipped_other_state, skipped_different_workflow)

    summary = {
        "dry_run": args.dry_run,
        "counts": {
            "transitioned": len(transitioned),
            "already_done": len(already_done),
            "skipped_other_state": len(skipped_other_state),
            "skipped_different_workflow": len(skipped_different_workflow),
            "failed": len(failed),
        },
        "transitioned": sorted(transitioned, key=lambda x: (x is None, x)),
        "already_done": _ids(already_done),
        "skipped_other_state": _ids(skipped_other_state),
        "skipped_different_workflow": _ids(skipped_different_workflow),
        "skipped_detail": skipped_detail,
        "failed": sorted(failed, key=lambda x: (x is None, x)),
        "hydrated": hydrated,
        "unresolved_story_ids": sorted(unresolved_story_ids),
    }

    print(json.dumps(summary, indent=2))

    # Make silent no-ops impossible: `stories` was non-empty, nothing got
    # transitioned, and at least one story was skipped for a reason other
    # than already being Done. That combination is indistinguishable from
    # "nothing needed moving" unless we say so explicitly.
    silently_skipped = skipped_other_state or skipped_different_workflow
    if stories and not transitioned and silently_skipped:
        skipped_ids_and_context = [
            f"{d['id']} (workflow_id={d['workflow_id']}, workflow_state_id={d['workflow_state_id']}, "
            f"reason={d['reason']})"
            for d in skipped_detail
        ]
        warn(
            "Nothing was transitioned, but "
            f"{len(silently_skipped)} shipped stor{'y was' if len(silently_skipped) == 1 else 'ies were'} "
            f"skipped for a reason other than already being Done: {skipped_ids_and_context}. "
            "This looks like a silent no-op — check --workflow-id/--from-state-id/--done-state-id "
            "against the workflow these stories actually live in."
        )
        if not args.dry_run:
            sys.exit(2)


if __name__ == "__main__":
    main()
