#!/usr/bin/env python3
"""Post a text file to Slack as one or more mrkdwn section blocks.

Reads the webhook URL from the SLACK_WEBHOOK_URL environment variable and
posts the contents of --file to it. Slack section blocks cap out at ~3000
characters per text field, so the file is split on blank lines (paragraph /
section boundaries) and repacked into chunks under --limit rather than being
truncated, then posted as one section block per chunk in a single message.

Exits non-zero (and prints the response) on any non-2xx response from Slack,
so a silently-dropped post is visible in the calling workflow's logs instead
of just disappearing.

Usage:
    python3 post_to_slack.py --file release-notes-output/release-notes-tech-slack.txt
    python3 post_to_slack.py --file some-notes.txt --limit 2900
"""

import argparse
import json
import os
import sys
import urllib.error
import urllib.request


def _split_long_paragraph(para: str, limit: int) -> list[str]:
    """Hard-split a single paragraph longer than `limit` into <= limit sized
    pieces. Prefers to break on the last newline or space found within the
    first `limit` characters of what's left, so words aren't cut mid-token;
    falls back to a hard cut at exactly `limit` when no such boundary exists
    (e.g. one very long word or URL). The fallback also guarantees forward
    progress on every iteration, so this always terminates."""
    pieces: list[str] = []
    remaining = para
    while len(remaining) > limit:
        window = remaining[:limit]
        boundary = max(window.rfind("\n"), window.rfind(" "))
        if boundary > 0:
            pieces.append(remaining[:boundary])
            remaining = remaining[boundary + 1:]  # drop the boundary char itself
        else:
            pieces.append(remaining[:limit])
            remaining = remaining[limit:]
    if remaining:
        pieces.append(remaining)
    return pieces


def chunk_text(text: str, limit: int) -> list[str]:
    """Split text on blank lines and repack paragraphs under `limit` chars.

    Any single paragraph longer than `limit` is hard-split first (see
    _split_long_paragraph) so it can never pass through whole — without
    this, a single over-limit paragraph would produce a chunk Slack rejects
    with `invalid_blocks` instead of being split like every other paragraph.
    Every chunk this function returns is guaranteed to be <= limit chars.
    """
    paragraphs: list[str] = []
    for para in text.split("\n\n"):
        if len(para) > limit:
            paragraphs.extend(_split_long_paragraph(para, limit))
        else:
            paragraphs.append(para)

    chunks: list[str] = []
    current = ""
    for para in paragraphs:
        candidate = (current + "\n\n" + para) if current else para
        if len(candidate) > limit and current:
            chunks.append(current)
            current = para
        else:
            current = candidate
    if current:
        chunks.append(current)
    return chunks


def post_to_slack(webhook_url: str, text: str, limit: int) -> None:
    chunks = chunk_text(text, limit)
    blocks = [
        {"type": "section", "text": {"type": "mrkdwn", "text": chunk}}
        for chunk in chunks
    ]
    payload = json.dumps({"blocks": blocks}).encode("utf-8")

    req = urllib.request.Request(
        webhook_url,
        data=payload,
        headers={"Content-Type": "application/json"},
    )

    try:
        with urllib.request.urlopen(req) as resp:
            status = resp.status
            body = resp.read().decode("utf-8", errors="replace")
    except urllib.error.HTTPError as exc:
        status = exc.code
        body = exc.read().decode("utf-8", errors="replace")

    if not (200 <= status < 300):
        print(
            f"ERROR: Slack webhook responded with status {status}: {body}",
            file=sys.stderr,
        )
        sys.exit(1)


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--file", required=True, help="Path to the text file to post to Slack."
    )
    parser.add_argument(
        "--limit",
        type=int,
        default=2900,
        help="Max characters per Slack section block text field (default: 2900).",
    )
    args = parser.parse_args()

    webhook_url = os.environ.get("SLACK_WEBHOOK_URL")
    if not webhook_url:
        print("ERROR: SLACK_WEBHOOK_URL is not set.", file=sys.stderr)
        sys.exit(1)

    with open(args.file, encoding="utf-8") as f:
        text = f.read()

    post_to_slack(webhook_url, text, args.limit)


if __name__ == "__main__":
    main()
