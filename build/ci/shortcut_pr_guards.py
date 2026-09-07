#!/usr/bin/env python3
"""
Shared "does this linked PR count as shipping evidence" guards.

Both `shipped_stories.py` (RC1's PR<->story link fallback) and
`reconcile_deploy_ready.py` (RC2's org-wide Deploy Ready sweep) need to
answer the exact same question about a PR that Shortcut says is linked to a
story: does this PR actually prove that story's change reached prod? A
linked PR is NOT automatically that evidence -- FOUR guards apply, and
both scripts must apply the SAME four guards or they will silently drift
apart. They already have, twice, in opposite directions: RC1's PR-link
fallback initially had no guards at all (a promotion PR resolved via
`search/stories?query=pr:<N>` to a real story just as readily as that
story's actual feature PR); then, after guards 1-3 were added here, a
promotion PR merging INTO master (rather than out of it) turned out to
still pass all three -- verified live: a real story was classified
`shipped` on the strength of a PR whose head branch was `preprod` and
target branch was `master`, a promotion merge, while its genuine feature
PR (head a hotfix/bugfix branch, target a hotfix branch) was correctly
rejected by guard 3 for not targeting `master` directly. Guard 3 alone
cannot catch this shape: a promotion merge legitimately targets `master`,
so the target-branch check has nothing to object to. The giveaway is the
SOURCE (head) branch, not the target -- hence guard 4.

  1. `merged` must be true. An open or closed-without-merging PR is not
     evidence anything shipped.
  2. `repository_id` must be Sefaria-Project's own (500000103). A story can
     link a PR from a different repo; resolving that PR number against
     Sefaria-Project instead would find an unrelated (often much older) PR
     that happens to share the number.
  3. `target_branch_name` must be "master". A promotion PR (preprod ->
     prod, or master -> preprod) merges constantly and proves nothing
     about whether a given story's own change reached prod -- it must
     never be treated as interchangeable with the real feature PR.
  4. `branch_name` (the PR's HEAD/source branch) must NOT be a long-lived
     environment branch (master, preprod, prod). A promotion PR that
     merges ONE of those branches INTO master (e.g. preprod -> master, the
     opposite direction from guard 3's preprod/prod targets) passes guards
     1-3 cleanly -- it's merged, against the right repo, and its target
     really is "master". Only the head branch reveals it's a promotion
     merge, not a feature PR.

This module holds the shared implementation so there is exactly one place
these guards live; single-source-of-truth, not two parallel copies that a
future edit only remembers to update in one of them. Stdlib only -- no
third-party dependencies, matching both callers' dependency posture.

All story/PR ids in this file's docstring and comments (e.g. 500000103,
which is Sefaria-Project's real repository id, not a story id, and is not
covered by the "no real Shortcut ids" convention the two callers document)
are either placeholders or non-story ids -- see shipped_stories.py's and
reconcile_deploy_ready.py's own docstrings for that convention.
"""

# Sefaria-Project's own Shortcut repository id. Not a story id -- see the
# module docstring's placeholder-id note.
SEFARIA_PROJECT_REPO_ID = 500000103

DEFAULT_TARGET_BRANCH = "master"

# Guard #4. Shared with shipped_stories.py's own pre-filter (it also skips
# the RC1 fallback lookup entirely for a commit whose PR head branch is one
# of these -- see that script's LONG_LIVED_ENV_BRANCHES, which now imports
# this same set rather than keeping a second copy) -- the two must name the
# exact same branches or they can drift apart on what counts as "long-lived"
# the same way they already drifted on whether this guard existed at all.
LONG_LIVED_ENV_BRANCHES = frozenset({"master", "preprod", "prod"})


def passes_pr_guards(pr, repo_id=SEFARIA_PROJECT_REPO_ID, target_branch=DEFAULT_TARGET_BRANCH):
    """True if a single linked-PR object (a Shortcut `pull-request` entity,
    as found in a story's `pull_requests` or `branches[*].pull_requests`)
    counts as evidence that a story's change reached prod: merged, against
    the right repo, targeting the right branch, and NOT itself a promotion
    merge (head branch not long-lived). See the module docstring for why
    each of the four checks exists."""
    return (
        pr.get("merged") is True
        and pr.get("repository_id") == repo_id
        and pr.get("target_branch_name") == target_branch
        and pr.get("branch_name") not in LONG_LIVED_ENV_BRANCHES
    )


def qualifying_prs(prs, repo_id=SEFARIA_PROJECT_REPO_ID, target_branch=DEFAULT_TARGET_BRANCH):
    """Filter a list of linked-PR objects down to the ones that pass
    passes_pr_guards."""
    return [pr for pr in prs if passes_pr_guards(pr, repo_id=repo_id, target_branch=target_branch)]


def gather_linked_prs(story):
    """Collect every PR linked to a Shortcut story from BOTH
    `story.pull_requests` and `story.branches[*].pull_requests` -- Shortcut
    duplicates the same PR object in both places, and depending on how/when
    a branch or PR was linked, either one can be the only place a given PR
    shows up. Deduplicated by PR number (top-level `pull_requests` wins on
    a tie; the object is identical either way). Returns every linked PR,
    guards not yet applied -- see qualifying_prs/passes_pr_guards -- so a
    caller can show what was linked at all, not just what passed."""
    seen = set()
    prs = []
    for pr in story.get("pull_requests") or []:
        number = pr.get("number")
        if number is not None and number not in seen:
            seen.add(number)
            prs.append(pr)
    for branch in story.get("branches") or []:
        for pr in branch.get("pull_requests") or []:
            number = pr.get("number")
            if number is not None and number not in seen:
                seen.add(number)
                prs.append(pr)
    return prs
