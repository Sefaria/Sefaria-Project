---
area: text-display
title: Text display & reading settings
domain: Reader
document: architecture
owner: unassigned
status: exploring  # baseline → exploring → proposed → agreed
updated: 2026-10-18
---
# Text display & reading settings — architecture

> Part of the future-reader specification (`docs/reader-future/`), maintained in Slack **#reader-future** by Claude Tag with the
> `capture-future-spec` skill. The sections above the BASELINE block belong to the channel; the block is generated from the
> Feature Atlas and refreshed by `tools/seed.py`. Claims about either codebase cite files on `master` (legacy) or `reader-next`.

## Summary

No target architecture yet for interaction in the reading column. The ideas recorded in the [product spec](product.md) would
change what the column's click and selection handlers do: segment clicks stop opening the sidebar, a word click or double-click
starts a lookup, and a selection is left alone. [Slack](https://sefaria.slack.com/archives/C0C9EGTL468/p1792316219999969?thread_ts=1792091846.417749&cid=C0C9EGTL468)

## Legacy approach vs new approach

**Clicks and selection in the reading column.**
- Legacy (`master`): the column listens for mouse-up (selection), click and mouse-down ([`static/js/TextColumn.jsx:510`](https://github.com/Sefaria/Sefaria-Project/blob/master/static/js/TextColumn.jsx#L510)). On
  mouse-up it highlights the segments the selection touches and sends the selected words on for lookup
  ([`static/js/TextColumn.jsx:142-170`](https://github.com/Sefaria/Sefaria-Project/blob/master/static/js/TextColumn.jsx#L142-L170)); a mouse-down that is part of a multi-click at a different spot is prevented
  ([`static/js/TextColumn.jsx:132-140`](https://github.com/Sefaria/Sefaria-Project/blob/master/static/js/TextColumn.jsx#L132-L140)). A click on a segment handles citations, footnotes and names, and otherwise opens the
  sidebar, with no check for a selection in progress ([`static/js/TextRange.jsx:485-527`](https://github.com/Sefaria/Sefaria-Project/blob/master/static/js/TextRange.jsx#L485-L527)). TXD-057, TXD-059, CON-008.
- New (`reader-next`): mouse-up reads the selection and reports the words and the segments it touches
  ([`src/features/reader/TextColumn.tsx:274-282`](https://github.com/Sefaria/Sefaria-Project/blob/reader-next/reader-next/src/features/reader/TextColumn.tsx#L274-L282), [`src/lib/reader/selection.ts:13`](https://github.com/Sefaria/Sefaria-Project/blob/reader-next/reader-next/src/lib/reader/selection.ts#L13)); the click that ends a drag-selection does not
  choose the verse ([`src/ui/Segment/Segment.tsx:77-82`](https://github.com/Sefaria/Sefaria-Project/blob/reader-next/reader-next/src/ui/Segment/Segment.tsx#L77-L82)). Selected segments are not highlighted and the double-click guard is not
  ported (TXD-057 partial in `rebuild-status.json`). A segment click opens the sidebar
  ([`src/features/reader/TextPanel.tsx:228-247`](https://github.com/Sefaria/Sefaria-Project/blob/reader-next/reader-next/src/features/reader/TextPanel.tsx#L228-L247)).

## Target architecture

Implications of ideas, not decisions.

- A segment click no longer opens the sidebar; what it does instead (choose the current verse, or nothing) is open. — *idea* · [Slack](https://sefaria.slack.com/archives/C0C9EGTL468/p1792091846417749?thread_ts=1792091846.417749&cid=C0C9EGTL468) · [Slack](https://sefaria.slack.com/archives/C0C9EGTL468/p1792316219999969?thread_ts=1792091846.417749&cid=C0C9EGTL468)
- Mouse-up on a selection stops starting a lookup; selection is left to the browser (copy keeps its own handler,
  [`src/features/reader/TextColumn.tsx:269`](https://github.com/Sefaria/Sefaria-Project/blob/reader-next/reader-next/src/features/reader/TextColumn.tsx#L269)). — *proposed* · [Slack](https://sefaria.slack.com/archives/C0C9EGTL468/p1792092258845779?thread_ts=1792091846.417749&cid=C0C9EGTL468) · [Slack](https://sefaria.slack.com/archives/C0C9EGTL468/p1792165490196399?thread_ts=1792091846.417749&cid=C0C9EGTL468)
- A word-level click or double-click handler (tap or tap-and-hold on phones) finds the word under the pointer and opens the
  lightweight lookup described in [Connections](../connections/architecture.md). — *idea* · [Slack](https://sefaria.slack.com/archives/C0C9EGTL468/p1792092258845779?thread_ts=1792091846.417749&cid=C0C9EGTL468) · [Slack](https://sefaria.slack.com/archives/C0C9EGTL468/p1792165467488169?thread_ts=1792091846.417749&cid=C0C9EGTL468) · [Slack](https://sefaria.slack.com/archives/C0C9EGTL468/p1792316219999969?thread_ts=1792091846.417749&cid=C0C9EGTL468)

## Dependencies on other areas

- [Connections](../connections/architecture.md): the sidebar's open state and the lookup surface.

## Risks and open questions

- Click or double-click for a lookup, and on phones tap or tap-and-hold. — [Slack](https://sefaria.slack.com/archives/C0C9EGTL468/p1792092258845779?thread_ts=1792091846.417749&cid=C0C9EGTL468) · [Slack](https://sefaria.slack.com/archives/C0C9EGTL468/p1792165467488169?thread_ts=1792091846.417749&cid=C0C9EGTL468) · [Slack](https://sefaria.slack.com/archives/C0C9EGTL468/p1792316219999969?thread_ts=1792091846.417749&cid=C0C9EGTL468)
- A double-click starts with a single click: today the first click of a double-click on a segment runs the segment click in both
  clients
  ([`static/js/TextRange.jsx:523-525`](https://github.com/Sefaria/Sefaria-Project/blob/master/static/js/TextRange.jsx#L523-L525); [`src/ui/Segment/Segment.tsx:77-82`](https://github.com/Sefaria/Sefaria-Project/blob/reader-next/reader-next/src/ui/Segment/Segment.tsx#L77-L82)).

## Decisions

_None yet. Every decision is also logged in `../DECISIONS.md`._

<!-- BASELINE:START (generated by docs/reader-future/tools/seed.py — do not edit by hand) -->

## Baseline: the two clients today

### Legacy client (`master`)

Where the atlas found this area's behaviour (files cited by its features, most-cited first):

- [`static/js/TextRange.jsx`](https://github.com/Sefaria/Sefaria-Project/blob/master/static/js/TextRange.jsx) (26)
- [`static/css/s2.css`](https://github.com/Sefaria/Sefaria-Project/blob/master/static/css/s2.css) (24)
- [`static/js/ReaderPanel.jsx`](https://github.com/Sefaria/Sefaria-Project/blob/master/static/js/ReaderPanel.jsx) (21)
- [`static/js/sefaria/sefaria.js`](https://github.com/Sefaria/Sefaria-Project/blob/master/static/js/sefaria/sefaria.js) (21)
- [`static/js/TextColumn.jsx`](https://github.com/Sefaria/Sefaria-Project/blob/master/static/js/TextColumn.jsx) (13)
- [`static/js/ReaderApp.jsx`](https://github.com/Sefaria/Sefaria-Project/blob/master/static/js/ReaderApp.jsx) (12)
- [`reader/views.py`](https://github.com/Sefaria/Sefaria-Project/blob/master/reader/views.py) (7)
- [`sefaria/model/marked_up_text_chunk.py`](https://github.com/Sefaria/Sefaria-Project/blob/master/sefaria/model/marked_up_text_chunk.py) (5)
- [`static/js/ReaderDisplayOptionsMenu.jsx`](https://github.com/Sefaria/Sefaria-Project/blob/master/static/js/ReaderDisplayOptionsMenu.jsx) (5)
- [`sefaria/model/text_request_adapter.py`](https://github.com/Sefaria/Sefaria-Project/blob/master/sefaria/model/text_request_adapter.py) (4)
- [`static/js/sefaria/util.js`](https://github.com/Sefaria/Sefaria-Project/blob/master/static/js/sefaria/util.js) (4)
- [`static/js/ContentText.jsx`](https://github.com/Sefaria/Sefaria-Project/blob/master/static/js/ContentText.jsx) (3)
- [`static/js/Misc.jsx`](https://github.com/Sefaria/Sefaria-Project/blob/master/static/js/Misc.jsx) (3)
- [`sefaria/model/text.py`](https://github.com/Sefaria/Sefaria-Project/blob/master/sefaria/model/text.py) (2)
- [`static/js/LexiconBox.jsx`](https://github.com/Sefaria/Sefaria-Project/blob/master/static/js/LexiconBox.jsx) (2)

Long-form audit write-up: `reader-next/docs/features/inv_03_text_rendering.md`, `reader-next/docs/features/inv_02_reader_shell.md`, `reader-next/docs/features/inv_08_other.md`.

### New client (`reader-next`, folder `reader-next/`)

Rebuild status of this area's features: done 45, partial 2, deferred 1, replaced 4, not started 17.

Implemented in (most features first):

- [`src/features/reader/`](https://github.com/Sefaria/Sefaria-Project/blob/reader-next/reader-next/src/features/reader/) (33)
- [`src/lib/text/model.ts`](https://github.com/Sefaria/Sefaria-Project/blob/reader-next/reader-next/src/lib/text/model.ts) (3)
- [`src/lib/reader/copy.ts`](https://github.com/Sefaria/Sefaria-Project/blob/reader-next/reader-next/src/lib/reader/copy.ts) (2)
- [`src/features/reader/reader-route.ts`](https://github.com/Sefaria/Sefaria-Project/blob/reader-next/reader-next/src/features/reader/reader-route.ts) (1)
- [`src/lib/reader/header.ts`](https://github.com/Sefaria/Sefaria-Project/blob/reader-next/reader-next/src/lib/reader/header.ts) (1)
- [`src/ui/NamedEntityView`](https://github.com/Sefaria/Sefaria-Project/blob/reader-next/reader-next/src/ui/NamedEntityView) (1)
- [`src/lib/text/prepare.ts`](https://github.com/Sefaria/Sefaria-Project/blob/reader-next/reader-next/src/lib/text/prepare.ts) (1)
- [`src/ui/Segment/Segment.module.css`](https://github.com/Sefaria/Sefaria-Project/blob/reader-next/reader-next/src/ui/Segment/Segment.module.css) (1)
- [`src/lib/reader/spread-numbers.ts`](https://github.com/Sefaria/Sefaria-Project/blob/reader-next/reader-next/src/lib/reader/spread-numbers.ts) (1)
- [`src/lib/reader/selection.ts`](https://github.com/Sefaria/Sefaria-Project/blob/reader-next/reader-next/src/lib/reader/selection.ts) (1)
- [`src/lib/lexicon/lookup.ts`](https://github.com/Sefaria/Sefaria-Project/blob/reader-next/reader-next/src/lib/lexicon/lookup.ts) (1)
- [`src/ui/TextColumnBanner`](https://github.com/Sefaria/Sefaria-Project/blob/reader-next/reader-next/src/ui/TextColumnBanner) (1)

### Gaps: core and standard features not done (14)

| ID | Tier | Feature | Rebuild status |
|---|---|---|---|
| TXD-044 | core | RTL translations rendered with Hebrew styling | partial |
| TXD-015 | standard | Section label by address type for TOC | not started |
| TXD-016 | standard | v3 texts API parameters and warnings | not started |
| TXD-018 | standard | Return formats and text cleaning | not started |
| TXD-019 | standard | Merge versions segment by segment | not started |
| TXD-020 | standard | Allowed inline HTML in stored text | not started |
| TXD-024 | standard | Entity span safety rules | not started |
| TXD-026 | standard | Inline images in text | not started |
| TXD-029 | standard | Search-term highlighting in text | not started |
| TXD-032 | standard | Language toggle visibility rule in display menu | not started |
| TXD-057 | standard | Text selection and double-click guard | partial |
| TXD-060 | standard | Fonts for Hebrew, English and special scripts | not started |
| TXD-063 | standard | Translation-language preference suggestion banner | deferred |
| TXD-066 | standard | Source/translation language popover | not started |

_Generated 2026-10-14 from the atlas and `rebuild-status.json`. Architecture of each client as a whole: `reader-next/docs/ARCHITECTURE.md`._

<!-- BASELINE:END -->
