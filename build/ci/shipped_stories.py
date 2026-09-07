#!/usr/bin/env python3
"""
Deterministically resolves which Shortcut stories shipped in a prod rollout,
by walking the git range between two prod tags and extracting story ids
from commit subjects, PR branch names, and (as a fallback) Shortcut's own
PR<->story link.

Usage:
    python3 shipped_stories.py --version 6.111.0-prod.2 [--out shipped-stories.json] [--repo Sefaria/Sefaria-Project]
    python3 shipped_stories.py --range <prev-tag>..<cur-tag> [--out shipped-stories.json] [--repo Sefaria/Sefaria-Project]

With --version V, the current tag is resolved as the single tag matching the
glob `prod/V+*`, and the previous tag is whichever prod/* tag immediately
precedes it by creation date. With --range, the two endpoints are used
verbatim as given.

Requires `git` and `gh` on PATH. SHORTCUT_API_TOKEN is optional; without
it, story ids are still emitted but hydration and the PR-link fallback are
skipped.
"""

import argparse
import concurrent.futures
import json
import os
import re
import subprocess
import sys
import urllib.error
import urllib.parse
import urllib.request

# build/ci is not a package (see tests/conftest.py); a plain sibling-module
# import works both run directly and under pytest.
import shortcut_pr_guards

LONG_LIVED_ENV_BRANCHES = shortcut_pr_guards.LONG_LIVED_ENV_BRANCHES

# Pattern 1 has a trailing word boundary and covers "sc-N"/"sc_N" in most
# contexts; patterns 2-4 catch shapes it doesn't (no trailing boundary, or a
# literal space after "sc").
SC_PATTERNS = [
    re.compile(r'\bsc[-_](\d+)\b', re.IGNORECASE),
    re.compile(r'feature/sc[-_ ](\d+)', re.IGNORECASE),
    re.compile(r'chore[:/\(].*?sc[-_](\d+)', re.IGNORECASE),
    re.compile(r'feat[:/\(].*?sc[-_](\d+)', re.IGNORECASE),
]

PR_PATTERN = re.compile(r'\(#(\d+)\)')

# A real (non-squash) merge commit's subject uses the bare "Merge pull
# request #N from <owner>/<branch>" form instead of "(#N)".
MERGE_PR_PATTERN = re.compile(r'^Merge pull request #(\d+)\s+from\s+\S+', re.IGNORECASE)

# Captures the quoted original subject inside a `Revert "..."` commit; not
# applicable to the `Revert: ...` / `revert(...)` forms.
REVERT_QUOTE_PATTERN = re.compile(r'^revert\s+"(.+?)"', re.IGNORECASE)

# Auto-generated noise excluded from commits_without_story.
NOISE_PATTERN = re.compile(
    r'^(deploy\(\w+\)|Merge (pull request|branch|remote-tracking branch))|\[skip ci\]',
    re.IGNORECASE,
)

# Matches a revert commit subject: `Revert "..."`, `Revert: ...`, or
# `revert(scope): ...`.
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
    """Return the LAST `(#NNN)` reference (e.g. `Revert "x (#123)" (#456)`), falling back to the bare "Merge pull request #N" form."""
    if not text:
        return None
    matches = PR_PATTERN.findall(text)
    if matches:
        return matches[-1]
    m = MERGE_PR_PATTERN.match(text)
    return m.group(1) if m else None


def split_range_spec(spec):
    """Split a PREV..CUR range string on the first '..' (git refnames never contain '..')."""
    if ".." not in spec:
        die(f"--range must be of the form PREV..CUR, got: {spec!r}")
    idx = spec.index("..")
    prev, cur = spec[:idx], spec[idx + 2:]
    if not prev or not cur:
        die(f"--range must be of the form PREV..CUR, got: {spec!r}")
    return prev, cur


def resolve_range_from_version(version, chart_version=None):
    """Resolve the (prev, cur) prod/* tag pair for --version V [--chart-version CV].

    Tags are read once via `git tag --list 'prod/*' --sort=-creatordate`
    (newest first); with no matching --chart-version and multiple tags for
    the same version, the newest is chosen and prev is the tag immediately
    after it in that same ordering.
    """
    v = version[1:] if version.startswith("v") else version

    all_tags = [t for t in run_git(["tag", "--list", "prod/*", "--sort=-creatordate"]).splitlines() if t.strip()]

    cur = None
    if chart_version:
        cv = chart_version[1:] if chart_version.startswith("v") else chart_version
        candidate = f"prod/{v}+chart.{cv}"
        if candidate in all_tags:
            cur = candidate
        else:
            warn(
                f"--chart-version {chart_version!r} does not match any tag "
                f"({candidate!r} not found); falling back to the newest "
                f"'prod/{v}+*' tag by creation date instead of failing the run."
            )

    if cur is None:
        matches = [t for t in all_tags if t.startswith(f"prod/{v}+")]
        if not matches:
            die(f"No prod tag found matching 'prod/{v}+*' (from --version {version!r})")
        if len(matches) > 1:
            # all_tags is already sorted -creatordate, so `matches` preserves
            # that ordering -- the first entry is the newest.
            warn(
                f"Multiple prod tags match 'prod/{v}+*' (from --version {version!r}), "
                f"most likely a chart-only rollout: {matches}. Choosing the newest "
                f"by creation date: {matches[0]!r}."
            )
        cur = matches[0]

    try:
        idx = all_tags.index(cur)
    except ValueError:
        die(f"Resolved tag {cur!r} unexpectedly missing from 'prod/*' tag listing")

    if idx + 1 >= len(all_tags):
        die(f"{cur!r} is the oldest 'prod/*' tag — no previous tag to diff against (from --version {version!r})")

    prev = all_tags[idx + 1]
    return prev, cur


def get_commit_subjects(range_spec):
    # Deliberately not --no-merges: a merge commit's subject can be the only
    # place its PR number and story id appear in the whole range.
    out = run_git(["log", range_spec, "--pretty=format:%s"])
    return [line for line in out.split("\n") if line.strip()]


def tag_creator_date_iso(tag):
    """ISO 8601 creation date of a tag, or None if `tag` isn't a real tag ref."""
    out = run_git(["for-each-ref", "--format=%(creatordate:iso-strict)", f"refs/tags/{tag}"]).strip()
    return out or None


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
            try:
                pr_number, branch = future.result()
            except FileNotFoundError:
                # gh not on PATH; every other in-flight lookup would fail
                # identically, so fail fast with one clear message.
                die("`gh` was not found on PATH. Install the GitHub CLI "
                    "(https://cli.github.com/) or ensure it's available in "
                    "this environment; PR branch name lookups cannot proceed without it.")
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


def fetch_story_by_pr_link(pr_number, token):
    """Look up the Shortcut story linked to a merged PR via `GET search/stories?query=pr:<N>`
    (only `pr:N` resolves this; `branch:`/`pull-request:` do not). Adopts the id only when
    the search returns exactly one story and that story's matching PR passes passes_pr_guards;
    ambiguous results or lookup failures are a warn-and-skip."""
    query = urllib.parse.quote(f"pr:{pr_number}")
    url = f"{SHORTCUT_API_BASE}/search/stories?query={query}"
    req = urllib.request.Request(url, headers={"Shortcut-Token": token, "Accept": "application/json"})
    try:
        with urllib.request.urlopen(req, timeout=20) as resp:
            body = resp.read().decode("utf-8")
        data = json.loads(body)
    except urllib.error.HTTPError as e:
        warn(f"Shortcut PR-link lookup for PR #{pr_number} failed: HTTP {e.code} {e.reason}")
        return pr_number, None
    except Exception as e:  # noqa: BLE001 - a lookup failure must never abort the run
        warn(f"Shortcut PR-link lookup for PR #{pr_number} failed: {e}")
        return pr_number, None

    results = data.get("data", [])
    total = data.get("total", len(results))
    if not results:
        return pr_number, None
    if total > 1 or len(results) > 1:
        warn(f"Shortcut PR-link lookup for PR #{pr_number} was ambiguous ({total} stories); skipping.")
        return pr_number, None

    story = results[0]
    story_id = story.get("id")
    if story_id is None:
        return pr_number, None

    try:
        pr_number_int = int(pr_number)
    except (TypeError, ValueError):
        pr_number_int = None

    matching_pr = next(
        (pr for pr in shortcut_pr_guards.gather_linked_prs(story) if pr.get("number") == pr_number_int),
        None,
    )
    if matching_pr is None or not shortcut_pr_guards.passes_pr_guards(matching_pr):
        warn(
            f"Shortcut PR-link lookup for PR #{pr_number} resolved to story {story_id}, but "
            "that PR does not pass the shipping-evidence guards (merged / Sefaria-Project "
            "repo / target branch master / head branch not long-lived) -- e.g. a promotion "
            "or branch-sync merge rather than the real feature PR. Skipping."
        )
        return pr_number, None

    return pr_number, str(story_id)


def fetch_stories_by_pr(pr_numbers, token, max_workers=8):
    """Batch-resolve fetch_story_by_pr_link across PRs concurrently."""
    story_id_by_pr = {}
    if not pr_numbers:
        return story_id_by_pr
    with concurrent.futures.ThreadPoolExecutor(max_workers=max_workers) as executor:
        futures = [executor.submit(fetch_story_by_pr_link, n, token) for n in pr_numbers]
        for future in concurrent.futures.as_completed(futures):
            pr_number, story_id = future.result()
            if story_id:
                story_id_by_pr[pr_number] = story_id
    return story_id_by_pr


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
    parser.add_argument(
        "--chart-version",
        help="Chart version to disambiguate a chart-only rollout of the same --version "
             "(e.g. 0.87.5-prod.1). Ignored with --range. If it doesn't match any tag, "
             "falls back to the newest 'prod/<version>+*' tag instead of failing.",
    )
    parser.add_argument("--out", help="Output file path (default: stdout)")
    parser.add_argument("--repo", default=DEFAULT_REPO, help=f"GitHub repo, default {DEFAULT_REPO}")
    return parser


CHART_IN_TAG = re.compile(r"\+chart\.(?P<chart>.+)$")


def chart_version_from_tag(tag):
    """Extract the chart version from a prod tag's '+chart.X' suffix, e.g. prod/6.111.0-prod.2+chart.0.87.5-prod.1 -> 0.87.5-prod.1. None if absent."""
    if not tag:
        return None
    m = CHART_IN_TAG.search(tag)
    return m.group("chart") if m else None

def main():
    args = build_arg_parser().parse_args()

    if args.version:
        prev, cur = resolve_range_from_version(args.version, args.chart_version)
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
            "is_revert": bool(REVERT_PATTERN.match(subject)),
        })
        if pr_number:
            pr_numbers.add(pr_number)

    branch_by_pr = fetch_branches(sorted(pr_numbers), args.repo)

    # Read once; used both for the PR-link fallback below and hydration later.
    token = os.environ.get("SHORTCUT_API_TOKEN")

    # Resolve each commit's full story_ids (subject ∪ its PR branch name) once.
    for c in parsed_commits:
        branch = branch_by_pr.get(c["pr_number"]) if c["pr_number"] else None
        c["branch"] = branch
        c["story_ids"] = c["subject_story_ids"] | extract_story_ids(branch)

    # Third discovery source: for a commit with a PR number but no story id
    # yet, ask Shortcut whether that PR is linked to a story -- unless the
    # subject is noise or the PR's head branch is a promotion merge.
    def _eligible_for_pr_link_fallback(c):
        return (
            c["pr_number"]
            and not c["story_ids"]
            and not NOISE_PATTERN.search(c["subject"])
            and c["branch"] not in LONG_LIVED_ENV_BRANCHES
        )

    stories_from_shortcut_pr_link = set()
    prs_needing_shortcut_lookup = sorted(
        {c["pr_number"] for c in parsed_commits if _eligible_for_pr_link_fallback(c)},
        key=int,
    )
    if prs_needing_shortcut_lookup:
        if token:
            story_id_by_pr = fetch_stories_by_pr(prs_needing_shortcut_lookup, token)
            for c in parsed_commits:
                if _eligible_for_pr_link_fallback(c):
                    sid = story_id_by_pr.get(c["pr_number"])
                    if sid:
                        c["story_ids"] = {sid}
                        stories_from_shortcut_pr_link.add(sid)
        else:
            warn(
                f"SHORTCUT_API_TOKEN is not set; skipping the Shortcut PR-link fallback "
                f"lookup for {len(prs_needing_shortcut_lookup)} commit(s) whose PR carries "
                "no sc-NNNNN id in its subject or branch name."
            )

    # Tracks which non-revert commits carry each story id, so a revert
    # excludes only the specific commit it quotes, not every commit sharing
    # that id.
    carrying_indices_by_id = {}
    for i, c in enumerate(parsed_commits):
        if c["is_revert"]:
            continue
        for sid in c["story_ids"]:
            carrying_indices_by_id.setdefault(sid, set()).add(i)

    reverted_commits = []
    for i, c in enumerate(parsed_commits):
        if not c["is_revert"]:
            continue

        # A revert's own story ids are never attributed as shipped, but are surfaced separately.
        if c["story_ids"]:
            reverted_commits.append({
                "subject": c["subject"],
                "suppressed_story_ids": sorted(c["story_ids"], key=int),
            })

        # If the reverted commit is also in this range, stop its ids from
        # shipping too, unless another commit still carries them.
        quote_match = REVERT_QUOTE_PATTERN.match(c["subject"])
        if not quote_match:
            continue
        quoted_subject = quote_match.group(1)
        for j, other in enumerate(parsed_commits):
            if j == i or other["is_revert"] or other["subject"] != quoted_subject:
                continue
            for sid in other["story_ids"]:
                carrying_indices_by_id.get(sid, set()).discard(j)

    all_story_ids = {sid for sid, indices in carrying_indices_by_id.items() if indices}

    commits = []
    commits_without_story = []
    for c in parsed_commits:
        commits.append({
            "subject": c["subject"],
            "pr_number": c["pr_number"],
            "branch": c["branch"],
            "story_ids": sorted(c["story_ids"], key=int),
        })

        if not c["is_revert"] and not c["story_ids"] and not NOISE_PATTERN.search(c["subject"]):
            commits_without_story.append(c["subject"])

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
        "release_date": tag_creator_date_iso(cur),
        "range": {"previous_tag": prev, "current_tag": cur, "spec": range_spec},
        "commits": commits,
        "commits_without_story": commits_without_story,
        "reverted_commits": reverted_commits,
        "story_ids": sorted(all_story_ids, key=int),
        # Ids adopted only via the PR-link fallback; already included in story_ids/stories.
        "stories_from_shortcut_pr_link": sorted(stories_from_shortcut_pr_link, key=int),
        "stories": stories,
        # False when SHORTCUT_API_TOKEN was absent, distinguishing "never looked up" from "found nothing".
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
