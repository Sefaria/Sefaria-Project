# The new reader: decision critique and adversarial code review

Review of `sefaria-reader` at `384f904` (= `reader-next/` on `reader-next-target-architecture`), 2026-10-28. The client was built
mostly by Claude Sonnet, moving fast toward parity with sefaria.org. This review was done with Claude Opus: five independent
adversarial reviewers (reader core; routing, SSR and the node server; data and cache; auth, analytics and security; UI, accessibility
and tests), each told to prove findings, followed by a second pass that re-checked every critical and high finding in the code.

How to read it: §1 is the verdict, §2 the decisions, §3 the directions, §4 every finding with its evidence and fix, §5 the order to fix
them in. **Verified** means reproduced (browser, test, curl or a script) or confirmed on the exact code path; **plausible** means read
but not reproduced. Scripts and screenshots are under the session scratchpad `review/` folder and are not part of the repo.

Where this document disagrees with `TARGET_ARCHITECTURE.md`, §3 says so and that document should be amended.

---

## 1. Verdict

The client is a credible base and should not be rewritten. Its first paint is server-rendered with the text in the HTML, it reads and
writes sefaria.org's URLs, it has a real component library, an RTL-correct stylesheet (logical properties almost everywhere), a sound
HTML sanitiser, a careful scroll-anchoring engine, and about 1,500 automated tests. Suites: unit 1,191 pass (19 s), stories 283 pass
(17 s), e2e 213 pass / **3 fail** / 4 skipped (4.5 min, against the live API).

What it lacks is the second half of engineering: **limits, boundaries and enforcement**. The smaller model optimised for "matches
sefaria.org today" and repeatedly took the shortest path to that: port legacy string-building literally, persist everything, fetch
everything a URL could mean, put logic where the data happened to be. The result works on the happy path and fails at the edges:

- **Safety:** a stored-XSS chain, an open redirect, a URL character (`%`) that crashes the reader, and no server timeouts or fan-out caps
  (one URL can make the node server issue 500 API calls).
- **The decided GA4 condition is already broken:** GTM and the gtag `config` re-run on every in-app route change, sending extra page
  views, and the sign-in funnel uses event names master has since replaced.
- **Performance debt hidden by a fast desktop:** ~320 KB gzip of JS on a reader page (58 KB of it runtime zod validators), 6 MB link
  arrays per chapter validated and written to IndexedDB, a disk cache that is never cleaned, a 4 MB catalog in the HTML of `/texts`,
  a re-render of every verse on every section load, a column that never unloads.
- **Rules that exist only in docs:** the adapter boundary, "ui never reads settings", "every colour a token" are each violated dozens
  of times, and nothing enforces them; there is no CI.

None of this is unusual for a fast port. It is all fixable in the existing structure, and most fixes also move the code toward the
target architecture.

---

## 2. The decisions, critiqued

Each decision Sonnet took (explicitly in `docs/ARCHITECTURE.md` or implicitly in the code), with a verdict: **keep**, **change**
(right goal, wrong execution) or **reverse**.

| # | Decision | Verdict | Why | Direction |
|---|---|---|---|---|
| 1 | React 19 + TanStack Start/Router/Query, SSR first paint | **Keep** | Right stack; per-request QueryClient is correct; SSR text in HTML is a real SEO/LCP win over legacy | Add an HTTP policy layer (§3.4) |
| 2 | React + Storybook component library instead of the Lit toolkit | **Keep** | Correct call; Popover, Modal (native `<dialog>`), SegmentedControl are well built | Enforce the ui boundary (§3.6) |
| 3 | "The URL is the reader state", byte-exact legacy grammar | **Change** | The goal is right (F1). The execution — porting `makeHistoryState`'s string templating, then re-parsing the string, then rewriting the address bar after the fact with `history.replaceState` outside the router — produced the `%` crash, parameter injection, the `sbsq{i}` typo, back/forward restore damage and a server round trip per scroll pause | Structured encoder (pairs → one serializer); byte-exactness proven by golden tests; full form written at navigation time; no post-hoc rewrite |
| 4 | "Local library cache is the backbone": persist every query to IndexedDB | **Reverse the default** | Persistence was made the default for every class, with no budget, no eviction and silent quota failure. Multi-MB link arrays, autocomplete prefixes and stale calendars go to disk; SSR-seeded data (the page you landed on) never does. Offline reading is not a stated product goal; a fast revisit is, and memory + HTTP caching gives most of it | Opt-in persistence for texts and catalog only, byte budget + LRU eviction, memory-only for links/related/search; a server freshness signal (ETag or library version) |
| 5 | Vendored toolkit API client with zod validation of every response at runtime | **Reverse** | Costs 58 KB gzip on every page and ~40 ms per large response on the main thread (more on phones), double-parses bodies, turns undocumented statuses into "contract" errors — and gives no type safety, since `src/lib` still casts (`as unknown as` ×11). Its cache is disabled and its schemas patched | Keep `text-transform`; replace the client with a thin fetch layer + types generated from Sefaria's OpenAPI; validate against fixtures in CI, sample in prod |
| 6 | Port legacy behaviour by hand, verified by parity scripts | **Change** | Parity is the right bar, but hand-ports drift (auth analytics was ported from a snapshot master has since changed) and copy legacy bugs (`sbsq{i}`, the range-collapse comment). The `innerText` parity scripts normalise away differences and mostly don't fail | Contract tests against master for anything with an external consumer (analytics events, chatbot events, URLs); parity as recorded fixtures asserted in specs |
| 7 | Feature logic inside React components (TextPanel ~600 lines, ~30 inline `useCallback` commands; ConnectionsPane a 700-line if-chain) | **Reverse** | Untestable without React, blocks the integration command layer (F2), duplicates logic, causes the render cascades | Pure commands `(ws, panelId, args) → {ws, navState}` in `src/lib/workspace`; a "now reading" store per panel; a view registry for the sidebar |
| 8 | Infinite column that only appends; per-verse React state | **Change** | Long sessions degrade linearly (DOM, links arrays, per-frame `querySelectorAll`, layout in `spreadNumbers`); each verse crossed re-renders the panel | Window the column (unload far sections); external store for "now reading", subscribed selectively |
| 9 | SSR loads everything the URL names | **Reverse** | Ranges fetch every section (up to 500), `p2…pN` loads every panel, the 4 MB catalog is dehydrated into HTML, slow upstreams hang renders with no timeout | SSR budgets: first section + highlight only, panel cap, `shouldDehydrateQuery` by class, timeouts, 503 + `Retry-After` |
| 10 | Analytics head scripts declared through the router's `head()` | **Reverse** | The router re-injects them on route changes (re-running GTM and `gtag('config')`) | Bootstrap third-party scripts once, in the document shell, idempotently |
| 11 | `light-dark()` tokens that follow the OS when no theme is set | **Change** | Shipped before the token sweep: dark-OS users already get a half-dark site with 1.07:1 contrast controls | Pin `data-theme="light"` until §6.6 lands behind its flag |
| 12 | Request prefs through a server function in root `beforeLoad` | **Reverse** | Runs on every navigation, including scroll-driven ones, as an HTTP round trip | Read cookies in request middleware → router context on the server; `document.cookie` on the client |
| 13 | e2e against the live API as the main gate; coverage % from `@feature` tags; no CI | **Reverse** | The suite is red today because live data changed (145 → 144); tags credit skipped and expected-fail tests | Fixture/HAR replay in CI on every PR; nightly live drift suite; coverage from tests that ran |
| 14 | Client developed in a local-only repo, synced by squash subtree | **Reverse** | The only copy of the history is on one laptop; squashes lose authorship and bisectability | Develop in `reader-next/` on the branch (or push `sefaria-reader` and keep the subtree) |
| 15 | Two HTML pipelines (vendored normaliser + `sanitizeHtml`) plus regex post-processing | **Reverse** | Regex highlighting over serialized HTML is the XSS (R-02) | One parse → DOM transforms (highlight, link upgrade) → one escaping serializer |

---

## 3. Directions forward

These amend `TARGET_ARCHITECTURE.md` where noted. Order follows dependency.

### 3.1 Make the rules machine-enforced first

Before more features: CI on every PR to `reader-next` (typecheck, unit, stories, fixture-replayed e2e — ~1 min without live e2e); a
vitest **architecture test** for import boundaries (`src/ui` may not import settings, router, config, analytics or API types; features
may not import API shapes) with a shrinking allowlist; **stylelint** `color-no-hex` outside `tokens.css`. Today: 48 ui files import
`src/lib` beyond i18n (7 emit analytics, 11 read config, 5 read settings), 13 ui/features files import API shapes, 208 literal colours
in 43 CSS files. Without enforcement every new Sonnet commit widens the gap. *(Amends §5: rules are tests, from day one.)*

### 3.2 One HTML pipeline

Parse once, transform the DOM (sanitise, highlight search terms, upgrade links, itags), serialize once with full attribute escaping
(`< > " &`). Delete regex-over-HTML. Regression tests with the R-02 payload.

### 3.3 The URL codec as a structured encoder

`Workspace → [key, value][] → stringifySearch`, decoder the inverse; property test: encode∘decode is the identity for arbitrary strings
in every field; golden tests hold the byte-exact legacy URLs (the existing `legacy-urls.ts` table becomes the oracle). Write the full
form at navigation time through `router.navigate`; delete the address-bar rewrite. Panel ids travel in history state (D7). Move `go`,
`current` and defaults to `src/lib/workspace/commands.ts` (router + settings getter), which is also the integration layer's entry
point (§6.12). *(Amends §6.1.)*

### 3.4 An HTTP policy layer on the node server

One request middleware owns: reading cookies → `ReaderPreferences` and runtime config (§4 of the target) into router context;
timeouts on every upstream fetch (`AbortSignal.timeout`, ~6 s render, shorter for pass-through); status mapping (404, 301/308, 410,
503 + `Retry-After` for upstream failure, so nginx can fall back); `Cache-Control: private, no-store` whenever the page carries viewer
data, and `Vary` on preference cookies before anyone caches anonymous pages; SSR fan-out caps (panels ≤ 5, sections per panel = first +
highlight); SIGTERM drain. Replace the global `fetch` monkey-patch with an injected `apiFetch(origin, host)`, and fail fast on bad
config at boot. Replace the "render, 404, then ask Django" fallback with an explicit route manifest plus a cached name check for refs.
*(Amends §4 and §6.16.)*

### 3.5 Data layer: fewer bytes, explicit lifetimes

- Persistence opt-in by class with a byte budget; metadata store for LRU eviction at idle; log quota failures. Texts and catalog only.
- Links and related in memory only; fetch them only when dots or the sidebar are on screen; stop downloading links twice (related +
  links); backend counts endpoint (already Phase D).
- Catalog in a node cross-request cache; never dehydrate it whole.
- Thin fetch layer with one error model (not found · unavailable · contract · retryable); no retry on 4xx.
- Ref value type `{book, structure, from[], to[]}` parsed once; sections derived from the index shape, not learned from text fetches;
  cache keys include the structure (prepares the backend text model).
- Freshness: ETag/Last-Modified through Varnish or a library-version endpoint to bust texts after corrections.
*(Amends §6.7.)*

### 3.6 Reader core: commands, stores, display model

- Pure commands for every panel action (open, replace, open-next-to, sidebar, version, language), shared by TextPanel and the integration layer.
- "Now reading" per panel in an external store (`useSyncExternalStore` with selectors): URL settle, last place, history, analytics and
  header subscribe; the panel no longer re-renders per verse.
- `resolvePanelVersions` once in the loader; the column keys on the resolved selection (fixes R-07 and removes the client swap hack).
- `resolveDisplayModel` produces stable per-segment props (fixes the re-render cascade, R-12) — the §6.3 proposal, now with a
  measured performance reason to do it first.
- Column windowing and a scoped `spreadNumbers`.
- ConnectionsPane as a view registry; each view owns and memoises its data.

### 3.7 Analytics as a contract

Third-party bootstrap once per document (shell, idempotent guard). Event names and parameters live in one module with a contract test
that reads the legacy source on master (`authAnalytics.js`, `analyticsEventTracker.js`) so drift fails CI. The launch gate (§6.10)
gains a "route change sends no extra `config`" check.

### 3.8 Tests that can gate

Fixture/HAR replay for e2e in CI; nightly live-API drift and parity, non-blocking. Story matrix theme × direction with keyboard
`play` tests for interactive components; stories for Segment and Modal; an axe pass on ~8 key routes. Absence assertions ("never
jumps") first assert their trigger happened. Coverage from Playwright annotations / vitest `meta` of tests that ran; `it.fails` →
`it.todo`.

### 3.9 Bundle

Remove runtime zod (§2 #5); split NavPage/NavSidebar out of the reader route; load Sentry without `replayIntegration` unless replay
rates > 0; CI budget on the reader route's critical JS (today ~1.07 MB raw / ~320 KB gzip).

---

## 4. Findings

IDs are stable for tickets. Severity: **C** critical, **H** high, **M** medium, **L** low. Paths are under `reader-next/` (identical
in `sefaria-reader`).

### Critical

**R-01 · C · analytics · GTM and `gtag('config')` re-run on every in-app route change** — *verified (production build; `config`,
`js`, `gtm.js` counts 1 → 2 → 3 over three clicks)*
`src/routes/__root.tsx:52` declares the snippets in `head().scripts`; TanStack's `<Script>` renders `null` after hydration and its effect
re-injects the script whenever the root loader's data changes. Each route change sends an extra `page_view` and re-fires every GTM
tag: the decided "GA4 stream unchanged" condition (D1, F4) is broken today. **Fix:** plain `<script>` in `RootDocument`'s `<head>`,
guarded (`if (window.__sfAnalyticsInit) return`).

**R-02 · C · security · stored XSS through search-term highlighting** — *verified (jsdom PoC)*
`src/lib/text/highlight-terms.ts:21` tokenises serialized HTML with `/<[^>]*>/`; the vendored serializer
(`vendor/sefaria-toolkit/text-transform/html.ts:48`, `entities.escapeAttribute`) leaves `<`/`>` raw in attribute values. A `>` inside
`data-value`/`data-ref`/`data-commentator` lets the highlighter's inserted `<span class="…">` break out of the attribute; the browser
then parses a live `<img onerror>`. Those attributes are allowed by the backend's bleach whitelist and any signed-in user can POST a
version (`reader/views.py:1863-1886`). Chain: plant text → wait for indexing → send `/search?q=…` → victim clicks a result. **Fix:**
escape `< > " &` in attributes; highlight by walking text nodes of the parsed DOM (§3.2); regression test with the payload; backend:
restrict who may create versions and strip `<`/`>` from those attributes.

**R-03 · C · security · open redirect in `/interface/<lang>?next=`** — *verified (`next=/%09/evil.com` → `Location: /\t/evil.com`;
`new URL("/\t/evil.com", origin)` = `https://evil.com/`)*
`src/lib/shell/interface-language.ts:9-11` blocks `//`, `/\` and CR/LF but not TAB. A correct implementation exists in
`src/lib/auth/utils.ts:64`. **Fix:** use that one; delete the copy; add the TAB case to its tests.

**R-04 · C · availability · a `%` in a sidebar search (or any free-text URL value) crashes the reader; values can inject parameters**
— *verified in the browser (`…&with=SidebarSearch&sbsq=100%25` hydrates, then `URIError`, "Something went wrong!")*
`src/lib/workspace/url.ts:137-142,159` writes `sbsq`, `with`/`w<n>`, `namedEntity` and version values unencoded into a string that
`encodeWorkspace` re-splits and `decodeURIComponent`s; `features/workspace/navigation.tsx:160` runs it on every rewrite. `sbsq=a%26p2%3DExodus.1`
round-trips into an extra panel; a search for `a&b` becomes `a`. Also `&sbsq{i}=` is written literally (missing `$`) and never read back.
**Fix:** §3.3 (structured encoder + property tests).

**R-05 · C · availability · unbounded server fan-out and no upstream timeouts** — *verified (local SSR: `/Psalms.1-150` → 150 parallel
requests, 8 MB HTML, 11.7 s; `?p2…p500` → every panel loaded; hung API → request still open at 40 s; API 503 → SSR 500)*
`src/lib/text/plan.ts:44-60,73-76` + `queries.ts:132` fetch every section of a range (≤ 500, e.g. `Shabbat 2a-157b` = 312);
`features/reader/reader-route.ts:103` loads every `pN` panel; `src/server/internal-fetch.ts:39` and `pass-through.ts:44` have no timeout;
nginx waits 300 s and does not intercept node's 500. One crawler URL multiplies into hundreds of Varnish/Django calls. **Fix:** §3.4
(caps, timeouts, 503 + `Retry-After`) and §3.5 (range = first section + highlight, the rest on scroll).

**R-06 · C · UX/a11y · users whose OS is in dark mode get a broken half-dark site today** — *verified (Playwright `colorScheme: dark`,
screenshot; English translation 2.97:1, "Exact Phrase" control 1.07:1, logo near-invisible)*
`src/ui/tokens/tokens.css:10` sets `color-scheme: light dark` and `__root.tsx` never sets `data-theme`, so tokens follow the OS while
208 literal colours stay light. Contradicts D3/§6.6 ("flag off ⇒ light"). **Fix:** render `<html data-theme="light">` until the dark-mode
work lands behind its flag.

### High

**R-07 · H · reader · a URL naming only `vhe` drops the reader's saved translation after hydration** — *verified (Playwright: SSR shows
Koren, hydration swaps to the default; Genesis 2 fetched in both versions)*
`features/reader/TextPanel.tsx:85` prefers `panel.versions` over the loader's resolved `data.versions` whenever the URL names any
version; `TextColumn.tsx:113-129` then swaps every section. **Fix:** loader returns requested + resolved; one `resolvePanelVersions`
(§3.6); test that resolved versions survive hydration.

**R-08 · H · analytics · the sign-in funnel sends master's old event names and schema** — *verified (`static/js/auth/authAnalytics.js`
on `origin/master` sends `auth_flow_started`, `auth_method_chosen`, `auth_process_started/ended`, `auth_flow_ended`)*
`src/lib/auth/analytics.ts:23`; missing `flow_intent`, `outcome`, the `sefaria_sso_outcome` cookie, and all email-login tracking
(`features/auth/views.tsx:125`). **Fix:** re-port from master; contract test (§3.7).

**R-09 · H · perf · every client navigation (including each scroll pause) makes a server round trip** — *verified (2 scroll gestures →
2 `GET /_serverFn/…getRequestPrefs…`)*
`src/routes/__root.tsx:36,45` calls a server function from root `beforeLoad`. **Fix:** §3.4 (middleware on the server, `document.cookie`
on the client, as `prefs-source.ts` already does).

**R-10 · H · perf · 6 MB link arrays per section: fetched, parsed twice, zod-validated on the main thread, held 2 h, written to disk 7 days**
— *verified (Genesis 1: 6.3 MB JSON, 11,051 rows; 40 ms parse + 42 ms validate on a Mac in node)*
`src/lib/connections/queries.ts:18-31`, `TextColumn.tsx:225`; Resources also fetches `/api/related` (1.27 MB gzip) containing the same
links and discards them (`related.ts:90`). **Fix:** §3.5.

**R-11 · H · data · IndexedDB is never garbage-collected; quota errors are swallowed** — *verified (`collectGarbage` has no caller)*
`src/lib/cache/persisters.ts:32`, `storage.ts:31-36`. With R-10 the disk cache grows until the quota, then silently stops writing (and the
browser may evict the origin). Note: wiring TanStack's `persisterGc` as-is loads every value. **Fix:** metadata store + LRU byte budget
(§3.5).

**R-12 · H · perf · the whole column re-renders on every section load and every links update; TextPanel renders per verse, twice**
— *verified (render probe: adding Genesis 11 → 436 `SegmentText` renders for 186 sides; a scroll batch with no new section re-rendered
all 262)*
`TextColumn.tsx:225-237` rebuilds counts for every section; `ui/TextSection/TextSection.tsx:91-92` passes inline objects that defeat
`Segment`'s `memo`; `ui/SegmentText/SegmentText.tsx:84` creates a new callback ref each render; `TextPanel.tsx:88`
`useSuspenseQueries(...).map(...)` is a new array each render, defeating every downstream memo and making `useDeferredValue` schedule
an extra render; `setCurrent` per verse; ConnectionsPane and TextColumn are not memoised. The code comment "adding a section never
re-renders the sections already there" is false. **Fix:** §3.6 (display model, external store, memoised counts per section, stable refs);
a render-count test.

**R-13 · H · process · the e2e suite is red against live data and nothing runs in CI** — *verified (213 pass, 3 fail: `webpages.spec.ts:11,36`
expect `Halachipedia (145)`, live is 144; `lexicon.spec.ts:105` fails 2/2)*
33 `waitForTimeout`s, several absence assertions that pass vacuously; only 4 specs mock routes. The lexicon failure is probably a real bug:
`DictionarySearch` submits `list[0]` instead of the exact typed word (plausible). **Fix:** §3.8.

**R-14 · H · perf · the 4 MB catalog is serialized into the HTML of `/texts` and `/search`** — *verified (`/texts` = 3.83 MB HTML)*
`routes/texts.index.tsx:9`, `texts.$.tsx:14`, `search.tsx:17` `ensureQueryData(tocQueryOptions())`, and the SSR integration dehydrates
every query. **Fix:** `shouldDehydrateQuery` by data class; node cross-request catalog cache; dehydrate only the slice rendered.

**R-15 · H · perf · reader-page JS ~1.07 MB raw / ~320 KB gzip before interactive** — *verified (production build)*
Entry 130 KB gz, reader route 86 KB, `toc` chunk 58 KB gz of which almost all is the toolkit's generated zod validators, NavPage + NavSidebar
47 KB gz statically imported by the reader route; Sentry chunk 148 KB gz loaded after hydration including `replayIntegration` while replay
rates are 0. **Fix:** §3.9 and a CI budget.

### Medium

| ID | Area | Finding | Evidence | Fix |
|---|---|---|---|---|
| R-16 | routing | Address-bar rewrite calls `history.replaceState` outside the router: TanStack sees a REPLACE, re-matches and re-runs root `beforeLoad`; the file's own subscriber clears `poppedKey` and overwrites the popped entry's saved positions (back/forward restore breaks after a setting change); 20× `setTimeout` polling | code path; restore damage plausible | §3.3 |
| R-17 | data | Global `retry: 1` retries every 404 (≈ +1 s on every bad or old link, on server and client) | verified: `Genesis 51` → 2 calls, 1,405 ms | Retry predicate: never on 4xx or contract errors |
| R-18 | data | Segment ranges crossing sections produce wrong refs (`"Genesis 1:30-31:1"`), cached 30 days; reached via the resolve path, ConnectionsPane ranged selections, dictionary search | verified: `fetchPassage("Genesis 1:30-2:3")` | Parse spanning refs with `parseHumanRef` (`model.ts` `leavesOf`) |
| R-19 | data | RefIndex never expires (no buster, no maxAge); aliases not keyed by structure; server singleton `Map` grows with every distinct spelling (also: server alias map unbounded) | code path; growth plausible | Under `CACHE_BUSTER` + maxAge; LRU+TTL on the server |
| R-20 | data | SSR-seeded queries are never persisted (TanStack persists only after a `queryFn` runs): the landing section is the one page not cached | code path | Persist hydrated queries after hydration; seed RefIndex |
| R-21 | data | Calendars hard-code `diaspora=1` (Israeli readers get the diaspora parasha when they differ); key has no date; persisted 90 days → last week's parasha offline | verified | Key by date + diaspora; diaspora from the server (§6.4); don't persist |
| R-22 | reader | Connected-texts list fetches a whole section per link (Genesis 1:1 commentary: 235 parallel v3 requests, each persisted 30 days); cross-section links truncated to their first section | measured | `/api/bulktext` or `links?with_text=1` scoped to the selection; virtualise |
| R-23 | auth | Feedback POST has no CSRF token → every submit 403s (feature broken); backend takes the sender from a client-supplied `uid` (spoofable) | code path (`lib/feedback/feedback.ts:46`, `sefaria/views.py:388`) | Use `postForm()`; backend: sender from the session |
| R-24 | workspace | Panels keyed by position: closing panel 1 hands its React state (scroll, selection) to the next panel; during a pending navigation `data.panels[id]` can belong to another panel | code path (`ops.ts:32`, `SplitView.tsx:56`) | Stable ids in history state (D7) |
| R-25 | reader | Column grows without bound: per-frame `querySelectorAll` over all segments, one links array per section, version change refetches all, `spreadNumbers` forces layout over every number on each resize | code path; growth observed | Windowing; scope `spreadNumbers` to the resized section |
| R-26 | reader | Version change: `Promise.all` over every loaded section, no `catch` (one failure leaves old text under a new header), nothing shown until the farthest section arrives, and a race with edge loads can drop a section | code path; race plausible | Visible sections first, merge into current state, error handling |
| R-27 | server | SSR HTML with viewer data (email-derived traffic type, uid) has no `Cache-Control: private` and only `Vary: Origin` | plausible (depends on edge rules) | §3.4 |
| R-28 | routing | `/texts/Tanach/A%20B` → `301 /texts/Tanakh/A%2520B` (double-encoded permanent redirect; crawlers cache it) | verified (curl) | Pass the raw path to the router |
| R-29 | privacy/perf | Last reading place per book in localStorage forever, not tied to the user, not cleared at logout (next person on a shared machine sees it); read-parse-write per verse; history positions stringified to sessionStorage twice per scroll pause | verified (code) | Server history when signed in; clear on viewer change; write on settle/`pagehide`; cap |
| R-30 | ui | ui boundary not real: 48 ui files import `src/lib` beyond i18n; business rules in ui (`Segment.tsx:66-75` numerals); 208 literal colours / 43 files + 5 in TSX | counted | §3.1 |
| R-31 | a11y | Every segment is a tab stop (31 on Genesis 1, growing with scroll) and selection is not exposed (no `aria-current`); SortMenu claims the ARIA menu pattern without its keyboard behaviour; two combobox implementations; mobile nav has no Escape/focus handling; nested `<main>`; no h1 on `/search` | verified (Playwright, axe probe) | Roving tabindex + `aria-current`; SortMenu on Popover as listbox/radiogroup; one combobox |
| R-32 | tests | 15 of 67 ui components have no story (Segment, SegmentText, Modal, NavSidebar…); only 33 of 283 stories have `play`; 72 stories fail a11y in dark theme (1,036 contrast violations) but the suite runs light/English only | verified (matrix configs) | §3.8 |
| R-33 | tests | `@feature` coverage counts any tag in a file, including skipped specs and `it.fails` (which also pass on any crash) | verified | §3.8 |
| R-34 | backend | Password-reset "resend" emails any account by uid and reveals whether a uid exists; no rate limit (`sefaria/views.py:153-170`) | code path | Rate-limit, uniform answer, require the session's reset token |
| R-35 | server | Config read at module load; global `fetch` monkey-patch for Host (skipped silently for an `https` origin); empty `SEFARIA_API_ORIGIN` → relative URLs on the server | code path | §3.4 |
| R-36 | routing | "Render, 404, then ask Django": full render with API calls thrown away; an API 429 becomes `notFound()` and Django serves the old reader | code path | Route manifest + cached name check (§3.4) |

### Low

- **Data:** API `warnings` ignored (an unknown `ven` silently shows no translation, cached 7 days); autocomplete prefixes persisted 90 days
  ("reference" class → "search"); raw `fetch` in calendars, name, topics-toc, search, completion bypass the error model (topics-toc
  persists a 404 as `[]` for 30 days); serial text→index-meta and unknown-book waterfalls; default-translation load fetched and dehydrated
  even when preferences differ; server per-request clients leave `gcTime` timers (set `gcTime: Infinity` on the server).
- **Reader:** commentary ranges spanning chapters lose their highlight (`plan.ts:44-48`); the sidebar briefly shows "no connections" at a
  chapter boundary (`TextPanel.tsx:203-208`); connected-text links built with a naive URL (use `refToUrl`); `window.__columnMounts` written
  in production (`TextColumn.tsx:93`).
- **Security/privacy:** book dedication rendered without `sanitizeHtml` (`BookPage.tsx:128`); data-tag listeners double-attach after
  remount (dev only); `setAnalyticsUser` is dead code that would send a second `config` (use `gtag('set')`).
- **Routing/server:** trailing slash answers 307 (use 308); `passResetLink` turns a Django 5xx into a 302; inline head scripts trigger
  React's "Encountered a script tag" error; a future POST server function would be routed to Django by the "every write" rule (exempt
  `/_serverFn/`).
- **UI:** smooth `scrollTo` ignores reduced motion (`SearchPage.tsx:81`); 31 abandoned debug scripts in `scripts/` (`_dbg*`, `_sbs*`,
  `probes/multipanel-*`).

### Checked and sound (do not re-review)

`sanitizeHtml` (blocks `javascript:`, svg/math/template/noscript breakout, quote injection, `on*`); `markdownToHtml` output sanitised;
`safeNext` in `lib/auth/utils.ts`; login/SSO/One Tap redirects; register redirect validated server-side; CSRF on auth, notes, history and
sheet writes; user-class data never written to disk; per-request QueryClient (no cross-request leak); config/analytics inline JSON escapes
`<`; pass-through cannot be steered to another origin; reset-link redirect is not open; `/Gen.1.1` → correct 301; RTL CSS; Popover,
Modal, SegmentedControl.

---

## 5. Fix plan

**Batch 0 — this week (security, analytics stream, crashes).** R-01, R-02, R-03, R-04, R-05 (caps + timeouts first), R-06, R-07, R-08,
R-23, R-27, R-34 (backend, master). Each with a regression test. Also fix the 3 red e2e tests by moving them to fixtures.

**Batch 1 — make rules enforceable (unblocks safe parallel work).** CI (§3.1), architecture test with allowlist, stylelint, fixture-replayed
e2e, story matrix, honest coverage (R-13, R-30 baseline, R-32, R-33).

**Batch 2 — structural moves that the target architecture needs anyway.** §3.3 URL codec + commands (R-16, R-24), §3.4 HTTP policy layer
(R-09, R-35, R-36, R-28), §3.6 versions + display model + "now reading" store (R-12, R-25, R-26), §3.5 persistence policy + GC (R-10,
R-11, R-14, R-17…R-22). These replace work-plan items A2, A5, C1, C3 and C5 in `TARGET_ARCHITECTURE.md` §10 rather than adding to them.

**Batch 3 — bundle and a11y polish.** §3.9 (R-15), R-31, the low list.

Process rule for the remaining build (any model): a change is done when it passes CI including the architecture test; anything that talks
to something outside the client (analytics, chatbot, URLs, Django) carries a contract test against master; no new persisted query class
without a size estimate.
