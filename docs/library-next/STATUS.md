# Library Next — status

Kept in sync with what shipped on `mf3`. One row per agent; details in each agent's doc.

| Wave | Agent | State | Notes |
|---|---|---|---|
| 1 | foundation | shipped | Seam, template, bundle, router, i18n, store, persona, shell, onboarding, dock slot, harness, smoke, jest, FOUNDATION.md, DEV.md |
| 1–2 | assistant | shipped | ai-chatbot `mf3`: `persona`, starter prompts, prompt guidance, `mode="panel"`, `initial-prompt` (no PR → no preview; cauldron uses chat-dev). Dock: greeting, starter prompts, embedded widget, sign-in fallback, `library-next:assistant` event, header action. See ASSISTANT.md |
| 2 | browse | shipped | `/`, `/texts`, `/texts/*`, book page (`book` route, book-level refs only), `/calendars`; `browse/refKind.js` for the reader |
| 2 | reader | — | `ref` route + tool contract (placeholder today; `placeholders.matchRef` is the stand-in) |
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

## Assistant dock — verified

- `npx jest static/js/library-next` — 8 suites, 44 tests (6 new in `AssistantDock.test.jsx`).
- `npm run build-library-next` compiles; `npm run library-next-smoke` — 4 pages ok.
- Not exercised here: a real chat round-trip (needs a user token for chat-dev); the harness takes
  `CHATBOT_USER_TOKEN` for that.

## Browse — what shipped

Routes (all in `static/js/library-next/browse/routes.js`): `home` (`/`), `texts` (`/texts`), `texts-category`
(`/texts/*`), `calendars` (`/calendars`) and `book`, whose `match` is `matchBook()` from `browse/refKind.js` and
claims only book-level paths (`/Genesis`, `/Rashi_on_Genesis`, `/Pesach_Haggadah`; title variants included).
`refKind(pathname)` → `'book' | 'ref' | null` and `parseRefPath()` are pure and synchronous (TOC caches only), so the
reader's `ref` catch-all can import them.

**Real**

- Home is built from `PERSONAS[id].homeModules` (`browse/homeModules.jsx`, `HOME_MODULES` map + `moduleOrder()`):
  `continueReading` (history), `startHere` (six-step path, completion in `kv.startHere.done`), `parashaExplained` /
  `parashaForClass` (live `/api/calendars`, description, haftarah, educator "Add to lesson"), `glossary` (12 terms
  EN/HE, searchable), `fiveMinuteReads`, `calendarToday`, `plans` (+ streak from `streak`), `recommendations`
  (sibling books of what was read, "based on your reading"; curated starters when there is no history), `topics`,
  `lessons`, `buildLesson` → `/my/lessons/new`, `sourceCollections` (shelf items grouped by tag), `notebook`,
  `recentRefs`, `comparisons` (notebook entries with ≥2 versions), `advancedSearch` (passes `exact`/`era` to
  `/search`), and `explore` (category tiles) appended for every persona. `continueReading` is prepended when there is
  history and the persona did not list it.
- `/texts`: top-level TOC with category colors; newcomer gets short descriptions and "where to start" picks
  (`curated.WHERE_TO_START`), scholar/educator get book + section counts.
- `/texts/<cats>`: breadcrumbs, description (short for newcomer, full otherwise), subcategories, books; learner "Add
  to plan", educator "Add to lesson" + Print; links go to the book page.
- Book page: `Sefaria.getIndexDetails` → about (description, authors → `/topics/<slug>`, composed/published strings,
  era, base texts, related topics), contents as structure tabs (default JaggedArray grid with Talmud/Folio/numeral
  labels, alt structures such as Parasha/Chapters, schema tree for complex books), versions via `Sefaria.getVersions`
  (section for scholars, collapsed `<details>` otherwise), Start reading / Continue where you left off (`history`),
  Save to shelf, Add to plan (learner), Add to lesson + Print (educator). Section links use the reader URL (`/Genesis.1`).
- `/calendars`: every item from `/api/calendars` (`Sefaria.updateCalendars`), EN/HE titles, newcomer explainers,
  open in reader (classic link for collection URLs), "Follow this schedule" → one `plans` entry per schedule
  (`{ title, titleHe, calendar, reminder, items }`), educator "Add to lesson".
- Collections written: `history` (read), `shelf` (`ref, title, tags`), `plans` (`title, items[], calendar?, reminder?`),
  `lessons` (`title, sources[], questions[], handoutNotes`), `notebook` and `streak` (read only).

**Simulated** (labelled with `.ln-badge-simulated`): the daily reminder toggle on a followed schedule. Recommendations
are heuristics over local history (labelled "based on your reading"). Lesson/plan targets are "the newest one"
(or a new untitled one) until my-library ships pickers.

**Verified**: `npx jest static/js/library-next` (11 suites, 72 tests), `npm run build-library-next`,
`npm run library-next-smoke`; every page screenshotted in headless Chromium in EN (ltr) and HE (rtl) for all four
personas with no console errors.

**Known gaps / handoffs**

- Smoke test heading for `/` is now the newcomer home title ("Welcome to the Library"); Shell test's two placeholder
  assertions for `/texts` were updated to the real page.
- Version counts on `/texts` (scholar) are not shown: not cheap without one API call per book.
- Hebrew labels for alt-structure names come from `Sefaria.hebrewTerm()`; terms missing from `data.js` show English.
- `/my/plans`, `/my/lessons/new`, `/my/shelf?tag=` and `/topics/<slug>` links assume the my-library and discover routes.
- The reader should import `refKind`/`matchBook` so `/Genesis` never reaches its catch-all once both are merged
  (today registration order already makes `book` win).

## Open issues for the next wave

- The cauldron serves the chat-dev widget, which has no `mode="panel"`: the dock shows prompts and a
  "simulated" badge while the chat floats in the page corner. An ai-chatbot PR from `mf3` plus
  `?chatbot_version=<PR#>` gives the inline, persona-aware chat.

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
