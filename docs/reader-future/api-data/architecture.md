---
area: api-data
title: Public API & data exports
domain: Platform
document: architecture
owner: unassigned
status: exploring  # baseline → exploring → proposed → agreed
updated: 2026-10-18
---
# Public API & data exports — architecture

> Part of the future-reader specification (`docs/reader-future/`), maintained in Slack **#reader-future** by Claude Tag with the
> `capture-future-spec` skill. The sections above the BASELINE block belong to the channel; the block is generated from the
> Feature Atlas and refreshed by `tools/seed.py`. Claims about either codebase cite files on `master` (legacy) or `reader-next`.

## Summary

No target architecture yet. One thread so far, on `/api/related`, the reader's heaviest call: the ideas below would store
per-segment counts on the server, send sheets as counts, slim the link rows and let clients ask for parts of the bundle.
Reader side: [Connections](../connections/architecture.md). [Slack](https://sefaria.slack.com/archives/C0C9EGTL468/p1792322132117529) · [Slack](https://sefaria.slack.com/archives/C0C9EGTL468/p1792322798155629?thread_ts=1792322132.117529&cid=C0C9EGTL468)

## Legacy approach vs new approach

**`/api/related` and `/api/links`.** Akiva Berger asked what the reader needs from `/api/related` in each state — [Slack](https://sefaria.slack.com/archives/C0C9EGTL468/p1792322132117529).
- Server (both clients use it): `related_api` computes links, sheets, topics, manuscripts, media and guides one after another,
  with `notes` always empty; no server-side cache and no way to ask for part of it ([`reader/views.py:2638-2666`](https://github.com/Sefaria/Sefaria-Project/blob/master/reader/views.py#L2638-L2666)).
  - links: a regex query on `links`, then two `Ref()`s and full formatting per link; book fields (title, Hebrew title,
    collective title, date, category) are repeated on every row and `ref` equals `sourceRef` ([`sefaria/client/wrapper.py:19-95`](https://github.com/Sefaria/Sefaria-Project/blob/master/sefaria/client/wrapper.py#L19-L95)).
    The `categories` filter runs after every link is formatted ([`sefaria/client/wrapper.py:338-339`](https://github.com/Sefaria/Sefaria-Project/blob/master/sefaria/client/wrapper.py#L338-L339)).
  - sheets: Mongo `sheets`, Postgres users and Mongo `profiles`, a user or collection lookup per sheet, one row per anchor
    (Genesis 1: 4,558 rows for 2,763 sheets) ([`sefaria/sheets.py:925-1019`](https://github.com/Sefaria/Sefaria-Project/blob/master/sefaria/sheets.py#L925-L1019)).
  - Nothing is stored per section or segment; the only stored link count is per book ([`sefaria/model/version_state.py:155`](https://github.com/Sefaria/Sefaria-Project/blob/master/sefaria/model/version_state.py#L155)).
  - `/api/link-summary/<ref>` gives category and book counts, but for the whole ref, not per segment, and it is not in the
    Varnish allow-list ([`reader/views.py:2531-2537`](https://github.com/Sefaria/Sefaria-Project/blob/master/reader/views.py#L2531-L2537)). Neither client uses it.
  - Varnish keeps `/api/related` and `/api/links` for 1 day, plus 10 days stale
    ([`varnish-config.yaml:132-136`](https://github.com/Sefaria/Sefaria-Project/blob/master/helm-chart/sefaria/templates/configmap/varnish-config.yaml#L132-L136)); a link or text save clears the
    section ([`sefaria/system/varnish/wrapper.py:17-58`](https://github.com/Sefaria/Sefaria-Project/blob/master/sefaria/system/varnish/wrapper.py#L17-L58)).
- Legacy client: `/api/related?with_sheet_links=1` for each section entered and its neighbours ([`static/js/TextRange.jsx:146-186`](https://github.com/Sefaria/Sefaria-Project/blob/master/static/js/TextRange.jsx#L146-L186)).
- New client: `/api/links?with_text=0&with_sheet_links=1` per loaded section, and `/api/related` again for Resources
  ([`src/lib/connections/queries.ts:18-31`](https://github.com/Sefaria/Sefaria-Project/blob/reader-next/reader-next/src/lib/connections/queries.ts#L18-L31), [`src/lib/connections/related.ts:90-109`](https://github.com/Sefaria/Sefaria-Project/blob/reader-next/reader-next/src/lib/connections/related.ts#L90-L109)).

Measured on www.sefaria.org, 2026-10-18 (hit: served by Varnish; miss: built by the server):

| Request | Time | Size (gzip) |
|---|---|---|
| `/api/related/Genesis.1?with_sheet_links=1` | 0.9 s hit · 504 after 15.6 s miss | 12.4 MB (1.26 MB) |
| `/api/links/Genesis.1?with_text=0&with_sheet_links=1` | 11.3 s miss | 6.3 MB (0.62 MB) |
| `/api/related/Exodus.12?with_sheet_links=1` | 8.0 s miss | 9.6 MB |
| `/api/related/Berakhot.2a` | 0.16 s hit · 2.1 s miss | 426 KB (50 KB) |
| `/api/related/Shulchan_Arukh,_Orach_Chayim.1` | 0.16 s hit · 1.2 s miss | 425 KB (46 KB) |
| `/api/link-summary/Genesis.1` | 3.0 s (not cached) | 76 KB |
| Counts per segment, Genesis 1 · Berakhot 2a (computed) | — | ~1 KB · 120 B gzip; by category and book 25 KB · 2.3 KB |

In `/api/related`, links are 51–60% of the bytes and sheets 34–48%; topics, media and manuscripts are 6% or less. Book fields
repeated on each link are about 36% of the link bytes (Genesis 1: 11,020 links from 761 books).

## Target architecture

Implications of ideas, not decisions.

- A stored per-section counts document: for each segment, links by category and book, and counts of sheets, topics,
  manuscripts, media and guides. Updated where Varnish is already cleared on link save ([`sefaria/system/varnish/wrapper.py:17-58`](https://github.com/Sefaria/Sefaria-Project/blob/master/sefaria/system/varnish/wrapper.py#L17-L58)),
  and nightly or on publish for sheets. Served inside the text response the reader already fetches per section, or from a small
  counts endpoint. A cache miss then no longer means formatting every link. — *idea* · [Slack](https://sefaria.slack.com/archives/C0C9EGTL468/p1792322132117529) · [Slack](https://sefaria.slack.com/archives/C0C9EGTL468/p1792322798155629?thread_ts=1792322132.117529&cid=C0C9EGTL468)
- Sheets as counts per segment instead of rows, since both readers only show a count. — *idea* · [Slack](https://sefaria.slack.com/archives/C0C9EGTL468/p1792322798155629?thread_ts=1792322132.117529&cid=C0C9EGTL468)
- Leaner link rows: book fields sent once in a books map, `ref` dropped, `anchorRefExpanded` only for ranged anchors. — *idea* · [Slack](https://sefaria.slack.com/archives/C0C9EGTL468/p1792322798155629?thread_ts=1792322132.117529&cid=C0C9EGTL468)
- The category filter applied in the Mongo query, so a request for one commentary does proportionally less work. — *idea* · [Slack](https://sefaria.slack.com/archives/C0C9EGTL468/p1792322798155629?thread_ts=1792322132.117529&cid=C0C9EGTL468)
- An `include=` parameter on `/api/related` (e.g. `include=topics,manuscripts`), so each sidebar view asks only for its part and
  `reader-next` stops downloading links twice. — *idea* · [Slack](https://sefaria.slack.com/archives/C0C9EGTL468/p1792322798155629?thread_ts=1792322132.117529&cid=C0C9EGTL468)

## Dependencies on other areas

- [Connections](../connections/architecture.md): which data each sidebar state and the dots need.
- [Text display](../text-display/architecture.md): if counts ride with the text, the text response and the per-section data
  loading of the settings proposal change.

## Risks and open questions

- Publishing a sheet does not clear `/api/related` from Varnish (there is no `invalidate_ref` call in `sourcesheets/`), so sheets
  in a cached response can be a day old; stored sheet counts need their own update path.
- `get_media_for_ref` builds every result from the last `media` of the earlier loop ([`sefaria/model/media.py:68-69`](https://github.com/Sefaria/Sefaria-Project/blob/master/sefaria/model/media.py#L68-L69)), so a
  section with clips from several media records may show the wrong one.
- Topics are sorted by `request.interfaceLang` ([`reader/views.py:2656`](https://github.com/Sefaria/Sefaria-Project/blob/master/reader/views.py#L2656)), but Varnish strips cookies and Accept-Language for
  `/api/related` and keeps one copy for everyone ([`varnish-config.yaml:79`](https://github.com/Sefaria/Sefaria-Project/blob/master/helm-chart/sefaria/templates/configmap/varnish-config.yaml#L79)).

## Decisions

_None yet. Every decision is also logged in `../DECISIONS.md`._

<!-- BASELINE:START (generated by docs/reader-future/tools/seed.py — do not edit by hand) -->

## Baseline: the two clients today

### Legacy client (`master`)

Where the atlas found this area's behaviour (files cited by its features, most-cited first):

- [`sefaria/urls_shared.py`](https://github.com/Sefaria/Sefaria-Project/blob/master/sefaria/urls_shared.py) (12)
- [`sefaria/views.py`](https://github.com/Sefaria/Sefaria-Project/blob/master/sefaria/views.py) (5)
- [`api/views.py`](https://github.com/Sefaria/Sefaria-Project/blob/master/api/views.py) (3)
- [`reader/views.py`](https://github.com/Sefaria/Sefaria-Project/blob/master/reader/views.py) (1)
- [`api/api_warnings.py`](https://github.com/Sefaria/Sefaria-Project/blob/master/api/api_warnings.py) (1)
- [`sefaria/urls_name.py`](https://github.com/Sefaria/Sefaria-Project/blob/master/sefaria/urls_name.py) (1)
- [`sourcesheets/views.py`](https://github.com/Sefaria/Sefaria-Project/blob/master/sourcesheets/views.py) (1)
- [`docs/openAPI.json`](https://github.com/Sefaria/Sefaria-Project/blob/master/docs/openAPI.json) (1)
- [`static/llms.txt`](https://github.com/Sefaria/Sefaria-Project/blob/master/static/llms.txt) (1)
- [`sefaria/export.py`](https://github.com/Sefaria/Sefaria-Project/blob/master/sefaria/export.py) (1)

Long-form audit write-up: `reader-next/docs/features/inv_08b_admin_linker_apps.md`, `reader-next/docs/features/inv_01_urls_routing.md`.

### New client (`reader-next`, folder `reader-next/`)

Rebuild status of this area's features: not started 17.

### Gaps: core and standard features not done (17)

| ID | Tier | Feature | Rebuild status |
|---|---|---|---|
| API-001 | core | Endpoints the client calls (index) | not started |
| API-002 | core | Texts API v3 (/api/v3/texts) | not started |
| API-005 | core | Index, shape, counts and terms API | not started |
| API-007 | core | Links, related and connections API | not started |
| API-013 | core | Linker and find-refs API | not started |
| API-003 | standard | Legacy texts API and related text endpoints | not started |
| API-004 | standard | Ref validation and navigation API | not started |
| API-006 | standard | Version admin and editing APIs | not started |
| API-008 | standard | Search endpoints | not started |
| API-009 | standard | Calendars API | not started |
| API-010 | standard | Topics API | not started |
| API-011 | standard | Sheets and collections API | not started |
| API-012 | standard | Users, profile and social API | not started |
| API-014 | standard | Miscellaneous public endpoints | not started |
| API-015 | standard | OpenAPI docs and llms.txt | not started |
| API-016 | standard | Single version download | not started |
| API-017 | standard | Full data export (cron and on demand) | not started |

_Generated 2026-10-14 from the atlas and `rebuild-status.json`. Architecture of each client as a whole: `reader-next/docs/ARCHITECTURE.md`._

<!-- BASELINE:END -->
