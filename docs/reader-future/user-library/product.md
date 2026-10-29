---
area: user-library
title: Saved, history & notes
domain: Voices (sheets & community)
document: product
owner: unassigned
status: exploring  # baseline → exploring → proposed → agreed
updated: 2026-10-15

updated: 2026-10-19

updated: 2026-10-28
---
# Saved, history & notes — product specification

> Part of the future-reader specification (`docs/reader-future/`), maintained in Slack **#reader-future** by Claude Tag with the
> `capture-future-spec` skill. The sections above the BASELINE block belong to the channel; the block is generated from the
> Feature Atlas and refreshed by `tools/seed.py`. Every change cites the Slack message it came from.

## Summary

Bookmarking is to be rebuilt, and the reader should know where each reader is up to in a text. Neither is in the first
iteration; the architecture should leave room for both. — *idea* · [Slack](https://sefaria.slack.com/archives/C0C9EGTL468/p1792404977763469?thread_ts=1792041146.749969&cid=C0C9EGTL468)

## Who it is for and what they need

_Not discussed yet._

## Target behaviour in the future reader

- Signed-in readers can save panel layouts (study sessions) and reopen them. See [Reader shell & panels](../reader-shell/product.md). — *idea* · stated by Akiva Berger, 2026-10-15 · [Slack](https://sefaria.slack.com/archives/C0C9EGTL468/p1792059081018739)
- **Where I'm up to.** For each text, the reader remembers the last verse (segment) read and offers to resume there, on the
  book page's Continue Reading and wherever else it helps. Signed in: across devices; signed out: on this device. Not in the
  first iteration. — *idea* · [Slack](https://sefaria.slack.com/archives/C0C9EGTL468/p1792404977763469?thread_ts=1792041146.749969&cid=C0C9EGTL468)
- **Bookmarks, rebuilt.** Places a reader saves on purpose, kept apart from the automatic "where I'm up to" but pointing at the
  same kind of place (a verse in a text, in the versions read). Not in the first iteration. — *idea* · [Slack](https://sefaria.slack.com/archives/C0C9EGTL468/p1792404977763469?thread_ts=1792041146.749969&cid=C0C9EGTL468)
- **One bookmark per book, carrying position and layout** (learning-workspace experiment, PR #3892). Each book has at most one
  bookmark: where you are in it, in a *manual* mode (right-click → "Move bookmark here") or an *automatic* one (it follows your
  reading). It keeps a *last read* and a *furthest read* you can reset, so reviewing (chazara) doesn't lose progress. It also
  carries your layout: which commentaries are open, how they are stacked and their sizes, mapped to the place you are at now.
  Position and layout change separately. — *idea* · [Slack](https://sefaria.slack.com/archives/C0C9EGTL468/p1792920222002419?thread_ts=1792041146.749969&cid=C0C9EGTL468) · [Slack](https://sefaria.slack.com/archives/C0C9EGTL468/p1792920246242149?thread_ts=1792041146.749969&cid=C0C9EGTL468) · [Slack](https://sefaria.slack.com/archives/C0C9EGTL468/p1792921227482299?thread_ts=1792041146.749969&cid=C0C9EGTL468) · [Slack](https://sefaria.slack.com/archives/C0C9EGTL468/p1792936714453059?thread_ts=1792041146.749969&cid=C0C9EGTL468)
- **Bookmarks page and Continue learning.** `/bookmarks` lists every book with its place and a Continue link; a "Continue
  learning" shelf of the books you're in the middle of sits above Browse the Library (builds on Penina's Bookshelf POC, #3837).
  — *idea* · [Slack](https://sefaria.slack.com/archives/C0C9EGTL468/p1792920222002419?thread_ts=1792041146.749969&cid=C0C9EGTL468) · [Slack](https://sefaria.slack.com/archives/C0C9EGTL468/p1792923052109879?thread_ts=1792041146.749969&cid=C0C9EGTL468)
- **Later:** several named layouts per book (Daf Yomi vs deep dive); suggested setups by genre that start from your favourite
  commentaries; "catch me up" and streaks. — *idea* · [Slack](https://sefaria.slack.com/archives/C0C9EGTL468/p1792921227482299?thread_ts=1792041146.749969&cid=C0C9EGTL468) · [Slack](https://sefaria.slack.com/archives/C0C9EGTL468/p1792920246242149?thread_ts=1792041146.749969&cid=C0C9EGTL468)

## Changes from today (keep · change · drop · new)

- **change** · Continue Reading follows the account when signed in. sefaria.org does; `reader-next` keeps it on this device
  only. — *idea* · [Slack](https://sefaria.slack.com/archives/C0C9EGTL468/p1792404977763469?thread_ts=1792041146.749969&cid=C0C9EGTL468)
- **change** · Resume to the verse read, not the section (sefaria.org resumes to the section, or to the verse chosen in the
  sidebar). — *idea* · [Slack](https://sefaria.slack.com/archives/C0C9EGTL468/p1792404977763469?thread_ts=1792041146.749969&cid=C0C9EGTL468)

## Open questions

- One place per text, or per text and translation? — [Slack](https://sefaria.slack.com/archives/C0C9EGTL468/p1792404977763469?thread_ts=1792041146.749969&cid=C0C9EGTL468)
- Are places kept while signed out carried into the account on sign-in? — [Slack](https://sefaria.slack.com/archives/C0C9EGTL468/p1792404977763469?thread_ts=1792041146.749969&cid=C0C9EGTL468)
- Does turning reading history off also stop tracking where I'm up to? (Suggested: yes.) — [Slack](https://sefaria.slack.com/archives/C0C9EGTL468/p1792404977763469?thread_ts=1792041146.749969&cid=C0C9EGTL468)
- Does resuming highlight the verse, or only scroll to it? — [Slack](https://sefaria.slack.com/archives/C0C9EGTL468/p1792404977763469?thread_ts=1792041146.749969&cid=C0C9EGTL468)
- Is the per-book bookmark the same thing as "where I'm up to" (its automatic mode), with a separate list for places saved on
  purpose, or does it replace both? — [Slack](https://sefaria.slack.com/archives/C0C9EGTL468/p1792920222002419?thread_ts=1792041146.749969&cid=C0C9EGTL468)

## Decisions

- 2026-10-25 — A bookmark's saved layout opens by itself only when the reader comes back to the book on purpose: through its
  bookmark, the bookshelf or a search result. Any other way in (table of contents, a citation, browsing) opens the book as usual.
  "Open my saved layout" is always one click away, in the right-click menu and the text display options. Daniel Schreiber.
  [Slack](https://sefaria.slack.com/archives/C0C9EGTL468/p1792923052109879?thread_ts=1792041146.749969&cid=C0C9EGTL468)

_Every decision is also logged in `../DECISIONS.md`._

## Parked ideas

_None yet._

<!-- BASELINE:START (generated by docs/reader-future/tools/seed.py — do not edit by hand) -->

## Baseline: what sefaria.org does today

From the Feature Atlas (`reader-next/docs/features`, area `user-library`): **12 features** — core 5, standard 4, optional 2, retire 1. Tiers are the audit's proposal (core: can't launch without it; standard: parity, can follow; optional: niche or rethink; retire: unused, broken or superseded).

Feature groups: Notes (5); Saved and history (3); Saved items (1); Reading history (1); Saving (1); History (1).

### Core (5)

| ID | Feature | What it does |
|---|---|---|
| USL-001 | Save (bookmark) button in text header | Signed-in readers can save the current text or sheet; anonymous users are invited to sign up. |
| USL-008 | Saved items and reading history pages | Users see saved items and reading history, split by Library texts and Voices sheets. |
| USL-009 | Save and unsave texts and sheets | A bookmark button saves texts and sheets for later. |
| USL-011 | Save (bookmark) button | Users can save texts and sheets to their saved list with a bookmark button; anonymous users are prompted to sign up. |
| USL-012 | Reading history and last place | The site remembers what a user read, for signed-in users on the server and for anonymous users in a cookie. |

### Standard (4)

| ID | Feature | What it does |
|---|---|---|
| USL-002 | Recently viewed / last place tracking | The app records what you are reading so it appears in history. |
| USL-003 | My Notes page | A page listing all of the user's notes with add-to-sheet and links back to the text. |
| USL-007 | Note display | Shows a public or private note on a text, with an edit pencil on the user's own notes. |
| USL-010 | Reading history logging | Texts and sheets read are recorded to history for signed-in users and in a cookie for anonymous users. |

### Optional (2)

| ID | Feature | What it does |
|---|---|---|
| USL-004 | Note listing with delete and sheet-aware links | Compact note entries on profile/note lists with delete and a link to the source. |
| USL-005 | Private notes list | Library users see their private notes with links back to the text and a delete action. |

### Retire (1)

| ID | Feature | What it does |
|---|---|---|
| USL-006 | Orphaned notes panel and Story remnants | Old notes and stories components remain in code but are not reachable. |

### Flags from the audit (not to port as-is)

- **USL-006** Orphaned notes panel and Story remnants — unused

_Generated 2026-10-14. Full behaviour for every ID: `reader-next/docs/features/FEATURES.md` and the atlas page._

<!-- BASELINE:END -->
