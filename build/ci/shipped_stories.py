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

# Shortcut (SC) story id patterns recognized in a commit subject or a PR
# branch name. Kept intentionally short: `\bsc[-_](\d+)\b` (pattern 1) has a
# TRAILING word boundary, so it already matches "sc-N"/"sc_N" wrapped in any
# punctuation (brackets, parens, a leading "chore:"/"feat:" etc.) -- adding a
# separate bracket/paren/prefix-scoped pattern for each of those shapes would
# just re-derive what pattern 1 already covers. The other two patterns here
# are kept because they are NOT subsumed by pattern 1:
#   - `chore[:/\(].*?sc[-_](\d+)` / `feat[:/\(].*?sc[-_](\d+)` have no
#     trailing boundary, so they still match when a word character follows
#     the digits directly with no separator (e.g. a "chore(sc_123abc)"-shaped
#     subject).
#   - `feature/sc[-_ ](\d+)` allows a literal space after "sc", which
#     pattern 1's `[-_]` does not.
SC_PATTERNS = [
    re.compile(r'\bsc[-_](\d+)\b', re.IGNORECASE),
    re.compile(r'feature/sc[-_ ](\d+)', re.IGNORECASE),
    re.compile(r'chore[:/\(].*?sc[-_](\d+)', re.IGNORECASE),
    re.compile(r'feat[:/\(].*?sc[-_](\d+)', re.IGNORECASE),
]

PR_PATTERN = re.compile(r'\(#(\d+)\)')

# A real (non-squash) merge commit's subject never gets the parenthesized
# "(#N)" form -- GitHub writes it as a bare "Merge pull request #N from
# <owner>/<branch>". For a merge-commit PR this subject is often the ONLY
# place the PR number appears in the whole range (no matching child commit
# carries it), so PR_PATTERN alone would silently miss it.
MERGE_PR_PATTERN = re.compile(r'^Merge pull request #(\d+)\s+from\s+\S+', re.IGNORECASE)

# Matches the double-quoted original subject inside a `Revert "..."` commit
# (e.g. a subject like `Revert "fix(sc-13): correct the thing"` captures
# `fix(sc-13): correct the thing`). Used to find that original commit
# elsewhere in the same range (see the reverted-original handling in
# main()) -- not applicable to the `Revert: ...` / `revert(...)` forms,
# which never quote a subject.
REVERT_QUOTE_PATTERN = re.compile(r'^revert\s+"(.+?)"', re.IGNORECASE)

# Auto-generated noise that should never count as "a real commit missing a
# story id" in commits_without_story: deploy(<any env>) markers, "Merge pull
# request" / "Merge branch" / "Merge remote-tracking branch" subjects (the
# latter two are plain branch-sync merges -- now that merge commits are
# walked at all for ID/PR extraction, these show up in the range too and
# must not pollute that list), and any subject ending in a "[skip ci]"
# marker. Generalized from an enumerated (staging|preprod|prod) alternation
# so new deploy environments (e.g. deploy(sandbox)) are recognized without
# an edit here.
NOISE_PATTERN = re.compile(
    r'^(deploy\(\w+\)|Merge (pull request|branch|remote-tracking branch))|\[skip ci\]',
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
    from the original (reverted) subject, e.g. `Revert "x (#123)" (#456)`.

    Falls back to the bare "Merge pull request #N from ..." form when no
    parenthesized ref is present -- that's the only form a real (non-squash)
    merge commit ever gets."""
    if not text:
        return None
    matches = PR_PATTERN.findall(text)
    if matches:
        return matches[-1]
    m = MERGE_PR_PATTERN.match(text)
    return m.group(1) if m else None


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


def resolve_range_from_version(version, chart_version=None):
    """Resolve the (prev, cur) prod/* tag pair for --version V [--chart-version CV].

    A prod app version can have MULTIPLE prod/* tags -- one per chart-only
    rollout of the same app version (e.g. prod/6.100.0-prod.1+chart.0.85.8-
    prod.{1,2,3}). With --chart-version, the exact tag `prod/V+chart.CV` is
    preferred; if it doesn't exist (e.g. Argo's chartVersion arg and the tag
    suffix drifted out of sync), that's logged and we fall through to the
    no-chart-version path below rather than dying -- a chart-version mismatch
    must never be the thing that kills a healthy rollout's release notes.

    Without a matching --chart-version, and when more than one tag matches
    `prod/V+*`, the newest by tag creation date is chosen (never dies) and
    the choice is logged. All tags are read once via `git tag --list
    'prod/*' --sort=-creatordate`, so "newest" and "previous tag" both use
    that same deterministic ordering -- prev is simply the tag immediately
    after the chosen one in that list.
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
    # Deliberately NOT --no-merges: a merge-commit PR's bare "Merge pull
    # request #N from .../hotfix/sc-.../..." subject can be the ONLY place
    # its PR number and story id appear in the whole range (no squashed
    # "(#N)" form, no matching child commit) -- see MERGE_PR_PATTERN and the
    # NOISE_PATTERN handling for the plain branch-sync merges this also lets
    # through.
    out = run_git(["log", range_spec, "--pretty=format:%s"])
    return [line for line in out.split("\n") if line.strip()]


def tag_creator_date_iso(tag):
    """ISO 8601 creation date of an annotated tag (`%(creatordate:iso-strict)`),
    or None if `tag` doesn't resolve to a real tag ref (e.g. an explicit
    --range endpoint that's a branch or SHA, not a prod/* tag)."""
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
                # `gh` itself isn't on PATH -- every other in-flight lookup
                # will hit the exact same error, so fail fast with one clear
                # message instead of an unhandled traceback (or N identical
                # per-PR warnings).
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

    # Resolve each commit's full story_ids (subject ∪ its PR branch name)
    # once, up front -- both the per-commit `commits[]` output and the
    # aggregate shipped-set logic below read from this.
    for c in parsed_commits:
        branch = branch_by_pr.get(c["pr_number"]) if c["pr_number"] else None
        c["branch"] = branch
        c["story_ids"] = c["subject_story_ids"] | extract_story_ids(branch)

    # Track, per story id, which NON-revert commit indices carry it. This is
    # what lets a revert exclude ONLY the specific original commit it quotes
    # from the shipped set -- not every commit that happens to share that id
    # -- so an id independently carried by another, still-live commit keeps
    # shipping (finding #7).
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

        # A revert's OWN story ids must never be attributed as shipped, but
        # they're too important to silently drop — surface them instead.
        if c["story_ids"]:
            reverted_commits.append({
                "subject": c["subject"],
                "suppressed_story_ids": sorted(c["story_ids"], key=int),
            })

        # If this revert quotes a commit subject that's ALSO in this same
        # range, that original's ids must stop shipping too -- unless some
        # other, still-live commit independently carries the same id.
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

        # Reverts are excluded here too: a revert with a suppressed story id
        # is already reported via reverted_commits, and a revert with no
        # story id at all is ordinary noise, not a commit needing attention.
        if not c["is_revert"] and not c["story_ids"] and not NOISE_PATTERN.search(c["subject"]):
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
        # ISO 8601 creation date of the resolved current tag, or null if
        # `cur` isn't a real tag ref (e.g. an explicit --range against a
        # branch/SHA). Source of truth for the release date shown in the
        # generated Slack posts -- see sefaria-release-notes/SKILL.md.
        "release_date": tag_creator_date_iso(cur),
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
