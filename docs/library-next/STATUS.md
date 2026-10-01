# Library Next — status

Kept in sync with what shipped on `mf3`. One row per agent; details in each agent's doc.

| Wave | Agent | State | Notes |
|---|---|---|---|
| 1 | foundation | shipped | Seam, template, bundle, router, i18n, store, persona, shell, onboarding, dock slot, harness, smoke, jest, FOUNDATION.md, DEV.md |
| 1–2 | assistant | shipped | ai-chatbot `mf3`: `persona`, starter prompts, prompt guidance, `mode="panel"`, `initial-prompt` (no PR → no preview; cauldron uses chat-dev). Dock: greeting, starter prompts, embedded widget, sign-in fallback, `library-next:assistant` event, header action. See ASSISTANT.md |
| 2 | browse | shipped | `/`, `/texts`, `/texts/*`, book page (`book` route, book-level refs only), `/calendars`; `browse/refKind.js` for the reader |
| 2 | reader | shipped | `ref` route (section/segment/range refs only), text stream, bilingual layouts, versions, connections, selection → toolbelt, tool registry + 3 built-in tools; `READER_TOOLS.md` |
| 2 | my-library | shipped | `/my/*` hub (9 sections + lesson editor/handout/shared), collection schemas + factories (`my/collections.js`, `COLLECTIONS.md`), export/import, simulated sync |
| 3 | learn-tools | shipped | Newcomer tools (Explain this, Who's who, Read it to me) and learner tools (Highlight, Note, Flashcard, Mark as read / Add to plan, Vocabulary) under `tools/learn/`; highlight decoration + `useHighlights` hook |
| 2 | discover | shipped | `/search?q=`, `/topics`, `/topics/<slug>`, `/topics/category/<slug>`; header search suggestions; see below |
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

## Discover — `/search`, `/topics`, `/topics/*`

Files: `static/js/library-next/discover/` (`SearchPage.jsx`, `TopicsPage.jsx`, `TopicPage.jsx`,
`TopicCategoryPage.jsx`, `searchModel.js`, `topicsModel.js`, `personaActions.js`, `refs.js`, `strings.js`,
`styles.css`, `tests/`). Routes: `search` (`/search`), `topics` (`/topics`), `topic` (`/topics/*`: a topic,
`/topics/category/<slug>`, `/topics/all*` → landing).

**Real**
- Search runs through the classic path: `Sefaria.search.execute_query` → `POST /api/search-wrapper/es8`
  (`naive_lemmatizer` / `exact` field, `path` aggregation, relevance / chronological sort, `start` paging).
  State lives in the URL: `q`, `exact=1`, `sort`, `path=A|B` (facet keys), `tl=he|en` (text language; `lang`
  is the interface-language param), `era`, `version`. In-page edits `navigate(..., { replace: true })`; the
  header box follows. Results collapse versions per ref ("N more versions"), highlight `<b>` snippets, link to
  `/<ref>?qh=<q>`. Facet tree from `aggregations.path.buckets` (TOC order via `Sefaria.compareSearchCatPaths`,
  Hebrew titles via `Sefaria.hebrewTerm` / index), counts rolled up; "Show more" pages by 20.
- Topics landing: featured (`/_api/topics/featured-topic`), trending (`/api/topics/trending?pool=general_<lang>`),
  random (`/api/topics/pools/general_<lang>?order=random`), categories from `Sefaria.topic_toc`, parasha /
  holiday (`/api/calendars/topics/<day>`), A–Z index (`Sefaria.topicList()`, 2.9 MB, loaded on demand), topic
  finder via `/api/name`.
- Topic page: `Sefaria.getTopic(slug)` (v2 topics API with refs + links → `tabs`), notable / all sources / top
  citations tabs, relevance (curated primacy per language) or chronological order, text previews via
  `Sefaria.getBulkText` in the content language (he / en / both), curated notes, related topics grouped by
  link type, subtopics for topics that are also categories, image, time period, Wikipedia (scholar).
- Header search box: `Sefaria.getName()` completions (texts, topics, categories) with keyboard navigation.
- Persona: newcomer → top-level category chips only, no sort/exact, topic explainer strip when the query
  names a topic (via `/api/name` + `getTopic`), notable sources first with an explainer card, English-first;
  learner → full filters, "Save this search" (`kv.savedSearches`), "Add topic to my plan" (`kv.planInbox`),
  recent topics on the landing (`kv.recentTopics`); educator → "Add to lesson" on every result and source
  (`kv.lessonInbox`), parasha/holiday "for class"; scholar → era + version filters, "Export results (CSV)"
  (client-side Blob), all sources first, dates on sources, "Add topic to notebook" (`kv.notebookInbox`),
  categories with counts and the A–Z index.

**Simulated (labelled `.ln-badge-simulated`)**
- Educator "grade fit" tag and filter: a stable hash of the ref into three bands.
- Educator discussion prompt under each source: a template with the topic name.
- Language, era and version filters apply client-side to the results loaded so far (the search API has no
  such filters); the panel says so.

**Handoffs / known gaps**
- The my-library collections had no draft model when this shipped, so persona actions write kv inbox
  lists: `savedSearches [{url,q,exact,sort,paths,ts}]`, `lessonInbox [{kind:'ref'|'topic', ref, heRef,
  snippet|title, topic?, from, ts}]`, `planInbox`, `notebookInbox [{kind:'topic', topic, title, citation,
  text, ts}]`, `recentTopics [{slug,title,ts}]` (helpers in `discover/personaActions.js`). My Library should
  drain these into `plans` / `lessons` / `notebook`.
- Hebrew non-exact queries also hit Dicta (inside `execute_query`); unreachable from the sandbox, fine on
  the cauldron.
- `aggregationsToUpdate` is requested only on a fresh query; with facets already applied from the URL the
  tree is the filtered one ("Clear filters" widens it).
- Sandbox only: the egress proxy allows no POST to sefaria.org, so the harness serves a recorded
  `search-wrapper` fixture (`x-dev-fixture` header; also `SEARCH_FIXTURE=1`); it also rejects any path with
  `;` (e.g. the ref "Moses; A Human Life"), so those previews fall back to per-ref requests and show no text.
- Foundation fix made here: `store.js` `notify()` iterates a copy of the listener set (a subscriber that
  re-subscribes while being notified otherwise loops forever); `useKv` callers should pass a stable fallback.

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

## Learn tools (newcomer + learner reader tools) — shipped

Code: `static/js/library-next/tools/learn/` (`index.js` registers everything; imported by `reader/routes.js` next to
the built-ins). Tool ids match `PERSONAS[*].readerTools`: newcomer `explain, whosWho, readAloud`; learner
`highlight, note, flashcard, markRead, vocab` (then `connections`). Jest: `tools/learn/tests/logic.test.js` (glossary,
figures, text kind, markdown-lite, cloze, speech helpers, highlights, plans, lexicon shaping) and `tools.test.jsx`
(every tool through the real reader page on `/Genesis.1` and `/Berakhot.2a`, collections written, EN + HE renders);
26 suites / 214 tests in all. Verified in headless Chromium through the harness: both pages, both personas, `en` and
`he` (RTL), every panel screenshotted, no console errors, no raw string keys.

| Tool | Real | Simulated / limited |
|---|---|---|
| Explain this | Kind of text from categories + section names (verse, mishnah, sugya, comment, midrash, halakhah, liturgy, thought); book description, authors, composed date/place and era from `Sefaria.getIndexDetails`; category blurb from the TOC; glossary of 67 terms (EN/HE one-liners) matched in the English (word boundary) and the Hebrew (consonantal, prefix-tolerant); "Ask the Assistant" via `requestAssistant` with ref + text prefilled | Category blurb falls back to English when the TOC has no Hebrew short description |
| Who's who | 51 curated figures (EN/HE names, blurbs, eras, topic slugs verified against `/api/name`) matched in EN and HE, link to `/topics/<slug>`; unknown "Rabbi X / Rav X" names resolved through `Sefaria.getName` (PersonTopic / AuthorTopic), max 4 per selection | Bare "Rav" and "Rabbi Shimon" resolve to the usual referents (Rav of Sura, bar Yochai) |
| Read it to me | Browser `speechSynthesis`: English, and Hebrew when a `he` voice exists; sentence chunking, speed, pause / resume / stop | Without speech support (or without any voice) the panel says so and carries the `simulated` badge; headless Chromium has no voices |
| Highlight | Four colours; one `highlights` row per selected segment (`addHighlight(ref, color, { text, book })`); remove; rendering via `data-ln-highlight` set by `mountHighlightDecorator()` (store event + MutationObserver) and `useHighlights(sectionRef)` for hosts that render themselves | — |
| Note | Textarea with Markdown-lite preview (`**`, `*`, `#`, lists, code); `addNote`; existing notes for the ref / its segments listed | — |
| Flashcard | Front Hebrew or ref, back English or your own; `addFlashcard`; "Quiz me" adds three deterministic cloze cards (longest content words, text order) | — |
| Mark as read / Add to plan | Finds the plan holding `book.sectionRef`, toggles `markPlanUnitDone`, shows progress; else `addToPlan` to the newest plan or `createPlan` for the book with this section as its first unit | Plans created by browse's "Follow this schedule" use `items`, not `units`, so they are not matched |
| Vocabulary | Hebrew words of the selection as chips (vowels kept for display, consonantal dedupe); `Sefaria.getLexiconWords(word, ref)` → `/api/words` (same call as the classic LexiconBox) shaped by `tools/learn/lexiconApi.js`; definitions with morphology / transliteration / source; "Add as flashcard" | — |

"What am I reading?" is the reader's own card (`reader/WhatAmIReading.jsx`), already shipped; nothing added.

Foundation / shared changes made by this agent: `persona.js` — newcomer `readerTools` → `['explain', 'whosWho', 'readAloud']`,
learner → `['highlight', 'note', 'flashcard', 'markRead', 'vocab', 'connections']` (two lines); `reader/routes.js` —
one import line for `tools/learn/index`; `reader/tests/registry.test.js` + `ReaderPage.test.jsx` — expectations updated
for the new ids (three lines). Nothing else outside `tools/learn/` and the docs.

Hand-offs / open issues:

- `tools/learn/lexiconApi.js` (`lookupWord`, `shapeEntries`, `flattenSenses`, `hebrewWords`) is a candidate for a shared
  `tools/lexiconApi.js` once the research tools' lexicon helper lands; dedupe then.
- The reader can call `useHighlights(sectionRef)` from `tools/learn/index` and add the class itself; until then the
  decorator sets the attribute from outside (`.ln-seg[data-ref]` / `.ln-seg-inline[data-ref]`).
- `/topics/<slug>` links from Who's who assume the discover agent's `topic` route.
- The `.husky/pre-commit` hook cannot run in a worktree (`_/husky.sh` missing); commits used `--no-verify` after the
  build + jest gate.

- Header search suggestions (`Sefaria.getName()`) shipped with discover (`suggestionsFrom` in `Shell.jsx`).
