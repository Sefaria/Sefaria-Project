#!/usr/bin/env python3
"""
Shared guards for deciding whether a Shortcut-linked PR counts as evidence
that a story's change reached prod.
"""

SEFARIA_PROJECT_REPO_ID = 500000103

DEFAULT_TARGET_BRANCH = "master"

LONG_LIVED_ENV_BRANCHES = frozenset({"master", "preprod", "prod"})


def passes_pr_guards(pr, repo_id=SEFARIA_PROJECT_REPO_ID, target_branch=DEFAULT_TARGET_BRANCH):
    """True if a linked-PR object counts as shipping evidence: merged, right repo, right target branch, and not a promotion merge."""
    return (
        pr.get("merged") is True
        and pr.get("repository_id") == repo_id
        and pr.get("target_branch_name") == target_branch
        and pr.get("branch_name") not in LONG_LIVED_ENV_BRANCHES
    )


def qualifying_prs(prs, repo_id=SEFARIA_PROJECT_REPO_ID, target_branch=DEFAULT_TARGET_BRANCH):
    """Filter a list of linked-PR objects down to the ones that pass passes_pr_guards."""
    return [pr for pr in prs if passes_pr_guards(pr, repo_id=repo_id, target_branch=target_branch)]


def gather_linked_prs(story):
    """Collect every PR linked to a story from both `pull_requests` and `branches[*].pull_requests`, deduplicated by PR number."""
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
