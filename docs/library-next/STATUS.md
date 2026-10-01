# Library Next — status

Kept in sync with what shipped on `mf3`. One row per agent; details in each agent's doc.

| Wave | Agent | State | Notes |
|---|---|---|---|
| 1 | foundation | shipped | Seam, template, bundle, router, i18n, store, persona, shell, onboarding, dock slot, harness, smoke, jest, FOUNDATION.md, DEV.md |
| 1 | assistant | — | ai-chatbot `persona` attribute; then `AssistantBody` in `AssistantDock.jsx` |
| 2 | browse | — | `/`, `/texts`, `/texts/*`, book page, `/calendars` (placeholders today) |
| 2 | reader | — | `ref` route + tool contract (placeholder today; `placeholders.matchRef` is the stand-in) |
| 2 | discover | shipped | `/search?q=`, `/topics`, `/topics/<slug>`, `/topics/category/<slug>`; header search suggestions; see below |
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
- Header search suggestions (`Sefaria.getName()`) shipped with discover (`suggestionsFrom` in `Shell.jsx`).
