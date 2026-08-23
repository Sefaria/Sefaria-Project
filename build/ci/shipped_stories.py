#!/usr/bin/env python3
"""
Deterministically resolve which Shortcut stories shipped in a prod rollout.

Walks the git tree between two prod tags (or an explicit commit range),
extracts Shortcut (SC) story ids from commit subjects and, for commits that
reference a merged PR, from that PR's branch name too. Revert commits
(`Revert "..."`, `Revert: ...`, `revert(...)`) never contribute story ids to
the shipped set; their suppressed ids are surfaced separately in
`reverted_commits` instead of being silently dropped. Optionally hydrates
each id via the Shortcut API (id, name, description, url, workflow id,
workflow state, story type) when SHORTCUT_API_TOKEN is set — `workflow_id`
is included because a workflow's Done state id is not universal across
Shortcut workflows, and downstream tooling (mark_stories_deployed.py) needs
it to tell "different workflow" apart from "different state". Emits a
single JSON document that downstream tooling (the sefaria-release-notes
skill, mark_stories_deployed.py) consumes — this script never writes prose
and never mutates a Shortcut story.

Usage:
    python3 shipped_stories.py --version 6.111.0-prod.2 [--out shipped-stories.json] [--repo Sefaria/Sefaria-Project]
    python3 shipped_stories.py --range <prev-tag>..<cur-tag> [--out shipped-stories.json] [--repo Sefaria/Sefaria-Project]

With --version V, the current tag is resolved as the single tag matching the
glob `prod/V+*` (an optional leading "v" on V is stripped first), and the
previous tag is whichever prod/* tag immediately precedes it by creation
date. With --range, the two endpoints are used verbatim as given.

Requires `git` and `gh` on PATH. `gh` is only used to look up PR branch
names (`gh pr view --json headRefName,number`) and is never required to
succeed — a failing lookup for one PR is logged to stderr and skipped.
SHORTCUT_API_TOKEN is optional; without it, story ids are still emitted but
`stories` is empty and `unresolved_story_ids` is not populated (hydration
was never attempted, which is a different case from a failed lookup).

All ids shown in this file's docstring and comments (e.g. story id 11111)
are placeholders, not real Shortcut story ids.
"""

import argparse
import concurrent.futures
import json
import os
import re
import subprocess
import sys
import urllib.error
import urllib.request

# Lifted verbatim from .claude/skills/sefaria-release-notes/scripts/match_stories.py
# so this script has no import-time dependency on that skill's directory layout.
SC_PATTERNS = [
    re.compile(r'\bsc[-_](\d+)\b', re.IGNORECASE),
    re.compile(r'\[sc[-_](\d+)\]', re.IGNORECASE),
    re.compile(r'feature/sc[-_ ](\d+)', re.IGNORECASE),
    re.compile(r'fix\(sc[-_](\d+)\)', re.IGNORECASE),
    re.compile(r'chore[:/\(].*?sc[-_](\d+)', re.IGNORECASE),
    re.compile(r'feat[:/\(].*?sc[-_](\d+)', re.IGNORECASE),
]

PR_PATTERN = re.compile(r'\(#(\d+)\)')

# Extends match_stories.py's noise regex (`^(deploy\(|Merge (pull request|branch)|deploy\[skip)`)
# to explicitly cover deploy(<any env>), "Merge pull request", "Merge branch",
# and any subject ending in a "[skip ci]" marker. Generalized from an
# enumerated (staging|preprod|prod) alternation so new deploy environments
# (e.g. deploy(sandbox)) are recognized without an edit here.
NOISE_PATTERN = re.compile(
    r'^(deploy\(\w+\)|Merge pull request|Merge branch)|\[skip ci\]',
    re.IGNORECASE,
)

# Matches a revert commit subject: `Revert "..."`, `Revert: ...`, or
# `revert(scope): ...`, case-insensitively. A revert's story ids must never
# be attributed as shipped — see the reverted_commits handling in main().
REVERT_PATTERN = re.compile(r'^(revert\s+"|revert:\s|revert\()', re.IGNORECASE)

SHORTCUT_API_BASE = "https://api.app.shortcut.com/api/v3"

DEFAULT_REPO = "Sefaria/Sefaria-Project"


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


def extract_story_ids(text):
    ids = set()
    if not text:
        return ids
    for pattern in SC_PATTERNS:
        for match in pattern.finditer(text):
            ids.add(match.group(1))
    return ids


def extract_pr_number(text):
    """Return the LAST `(#NNN)` reference in text, matching the merge-commit
    convention where a revert's own re-merge ref trails any PR ref quoted
    from the original (reverted) subject, e.g. `Revert "x (#123)" (#456)`."""
    if not text:
        return None
    matches = PR_PATTERN.findall(text)
    return matches[-1] if matches else None


def split_range_spec(spec):
    """Split a PREV..CUR range string. Git refnames may never contain '..',
    so the first occurrence is an unambiguous split point."""
    if ".." not in spec:
        die(f"--range must be of the form PREV..CUR, got: {spec!r}")
    idx = spec.index("..")
    prev, cur = spec[:idx], spec[idx + 2:]
    if not prev or not cur:
        die(f"--range must be of the form PREV..CUR, got: {spec!r}")
    return prev, cur


def resolve_range_from_version(version):
    v = version[1:] if version.startswith("v") else version
    glob = f"prod/{v}+*"

    matches = [t for t in run_git(["tag", "--list", glob]).splitlines() if t.strip()]
    if len(matches) == 0:
        die(f"No prod tag found matching 'prod/{v}+*' (from --version {version!r})")
    if len(matches) > 1:
        die(f"Multiple prod tags match 'prod/{v}+*' (from --version {version!r}): {matches}")
    cur = matches[0]

    all_tags = [t for t in run_git(["tag", "--list", "prod/*", "--sort=-creatordate"]).splitlines() if t.strip()]
    try:
        idx = all_tags.index(cur)
    except ValueError:
        die(f"Resolved tag {cur!r} unexpectedly missing from 'prod/*' tag listing")

    if idx + 1 >= len(all_tags):
        die(f"{cur!r} is the oldest 'prod/*' tag — no previous tag to diff against (from --version {version!r})")

    prev = all_tags[idx + 1]
    return prev, cur


def get_commit_subjects(range_spec):
    out = run_git(["log", range_spec, "--no-merges", "--pretty=format:%s"])
    return [line for line in out.split("\n") if line.strip()]


def fetch_pr_branch(pr_number, repo):
    proc = subprocess.run(
        ["gh", "pr", "view", str(pr_number), "--repo", repo, "--json", "headRefName,number"],
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
    return pr_number, data.get("headRefName")


def fetch_branches(pr_numbers, repo, max_workers=8):
    branch_by_pr = {}
    if not pr_numbers:
        return branch_by_pr
    with concurrent.futures.ThreadPoolExecutor(max_workers=max_workers) as executor:
        futures = [executor.submit(fetch_pr_branch, n, repo) for n in pr_numbers]
        for future in concurrent.futures.as_completed(futures):
            pr_number, branch = future.result()
            if branch:
                branch_by_pr[pr_number] = branch
    return branch_by_pr


def fetch_story(story_id, token):
    url = f"{SHORTCUT_API_BASE}/stories/{story_id}"
    req = urllib.request.Request(url, headers={"Shortcut-Token": token, "Accept": "application/json"})
    try:
        with urllib.request.urlopen(req, timeout=20) as resp:
            body = resp.read().decode("utf-8")
        data = json.loads(body)
    except urllib.error.HTTPError as e:
        warn(f"Shortcut lookup for story {story_id} failed: HTTP {e.code} {e.reason}")
        return story_id, None
    except Exception as e:  # noqa: BLE001 - hydration must never abort the run
        warn(f"Shortcut lookup for story {story_id} failed: {e}")
        return story_id, None

    return story_id, {
        "id": data.get("id"),
        "name": data.get("name"),
        "description": data.get("description"),
        "url": data.get("app_url"),
        "workflow_id": data.get("workflow_id"),
        "workflow_state_id": data.get("workflow_state_id"),
        "story_type": data.get("story_type"),
    }


def hydrate_stories(story_ids, token, max_workers=8):
    stories = []
    unresolved = []
    if not story_ids:
        return stories, unresolved
    with concurrent.futures.ThreadPoolExecutor(max_workers=max_workers) as executor:
        futures = [executor.submit(fetch_story, sid, token) for sid in story_ids]
        for future in concurrent.futures.as_completed(futures):
            sid, data = future.result()
            if data is None:
                unresolved.append(sid)
            else:
                stories.append(data)
    stories.sort(key=lambda s: s.get("id") if s.get("id") is not None else -1)
    unresolved.sort()
    return stories, unresolved


def build_arg_parser():
    parser = argparse.ArgumentParser(
        description="Deterministically resolve shipped Shortcut stories for a prod rollout.",
    )
    range_group = parser.add_mutually_exclusive_group(required=True)
    range_group.add_argument("--version", help="Prod version, e.g. 6.111.0-prod.2")
    range_group.add_argument("--range", help="Explicit commit range, e.g. <prev-tag>..<cur-tag>")
    parser.add_argument("--out", help="Output file path (default: stdout)")
    parser.add_argument("--repo", default=DEFAULT_REPO, help=f"GitHub repo, default {DEFAULT_REPO}")
    return parser


CHART_IN_TAG = re.compile(r"\+chart\.(?P<chart>.+)$")


def chart_version_from_tag(tag):
    """Prod tags carry the chart version after a '+', e.g.
    prod/6.111.0-prod.2+chart.0.87.5-prod.1 -> 0.87.5-prod.1.
    Returns None for a tag that does not follow that shape (e.g. an
    explicit --range against arbitrary refs)."""
    if not tag:
        return None
    m = CHART_IN_TAG.search(tag)
    return m.group("chart") if m else None

def main():
    args = build_arg_parser().parse_args()

    if args.version:
        prev, cur = resolve_range_from_version(args.version)
        version = args.version
    else:
        prev, cur = split_range_spec(args.range)
        version = None

    range_spec = f"{prev}..{cur}"
    subjects = get_commit_subjects(range_spec)

    parsed_commits = []
    pr_numbers = set()
    for subject in subjects:
        pr_number = extract_pr_number(subject)
        subject_story_ids = extract_story_ids(subject)
        parsed_commits.append({
            "subject": subject,
            "pr_number": pr_number,
            "subject_story_ids": subject_story_ids,
        })
        if pr_number:
            pr_numbers.add(pr_number)

    branch_by_pr = fetch_branches(sorted(pr_numbers), args.repo)

    all_story_ids = set()
    commits_without_story = []
    reverted_commits = []
    commits = []
    for c in parsed_commits:
        pr_number = c["pr_number"]
        branch = branch_by_pr.get(pr_number) if pr_number else None
        branch_story_ids = extract_story_ids(branch)
        story_ids = c["subject_story_ids"] | branch_story_ids

        is_revert = bool(REVERT_PATTERN.match(c["subject"]))
        if is_revert:
            # A revert's story ids must never be attributed as shipped, but
            # they're too important to silently drop — surface them instead.
            if story_ids:
                reverted_commits.append({
                    "subject": c["subject"],
                    "suppressed_story_ids": sorted(story_ids, key=int),
                })
        else:
            all_story_ids |= story_ids

        commits.append({
            "subject": c["subject"],
            "pr_number": pr_number,
            "branch": branch,
            "story_ids": sorted(story_ids, key=int),
        })

        # Reverts are excluded here too: a revert with a suppressed story id
        # is already reported via reverted_commits, and a revert with no
        # story id at all is ordinary noise, not a commit needing attention.
        if not is_revert and not story_ids and not NOISE_PATTERN.search(c["subject"]):
            commits_without_story.append(c["subject"])

    token = os.environ.get("SHORTCUT_API_TOKEN")
    hydrated = bool(token)
    if token:
        stories, unresolved_story_ids = hydrate_stories(sorted(all_story_ids, key=int), token)
    else:
        if all_story_ids:
            warn(f"SHORTCUT_API_TOKEN is not set; skipping Shortcut hydration for {len(all_story_ids)} story id(s).")
        stories, unresolved_story_ids = [], []

    result = {
        "version": version,
        "chart_version": chart_version_from_tag(cur),
        "range": {"previous_tag": prev, "current_tag": cur, "spec": range_spec},
        "commits": commits,
        "commits_without_story": commits_without_story,
        "reverted_commits": reverted_commits,
        "story_ids": sorted(all_story_ids, key=int),
        "stories": stories,
        # False when SHORTCUT_API_TOKEN was absent, so `stories` being empty
        # means "never looked up" rather than "looked up and found nothing".
        # Without this the two cases are indistinguishable downstream.
        "hydrated": hydrated,
        "unresolved_story_ids": unresolved_story_ids,
    }

    output = json.dumps(result, indent=2, ensure_ascii=False)
    if args.out:
        with open(args.out, "w", encoding="utf-8") as f:
            f.write(output + "\n")
    else:
        print(output)


if __name__ == "__main__":
    main()
