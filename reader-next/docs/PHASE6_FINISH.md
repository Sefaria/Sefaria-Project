# Finishing Phase 6 (Search) — instructions for the next agent

Written 2026-10-05 after commit `e343593` (header autocomplete + Sources results page). Read `docs/HANDOFF.md` first
for the general rules; this file narrows them to what is left in Phase 6 and the order to do it in. When this file and
the code disagree, the code wins — fix this file.

## Ground rules (unchanged, repeated because they matter)

- Local repo only. Never push, never create remotes, never deploy.
- The Feature Atlas (`docs/features/features.json`, 945 entries) is the source of truth. Every time live sefaria.org
  differs from what the atlas says, or you find a behaviour the atlas lacks, record it: add a dated
  `docs/features/tools/apply_2026_10_05y.py` (then `z`, then `2026_10_06a` …), modelled on `apply_2026_10_05x.py`
  (idempotent `add(id, [lines])`, plus status writes to `rebuild-status.json`), and a section in
  `docs/features/CHANGELOG.md`. Look IDs up **by name** in features.json — never guess an ID.
- Tests carry `// @feature SRC-0xx` tags (in e2e describe/test comments, JSDoc `@feature` in components).
- One feature per commit; `npm run typecheck`, `npm test`, `npm run test:stories` and the relevant e2e specs green
  before committing. Commit message ends with the `Co-Authored-By:` line the harness gives you.
- Stop and ask the owner (do not build) for: anything that sends data to Sefaria (analytics, feedback, writes),
  sign-in, Phase 7 surfaces (topics pages, Voices/sheets, collections, profiles), deployment, product decisions.
- After each atlas change: rebuild and republish the artifact (see "Atlas publishing" below).

## Where search lives

| Piece | File |
|---|---|
| Header combobox (autocomplete, keyboard, debounce) | `src/ui/SiteHeader/HeaderSearch.tsx` |
| Header submit logic (ref / topic / category / search) | `src/features/shell/useHeaderSearch.ts` |
| Name API, suggestion grouping | `src/lib/search/autocomplete.ts` |
| Search page params, ES body, filter tree, counts | `src/lib/search/search-page.ts` |
| Entity search (books/authors/topics) | `src/lib/search/entity-search.ts` |
| Hits, merging versions, snippets, `highlightsOf` | `src/lib/search/text-search.ts` |
| Page UI pieces (SearchBar, SearchTabs, ExactToggle, SortMenu, SearchResultCard, SearchFilters, EntityResults, NoResults) | `src/ui/SearchPage/SearchPage.tsx` |
| Page container + route | `src/features/search/SearchRoute.tsx`, `src/routes/search.tsx` |
| Sidebar "search in this text" | `src/ui/SidebarSearch/`, wired in `src/features/reader/ConnectionsPane.tsx` |
| Fixtures (MSW) | `fixtures/api/search/*`, `fixtures/api/requests.json`, `search-requests.json`; re-record with `scripts/record-search-fixtures.mjs` |
| e2e | `e2e/search-page.spec.ts`, `e2e/header.spec.ts`, `e2e/sidebar-search.spec.ts` |

Live request facts already verified (don't re-derive): POST `/api/search-wrapper/es8` sent as `text/plain` (CORS);
100 hits/page; the filter tree comes from a separate unfiltered size-0 request with the `path` aggregation; entity
counts from GET `/api/entity-search?q&type&start&sort`; autocomplete GET
`/api/name/<q>?type=Topic&type=ref&type=TocCategory&type=Term&topic_pool=library`.

## Tasks, in order

### 0. Bookkeeping (do first, small commit)
`apply_2026_10_05x.py` marked only the results page done. These are built but still read "todo" in
`rebuild-status.json`. For each one, read the atlas details, check the code honours them, and mark it `done` (or
`partial` with a note saying what's missing): SRC-001…SRC-016 (autocomplete/smart submit; SRC-014 is a crash in
the old site, so mark it `"status": "not-rebuilt", "note": "old-site bug, deliberately not reproduced"`), SRC-041,
SRC-043…SRC-045, SRC-047, SRC-056, SRC-067, SRC-070…SRC-072, SRC-079, SRC-080, SRC-083, SRC-084, SRC-086.
Mark server-only or dead entries so they stop counting as todo — `"status": "n/a", "note": "server behaviour; the
client calls the API"`: SRC-031…SRC-038, SRC-073…SRC-082 (except the ones above), SRC-101, SRC-102; dead:
SRC-059, SRC-077, SRC-103. Check how `scripts/feature-coverage.mjs` and `docs/features/tools/build.py` treat
unfamiliar status values before you invent any; reuse an existing value if one fits.

Also add the missing stories for `src/ui/SearchPage/*` (one story per component: populated, loading, empty,
Hebrew interface) using the fixtures above; the storybook project runs axe, so fix any heading-order or
label problems it reports. The first storybook run after new deps can fail from Vite re-optimisation — just rerun it.

### 1. Matched words highlighted in the reader after opening a result — SRC-058, TXT-027 (most important)
Atlas: clicking a result highlights the searched words inside the highlighted segment, wrapping matches in a span
(old class `queryTextHighlight`) even across inline HTML tags between words, and clears it when the highlighted segment
changes. It only applies to in-app clicks (the `qh` URL parameter is dead — SRC-059), so **don't put it in the
URL**: pass the words in router history state (the reader already uses history state `{nav, panel, ref}`, see
`docs/WORKSPACE.md`), e.g. `state.terms = highlightsOf(hit)`. Both the search page (`openHit` in `SearchRoute.tsx`)
and the sidebar search (`onOpen` in `ConnectionsPane.tsx`) should send it. Do the wrapping in a pure function on
the segment HTML (unit-test it against tags between words, Hebrew with nikkud/cantillation — check how the old
`TextRange.addHighlights` normalised these — and repeated words), applied in the segment renderer only for the
highlighted segment(s). Verify on live: search "let there be light", click Genesis 1:3, inspect the
`.queryTextHighlight` spans and their colour; match the colour with a token, not a hex value in the component.
e2e: result click → spans present; scroll to another verse/select another segment → spans gone; reload → none.

### 2. Phone layout — SRC-049, SRC-062, SRC-063, SRC-024
Live switches to the mobile layout at `window.innerWidth <= 985` (re-measured on resize) — note this differs from the
header breakpoint. Mobile: horizontally scrollable `role=tablist` tab strip with counts and edge fades, active tab
scrolled into view; a "Sort & filter results" icon button opening a full-screen panel (Sources: Close X +
"Filters", "Search Type" + exact toggle, "Sort by" radio list, filter groups, footer "Show Results"; Books: "Filter",
sort radios, category filters; Authors/Topics: "Sort" radios); switching tab closes the panel. SRC-024 is the
search box in the mobile nav menu (reuse `HeaderSearch` with its `mobile` prop — don't make a second component).
Probe live at 390×844 with the probing rules in HANDOFF (remove `#interruptingMessageOverlay`/`#interruptingMessageBox`,
cookie `interfaceLang=english`), screenshot both sides with `scripts/parity-shots.mjs`-style captures, and add the
mobile project cases to `e2e/search-page.spec.ts`.

### 3. Entity tabs — SRC-068, SRC-069
Sorting on Books/Authors/Topics (read the atlas for the option list and API `sort` values) and the category filter
sidebar on the Books tab. `entitySearchInfiniteOptions` already takes `sort`.

### 4. Hebrew on-screen keyboard — SRC-017
English interface only, not on mobile; launcher icon visible only while the input is focused; typed text must survive
blur. Before building, check whether the old `lib/keyboard.js` layout can be expressed as a small data table + a
toolkit popover (`src/ui/Popover`). Applies to the header box and the search page box — one shared component.

### 5. Dictionary search — SRC-020, SRC-021, SRC-022, and finish SRC-094
Dictionary word search box with autocomplete in the sidebar for dictionary books, and the headword box on dictionary
book pages (API in SRC-036). Reuse `SidebarSearch`/`LexiconView` pieces; read what is `partial` in
`rebuild-status.json` for SRC-020/094 first.

### 6. Small items
SRC-050 loading skeleton (use `src/ui/Skeleton`), SRC-065 error states (the old site had gaps — record what live
does, then do better and note it), SRC-018/019 focus/blur and input limits/labels, SRC-060 touch pressed state,
SRC-109 caches (check our `search` cache policy matches what the atlas says; note differences), SRC-110 accessibility.

### Out of scope for Phase 6 — record, don't build
- SRC-025/026 Compare-panel search: needs Compare Text (not built). Mark `todo` with that note.
- SRC-027, SRC-088…SRC-093, SRC-098…SRC-100: collections / Voices / topics — Phase 7, owner decides.
- SRC-104…SRC-108 analytics: sends data to Sefaria — ask the owner.
- SRC-028/029/030 (OpenSearch, sitelinks box, legacy s1 handoff): need server/deploy decisions — list them for the owner.

## Verifying against live

- Write `scripts/parity-search.mjs` (pattern: `scripts/parity-library.mjs`): for a list of queries ("light",
  "אור", "let there be light" exact, a no-result query, a query with gershayim like `רש"י`) and each tab, load live
  `https://www.sefaria.org/search?q=…&tab=text&search_tab=…&tvar=…&tsort=…` and ours on `http://localhost:3100`,
  compare tab labels/counts, first 10 card titles + version lines, the top-level filter list with counts. Counts can
  drift a little between runs; compare order and labels exactly, counts loosely.
- The dev server is on :3100 (`nohup npm run dev`); new routes need a restart for SSR.

## Atlas publishing

```
python3 docs/features/tools/apply_<new>.py
ATLAS_HTML=<scratchpad>/sefaria-feature-atlas.html python3 docs/features/tools/build.py
```
Then republish that file to https://claude.ai/artifact/Hwe1LNomGobeZ4tseqEf51 with the Artifact tool (pass `url`;
read it first if this is a new conversation). The current version is 21.

## Done means

Every SRC entry is `done`, `partial` with a reason, `n/a`/`not-rebuilt` with a reason, or explicitly parked for the
owner; `scripts/parity-search.mjs` agrees with live; all suites green; `docs/PROGRESS.md` and `docs/HANDOFF.md` say
Phase 6 is complete and list what was parked; a short note for the owner lists the open questions (analytics,
OpenSearch/sitelinks, Compare Text, Phase 7 scope). Then stop and ask before starting Phase 7.
