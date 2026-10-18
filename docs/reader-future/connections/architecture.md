---
area: connections
title: Connections & resources sidebar
domain: Reader
document: architecture
owner: unassigned
status: exploring  # baseline → exploring → proposed → agreed
updated: 2026-10-18
---
# Connections & resources sidebar — architecture

> Part of the future-reader specification (`docs/reader-future/`), maintained in Slack **#reader-future** by Claude Tag with the
> `capture-future-spec` skill. The sections above the BASELINE block belong to the channel; the block is generated from the
> Feature Atlas and refreshed by `tools/seed.py`. Claims about either codebase cite files on `master` (legacy) or `reader-next`.

## Summary

No target architecture yet. The ideas in the [product spec](product.md) would make whether the sidebar is open (or docked) a
piece of panel state set by its own control rather than by choosing a segment, and would add a lightweight lookup surface at the
word, next to the sidebar rather than inside it. [Slack](https://sefaria.slack.com/archives/C0C9EGTL468/p1792316219999969?thread_ts=1792091846.417749&cid=C0C9EGTL468)

## Legacy approach vs new approach

**Opening and closing the sidebar.**
- Legacy (`master`): on desktop the sidebar is a separate panel spliced in after the text panel; a segment click opens it
  ([`static/js/ReaderApp.jsx:1059`](https://github.com/Sefaria/Sefaria-Project/blob/master/static/js/ReaderApp.jsx#L1059), [`static/js/ReaderApp.jsx:1841`](https://github.com/Sefaria/Sefaria-Project/blob/master/static/js/ReaderApp.jsx#L1841); CON-004, CON-008). In the text panel, a segment click
  in mode `Text` opens it; on phones, in mode `TextAndConnections`, a segment click closes it again
  ([`static/js/ReaderPanel.jsx:170-182`](https://github.com/Sefaria/Sefaria-Project/blob/master/static/js/ReaderPanel.jsx#L170-L182)). The segment click handler has no check for a selection in progress
  ([`static/js/TextRange.jsx:485-527`](https://github.com/Sefaria/Sefaria-Project/blob/master/static/js/TextRange.jsx#L485-L527)); the check exists only in `TextRange.handleClick`, used for text in the sidebar's lists
  ([`static/js/TextRange.jsx:90-94`](https://github.com/Sefaria/Sefaria-Project/blob/master/static/js/TextRange.jsx#L90-L94)).
- New (`reader-next`): the sidebar is an *aside* of its panel in the workspace state ([`src/lib/workspace/types.ts:33`](https://github.com/Sefaria/Sefaria-Project/blob/reader-next/reader-next/src/lib/workspace/types.ts#L33)), carried in the
  URL ([`src/lib/workspace/url.ts:47`](https://github.com/Sefaria/Sefaria-Project/blob/reader-next/reader-next/src/lib/workspace/url.ts#L47)), opened and closed with `openAside` / `closeAside` ([`src/lib/workspace/ops.ts:117`](https://github.com/Sefaria/Sefaria-Project/blob/reader-next/reader-next/src/lib/workspace/ops.ts#L117),
  [`src/lib/workspace/ops.ts:139`](https://github.com/Sefaria/Sefaria-Project/blob/reader-next/reader-next/src/lib/workspace/ops.ts#L139)). A segment click opens it, or closes it when the clicked verse is already the current one
  ([`src/features/reader/TextPanel.tsx:228-247`](https://github.com/Sefaria/Sefaria-Project/blob/reader-next/reader-next/src/features/reader/TextPanel.tsx#L228-L247)); the click that ends a drag-selection is ignored ([`src/ui/Segment/Segment.tsx:77-82`](https://github.com/Sefaria/Sefaria-Project/blob/reader-next/reader-next/src/ui/Segment/Segment.tsx#L77-L82)).
  While the sidebar is open, the selected verse follows scrolling ([`src/features/reader/TextPanel.tsx:168-175`](https://github.com/Sefaria/Sefaria-Project/blob/reader-next/reader-next/src/features/reader/TextPanel.tsx#L168-L175); TXD-055, TXD-067).

**Dictionary lookup.**
- Legacy: selected words go to the sidebar panel only if it already exists ([`static/js/ReaderApp.jsx:1936-1942`](https://github.com/Sefaria/Sefaria-Project/blob/master/static/js/ReaderApp.jsx#L1936-L1942); on phones to
  the same panel, [`static/js/ReaderPanel.jsx:339-348`](https://github.com/Sefaria/Sefaria-Project/blob/master/static/js/ReaderPanel.jsx#L339-L348)). The sidebar switches to the dictionaries for fewer than three words in
  one segment ([`static/js/ConnectionsPanel.jsx:82-88`](https://github.com/Sefaria/Sefaria-Project/blob/master/static/js/ConnectionsPanel.jsx#L82-L88)) and renders `LexiconBox` there ([`static/js/ConnectionsPanel.jsx:437-438`](https://github.com/Sefaria/Sefaria-Project/blob/master/static/js/ConnectionsPanel.jsx#L437-L438)).
  A selection never opens a closed sidebar (SHL-053, CON-042).
- New: the same rule. Mouse-up in the column reports the selected words ([`src/features/reader/TextColumn.tsx:274-282`](https://github.com/Sefaria/Sefaria-Project/blob/reader-next/reader-next/src/features/reader/TextColumn.tsx#L274-L282)); nothing
  happens unless the sidebar is open ([`src/features/reader/TextPanel.tsx:342-353`](https://github.com/Sefaria/Sefaria-Project/blob/reader-next/reader-next/src/features/reader/TextPanel.tsx#L342-L353)); definitions render in the sidebar's
  dictionaries view ([`src/features/reader/ConnectionsPane.tsx:338-345`](https://github.com/Sefaria/Sefaria-Project/blob/reader-next/reader-next/src/features/reader/ConnectionsPane.tsx#L338-L345)), from [`src/lib/lexicon/lookup.ts:97`](https://github.com/Sefaria/Sefaria-Project/blob/reader-next/reader-next/src/lib/lexicon/lookup.ts#L97) (`/api/words`).
- In both clients the dictionary has no surface outside the sidebar.

## Target architecture

Implications of ideas, not decisions.

- Whether the sidebar is open, closed or docked becomes panel state changed only by its own control (and a default, if it starts
  open), not by choosing a segment. `reader-next` already keeps the sidebar as an aside separate from the panel's verse; segment
  selection would stop calling `openAside`, and a docked state would need a representation (and a decision on whether it goes
  in the URL). — *idea* · [Slack](https://sefaria.slack.com/archives/C0C9EGTL468/p1792091846417749?thread_ts=1792091846.417749&cid=C0C9EGTL468) · [Slack](https://sefaria.slack.com/archives/C0C9EGTL468/p1792316219999969?thread_ts=1792091846.417749&cid=C0C9EGTL468)
- If the sidebar starts open, the selected-verse tracking that today runs only while it is open would run by default
  ([`src/features/reader/TextPanel.tsx:168-175`](https://github.com/Sefaria/Sefaria-Project/blob/reader-next/reader-next/src/features/reader/TextPanel.tsx#L168-L175); TXD-050, TXD-067). — *idea* · [Slack](https://sefaria.slack.com/archives/C0C9EGTL468/p1792091846417749?thread_ts=1792091846.417749&cid=C0C9EGTL468)
- A lightweight lookup surface (pop-up or tooltip) anchored to the word, outside the sidebar, reusing the lexicon lookup and
  entry rendering, with a call-to-action that opens the sidebar on the dictionaries for the same words. — *idea* · [Slack](https://sefaria.slack.com/archives/C0C9EGTL468/p1792111854572059?thread_ts=1792091846.417749&cid=C0C9EGTL468) · [Slack](https://sefaria.slack.com/archives/C0C9EGTL468/p1792315304773969?thread_ts=1792091846.417749&cid=C0C9EGTL468) · [Slack](https://sefaria.slack.com/archives/C0C9EGTL468/p1792316219999969?thread_ts=1792091846.417749&cid=C0C9EGTL468)
- Lookups start from an explicit click or double-click on a word (tap or tap-and-hold on phones), not from mouse-up on a
  selection; see [Text display](../text-display/architecture.md). — *idea* · [Slack](https://sefaria.slack.com/archives/C0C9EGTL468/p1792092258845779?thread_ts=1792091846.417749&cid=C0C9EGTL468) · [Slack](https://sefaria.slack.com/archives/C0C9EGTL468/p1792165467488169?thread_ts=1792091846.417749&cid=C0C9EGTL468) · [Slack](https://sefaria.slack.com/archives/C0C9EGTL468/p1792316219999969?thread_ts=1792091846.417749&cid=C0C9EGTL468)

## Dependencies on other areas

- [Text display](../text-display/architecture.md): click, double-click and selection handling in the reading column.
- [Reader shell & panels](../reader-shell/architecture.md): panel and aside state in the workspace; single panel on phones (SHL-061).
- [URLs & routing](../routing/architecture.md): sidebar and lookup state in the URL (`with=`, `lookup=`).

## Risks and open questions

- Rules for which content opens in a pop-up and which in the sidebar. — [Slack](https://sefaria.slack.com/archives/C0C9EGTL468/p1792111854572059?thread_ts=1792091846.417749&cid=C0C9EGTL468)
- Phones: the pop-up idea was raised for desktop; a gesture (tap vs tap-and-hold) and a place for the pop-up in the single-panel
  layout are open. — [Slack](https://sefaria.slack.com/archives/C0C9EGTL468/p1792115591468479?thread_ts=1792091846.417749&cid=C0C9EGTL468) · [Slack](https://sefaria.slack.com/archives/C0C9EGTL468/p1792165467488169?thread_ts=1792091846.417749&cid=C0C9EGTL468)
- If double-click becomes the lookup gesture: the legacy guard against accidental multi-click selection
  ([`static/js/TextColumn.jsx:132-140`](https://github.com/Sefaria/Sefaria-Project/blob/master/static/js/TextColumn.jsx#L132-L140)) is not ported to `reader-next` (TXD-057, `rebuild-status.json`: partial).

## Decisions

_None yet. Every decision is also logged in `../DECISIONS.md`._

<!-- BASELINE:START (generated by docs/reader-future/tools/seed.py — do not edit by hand) -->

## Baseline: the two clients today

### Legacy client (`master`)

Where the atlas found this area's behaviour (files cited by its features, most-cited first):

- [`static/js/ConnectionsPanel.jsx`](https://github.com/Sefaria/Sefaria-Project/blob/master/static/js/ConnectionsPanel.jsx) (38)
- [`static/js/sefaria/sefaria.js`](https://github.com/Sefaria/Sefaria-Project/blob/master/static/js/sefaria/sefaria.js) (20)
- [`static/js/ReaderPanel.jsx`](https://github.com/Sefaria/Sefaria-Project/blob/master/static/js/ReaderPanel.jsx) (15)
- [`static/js/ReaderApp.jsx`](https://github.com/Sefaria/Sefaria-Project/blob/master/static/js/ReaderApp.jsx) (15)
- [`reader/views.py`](https://github.com/Sefaria/Sefaria-Project/blob/master/reader/views.py) (11)
- [`static/js/TextList.jsx`](https://github.com/Sefaria/Sefaria-Project/blob/master/static/js/TextList.jsx) (8)
- [`static/js/ConnectionsPanelHeader.jsx`](https://github.com/Sefaria/Sefaria-Project/blob/master/static/js/ConnectionsPanelHeader.jsx) (5)
- [`static/js/ConnectionFilters.jsx`](https://github.com/Sefaria/Sefaria-Project/blob/master/static/js/ConnectionFilters.jsx) (5)
- [`static/js/AboutBox.jsx`](https://github.com/Sefaria/Sefaria-Project/blob/master/static/js/AboutBox.jsx) (4)
- [`static/js/AddToSourceSheet.jsx`](https://github.com/Sefaria/Sefaria-Project/blob/master/static/js/AddToSourceSheet.jsx) (4)
- [`sefaria/client/wrapper.py`](https://github.com/Sefaria/Sefaria-Project/blob/master/sefaria/client/wrapper.py) (3)
- [`static/js/TextRange.jsx`](https://github.com/Sefaria/Sefaria-Project/blob/master/static/js/TextRange.jsx) (3)
- [`static/js/LexiconBox.jsx`](https://github.com/Sefaria/Sefaria-Project/blob/master/static/js/LexiconBox.jsx) (3)
- [`static/js/TopicSearch.jsx`](https://github.com/Sefaria/Sefaria-Project/blob/master/static/js/TopicSearch.jsx) (2)
- [`static/js/Media.jsx`](https://github.com/Sefaria/Sefaria-Project/blob/master/static/js/Media.jsx) (2)

Long-form audit write-up: `reader-next/docs/features/inv_04_connections.md`, `reader-next/docs/features/inv_02_reader_shell.md`.

### New client (`reader-next`, folder `reader-next/`)

Rebuild status of this area's features: done 41, partial 5, not started 25.

Implemented in (most features first):

- [`src/features/reader/ConnectionsPane.tsx`](https://github.com/Sefaria/Sefaria-Project/blob/reader-next/reader-next/src/features/reader/ConnectionsPane.tsx) (5)
- [`src/features/reader/TextPanel.tsx`](https://github.com/Sefaria/Sefaria-Project/blob/reader-next/reader-next/src/features/reader/TextPanel.tsx) (2)
- [`src/ui/AddToSheetView`](https://github.com/Sefaria/Sefaria-Project/blob/reader-next/reader-next/src/ui/AddToSheetView) (1)
- [`src/ui/ConnectionsPanel/TextList.tsx`](https://github.com/Sefaria/Sefaria-Project/blob/reader-next/reader-next/src/ui/ConnectionsPanel/TextList.tsx) (1)
- [`src/ui/AboutView/AboutView.tsx`](https://github.com/Sefaria/Sefaria-Project/blob/reader-next/reader-next/src/ui/AboutView/AboutView.tsx) (1)
- [`src/lib/lexicon/lookup.ts`](https://github.com/Sefaria/Sefaria-Project/blob/reader-next/reader-next/src/lib/lexicon/lookup.ts) (1)
- [`src/ui/LexiconEntry/LexiconEntry.tsx`](https://github.com/Sefaria/Sefaria-Project/blob/reader-next/reader-next/src/ui/LexiconEntry/LexiconEntry.tsx) (1)
- [`src/ui/NamedEntityView`](https://github.com/Sefaria/Sefaria-Project/blob/reader-next/reader-next/src/ui/NamedEntityView) (1)
- [`src/ui/TopicsView/TopicsView.tsx`](https://github.com/Sefaria/Sefaria-Project/blob/reader-next/reader-next/src/ui/TopicsView/TopicsView.tsx) (1)
- [`src/ui/NotesView`](https://github.com/Sefaria/Sefaria-Project/blob/reader-next/reader-next/src/ui/NotesView) (1)
- [`src/ui/WebPagesView/WebPagesView.tsx`](https://github.com/Sefaria/Sefaria-Project/blob/reader-next/reader-next/src/ui/WebPagesView/WebPagesView.tsx) (1)
- [`src/lib/connections/webpages.ts`](https://github.com/Sefaria/Sefaria-Project/blob/reader-next/reader-next/src/lib/connections/webpages.ts) (1)
- [`src/ui/TorahReadingsView/TorahReadingsView.tsx`](https://github.com/Sefaria/Sefaria-Project/blob/reader-next/reader-next/src/ui/TorahReadingsView/TorahReadingsView.tsx) (1)
- [`src/ui/ManuscriptsView/ManuscriptsView.tsx`](https://github.com/Sefaria/Sefaria-Project/blob/reader-next/reader-next/src/ui/ManuscriptsView/ManuscriptsView.tsx) (1)
- [`src/ui/ShareView`](https://github.com/Sefaria/Sefaria-Project/blob/reader-next/reader-next/src/ui/ShareView) (1)

### Gaps: core and standard features not done (16)

| ID | Tier | Feature | Rebuild status |
|---|---|---|---|
| CON-005 | core | Sidebar panel state fields | not started |
| CON-007 | core | Complete sidebar mode inventory | not started |
| CON-043 | core | Lexicon lookup and filtering | partial |
| CON-055 | core | Add selected source to a sheet | partial |
| CON-002 | standard | Connections header mobile variant | not started |
| CON-016 | standard | Tools button component behavior | not started |
| CON-022 | standard | Link category assignment (server) | not started |
| CON-028 | standard | Recent filters chips | not started |
| CON-031 | standard | Commentary text preload before display | not started |
| CON-034 | standard | Add connection to sheet button | partial |
| CON-035 | standard | Remove connection (moderator) | not started |
| CON-048 | standard | Add private note on a ref | partial |
| CON-050 | standard | Edit and delete note | not started |
| CON-056 | standard | Add to sheet: version and partial-selection handling | not started |
| CON-065 | standard | Create connection between two texts | partial |
| CON-066 | standard | Compare text from sidebar | not started |

_Generated 2026-10-14 from the atlas and `rebuild-status.json`. Architecture of each client as a whole: `reader-next/docs/ARCHITECTURE.md`._

<!-- BASELINE:END -->
