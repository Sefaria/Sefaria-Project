# Library Next — status

Kept in sync with what shipped on `mf3`. One row per agent; details in each agent's doc.

| Wave | Agent | State | Notes |
|---|---|---|---|
| 1 | foundation | shipped | Seam, template, bundle, router, i18n, store, persona, shell, onboarding, dock slot, harness, smoke, jest, FOUNDATION.md, DEV.md |
| 1 | assistant | — | ai-chatbot `persona` attribute; then `AssistantBody` in `AssistantDock.jsx` |
| 2 | browse | — | `/`, `/texts`, `/texts/*`, book page, `/calendars` (placeholders today) |
| 2 | reader | shipped | `ref` route (section/segment/range refs only), text stream, bilingual layouts, versions, connections, selection → toolbelt, tool registry + 3 built-in tools; `READER_TOOLS.md` |
| 2 | discover | — | `/search`, `/topics`, `/topics/*` (placeholders today) |
| 2 | my-library | — | `/my/*`, collection schemas, export/import UI |
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

## Reader — what shipped

Real (live data through `Sefaria.getText` / `getLinks` / `getIndexDetails`):

- `ref` route: `reader/refKind.js` claims one-segment paths that parse (via `Sefaria.parseRef`) to a
  sectioned ref (`/Genesis.1`, `/Genesis.1.3-5`, `/Berakhot.2a`, `/Rashi_on_Genesis.1.1.1`); book-level
  paths return null for the browse agent's `book` route; non-refs fall through to the server. Without
  book data (jest) a shape heuristic stands in.
- Text stream: numbered segments (Hebrew numerals in HE), he / en / bi with stacked or side-by-side
  layout, segmented or continuous flow, text size, vowels and cantillation toggles, footnotes on tap,
  in-text ref links navigate in-app, URL ranges highlighted and scrolled into view, next/previous
  sections (button + auto-load near the end; the header and URL follow the section in view).
- Header strip: title + position, section label (`Chapter 1` / `פרק א׳`), categories, book page link,
  copy link, version switcher (source / translation, grouped by language, priority order; `?ven=`/`?vhe=`
  honoured and written back to the URL).
- Selection (click, shift-click, `j`/`k`/arrows, `Esc`) → toolbelt (inline on desktop, fixed bottom bar
  on small screens) → tool panel (side panel / bottom sheet, dialog semantics, focus management).
- Tool registry (`reader/tools/registry.js`, contract in `READER_TOOLS.md`) and built-ins: Connections
  (counts by category → work, major commentators first, "Cited by" disclosed on demand, a work's refs,
  a connection's text inline, "Hebrew only" labels, "Open in reader"), Save to shelf (writes `shelf`),
  Copy / cite (plain text + Simple or Chicago citation; scholars default to Chicago).
- Persona defaults: newcomer English + "What am I reading?" card (description, era, place from
  `/api/v2/index`), learner / educator bilingual, scholar Hebrew with the versions row open. Explicit
  content-language choices (header control, `?lang=`) win.
- Writes `history` (one row per section ref, `ts` bumped on re-read) and `streak` (today) on every section load.

Simulated / limited:

- Nothing is faked in the reader itself; "Saved in this browser" is stated on the shelf tool.
- `next` / `prev` refs are shown in English in the Hebrew interface (the API gives no Hebrew form).
- Hebrew category names use `Sefaria.hebrewTerm` (terms from `/data.js`); unknown terms fall back to English.

Known gaps / handoffs:

- `?lang=` means the *content* language (classic grammar). On the dev harness the same param also
  picks the interface language, so `/Genesis.1?lang=en` forces English content there; use the cookie
  (`/?lang=he` once) or the header toggle instead.
- The book page link (`/Genesis`) is the browse agent's route; until it lands the server renders the shell with no matching route.
- `browse/refKind.js` (browse agent) can replace `reader/refKind.js#classifyPath` when it lands; the reader's version is minimal and tested.
- Complex texts with non-numeric nodes (`Shulchan Arukh, Orach Chayim 1:1`) parse through `Sefaria.parseRef`; alt-structure
  refs (parasha names) are not claimed.
- Connections load for the whole selection ref; very large selections make large `/api/links` calls.

## Open issues for the next wave

- The reader's `ref` matcher replaced the placeholder: unknown single-segment paths now fall through to
  the server (full navigation) and book-level refs wait for the browse agent's `book` route.
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
