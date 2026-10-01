# Library Next — status

Kept in sync with what shipped on `mf3`. One row per agent; details in each agent's doc.

| Wave | Agent | State | Notes |
|---|---|---|---|
| 1 | foundation | shipped | Seam, template, bundle, router, i18n, store, persona, shell, onboarding, dock slot, harness, smoke, jest, FOUNDATION.md, DEV.md |
| 1 | assistant | — | ai-chatbot `persona` attribute; then `AssistantBody` in `AssistantDock.jsx` |
| 2 | browse | — | `/`, `/texts`, `/texts/*`, book page, `/calendars` (placeholders today) |
| 2 | reader | — | `ref` route + tool contract (placeholder today; `placeholders.matchRef` is the stand-in) |
| 2 | discover | — | `/search`, `/topics`, `/topics/*` (placeholders today) |
| 2 | my-library | shipped | `/my/*` hub (9 sections + lesson editor/handout/shared), collection schemas + factories (`my/collections.js`, `COLLECTIONS.md`), export/import, simulated sync |
| 3 | learn-tools | — | |
| 3 | teach-research-tools | — | |
| 3 | qa | — | |

## Foundation — verified

- `PYTHONPATH=. pytest --noconftest reader/tests/library_next_test.py` — 16 passed.
- `npx jest static/js/library-next` — 7 suites, 38 tests; full `npx jest` — 36 suites, 464 tests.
- `npm run build-library-next` — compiles; `npm run build-client` still compiles.
- Harness: `/api/texts/Genesis.1?context=0` returns JSON through the CONNECT tunnel; `/` is the shell;
  `?lang=he` → `dir="rtl"`; `/data.js` proxied and cached.
- `npm run library-next-smoke` — `/`, `/Genesis.1`, `/texts`, `/texts?lang=he` render in headless
  Chromium with no console errors; onboarding opens; persona chip updates.

## Open issues for the next wave

- The real `ref` matcher belongs to the reader agent; the placeholder (`placeholders.matchRef`) claims
  any single-segment path not in `NOT_A_REF`, so an unlisted classic page under `/<something>` shows
  "Page not found"-style placeholder instead of falling through to the server. Extend `NOT_A_REF` or
  replace the matcher.
- `library_next_props` does one `UserProfile` lookup for logged-in users (slug, name, assistant
  setting). Anonymous requests do no Mongo queries beyond `library.get_last_cached_time()`.
- Hebrew interface title/description in `LIBRARY_NEXT_PAGE_META` go through Django `_()`; the
  SPA sets `document.title` on load so the server title only matters for crawlers (pages are `noindex`).
- The Django side could not be executed here (no Django/Mongo in the sandbox): `reader/views.py`
  changes are syntax-checked and mirror `ng-mobile`'s plumbing, but the first run on the cauldron
  should load `/`, `/texts`, `/Genesis.1`, `/topics`, `/search`, `/my` and `?library=classic`.
- `/my/notes` keeps its classic redirect (`^my(?!/notes)` in `urls_library.py`); the hub owns every
  other `/my/*` path.
- Search autocomplete in the header is not wired (plain submit to `/search?q=`); the discover agent
  may add `Sefaria.getName()` suggestions to `SearchBox` in `Shell.jsx` (one component, shared).

## My Library (`/my/*`) — shipped

Code: `static/js/library-next/my/`. Schemas and factories: `my/collections.js`, documented in `COLLECTIONS.md`.
One route (`my`, `/my/*`); `MyHub` dispatches on `params.rest`. Nav order follows the persona (learner: plans,
flashcards first; educator: lessons; scholar: notebook; newcomer: shelf, history); every section is reachable
for every persona. Jest: 8 suites / 70 tests under `my/tests` (factories + migration, plan scheduling, SM-2,
share-hash round trip, question templates, exports, nav, every page in EN + HE). Verified in headless Chromium
through the harness in `en` and `he` (no console errors, `dir` correct, no raw string keys).

| Section | Real | Simulated / faked | Known gaps |
|---|---|---|---|
| `/my` overview | continue reading (history), streak with 12-week heatmap, counts, persona quick actions, newcomer "start here" progress | — | start-here path is a fixed list of 5 refs |
| `/my/shelf` | tags, filters (kind, tag, text), add by reference, inline tag editing | — | "Save" buttons in reader/browse are wave-2/3 work (`saveToShelf`) |
| `/my/history` | grouped by day, pause toggle (`kv.historyPaused`, honoured by `addHistory`), clear with confirm | — | the reader writes history via `addHistory`; nothing is recorded until it does |
| `/my/notes` | notes + highlights grouped by book, search, inline edit, Markdown export | — | reader selection → note/highlight is a wave-3 tool |
| `/my/plans` | book lookup (`getIndexDetails`), title suggestions (`getName`), today's calendars as starting points, daily chunking computed client side (chapters/dafim), progress, today's unit opens the reader, catch-up | daily reminder toggle (badge) | complex (multi-node) texts are refused with a message; calendar plans follow the book from today's ref, not the calendar's future dates |
| `/my/flashcards` | add cards, review session with SM-2 lite (again/hard/good/easy, interval preview), due counts | — | "create from selection" is a wave-3 reader tool (`addFlashcard`) |
| `/my/lessons` | list, create, title/sources (text fetched with `Sefaria.getText`, bilingual preview, reorder, teacher note), questions (templates by category + custom), handout notes, handout view with print stylesheet, share link = whole lesson LZW-compressed in the URL hash (`/my/lessons/shared#…`, truly offline), "save a copy" | class code (stable 6 chars, badge); question templates are labelled "from templates" | "Ask the Assistant" dispatches `library-next:assistant` and opens the dock; the dock must consume `detail.prompt` |
| `/my/notebook` | lookup with available versions (from the text API), versions compared, auto citation, BibTeX / CSV / JSON export | — | citation style is a single URL style |
| `/my/data` | storage table (collection, items, size, last updated, key), JSON export, import with per-collection merge preview (merge / replace), clear | "Sync to account" (progress + timestamp, badge) | — |

Foundation changes made by this agent: `static/js/library-next/tests/Shell.test.jsx` — the `/my/notes`
expectation now reads the real page title; `sefaria/urls_library.py` — the hub URL no longer excludes
`/my/notes` (the SPA renders it). Nothing else outside `my/` and the docs.

Hand-offs: reader → `addHistory(ref, title, { heTitle })` on every ref shown (it also marks the streak);
learner tools → `addNote`, `addHighlight`, `addFlashcard`; browse → `saveToShelf`, `addToPlan`; educator
tools → `addSourceToLesson`, `addQuestion`; scholar tools → `addNotebookEntry`; assistant dock → listen for
`library-next:assistant` (`detail.prompt`, `detail.source`).
