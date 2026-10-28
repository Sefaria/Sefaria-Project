---
area: user-library
title: Saved, history & notes
domain: Voices (sheets & community)
document: architecture
owner: unassigned
status: exploring  # baseline → exploring → proposed → agreed
updated: 2026-10-19
---
# Saved, history & notes — architecture

> Part of the future-reader specification (`docs/reader-future/`), maintained in Slack **#reader-future** by Claude Tag with the
> `capture-future-spec` skill. The sections above the BASELINE block belong to the channel; the block is generated from the
> Feature Atlas and refreshed by `tools/seed.py`. Claims about either codebase cite files on `master` (legacy) or `reader-next`.

## Summary

No target architecture yet. Tracking where a reader is up to in a text, and rebuilt bookmarking, are wanted but not for the first
iteration; the architecture should leave room for them. Below: what both clients do today and the seam that keeps the path open.
Everything under target, dependencies and risks is an *idea* · [Slack](https://sefaria.slack.com/archives/C0C9EGTL468/p1792404977763469?thread_ts=1792041146.749969&cid=C0C9EGTL468).

**Assessment:** compatible with small changes. The reader already knows, per panel, the segment being read, and the URL already
names it, so a position tracker needs no rework of the reading engine or routing. What is missing is one place for user state:
today four stores are written from four places, and Continue Reading never leaves the device.

## Legacy approach vs new approach

**Legacy** (`master` @ 121350b). History, saved items and last place are one Mongo collection, `UserHistory`: each item has ref,
book, versions, a client `time_stamp`, a `server_time_stamp`, and a `last_place` flag the server moves to the newest item per user
and book [`sefaria/model/user_profile.py:80-82`](https://github.com/Sefaria/Sefaria-Project/blob/121350b2659ef01e08ef618cf7bbefd54f8799ed/sefaria/model/user_profile.py#L80-L82), [`sefaria/model/user_profile.py:130-135`](https://github.com/Sefaria/Sefaria-Project/blob/121350b2659ef01e08ef618cf7bbefd54f8799ed/sefaria/model/user_profile.py#L130-L135). Signed-in pages get `last_place` in
their props [`reader/views.py:320`](https://github.com/Sefaria/Sefaria-Project/blob/121350b2659ef01e08ef618cf7bbefd54f8799ed/reader/views.py#L320), and `/api/profile/user_history?last_place=1` reads it [`reader/views.py:4501-4503`](https://github.com/Sefaria/Sefaria-Project/blob/121350b2659ef01e08ef618cf7bbefd54f8799ed/reader/views.py#L4501-L4503). The book
page's Continue Reading uses it [`static/js/sefaria/sefaria.js:2985-2987`](https://github.com/Sefaria/Sefaria-Project/blob/121350b2659ef01e08ef618cf7bbefd54f8799ed/static/js/sefaria/sefaria.js#L2985-L2987), [`static/js/BookPage.jsx:172-175`](https://github.com/Sefaria/Sefaria-Project/blob/121350b2659ef01e08ef618cf7bbefd54f8799ed/static/js/BookPage.jsx#L172-L175). Its ref is the
history item's: the section, or the verse chosen in the sidebar.

**New** (`reader-next` @ 837d585). Four stores, each written from its own place:
- *History and Save*: the legacy protocol, `POST /api/profile/sync` signed in and the `user_history` cookie signed out
  [`src/lib/user/history.ts:1-19`](https://github.com/Sefaria/Sefaria-Project/blob/837d5851180be4d26c08f3276752d8bdad8fa607/reader-next/src/lib/user/history.ts#L1-L19), [`src/lib/user/history.ts:110-138`](https://github.com/Sefaria/Sefaria-Project/blob/837d5851180be4d26c08f3276752d8bdad8fa607/reader-next/src/lib/user/history.ts#L110-L138); recorded per panel after 3 s on a place
  [`src/features/reader/use-reader-history.ts:33-56`](https://github.com/Sefaria/Sefaria-Project/blob/837d5851180be4d26c08f3276752d8bdad8fa607/reader-next/src/features/reader/use-reader-history.ts#L33-L56), section-level unless the sidebar has a verse
  [`src/features/reader/TextPanel.tsx:462-473`](https://github.com/Sefaria/Sefaria-Project/blob/837d5851180be4d26c08f3276752d8bdad8fa607/reader-next/src/features/reader/TextPanel.tsx#L462-L473). Writes are fire-and-forget; a failure is dropped
  [`src/features/reader/use-reader-history.ts:19-23`](https://github.com/Sefaria/Sefaria-Project/blob/837d5851180be4d26c08f3276752d8bdad8fa607/reader-next/src/features/reader/use-reader-history.ts#L19-L23). Saved items are a query of the `user` class, never kept on disk
  [`src/lib/user/history.ts:94-106`](https://github.com/Sefaria/Sefaria-Project/blob/837d5851180be4d26c08f3276752d8bdad8fa607/reader-next/src/lib/user/history.ts#L94-L106), [`src/lib/cache/policies.ts:25`](https://github.com/Sefaria/Sefaria-Project/blob/837d5851180be4d26c08f3276752d8bdad8fa607/reader-next/src/lib/cache/policies.ts#L25).
- *Last place per book*: segment-level `{ref, time}` in localStorage, keyed by book title [`src/lib/reader/last-place.ts:1-28`](https://github.com/Sefaria/Sefaria-Project/blob/837d5851180be4d26c08f3276752d8bdad8fa607/reader-next/src/lib/reader/last-place.ts#L1-L28),
  written whenever the current segment changes [`src/features/reader/TextPanel.tsx:355-358`](https://github.com/Sefaria/Sefaria-Project/blob/837d5851180be4d26c08f3276752d8bdad8fa607/reader-next/src/features/reader/TextPanel.tsx#L355-L358), read only by Continue Reading
  [`src/features/book/BookRoute.tsx:38-40`](https://github.com/Sefaria/Sefaria-Project/blob/837d5851180be4d26c08f3276752d8bdad8fa607/reader-next/src/features/book/BookRoute.tsx#L38-L40). Nothing leaves the device: the server's `last_place` is written (through history)
  but never read, so a signed-in reader loses the cross-device resume sefaria.org has (USL-012, BOK-003).
- *Back/forward*: segment plus pixel offset per history entry and panel, in sessionStorage
  [`src/lib/reader/position-store.ts:1-22`](https://github.com/Sefaria/Sefaria-Project/blob/837d5851180be4d26c08f3276752d8bdad8fa607/reader-next/src/lib/reader/position-store.ts#L1-L22), [`src/features/workspace/navigation.tsx:74-96`](https://github.com/Sefaria/Sefaria-Project/blob/837d5851180be4d26c08f3276752d8bdad8fa607/reader-next/src/features/workspace/navigation.tsx#L74-L96).
- *Display preferences*: cookies (see [Versions](../versions/architecture.md)).

## Target architecture

Not for the first iteration (*idea* · [Slack](https://sefaria.slack.com/archives/C0C9EGTL468/p1792404977763469?thread_ts=1792041146.749969&cid=C0C9EGTL468)); recorded so the first iteration does not close the path.

- **One position record.** `ReadingPosition { work, ref, anchorId?, structure?, versions?, updatedAt, device? }`: `work` the
  index title; `ref` the canonical segment ref; `anchorId` a stable location id once the API has one; `structure` only if a work
  gets several; `versions` as `{primary, translation}` in `family|Title` form; `updatedAt` client epoch ms. One per reader and
  work, latest wins; history stays its own append-only list. — *idea* · [Slack](https://sefaria.slack.com/archives/C0C9EGTL468/p1792404977763469?thread_ts=1792041146.749969&cid=C0C9EGTL468)
- **Bookmarks share the anchor.** A bookmark is an explicit item in its own list, `{ anchor, label?, createdAt, updatedAt }`, with
  `anchor` the same `ref / anchorId / structure / versions` as a position. Today's saved record (ref plus versions,
  [`src/lib/user/history.ts:42-49`](https://github.com/Sefaria/Sefaria-Project/blob/837d5851180be4d26c08f3276752d8bdad8fa607/reader-next/src/lib/user/history.ts#L42-L49)) maps onto it. — *idea* · [Slack](https://sefaria.slack.com/archives/C0C9EGTL468/p1792404977763469?thread_ts=1792041146.749969&cid=C0C9EGTL468)
- **One signal from the reader.** Positions come from the panel's single "now reading" signal, emitted on settle (see
  [Reader shell](../reader-shell/architecture.md)), not from a fifth hook in `TextPanel`. — *idea* · [Slack](https://sefaria.slack.com/archives/C0C9EGTL468/p1792404977763469?thread_ts=1792041146.749969&cid=C0C9EGTL468)
- **One user-state store.** `src/lib/user` owns positions, bookmarks and history behind one interface (get/set position per
  work, list/toggle bookmarks, record history). Anonymous: local (localStorage or IndexedDB, as `last-place.ts` already is).
  Signed in: the same local copy plus server sync, read back on load. Features never touch cookies, storage or `/api/profile/*`
  themselves, the same rule as the adapter boundary over the text model (`../CROSS_CUTTING.md`). On sign-in, local positions are
  sent to the profile once. — *idea* · [Slack](https://sefaria.slack.com/archives/C0C9EGTL468/p1792404977763469?thread_ts=1792041146.749969&cid=C0C9EGTL468)
- **Sync and conflicts.** Writes are coalesced per work and debounced (the 3 s rule already used for history,
  [`src/features/reader/use-reader-history.ts:16`](https://github.com/Sefaria/Sefaria-Project/blob/837d5851180be4d26c08f3276752d8bdad8fa607/reader-next/src/features/reader/use-reader-history.ts#L16)), queued locally when offline, and merged last-write-wins on `updatedAt` per
  work; bookmarks merge per item, with tombstones for deletes. The legacy record already keeps a client time next to the
  server's ([`sefaria/model/user_profile.py:80-81`](https://github.com/Sefaria/Sefaria-Project/blob/121350b2659ef01e08ef618cf7bbefd54f8799ed/sefaria/model/user_profile.py#L80-L81)), so this fits it too. — *idea* · [Slack](https://sefaria.slack.com/archives/C0C9EGTL468/p1792404977763469?thread_ts=1792041146.749969&cid=C0C9EGTL468)
- **Resume is a link.** Resuming opens the position's segment URL with its versions; the pixel offset stays local, for
  back/forward only. See [URLs & routing](../routing/architecture.md). — *idea* · [Slack](https://sefaria.slack.com/archives/C0C9EGTL468/p1792404977763469?thread_ts=1792041146.749969&cid=C0C9EGTL468)
- **Privacy.** A position is reading history: it obeys "reading history off" (enforced by the server today,
  [`src/features/reader/use-reader-history.ts:29`](https://github.com/Sefaria/Sefaria-Project/blob/837d5851180be4d26c08f3276752d8bdad8fa607/reader-next/src/features/reader/use-reader-history.ts#L29)) and is cleared with it. — *idea* · [Slack](https://sefaria.slack.com/archives/C0C9EGTL468/p1792404977763469?thread_ts=1792041146.749969&cid=C0C9EGTL468)

## Dependencies on other areas

- [Reader shell](../reader-shell/architecture.md): the single "now reading" signal per panel.
- [URLs & routing](../routing/architecture.md): resume links; how a URL would name a structure.
- [Book pages](../book-pages/architecture.md): Continue Reading (BOK-003) reads the store, not `last-place.ts`.
- [Accounts](../accounts/architecture.md): moving anonymous state into the profile on sign-in.
- The text data-model assessment (`../CROSS_CUTTING.md`, "Assessment: a new backend text model", PR #3821): stable location ids
  (`anchorId`) and several structures per work.

## Risks and open questions

- Where positions live on the server: reuse `UserHistory.last_place` (exists, one per book, but its ref is whatever history sent,
  section-level today, and it is tied to the history list) or a new position record with segment refs and device. A backend
  choice; the reader does not care which if it goes through the store. — *idea* · [Slack](https://sefaria.slack.com/archives/C0C9EGTL468/p1792404977763469?thread_ts=1792041146.749969&cid=C0C9EGTL468)
- Key per work only, or per work and version / structure? Proposed: per work, with versions as attributes. — *idea* · [Slack](https://sefaria.slack.com/archives/C0C9EGTL468/p1792404977763469?thread_ts=1792041146.749969&cid=C0C9EGTL468)
- Renamed titles: both clients key by title string, so a position survives a rename only while the old title stays an alias.
  The client resolves aliases once ([`src/lib/cache/ref-index.ts:1-8`](https://github.com/Sefaria/Sefaria-Project/blob/837d5851180be4d26c08f3276752d8bdad8fa607/reader-next/src/lib/cache/ref-index.ts#L1-L8)); the server must too. `anchorId` removes the
  dependency. — *idea* · [Slack](https://sefaria.slack.com/archives/C0C9EGTL468/p1792404977763469?thread_ts=1792041146.749969&cid=C0C9EGTL468)
- Writing a segment position on every settle through `/api/profile/sync`, which also feeds the history list, is chatty and would
  fill history with verses: coalesce, and keep positions out of the history list. — *idea* · [Slack](https://sefaria.slack.com/archives/C0C9EGTL468/p1792404977763469?thread_ts=1792041146.749969&cid=C0C9EGTL468)

## Decisions

_None yet. Every decision is also logged in `../DECISIONS.md`._

<!-- BASELINE:START (generated by docs/reader-future/tools/seed.py — do not edit by hand) -->

## Baseline: the two clients today

### Legacy client (`master`)

Where the atlas found this area's behaviour (files cited by its features, most-cited first):

- [`static/js/sefaria/sefaria.js`](https://github.com/Sefaria/Sefaria-Project/blob/master/static/js/sefaria/sefaria.js) (7)
- [`static/js/Misc.jsx`](https://github.com/Sefaria/Sefaria-Project/blob/master/static/js/Misc.jsx) (6)
- [`reader/views.py`](https://github.com/Sefaria/Sefaria-Project/blob/master/reader/views.py) (5)
- [`static/js/ReaderApp.jsx`](https://github.com/Sefaria/Sefaria-Project/blob/master/static/js/ReaderApp.jsx) (3)
- [`static/js/MyNotesPanel.jsx`](https://github.com/Sefaria/Sefaria-Project/blob/master/static/js/MyNotesPanel.jsx) (2)
- [`static/js/NoteListing.jsx`](https://github.com/Sefaria/Sefaria-Project/blob/master/static/js/NoteListing.jsx) (2)
- [`static/js/UserHistoryPanel.jsx`](https://github.com/Sefaria/Sefaria-Project/blob/master/static/js/UserHistoryPanel.jsx) (2)
- [`static/js/Story.jsx`](https://github.com/Sefaria/Sefaria-Project/blob/master/static/js/Story.jsx) (2)
- [`sefaria/model/user_profile.py`](https://github.com/Sefaria/Sefaria-Project/blob/master/sefaria/model/user_profile.py) (2)

Long-form audit write-up: `reader-next/docs/features/inv_07_sheets_users.md`, `reader-next/docs/features/inv_08_other.md`, `reader-next/docs/features/inv_02_reader_shell.md`, `reader-next/docs/features/inv_04_connections.md`.

### New client (`reader-next`, folder `reader-next/`)

Rebuild status of this area's features: done 8, not started 4.

Implemented in (most features first):

- [`src/features/reader/use-reader-history.ts`](https://github.com/Sefaria/Sefaria-Project/blob/reader-next/reader-next/src/features/reader/use-reader-history.ts) (6)
- [`src/ui/NotesView`](https://github.com/Sefaria/Sefaria-Project/blob/reader-next/reader-next/src/ui/NotesView) (2)

### Gaps: core and standard features not done (2)

| ID | Tier | Feature | Rebuild status |
|---|---|---|---|
| USL-008 | core | Saved items and reading history pages | not started |
| USL-003 | standard | My Notes page | not started |

_Generated 2026-10-14 from the atlas and `rebuild-status.json`. Architecture of each client as a whole: `reader-next/docs/ARCHITECTURE.md`._

<!-- BASELINE:END -->
