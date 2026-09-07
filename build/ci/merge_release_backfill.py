#!/usr/bin/env python3
"""
Merge reconcile_deploy_ready.py's "shipped in THIS release" backfill stories
into shipped_stories.py's own output, for the release-notes prose step.

Why this exists: reconcile_deploy_ready.py's org-wide sweep exists because
nothing else revisits a Deploy Ready story once it falls outside the
current release's git-range scan (RC2). Most of what it finds shipped in
EARLIER releases, and must never reach today's announcement -- that's why
its report is written to $RUNNER_TEMP and never touched by the prose step
(see that script's own docstring). But some of what it finds -- a race, a
discovery gap RC1 didn't close, a story that just never got the write-back
it deserved -- shipped in the CURRENT release, same as everything
shipped_stories.py's own git-range scan already found. Silently excluding
THOSE from the announcement is a different flavor of the same underlying
mistake ("say what actually shipped today"), just by omission instead of
leakage. This script is the one, single, deterministic place that decides
which backfilled stories cross that line -- never the prose agent itself,
never a prompt instruction.

The decision was ALREADY MADE upstream, in reconcile_deploy_ready.py's own
classify_candidates: a shipped entry there carries `hydrated_story` if and
only if its `shipping_release_tag` (the TRUE release, resolved via
resolve_shipping_release_tag's `git tag --contains` lookup) equals the
CURRENT prod tag reconcile_deploy_ready.py was run against. This script
trusts that signal completely and does nothing else -- it is a pure,
mechanical merge, not a second opinion. `hydrated_story` is already in
shipped_stories.py's own hydrated-story shape (id, name, description, url,
workflow_id, workflow_state_id, story_type), built by
reconcile_deploy_ready.py from data it already had in memory -- no extra
Shortcut API call here either.

Reads --shipped-stories-out (shipped_stories.py's own --out file) and
--reconcile-report (reconcile_deploy_ready.py's own --out file), and writes
the merged result to --out (default: overwrite --shipped-stories-out in
place, so the prose step's existing "read shipped-stories.json" step needs
no change at all). Deduplicates by story id against what shipped_stories.py
ALREADY found -- a story RC1's text/PR-link discovery independently found
in this same range must not be double-counted or duplicated in the merged
`stories` list.

CRITICAL: this script only ever reads reconcile_deploy_ready.py's report to
extract the pre-filtered, pre-decided `hydrated_story` entries. It never
reads (or writes back) `shipped`/`pending`/`triage` wholesale, and it never
makes its own judgment about which release a story belongs to -- that
judgment already happened, once, in reconcile_deploy_ready.py, using git
evidence. Running this script does not, by itself, change what's readable
by the release-notes prose step: it only ever touches shipped-stories.json,
which was already that step's designated input before this script existed.
The reconcile report itself must still never be passed to, or made
readable by, that step -- this script's whole job is to extract the one
safe, pre-filtered slice from it and leave the rest behind in $RUNNER_TEMP.

Usage:
    python3 merge_release_backfill.py --shipped-stories-out shipped-stories.json \
        --reconcile-report reconcile-deploy-ready-report.json [--out shipped-stories.json]

Stdlib only -- no third-party dependencies, matching the rest of this
pipeline's scripts.

All story ids in this file's docstring and comments (e.g. 11111) are
placeholders, not real Shortcut story ids.
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
    """Every `hydrated_story` already attached to report['shipped'] --
    i.e. every story reconcile_deploy_ready.py ALREADY determined belongs
    in the CURRENT release (shipping_release_tag == the prod tag that run
    was against). This function makes no decision of its own: a shipped
    entry with no `hydrated_story` (an earlier or unresolvable release) is
    silently skipped, exactly as it should be -- fail closed, never guess
    a story into an announcement this script didn't independently verify
    and has no way to."""
    return [s["hydrated_story"] for s in (report.get("shipped") or []) if s.get("hydrated_story")]


def merge(shipped_stories_data, backfill_stories):
    """Fold `backfill_stories` (already in shipped_stories.py's own
    hydrated-story shape) into `shipped_stories_data`'s `story_ids` /
    `stories`, deduplicated by story id. A story shipped_stories.py's own
    git-range + RC1 discovery ALREADY found independently must not be
    duplicated -- existing entries always win the dedupe (this script
    never overwrites data shipped_stories.py already hydrated for itself).

    Returns (merged_data, added_ids) so the caller can report exactly what
    was added, for visibility -- mirrors shipped_stories.py's own
    stories_from_shortcut_pr_link provenance field."""
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
    # Provenance: which ids were folded in by the reconciliation sweep,
    # distinct from shipped_stories.py's own git-range/RC1 discovery --
    # same purpose as that script's own stories_from_shortcut_pr_link
    # field (say what only the sweep knew).
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
