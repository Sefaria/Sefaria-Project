#!/usr/bin/env python3
"""
Merges reconcile_deploy_ready.py's "shipped in this release" backfill
stories into shipped_stories.py's own output, for the release-notes prose
step. Only reads the pre-filtered `hydrated_story` entries from the
reconcile report; never touches `shipped`/`pending`/`triage` wholesale.

Usage:
    python3 merge_release_backfill.py --shipped-stories-out shipped-stories.json \
        --reconcile-report reconcile-deploy-ready-report.json [--out shipped-stories.json]
"""

import argparse
import json
import sys


def die(message: str) -> None:
    print(f"ERROR: {message}", file=sys.stderr)
    sys.exit(1)


def warn(message: str) -> None:
    print(f"WARNING: {message}", file=sys.stderr)


def backfill_stories_from_report(report):
    """Every `hydrated_story` already attached to report['shipped'] -- entries with none are skipped."""
    return [s["hydrated_story"] for s in (report.get("shipped") or []) if s.get("hydrated_story")]


def merge(shipped_stories_data, backfill_stories):
    """Fold `backfill_stories` into `shipped_stories_data`'s `story_ids` / `stories`, deduplicated by story id. Returns (merged_data, added_ids)."""
    existing_ids = set(str(sid) for sid in (shipped_stories_data.get("story_ids") or []))
    stories = list(shipped_stories_data.get("stories") or [])
    added_ids = []

    for story in backfill_stories:
        sid = str(story.get("id"))
        if sid in existing_ids:
            continue
        existing_ids.add(sid)
        added_ids.append(sid)
        stories.append(story)

    shipped_stories_data["story_ids"] = sorted(existing_ids, key=int)
    shipped_stories_data["stories"] = stories
    shipped_stories_data["stories_from_reconciliation_backfill"] = sorted(added_ids, key=int)

    return shipped_stories_data, added_ids


def build_arg_parser():
    parser = argparse.ArgumentParser(
        description="Merge reconcile_deploy_ready.py's current-release backfill stories "
                     "into shipped_stories.py's own output, before the release-notes prose step runs.",
    )
    parser.add_argument("--shipped-stories-out", required=True, help="Path to shipped_stories.py's own --out file")
    parser.add_argument("--reconcile-report", required=True, help="Path to reconcile_deploy_ready.py's own --out file")
    parser.add_argument(
        "--out",
        help="Where to write the merged result (default: overwrite --shipped-stories-out in place)",
    )
    return parser


def main():
    args = build_arg_parser().parse_args()

    try:
        with open(args.shipped_stories_out, encoding="utf-8") as f:
            shipped_stories_data = json.load(f)
    except (OSError, json.JSONDecodeError) as e:
        die(f"Could not read/parse --shipped-stories-out {args.shipped_stories_out!r}: {e}")

    try:
        with open(args.reconcile_report, encoding="utf-8") as f:
            report = json.load(f)
    except (OSError, json.JSONDecodeError) as e:
        die(f"Could not read/parse --reconcile-report {args.reconcile_report!r}: {e}")

    backfill_stories = backfill_stories_from_report(report)
    merged, added_ids = merge(shipped_stories_data, backfill_stories)

    out_path = args.out or args.shipped_stories_out
    with open(out_path, "w", encoding="utf-8") as f:
        json.dump(merged, f, indent=2, ensure_ascii=False)
        f.write("\n")

    if added_ids:
        print(f"Merged {len(added_ids)} backfilled stor{'y' if len(added_ids) == 1 else 'ies'} "
              f"that shipped in the current release: {added_ids}")
    else:
        print("No backfilled stories belong to the current release -- nothing to merge.")


if __name__ == "__main__":
    main()
