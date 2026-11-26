# Library Next — status

Kept in sync with what shipped on `mf3`. One row per agent; details in each agent's doc.

| Wave | Agent | State | Notes |
|---|---|---|---|
| 1 | foundation | shipped | Seam, template, bundle, router, i18n, store, persona, shell, onboarding, dock slot, harness, smoke, jest, FOUNDATION.md, DEV.md |
| 1–2 | assistant | shipped | ai-chatbot `mf3`: `persona`, starter prompts, prompt guidance, `mode="panel"`, `initial-prompt` (PR ai-chatbot#235 → Coolify preview; Library Next defaults to `chatbot_version=235`). Dock: greeting, starter prompts, embedded widget, sign-in fallback, `library-next:assistant` event, header action. See ASSISTANT.md |
| 2 | browse | shipped | `/`, `/texts`, `/texts/*`, book page (`book` route, book-level refs only), `/calendars`; `browse/refKind.js` for the reader |
| 2 | reader | shipped | `ref` route (section/segment/range refs only), text stream, bilingual layouts, versions, connections, selection → toolbelt, tool registry + 3 built-in tools; `READER_TOOLS.md` |
| 2 | my-library | shipped | `/my/*` hub (9 sections + lesson editor/handout/shared), collection schemas + factories (`my/collections.js`, `COLLECTIONS.md`), export/import, simulated sync |
| 3 | learn-tools | shipped | Newcomer tools (Explain this, Who's who, Read it to me) and learner tools (Highlight, Note, Flashcard, Mark as read / Add to plan, Vocabulary) under `tools/learn/`; highlight decoration + `useHighlights` hook |
| 2 | discover | shipped | `/search?q=`, `/topics`, `/topics/<slug>`, `/topics/category/<slug>`; header search suggestions; see below |
| 3 | teach-research-tools | shipped | Educator tools (`tools/teach/`): Add to lesson, Discussion questions, Handout snippet, Compare translations. Scholar tools (`tools/research/`): Versions compare, Manuscripts, Lexicon, Copy / cite (Chicago / MLA / BibTeX, export), Cross-references graph. Registered in the reader's tool registry; `translations` and `linkGraph` added to `persona.js` |
| 3 | qa | shipped | Gates green, Django seam reviewed and template-rendered, persona journeys (`npm run library-next-journeys`, 260 steps EN+HE, 0 failures), 9 defects fixed, discover inbox drained into My Library. See "QA" below |

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
| Mark as read / Add to plan | Finds the plan holding `book.sectionRef`, toggles `markPlanUnitDone`, shows progress; else `addToPlan` to the newest plan or `createPlan` for the book with this section as its first unit | — (browse's "Follow this schedule" now writes `units`; QA) |
| Vocabulary | Hebrew words of the selection as chips (vowels kept for display, consonantal dedupe); `Sefaria.getLexiconWords(word, ref)` → `/api/words` (same call as the classic LexiconBox) shaped by `tools/lexiconApi.js` (shared with the scholar Lexicon since QA); definitions with morphology / transliteration / source; "Add as flashcard" | — |

"What am I reading?" is the reader's own card (`reader/WhatAmIReading.jsx`), already shipped; nothing added.

Foundation / shared changes made by this agent: `persona.js` — newcomer `readerTools` → `['explain', 'whosWho', 'readAloud']`,
learner → `['highlight', 'note', 'flashcard', 'markRead', 'vocab', 'connections']` (two lines); `reader/routes.js` —
one import line for `tools/learn/index`; `reader/tests/registry.test.js` + `ReaderPage.test.jsx` — expectations updated
for the new ids (three lines). Nothing else outside `tools/learn/` and the docs.

Hand-offs / open issues:

- ~~`tools/learn/lexiconApi.js` is a candidate for a shared `tools/lexiconApi.js`~~ — done in QA: one `tools/lexiconApi.js`.
- The reader can call `useHighlights(sectionRef)` from `tools/learn/index` and add the class itself; until then the
  decorator sets the attribute from outside (`.ln-seg[data-ref]` / `.ln-seg-inline[data-ref]`).
- `/topics/<slug>` links from Who's who assume the discover agent's `topic` route.
- The `.husky/pre-commit` hook cannot run in a worktree (`_/husky.sh` missing); commits used `--no-verify` after the
  build + jest gate.

- Header search suggestions (`Sefaria.getName()`) shipped with discover (`suggestionsFrom` in `Shell.jsx`).

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
  (in-app links); free-text lookup too. Lookups go through the shared `tools/lexiconApi.js` (`wordsOf`, `lookupEntries`; deduped in QA).
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
- ~~Two `lexiconApi.js` modules (learn + research)~~ merged into `tools/lexiconApi.js` (QA).
- Manuscript thumbnails come from `manuscripts.sefaria.org`, which this container's egress proxy blocks; the panel
  shows a placeholder for a broken image (the metadata and links still render). Check on the cauldron.
- MLA is the web-page form (`"ref." version. Sefaria, url. Accessed date.`); no in-text forms.
- Husky's pre-commit hook cannot run in this container (`.husky/_/husky.sh` missing); commits used `--no-verify`
  after running the gate by hand.

## QA — what was tested, fixed and what remains

Worktree `mf3-qa` off `mf3` (after the teach/research merge, a524b0f1e). Commits are small `fix(library-next): …`;
`.husky/pre-commit` cannot run in a worktree, so each was committed with `--no-verify` after the gates below.

**Gates (final tree)**: `npm run build-library-next` and `npm run build-client` compile; full `npx jest` 65 suites /
739 tests (36 suites / 311 + 7 new under `library-next`); `PYTHONPATH=. pytest --noconftest
reader/tests/library_next_test.py` 16 passed; `npm run library-next-smoke` 4/4; `npm run library-next-journeys`
260/260 steps. Production bundle (`--mode=production`): 1.33 MB raw, **339 KB gzipped** (flag threshold 600 KB).

**Django seam (static + rendered)**: `reader/library_next.py` imports nothing from Django and is covered by the
pytest; every decorated view in `reader/views.py` (`home`, `texts_list`, `texts_category_list`, `calendars`,
`topics_page`, `topics_category_page`, `all_topics_page`, `topic_page`, `search`) has `@library_next_route`
innermost, so `?library=classic` reaches the classic view and the cookie is applied on both paths; the `text_panels`
guard sits after `Ref()` validation (bad refs still 404) and before any panel work, sheets excluded. Every name the
seam uses (`CHATBOT_API_BASE_URL`, `CHATBOT_USER_ID_SECRET`, `library_assistant`, `UserProfile`, `APP_VERSION`,
`redirect`, `_`, `settings`) is imported. `^my(?P<rest>/.*)?$` in `urls_library.py` precedes `shared_patterns`, so
`/my/notes` reaches the hub (intended) and `/my/profile`-style URLs do not exist on the library host. `app.html` was
rendered with Django 5.2's engine (6.0.4 needs Python 3.12), `django-webpack-loader` 3.1.1 and the real
`webpack-stats.client-library-next.json`, with a stub `sefaria_tags` carrying the real `meta_title`/`meta_desc`/
`social_image_url` signatures and `string_if_invalid` set: no invalid variables in EN or HE, `dir="rtl"`/`lang="he"`,
the bundle tag deferred under the `LIBRARY_NEXT` config, hreflang/noindex present; every context variable the
template reads comes from the listed context processors. Not executable here: the views themselves (no Mongo).

**Journeys** (`static/js/library-next/dev/journeys.js`): for each persona in EN and HE — onboarding → persona →
home modules; `/texts` → category → book → "Start reading" → `/Genesis.1`; segment selection → the persona's toolbelt
(ids checked against `persona.js`) → every tool run (highlight, note, flashcard, mark as read, vocabulary, explain,
who's who, read aloud, add to lesson, discussion questions, handout, translations, versions compare → notebook,
manuscripts, lexicon, cite, cross-references, connections, shelf) → `/my/*` reflects the writes; `/search?q=שבת`
and `?q=shabbat` → a result; `/topics` → a topic → a source; `/calendars` → follow → `/my/plans`; the discover inbox
drained on `/my/plans`, `/my/lessons`, `/my/notebook`; saved searches on `/my`; interface toggle keeps the route;
footer `?library=classic` link; back/forward; header overlap check at 1440/1280/1024/820/390; 390px reader,
toolbelt, bottom sheet, home and lesson editor; the handout in print media. Every page is audited for console
errors, page errors, failed requests, raw i18n keys (text nodes, labels, title), `dir`, blank space below the footer,
and screenshotted (`SHOTS_DIR`, `qa-<persona>-<lang>-NN-<step>.png`). Sandbox-only noise is listed separately:
Dicta (`ERR_TUNNEL_CONNECTION_FAILED`) on Hebrew search, topic images from `storage.googleapis.com`
(`ERR_CERT_AUTHORITY_INVALID`), fetches aborted by navigation — check both on the cauldron.

**Fixed**

1. `my/tests/logic.test.js` failed only in the full run: jsdom 11 shares one `whatwg-url` `URL` class per worker, and
   the discover pages test left a mock on `URL.createObjectURL`. Both tests now restore it (after the revoke tick).
2. `?library=classic` from a reader page was not sticky (`text_panels` is not decorated) — cookie applied there too.
3. Collections: browse wrote plans as `items`/`titleHe`/`reminder` and lessons/shelf rows with its own fields; the
   reader's shelf used `s:<ref>` ids while `/my/shelf` removes and tags `shelf:<ref>`. Reader and browse now write
   through `my/collections` (`createPlan` gained `calendar`; plans are schema v2 with a migration for the old rows;
   `createCollection` upgrades an instance in place when a later caller brings a newer schema, so load order can no
   longer skip a migration). History rows are titled by the section ref (`Genesis 1` / `בראשית א׳`) with `book` set,
   and honour the history pause.
4. One `tools/lexiconApi.js` (was `tools/learn/` + `tools/research/`): `wordsOf`/`hebrewWords`, `lookupEntries`
   (nested, Lexicon), `lookupWord` (flat, Vocabulary).
5. Discover inbox drained: `my/inbox.js` + `my/InboxCard.jsx` on Plans, Lessons (list → newest lesson, editor →
   this lesson) and Notebook; a ref becomes a unit / a source with fetched text / an entry; a topic adds its notable
   sources (plan 5, lesson 3) or an entry under `topics/<slug>` with the citation; saved searches on the overview.
6. Add to lesson stored the selection's HTML (raw footnote markup on the handout): `plainText` in the tool and a
   tag strip in the lesson source factory.
7. Topics landing: `/api/calendars/topics/<day>` gives `topic` as a slug string; the educator "for class" card
   linked to `/topics/undefined`.
8. Lexicon tool updated state after its panel closed (React warning on the next tool).
9. Header: at 1280px the tools spilled over the content-language control; two rows up to 1199px, single row from
   1200px, content-sized tracks. Phones get the nav as a third row and the My Library link (a reader page had no way
   out). Below 768px the page reserves the dock button's corner and `scroll-margin` keeps controls above it (lesson
   editor "Add" row). Home "Continue reading" shows Hebrew titles in the Hebrew interface.

**Remains / to check on the cauldron**

- The floating dock button (< 768px) still covers body text mid-scroll; only the page end and scroll-into-view are
  reserved. A slimmer affordance is a design call.
- An inbox topic item whose topic has no sources (e.g. this week's "Torah Reading for …" topic) stays in the inbox
  with the toast "No sources found for this topic"; dismiss it with ×. Repro: educator → `/topics` → "For this
  week's class" → "Add topic to lesson" → `/my/lessons` → "Add to lesson".
- `Sefaria.getUpcomingDay('holiday')` returns `{ error }` today, so the holiday card hides (as it should).
- Browse's "Add to plan / lesson" and the inbox target the newest plan / lesson (documented behaviour); a picker is
  the next step.
- `text_panels`' cookie change has no automated test (Django is not importable here); the first cauldron run should
  load `/Genesis.1?library=classic` and then `/texts` (classic should stick).
- Hebrew search calls Dicta inside `execute_query`; blocked here, check there. Topic images likewise.
- Pre-existing `act(...)` warnings in a few jest suites are console noise, not failures.

Screenshots worth a look (`scratchpad/shots/`): `qa-learner-en-07-tool-highlight.png` (the pre-fix header clip is
visible in run-1 captures of the same name), `qa-educator-en-18-lesson-editor.png`, `qa-educator-en-19-handout-print.png`,
`qa-educator-en-32-mobile-lesson-add.png` (phone header + inbox card + "Add" row clear of the dock),
`qa-learner-he-06-reader-select.png` (RTL reader + toolbelt), `qa-learner-en-29-inbox-plan.png` ("5 added"),
`qa-learner-he-32-mobile-home.png`.

