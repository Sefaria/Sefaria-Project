#!/usr/bin/env python3
"""
Post-deploy steps: open checklist items on a Shortcut story whose text starts
with "Post-deploy:". The release pipeline keeps such a story out of Done and
lists the items in the release notes. See README-prod-release-notes.md.

Usage:
    python3 post_deploy.py --input shipped-stories.json --append-to release-notes-tech-slack.txt
"""

import argparse
import json
import re

POST_DEPLOY_PATTERN = re.compile(r"^\s*post[- ]?deploy\s*:", re.IGNORECASE)


UNREADABLE_CHECKLIST = "Checklist couldn't be read; check it for post-deploy steps"


def open_items(story):
    """Unticked "Post-deploy:" checklist items of a raw Shortcut story, without the prefix.

    A story whose checklist exists (`task_ids`) but wasn't returned (`tasks`) is treated as
    held, since we can't tell whether its items are ticked.
    """
    if "tasks" not in story and story.get("task_ids"):
        return [UNREADABLE_CHECKLIST]
    return [
        POST_DEPLOY_PATTERN.sub("", t["description"], count=1).strip()
        for t in story.get("tasks") or []
        if not t.get("complete") and POST_DEPLOY_PATTERN.match(t.get("description") or "")
    ]


def _escape(text):
    return text.replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;")


def slack_section(shipped_stories_data):
    """Slack mrkdwn section listing every shipped story's open items verbatim, or "" if there are none."""
    lines = [
        f"• {_escape(item)} (<{story.get('url')}|sc-{story.get('id')}: {_escape(story.get('name') or '')}>)"
        for story in shipped_stories_data.get("stories") or []
        for item in story.get("post_deploy_items") or []
    ]
    return "\n".join([":pushpin: *Post-deploy actions*", *lines]) if lines else ""


def main():
    parser = argparse.ArgumentParser(description="Append the Post-deploy actions section to the tech release notes.")
    parser.add_argument("--input", required=True, help="Path to shipped-stories.json")
    parser.add_argument("--append-to", required=True, help="Release notes file to append the section to")
    args = parser.parse_args()

    with open(args.input, encoding="utf-8") as f:
        section = slack_section(json.load(f))
    if section:
        with open(args.append_to, "a", encoding="utf-8") as f:
            f.write("\n\n" + section + "\n")


if __name__ == "__main__":
    main()
