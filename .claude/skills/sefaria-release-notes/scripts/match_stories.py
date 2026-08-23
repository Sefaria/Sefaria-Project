#!/usr/bin/env python3
"""
Deterministic cross-reference of GitHub PR commits against Shortcut Done stories.

Extracts story IDs from commit messages (patterns: sc-XXXXX, [sc-XXXXX],
Feature/sc-XXXXX/..., fix(sc-XXXXX)) and PR titles/branch names.
Outputs a JSON report with matched and unmatched items on both sides.

Usage:
    python3 match_stories.py --commits '<json>' --stories '<json>' [--branches '<json>']

Where:
    --commits  JSON array of commit message strings from `gh pr view --json commits`
               OR newline-separated commit lines from the PR body's "### Changes" section
    --stories  JSON array of story objects with fields: id, name, app_url
    --branches (optional) JSON object mapping PR number strings to branch names,
               e.g. {"3301": "feature/sc-12345/my-feature", "3302": "sc-67890-fix"}
               Used as an additional signal when the commit message has no story ID.
"""

import argparse
import json
import re
import sys


SC_PATTERNS = [
    re.compile(r'\bsc[-_](\d+)\b', re.IGNORECASE),
    re.compile(r'\[sc[-_](\d+)\]', re.IGNORECASE),
    re.compile(r'feature/sc[-_ ](\d+)', re.IGNORECASE),
    re.compile(r'fix\(sc[-_](\d+)\)', re.IGNORECASE),
    re.compile(r'chore[:/\(].*?sc[-_](\d+)', re.IGNORECASE),
    re.compile(r'feat[:/\(].*?sc[-_](\d+)', re.IGNORECASE),
]

PR_PATTERN = re.compile(r'\(#(\d+)\)')


def extract_story_ids(text: str) -> set[str]:
    ids = set()
    for pattern in SC_PATTERNS:
        for match in pattern.finditer(text):
            ids.add(match.group(1))
    return ids


def extract_pr_number(text: str) -> str | None:
    match = PR_PATTERN.search(text)
    return match.group(1) if match else None


def parse_commits(raw) -> list[dict]:
    """Accept either a JSON array of strings or commit objects."""
    if isinstance(raw, str):
        try:
            data = json.loads(raw)
        except json.JSONDecodeError:
            # Treat as newline-separated commit lines
            return [{"message": line.strip("- ").strip()} for line in raw.splitlines() if line.strip()]
    else:
        data = raw

    if not data:
        return []

    # gh pr view --json commits returns objects with a 'messageHeadline' field
    if isinstance(data[0], dict):
        return [{"message": c.get("messageHeadline", c.get("message", str(c)))} for c in data]

    # Plain strings
    return [{"message": str(c)} for c in data]


def main():
    parser = argparse.ArgumentParser(description="Match GitHub commits to Shortcut stories.")
    parser.add_argument("--commits", required=True, help="JSON commit list or raw commit lines")
    parser.add_argument("--stories", required=True, help="JSON array of Shortcut story objects")
    parser.add_argument(
        "--branches",
        default="{}",
        help='JSON object mapping PR number strings to branch names, e.g. {"3301": "feature/sc-12345/desc"}',
    )
    args = parser.parse_args()

    try:
        stories_raw = json.loads(args.stories)
    except json.JSONDecodeError as e:
        print(json.dumps({"error": f"Invalid --stories JSON: {e}"}))
        sys.exit(1)

    try:
        branches: dict[str, str] = json.loads(args.branches)
    except json.JSONDecodeError as e:
        print(json.dumps({"error": f"Invalid --branches JSON: {e}"}))
        sys.exit(1)

    commits = parse_commits(args.commits)

    # Build story lookup by ID
    story_by_id: dict[str, dict] = {}
    for story in stories_raw:
        sid = str(story.get("id", ""))
        if sid:
            story_by_id[sid] = story

    # Process commits
    matched: list[dict] = []
    unmatched_commits: list[str] = []
    matched_story_ids: set[str] = set()

    for commit in commits:
        msg = commit["message"]
        pr_num = extract_pr_number(msg)

        # Extract story IDs from commit message
        story_ids = extract_story_ids(msg)

        # Also check the merged PR's branch name (if we have it)
        branch_name = branches.get(pr_num, "") if pr_num else ""
        if branch_name:
            story_ids |= extract_story_ids(branch_name)

        found_story = None
        for sid in story_ids:
            if sid in story_by_id:
                found_story = story_by_id[sid]
                matched_story_ids.add(sid)
                break

        entry = {
            "commit_message": msg,
            "pr_number": pr_num,
            "story_ids_referenced": sorted(story_ids),
            "branch_name": branch_name or None,
        }

        if found_story:
            entry["matched_story"] = {
                "id": found_story.get("id"),
                "name": found_story.get("name"),
                "url": found_story.get("app_url"),
            }
            matched.append(entry)
        else:
            # Skip deploy/ci noise
            noise = re.compile(r'^(deploy\(|Merge (pull request|branch)|deploy\[skip)', re.IGNORECASE)
            if not noise.match(msg):
                unmatched_commits.append(msg)

    # Stories not matched to any commit
    unmatched_stories = [
        {"id": s.get("id"), "name": s.get("name"), "url": s.get("app_url")}
        for sid, s in story_by_id.items()
        if sid not in matched_story_ids
    ]

    result = {
        "summary": {
            "total_commits_processed": len(commits),
            "commits_matched_to_stories": len(matched),
            "commits_unmatched": len(unmatched_commits),
            "total_done_stories": len(story_by_id),
            "stories_matched_to_commits": len(matched_story_ids),
            "stories_sprint_only": len(unmatched_stories),
        },
        "matched": matched,
        "unmatched_commits": unmatched_commits,
        "sprint_only_stories": unmatched_stories,
    }

    print(json.dumps(result, indent=2, ensure_ascii=False))


if __name__ == "__main__":
    main()
