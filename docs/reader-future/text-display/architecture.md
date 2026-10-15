---
area: text-display
title: Text display & reading settings
domain: Reader
document: architecture
owner: unassigned
status: exploring  # baseline → exploring → proposed → agreed
updated: 2026-10-15
---
# Text display & reading settings — architecture

> Part of the future-reader specification (`docs/reader-future/`), maintained in Slack **#reader-future** by Claude Tag with the
> `capture-future-spec` skill. The sections above the BASELINE block belong to the channel; the block is generated from the
> Feature Atlas and refreshed by `tools/seed.py`. Claims about either codebase cite files on `master` (legacy) or `reader-next`.

## Summary

_Not discussed yet._

## Legacy approach vs new approach

Scroll and click repaints, rows 10–13 of the load/repaint table in [platform-seo architecture](../platform-seo/architecture.md#legacy-loadrepaint-issues-vs-new-arc)
("current architecture" means the legacy sefaria.org reader: [Slack](https://sefaria.slack.com/archives/C0C9EGTL468/p1792052319198069?thread_ts=1792048275.276949&cid=C0C9EGTL468)). Lab numbers are from the same run as that table (Pixel 7
emulation, 4× CPU slow-down, 1.6 Mbps); indicative only.

| # | Interaction | Legacy (`master`) | New (`reader-next`) | Status · gap |
|---|---|---|---|---|
| 10 | Segment numbers after each load | jQuery measures every number and sets its `top` after each load and on resize: [`static/js/TextRange.jsx:188-225`](https://github.com/Sefaria/Sefaria-Project/blob/master/static/js/TextRange.jsx#L188-L225), [`static/js/TextRange.jsx:25-28`](https://github.com/Sefaria/Sefaria-Project/blob/master/static/js/TextRange.jsx#L25-L28). | Numbers are laid out by CSS; only the continuous layout spreads numbers on one line, in a ResizeObserver: [`src/features/reader/TextColumn.tsx:236-246`](https://github.com/Sefaria/Sefaria-Project/blob/reader-next/reader-next/src/features/reader/TextColumn.tsx#L236-L246). | **Solved** for the segmented layout. The continuous layout still measures every number on each change. |
| 11 | Infinite scroll adding text above the reader | Up to 10 sections are added above at once, then the scroll position is set back after they load: [`static/js/TextColumn.jsx:321-361`](https://github.com/Sefaria/Sefaria-Project/blob/master/static/js/TextColumn.jsx#L321-L361), [`static/js/TextColumn.jsx:241-268`](https://github.com/Sefaria/Sefaria-Project/blob/master/static/js/TextColumn.jsx#L241-L268). In the lab `/Genesis.1.5` had a scroll-time shift of 0.027. | One section at a time; the reading-scroll engine puts the reader back before paint (ResizeObserver and layout effects), with browser scroll anchoring off: [`src/features/reader/use-reading-scroll.ts:156-186`](https://github.com/Sefaria/Sefaria-Project/blob/reader-next/reader-next/src/features/reader/use-reading-scroll.ts#L156-L186), [`src/features/reader/use-reading-scroll.ts:290-299`](https://github.com/Sefaria/Sefaria-Project/blob/reader-next/reader-next/src/features/reader/use-reading-scroll.ts#L290-L299), [`src/features/reader/TextColumn.tsx:201-218`](https://github.com/Sefaria/Sefaria-Project/blob/reader-next/reader-next/src/features/reader/TextColumn.tsx#L201-L218). Lab gates: [`e2e/smoothness.spec.ts:40-57`](https://github.com/Sefaria/Sefaria-Project/blob/reader-next/reader-next/e2e/smoothness.spec.ts#L40-L57). Lab scroll CLS 0. | **Solved in the lab.** Gates run on a desktop viewport and the dev server only; nothing is measured for real users. |
| 12 | Work done on each scroll event | Every scroll event runs `adjustInfiniteScroll` (layout reads); a 100 ms debounce then measures every segment and sets state up through the panel and app, which rewrites history: [`static/js/TextColumn.jsx:114-121`](https://github.com/Sefaria/Sefaria-Project/blob/master/static/js/TextColumn.jsx#L114-L121), [`static/js/TextColumn.jsx:404-444`](https://github.com/Sefaria/Sefaria-Project/blob/master/static/js/TextColumn.jsx#L404-L444), [`static/js/ReaderPanel.jsx:584-590`](https://github.com/Sefaria/Sefaria-Project/blob/master/static/js/ReaderPanel.jsx#L584-L590). Lab: 8–11 long tasks while scrolling. | One passive listener, one step per animation frame, binary search for the current verse; the highlight is a DOM attribute, not React state: [`src/features/reader/use-reading-scroll.ts:130-154`](https://github.com/Sefaria/Sefaria-Project/blob/reader-next/reader-next/src/features/reader/use-reading-scroll.ts#L130-L154), [`src/features/reader/use-reading-scroll.ts:249-251`](https://github.com/Sefaria/Sefaria-Project/blob/reader-next/reader-next/src/features/reader/use-reading-scroll.ts#L249-L251), [`src/features/reader/TextColumn.tsx:100-109`](https://github.com/Sefaria/Sefaria-Project/blob/reader-next/reader-next/src/features/reader/TextColumn.tsx#L100-L109). Still, each change of verse sets panel state, and each pause in scrolling navigates the router (URL replace): [`src/features/reader/TextPanel.tsx:162-175`](https://github.com/Sefaria/Sefaria-Project/blob/reader-next/reader-next/src/features/reader/TextPanel.tsx#L162-L175). Lab: 2–5 long tasks while scrolling. | **Partly.** No INP or long-task measurement; no budget for work per scroll step. |
| 13 | Tapping a segment to open connections (phone) | The text column changes size and then scrolls to the highlight: [`static/js/TextColumn.jsx:80-83`](https://github.com/Sefaria/Sefaria-Project/blob/master/static/js/TextColumn.jsx#L80-L83). Lab: a shift of 0.14 on the tap (not counted as CLS because it follows input, but visible). | The tapped verse becomes the anchor before the column reflows: [`src/features/reader/TextColumn.tsx:175-183`](https://github.com/Sefaria/Sefaria-Project/blob/reader-next/reader-next/src/features/reader/TextColumn.tsx#L175-L183); lab gate on desktop: [`e2e/smoothness.spec.ts:66-73`](https://github.com/Sefaria/Sefaria-Project/blob/reader-next/reader-next/e2e/smoothness.spec.ts#L66-L73). Lab: shift 0.0001 on tap, but 6–7 long tasks after it. | **Partly.** Layout solved; time to the next paint after the tap (INP) is not measured. |

## Target architecture

- Repaints are monitored in production on interactions in the reading column (scroll, including infinite scroll; clicks on
  segments and controls), not only on load. — *proposed* · [Slack](https://sefaria.slack.com/archives/C0C9EGTL468/p1792048342291029?thread_ts=1792048275.276949&cid=C0C9EGTL468) · TXD-052
- The lab checks already in `reader-next` (jump analysis and CLS per scroll step) stay as regression gates. — *proposed* · [Slack](https://sefaria.slack.com/archives/C0C9EGTL468/p1792048342291029?thread_ts=1792048275.276949&cid=C0C9EGTL468) · TXD-068 · [`e2e/smoothness.spec.ts:120`](https://github.com/Sefaria/Sefaria-Project/blob/reader-next/reader-next/e2e/smoothness.spec.ts#L120)

## Dependencies on other areas

- [SSR, SEO & platform](../platform-seo/architecture.md): load-time targets, SSR payload and production monitoring.
- [Cross-cutting → Performance](../CROSS_CUTTING.md#performance).

## Risks and open questions

- Gaps for scroll and click, from checking `reader-next` against the legacy reader (rows 11–13 above). Not agreed; each needs
  someone to propose a requirement or drop it. — [Slack](https://sefaria.slack.com/archives/C0C9EGTL468/p1792052319198069?thread_ts=1792048275.276949&cid=C0C9EGTL468)
  - Should the smoothness gates (`e2e/smoothness.spec.ts`) also run on a phone profile and a production build? Today they run
    on the desktop project against the dev server.
  - Is a budget needed for main-thread work on scroll and tap (INP, long tasks)? The new reader still sets panel state on each
    verse change and replaces the URL on each scroll pause.
  - The column keeps every section it loads; neither client removes sections during a long reading session. Does this need
    a limit?

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
