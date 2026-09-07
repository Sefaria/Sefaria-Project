#!/usr/bin/env python3
"""
Shared "post a comment on a Shortcut story" helper.

Today this pipeline only ever WRITES a story's workflow state (a PUT that
changes `workflow_state_id`) -- nothing records WHICH release actually
carried a story, so a person reading the story inside Shortcut can see it
became Done but has no way to tell what shipped it without going and
digging through CI logs or git. Both `mark_stories_deployed.py` (this
release's own shipped stories) and `reconcile_deploy_ready.py` (older
stories backfilled by the org-wide sweep) close that gap by posting a
short, factual write-back comment immediately after a successful
transition -- but they need the exact same POST mechanics and the exact
same non-fatal error handling around it, so that lives here once. Two
copies of this would be exactly the drift failure the shared
shortcut_pr_guards.py module already exists to prevent for the PR-level
guards -- same reasoning, same fix.

What differs between the two callers is not HOW to post a comment, but
WHAT the comment says: `mark_stories_deployed.py` knows the current
release's own version/chart/date (it's reading that release's own
shipped-stories.json) and can just say so. `reconcile_deploy_ready.py`
does NOT know that -- a story it backfills shipped in some EARLIER
release, and if its comment named the CURRENT prod tag, a reader would
reasonably conclude that story shipped in TODAY's release. That's exactly
the "old features shipped today" error class the shipped-stories.json /
reconcile-report separation in this codebase's other docstrings exists to
avoid, just showing up in a different place (a Shortcut comment instead of
a Slack post). So comment-TEXT construction stays in each caller, where
the release-identity knowledge already lives; only the POST mechanics are
shared here.

Stdlib only -- no third-party dependencies, matching both callers'
dependency posture.
"""

import json
import urllib.error
import urllib.request

SHORTCUT_API_BASE = "https://api.app.shortcut.com/api/v3"


def post_story_comment(story_id, text, token):
    """POST a comment onto a story (`POST /stories/{id}/comments`).
    Returns (story_id, ok, error). Mirrors the transition_story functions
    in both callers: a failure here must never raise, and must never be
    conflated with a failed transition -- by the time this is ever called,
    the state change has ALREADY succeeded. The comment is a best-effort
    annotation on top of a real, already-durable state change, not a
    precondition for it -- so a comment failure is reported (the caller
    warns and tracks it) but never rolls anything back and never fails the
    run on its own."""
    url = f"{SHORTCUT_API_BASE}/stories/{story_id}/comments"
    body = json.dumps({"text": text}).encode("utf-8")
    req = urllib.request.Request(url, data=body, method="POST")
    req.add_header("Shortcut-Token", token)
    req.add_header("Content-Type", "application/json")
    try:
        with urllib.request.urlopen(req, timeout=20) as resp:
            resp.read()
        return story_id, True, None
    except urllib.error.HTTPError as e:
        return story_id, False, f"HTTP {e.code} {e.reason}"
    except Exception as e:  # noqa: BLE001 - a comment failure must never abort the run or roll back the transition
        return story_id, False, str(e)
