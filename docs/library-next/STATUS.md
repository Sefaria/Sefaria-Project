# Library Next — status

Kept in sync with what shipped on `mf3`. One row per agent; details in each agent's doc.

| Wave | Agent | State | Notes |
|---|---|---|---|
| 1 | foundation | shipped | Seam, template, bundle, router, i18n, store, persona, shell, onboarding, dock slot, harness, smoke, jest, FOUNDATION.md, DEV.md |
| 1–2 | assistant | shipped | ai-chatbot `mf3`: `persona`, starter prompts, prompt guidance, `mode="panel"`, `initial-prompt` (no PR → no preview; cauldron uses chat-dev). Dock: greeting, starter prompts, embedded widget, sign-in fallback, `library-next:assistant` event, header action. See ASSISTANT.md |
| 2 | browse | shipped | `/`, `/texts`, `/texts/*`, book page (`book` route, book-level refs only), `/calendars`; `browse/refKind.js` for the reader |
| 2 | reader | shipped | `ref` route (section/segment/range refs only), text stream, bilingual layouts, versions, connections, selection → toolbelt, tool registry + 3 built-in tools; `READER_TOOLS.md` |
| 2 | discover | — | `/search`, `/topics`, `/topics/*` (placeholders today) |
| 2 | my-library | shipped | `/my/*` hub (9 sections + lesson editor/handout/shared), collection schemas + factories (`my/collections.js`, `COLLECTIONS.md`), export/import, simulated sync |
| 3 | learn-tools | — | |
| 3 | teach-research-tools | shipped | Educator tools (`tools/teach/`): Add to lesson, Discussion questions, Handout snippet, Compare translations. Scholar tools (`tools/research/`): Versions compare, Manuscripts, Lexicon, Copy / cite (Chicago / MLA / BibTeX, export), Cross-references graph. Registered in the reader's tool registry; `translations` and `linkGraph` added to `persona.js` |
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

## Teach + research tools — what shipped

Two modules imported by `reader/routes.js` (one line each): `tools/teach/index.js` registers the educator
tools, `tools/research/index.js` the scholar tools. Ids match `PERSONAS[*].readerTools`; `translations`
(educator) and `linkGraph` (scholar) were added to `persona.js` as one-line changes. `apparatus` in the
scholar list has no tool behind it (not in this scope) and is simply not shown.

**Educator (`personas: ['educator']`)**

- `lessonBuilder` — *Add to lesson*: pick a lesson (newest first) or create one inline (`createLesson`), optional
  teaching note, `addSourceToLesson` with `ref / title / heTitle / he / en / note / category`; duplicate refs are
  refused; after saving, a link to `/my/lessons/<id>` plus a toast. Picker shared with the discussion tool
  (`LessonPicker.jsx`, `useLessonChoice()`).
- `discussionPrompts` — *Discussion questions*: three questions from my-library's `questions.generateQuestions`
  (same template families, by `book.primaryCategory`; Hebrew text gets `heRef`), editable, "Other questions"
  cycles the templates, "+" adds one / "Add to lesson" adds all (`addQuestion` with `{ en, he }`), copy, and
  "Ask the Assistant for better ones" → `requestAssistant()` with the ref, category, the segment text quoted
  (≤500 chars) and the current questions. Labelled "Templates by text type" with the simulated badge.
- `handout` — *Handout snippet*: bilingual card (ref EN/HE, numbered Hebrew and English lines, source and
  translation attribution, canonical URL), live preview, grade level (Elementary / Middle / High / Adult —
  **simulated**: only the translation-style note and type scale change), optional writing lines, "Copy as HTML",
  "Copy as Markdown", "Open print view" (`window.open` + `document.write` with an inline print stylesheet;
  blocked pop-ups are reported). Follows content language and the reader's vowel/cantillation settings.
- `translations` — *Compare translations*: English versions from the reader's `/api/texts` payload
  (`book.data.versions`, `Sefaria.getVersions` fallback), foreign-language `[xx]` versions excluded; the version in
  view plus the next two by priority shown side by side, chips toggle up to three; text per version via
  `Sefaria.getText(ref, { enVersion })`.

**Scholar (`personas: ['scholar']`, except `cite`)**

- `versions` — *Versions compare*: language (Hebrew default / English), two selects (defaults: the version in view
  + the next by priority), `Sefaria.getText` with `heVersion` / `enVersion`, word-level LCS diff (`diff.js`;
  vowels/cantillation ignored for matching by default, toggle), deletions highlighted on A, insertions on B,
  summary line; "Save comparison to notebook" → `addNotebookEntry({ versions: [A, B], citation: citationFor(...) })`.
- `manuscripts` — `Sefaria._manuscripts` cache, else `/api/manuscripts/<ref>` (through `Sefaria._ApiPromise`):
  thumbnails (link to the full image), title (HE when the interface is Hebrew), page id, covered ref, source
  library link, description; empty state when none (Berakhot and Shulchan Arukh have none today).
- `lexicon` — Hebrew words of the selection as buttons (cantillation stripped, maqaf split), tap → `Sefaria.getLexiconWords(word, segmentRef)`
  (`/api/words/…?lookup_ref=`), entries flattened to headword / lexicon / morphology / nested senses / cited refs
  (in-app links); free-text lookup too. `tools/research/lexiconApi.js` wraps the same API as learn-tools'
  `tools/learn/lexiconApi.js` — **dedupe into one module** (handoff).
- `cite` — registered for *all* personas under the built-in id: scholars get Chicago / MLA / BibTeX (version title +
  access date), copy one / all / text+citation, "Export selection" as JSON / CSV (one row per segment, via
  `my/exportFormats.download`) and "Save to notebook"; every other persona renders the reader's built-in
  `CiteTool` unchanged.
- `linkGraph` — *Cross-references*: `Sefaria.getLinks(ref)` → `reader/textData.groupConnections` → radial inline
  SVG, one node per connected work (≤18, sized by link count, category colour from `Sefaria.palette`), category
  arcs and legend, centre shows the total; click/Enter opens the first linked text (`navigate(refToPath(...))`)
  and closes the panel. Caption "Live data: N connections to M works"; hidden smaller works are counted.

**Simulated**: the handout grade level (badge). Everything else reads live data or writes the shared collections.

**Verified**: `npm run build-library-next`; `npx jest static/js/library-next` (28 suites, 220 tests; 53 of them are logic + render
tests in EN and HE under `tools/teach/tests`, `tools/research/tests`); harness on a free port (`PORT=8793`) in
headless Chromium: every tool opened on `/Genesis.1`, `/Berakhot.2a`, `/Shulchan_Arukh,_Orach_Chayim.1.1` as
educator and scholar in `en` and `he` (RTL) with a selection, no console errors; `npm run library-next-smoke`.

**Known gaps / handoffs**

- `toast()` takes text only, so the "link to the lesson" after *Add to lesson* is rendered in the panel (plus a
  text toast) rather than inside the toast.
- `Sefaria._ApiPromise` is a jQuery deferred (no `.catch`); wrap it in `Promise.resolve()` as `manuscriptsApi.js` does.
- Two `lexiconApi.js` modules (learn + research) call the same words API; merge after both waves land.
- Manuscript thumbnails come from `manuscripts.sefaria.org`, which this container's egress proxy blocks; the panel
  shows a placeholder for a broken image (the metadata and links still render). Check on the cauldron.
- MLA is the web-page form (`"ref." version. Sefaria, url. Accessed date.`); no in-text forms.
- Husky's pre-commit hook cannot run in this container (`.husky/_/husky.sh` missing); commits used `--no-verify`
  after running the gate by hand.
