#!/usr/bin/env python3
"""
Transitions shipped Shortcut stories from "Deploy Ready" to "Done".

Usage:
    python3 mark_stories_deployed.py --input shipped-stories.json [--dry-run] \
        [--workflow-id 500000005] [--from-state-id 500000045] [--done-state-id 500000010]

Requires SHORTCUT_API_TOKEN unless --dry-run is passed.
"""

import argparse
import concurrent.futures
import json
import os
import sys
import urllib.error
import urllib.request

SHORTCUT_API_BASE = "https://api.app.shortcut.com/api/v3"

# Sefaria's "Standard" Shortcut workflow: "Deploy Ready" -> "Done".
DEFAULT_WORKFLOW_ID = 500000005
DEFAULT_FROM_STATE_ID = 500000045
DEFAULT_DONE_STATE_ID = 500000010


def die(message: str) -> None:
    print(f"ERROR: {message}", file=sys.stderr)
    sys.exit(1)


def warn(message: str) -> None:
    print(f"WARNING: {message}", file=sys.stderr)


def classify_stories(stories, workflow_id, from_state_id, done_state_id):
    """Split stories into (to_transition, already_done, skipped_other_state, skipped_different_workflow) buckets."""
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
    """Build the detail list for every skipped (non-already-done) story: id, workflow_id, workflow_state_id, and reason."""
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
