# Handoff: next phase of the Sefaria reader rebuild

For the agent picking this up. Read this file top to bottom before touching code, then `docs/ARCHITECTURE.md`,
`docs/WORKSPACE.md` and `docs/PROGRESS.md`. State at handoff: commit `54c2388`, all suites green
(661 unit, 115 story, 85 e2e), 109 of 905 in-scope atlas features covered by tests.

---

## 1. The goal and the rules

**Goal:** a new client for Sefaria (React + TanStack Start, this repo) with true parity with the current
reader at www.sefaria.org, built section by section, always tested, always checked against the live site.

**Non-negotiables** (these come from the product owner; do not relax them):

1. **The Feature Atlas is the source of truth.** `docs/features/features.json` (945 features). When you find that
   an entry is wrong, incomplete or missing — or that the rebuild differs on purpose — fix the atlas *in the same
   commit* and log it in `docs/features/CHANGELOG.md`. Details in §4.
2. **Verify against the live site, never from memory.** Before building a feature, look at what sefaria.org does
   (Playwright, §5) and read the legacy code it cites (`/Users/akiva/Sefaria/dev/Sefaria-Project`). Mark checked
   claims `VERIFIED <date>:` in the atlas. Earlier work found several atlas claims that were wrong on the live site.
3. **Tests for everything.** Every feature gets unit and/or story and/or e2e tests tagged `// @feature ID`.
   Look the ID up **by name** in `features.json` before tagging — IDs written from memory were wrong most of the
   time last round (the coverage script only catches IDs that don't exist, not wrong ones).
4. **Reading never jumps.** Nothing the reader is reading may move unless they scroll. `e2e/smoothness.spec.ts`
   and `scripts/jank-probe.mjs` guard this; run them whenever you touch the text column, fonts, sidebar or layout.
5. **One component per job.** UI lives in `src/ui`, each component with a CSS module, a story and a test. Look in
   Storybook before adding one; prefer a variant over a near-duplicate.
6. **Local cache is a core tenet.** All data goes through TanStack Query with the policies in
   `src/lib/cache/policies.ts` (persisted to IndexedDB). Never fetch outside a query. A second visit to anything
   must make zero requests (see `src/lib/text/queries.test.ts` for the pattern).
7. **The URL is the state**, in the old site's grammar, so every old link works. Panels and sidebars go through
   workspace operations (`src/lib/workspace/ops.ts`) and `useWorkspaceNav()` — never `history.*` directly, never
   `router.navigate` from a panel for reader URLs. Read `docs/WORKSPACE.md`.
8. **Side panels belong to the panel that opened them.** Keep the layout tree able to do drag-reorder, vertical
   stacking and two stacked sidebars (tested in `src/lib/layout/tree.test.ts`), but don't build those UIs.
9. **Don't port old bugs.** When the old site is broken, record it as `BUG (VERIFIED …)` in the atlas and do the
   right thing. When you deliberately differ (accessibility, performance), say so in the atlas detail.
10. **Small, honest commits.** One feature (or fix) per commit, suites green, atlas updated. Commit messages end
    with the attribution line your environment specifies. Never claim something works without having run it.
    The repo is local only — do not push or create remotes.

---

## 2. How to run things

```bash
npm run dev                      # http://localhost:3100 (strictPort; 3000 belongs to another app)
npm run storybook
npx tsc --noEmit -p .            # typecheck (run before every commit)
npx vitest run --project unit    # ~650 tests, uses recorded fixtures via MSW
npx vitest run --project storybook   # stories + axe; the FIRST run after new imports can fail from Vite
                                     # dependency re-optimisation — rerun once before investigating
npx playwright test              # e2e against the dev server and the LIVE API
node scripts/feature-coverage.mjs --unknown   # coverage of atlas IDs; must report no unknown IDs
STEP=120 WAIT=60 node scripts/jank-probe.mjs http://localhost:3100 "/Berakhot.3a.5?lang=he" "Berakhot 3a:5"
```

The Browser pane's preview config is in `/Users/akiva/Sefaria/dev/Sefaria-Project/.claude/launch.json`
(`reader`, `reader-storybook`).

Fixtures: `fixtures/api/` (recorded responses), `fixtures/api/requests.json` maps exact request URLs to files.
To add one, record it with `scripts/record-fixtures.mjs` (add an `extra` entry) or, for a one-off, fetch it and add
the mapping by hand — do **not** re-record everything casually: live data drifts and breaks assertions. If you
change a request's query string, add the new key to `requests.json` pointing at the existing file (see how
`with_sheet_links=1` was added for links).

---

## 3. Where things are

| Need | Look at |
|---|---|
| Reader route, loader, canonical redirects | `src/routes/$.tsx`, `src/features/reader/reader-route.ts` |
| Workspace (panels, sizing, URL codec) | `src/lib/workspace/*`, `src/lib/layout/tree.ts`, `src/features/workspace/*` |
| A text panel (header, column, its sidebar) | `src/features/reader/TextPanel.tsx` |
| Scroll engine (focus, anchors, URL sync) | `src/features/reader/use-reading-scroll.ts`, `TextColumn.tsx`, `src/lib/reader/column.ts` |
| Sidebar container and views | `src/features/reader/ConnectionsPane.tsx`, `src/ui/ConnectionsPanel/*`, `src/ui/TranslationsView/*` |
| Sidebar data | `src/lib/connections/*` (links, summary, related resources, `with=` grammar) |
| Text model and pipeline | `src/lib/text/*` (`model.ts`, `prepare.ts`, `queries.ts`, `commentary.ts`) |
| Versions | `src/lib/versions/translations.ts` |
| Settings (cookies, display menu rules) | `src/lib/reader/settings.ts`, `src/features/reader/settings-context.tsx` |
| Query-string format (old site's) | `src/lib/reader/search-serializer.ts` (`+` is a space; no JSON quoting) |
| API client (vendored, GPL-3.0) | `vendor/sefaria-toolkit/client` — use its namespaces (`text`, `related`, `index`, `lexicon`, `topic`, …) |
| Atlas tools | `docs/features/tools/` (`build.py`, `apply_<date>.py`, template) |
| Old client | `/Users/akiva/Sefaria/dev/Sefaria-Project/static/js` (the atlas cites file:line for every feature) |

---

## 4. Keeping the atlas true

For every correction or addition:

1. Write an **idempotent** script `docs/features/tools/apply_<yyyy_mm_dd>[x].py` (copy the pattern of
   `apply_2026_10_05.py`): `add_details(id, [...])` for verified facts, summary rewrites for wrong summaries,
   `add({...})` for new features (next free number in the area; `status: "rebuild-only"` for things only the
   rebuild has). Run it twice — the second run must change nothing.
2. Append a dated section to `docs/features/CHANGELOG.md`: *Corrected*, *Added*, *Bugs recorded*, *Test tags fixed*.
3. Rebuild and publish:
   ```bash
   ATLAS_HTML=<scratchpad>/sefaria-feature-atlas.html python3 docs/features/tools/build.py
   ```
   This regenerates `docs/features/FEATURES.md`, marks features covered by tests, and mirrors `features.json`,
   `FEATURES.md` and `CHANGELOG.md` to `/Users/akiva/Sefaria/dev/Sefaria-Project/client-rebuild-inventory/`.
   Then republish the HTML to the **existing** artifact https://claude.ai/artifact/Hwe1LNomGobeZ4tseqEf51
   (Artifact tool, `url` set to that link, after reading it once) so the link the team has keeps working.

Do this at the end of each phase at least, and immediately for anything surprising.

---

## 5. The per-feature loop

For each feature (or tight group):

1. **Read** its atlas entries (`python3 -c "…"` over `features.json`) and the legacy code they cite.
2. **Look at the live site** with a throwaway Playwright script in your scratchpad (or `scripts/_x.mjs`, deleted
   before commit). Set the English interface for comparisons:
   ```js
   await ctx.addCookies([{ name: "interfaceLang", value: "english", domain: "www.sefaria.org", path: "/" }]);
   ```
   Capture: visible text (`innerText`), the requests it makes (`page.on("request")`), the URL before/after, and a
   screenshot of the region. Compare ours the same way. Differences go in the atlas (step 1 of §4).
3. **Data first:** a pure module in `src/lib/...` with a `queryOptions` factory (cache policy!) and unit tests on
   recorded fixtures, including at least one test against the real recorded response.
4. **UI:** a component in `src/ui/...` (props in, no data fetching), story on real recorded data, unit test,
   axe must pass. Interface strings: take the old site's English/Hebrew from
   `Sefaria-Project/static/js/sefaria/i18n/interface/{en,he}.json` or the component's `EnglishText`/`HebrewText`
   — do not invent Hebrew.
5. **Wire** it in `src/features/...`; navigation via workspace ops with the right history state
   (`stay` for sidebar-only changes, `select`, `go`, or none for real navigations — see `navigation.tsx`).
6. **e2e** in `e2e/*.spec.ts` against the live API: behaviour, URL, and anything that must not move.
7. **Run everything**, update `docs/PROGRESS.md`, the atlas (§4), commit.

---

## 6. Gotchas already paid for (don't relearn them)

- Never write `history.replaceState/pushState` — the router notices and resets the column. Use `useWorkspaceNav()`.
- A panel must never suspend on a URL change: it reads its initial sections in `data.versions` (what the loader
  loaded); the column swaps to the URL's versions itself (`TextColumn` version-swap effect). Keep it that way.
- Measuring jank: sample only **after paint** (`requestAnimationFrame(() => setTimeout(…))`). Measuring in rAF
  or arbitrary tasks forces a layout the ResizeObserver hasn't corrected yet and reports jumps nobody sees.
- Chrome's CLS counts scroll-compensated shifts; use the per-step jump analysis, not CLS, for prepends.
- Any inline run in another font (bold Heebo in Talmud, footnote markers) needs `line-height: 1` or its late
  font load changes line height. New faces used at first paint must be preloaded in `src/routes/__root.tsx`.
- The old server decodes `+` in queries as a space. `with=Commentary+ConnectionsList` = "Commentary ConnectionsList".
- `/api/related` is ~1.25 MB gzipped per section; it is only fetched when the Resources view is open.
  `/api/links/…?with_text=0&with_sheet_links=1` is the cheap source for connection counts (the flag matters:
  without it counts are one short of sefaria.org).
- Playwright's `locator.click()` scrolls the element into view first; when testing place-keeping, click by
  coordinates (`page.mouse.click`) or `el.click()` via `evaluate`.
- A native `<aside>` has role complementary but no `role` attribute: use `getByRole`, not `[role=…]` selectors.
- Commentary → base text conversion applies to **in-app opens only** (citations, links, search results), never to
  direct page loads (verified). Use `panelForRef()` in `src/features/workspace/open-ref.ts`.
- Language buckets for translations use the "[xx]" title suffix else `language` — not the API's `actualLanguage`.

---

## 7. The plan

Work the phases in order; within a phase, the listed order. Each task lists atlas IDs, what "done" means, and
pointers. If a task turns out bigger than expected, split it and commit the parts.

### Phase 0 — Housekeeping (½ day)

0.1 **Rebuild status per feature.** Coverage is undercounted because many "core" entries describe old internals
that have no equivalent here (e.g. TXD-007 "adapt v3 response to legacy shape", TXD-008 legacy text cache,
TXD-017 TextRequestAdapter, SHL-022/024/026/027 bootstrap details, server-only RTE/PLT entries). Add
`docs/features/rebuild-status.json` (`{ "TXD-007": { "status": "n/a" | "replaced" | "done" | "partial" | "todo",
"note": "…", "by": "src/…" } }`), teach `build.py` to show it (pill + filter in the HTML, column in FEATURES.md) and
`feature-coverage.mjs` to report `done + n/a` vs `todo` per area. Triage every **core** entry in `reader-shell`,
`text-display`, `routing`, `platform-seo` honestly. Done: report numbers per area; atlas republished.

0.2 **Back/forward restores the right place** (SHL-064, SHL-065, RTE-055). Today a popstate is treated as the kind
stored with the entry (e.g. `select`), so the column isn't re-placed. Treat a popstate as a real navigation for
panels whose ref changed, but keep scroll positions for entries the reader merely scrolled through (store
`scrollTop` per panel in history state on `replace`, restore it on popstate before paint). Done: e2e — scroll,
select a verse, go back, forward: column and highlight right each time, no jump.

0.3 Tag existing tests that already cover features (verify by name), e.g. SHL-031, SHL-033, SHL-074, TXD-013.

### Phase 1 — Versions and About (core reader)

1.1 **Version resolution order** (VER-014, VER-001, VER-002, I18-001): explicit `ven/vhe` → corpus preference
(`version_preferences_by_corpus` cookie, JSON, written whenever a translation is chosen — VER-012) →
`translation_language_preference` cookie → default. Server reads cookies in the loader (see how `__root.tsx`
reads settings cookies). Done: unit tests for the order; e2e: choose Koren on Genesis 1, open Exodus 1 → Koren.

1.2 **Header version label** (TXD-013, VER-005, TXT-009 William Davidson attribution for Bavli): match the old
header's subtitle exactly (it shows an attribution string for some corpora, not the version title). Verify on
Genesis, Berakhot, a Mishnah, a commentary.

1.3 **Translation Open / Version Open** (VER-013, VER-007, VER-010 preview click): clicking a preview shows that
translation's text for the selection inside the sidebar (`with=Translation Open&vside=…`). Add `vside` to the
workspace URL codec (per panel `vside{n}`), with codec tests.

1.4 **About this Text** (CON-039, VER-006, VER-008, LIB-036): book description, authors, composition dates/places,
current and alternate source versions, version info rows (VER-017), download links. Data: `/api/v2/index/<title>`
(already a cached query in `src/lib/text/commentary.ts` — generalise it into `src/lib/catalog/index-meta.ts`).

1.5 **Hebrew source versions** (`vhe`): selecting a source version from About; same in-place swap as translations.

### Phase 2 — Sidebar tools (each replaces its "not built yet" view)

2.1 **Lexicon** (CON-042, CON-043, CON-044, TXD-059, SHL-053, TXT-019): selecting words in the text opens
`with=Lexicon&lookup=…` (codec: `lookup`, `lookup{n}`); lookups via the client's `lexicon` namespace; entry rendering
for Jastrow, BDB, Klein (fixtures exist: `jastrow-abba-1`, `klein-av-1`). Mobile: same sheet.

2.2 **Topics** (CON-046, CON-045 named-entity popup, TXD-022 inline entity links): data from the related resources
query (already loaded); entity links in text open the topic sidebar.

2.3 **Web Pages** (CON-052, CON-053) and **Manuscripts** (images; fixture `genesis-1` has manuscripts) and
**Torah Readings** (audio player; `media` in related data).

2.4 **Table of Contents in the sidebar** (BOK-008…018) — DONE (`src/lib/toc`, `src/ui/TocView`; the book page reuses `TocView`; dictionary search box still missing).

2.5 **Search in this Text** — DONE (`src/lib/search`, `src/ui/SidebarSearch`; keyboard/dictionary box missing; POST must be text/plain). Original note: (SRC-094, SRC-095 `sbsq`, SRC-096) — needs the search client from Phase 5; if you
reach it first, build the search API module here and reuse it later.

2.6 **Share** — DONE (`src/ui/ShareView`, `src/ui/FeedbackView`). Original note: (CON-061) and **Feedback** (CON-067; posts to the old endpoint — check what it sends, ask the owner
before sending real feedback from tests; mock it in e2e).

2.7 (signed-out part DONE: `SignUpModal`; signed-in part waits for the owner) **Signed-in tools** (CON-011, CON-048–050 notes, CON-055/056 add to sheet, GUI-004 sign-up modal): there is no
auth in this client yet. Build the signed-out behaviour (sign-up prompt) now; **stop and ask** the owner how
sign-in should work before building signed-in flows (there is a separate SSO project).

### Phase 3 — Every text type, side by side with the live site

Use `scripts/reference-shots.mjs` (live) and `scripts/app-shots.mjs` (ours) across the book-type matrix in
`docs/BOOK_TYPES.md`, at desktop and 390px, Hebrew/English/bilingual, segmented/continuous. Fix differences;
record intentional ones. Includes: TXT-001 Tanakh, TXT-014 Mishnah/Tosefta, TXT-016 commentary as base text,
TXT-017/018 commentary markers and numbers, TXT-020 Siddur, TXT-023 complex texts and default nodes, TXT-024
address types, TXT-025 Hebrew-only / translation-only, TXD-044 RTL translations, TXD-046 segment numbers in
continuous layout (known gap: collisions), TXD-026 inline images, TXD-001/058 copy formatting, TXD-063/064
translation banners, SHL-012/013/014 language rules. Done: a screenshot diff table committed as
`docs/PARITY_SHOTS.md` with every remaining difference explained.

### Phase 4 — Shell: header, navigation, accessibility

GUI-002/003/009/010/011 header and mobile menu (no auth: show Log in / Sign up linking to sefaria.org for now),
SHL-062 mobile reader header, SHL-067/069 in-app link interception with modifier keys (links inside text and
sidebar; `data-target-module` to other modules), SHL-071 Escape closes a panel, SHL-040 auto-scroll to a new panel
when the row overflows, SHL-035 panel error state, I18-002 skip link and landmarks, I18-003 focus management,
I18-007/008/010 interface language switch (`/interface/<lang>` + cookie), GUI-007 cookie notice (privacy-preserving
default), SHL-010 new panels inherit display settings.

### Phase 5 — Book pages and library (book pages DONE 2026-10-05: BOK-001…023 except compare-panel mode, extended notes and the promo; library home and category pages DONE 2026-10-05; translations-by-language pages LIB-020 and recently viewed remain)

BOK-001…BOK-023 (book page: header, Start/Continue Reading, Contents/Versions tabs, schema nodes, section grids by
address type, alt structures and Torah portions, dictionary browse), then LIB-008…LIB-016 (category pages,
Talmud/Tosefta edition toggle, single-text collapse, Hebrew ordering), LIB-001 home, then the nav-sidebar modules
(LIB-023…LIB-060) that the home, category and book pages use. Book pages are new routes in `src/routes/`; the
catalog query (`src/lib/catalog/toc.ts`) already caches `/api/index`.

### Phase 6 — Search — COMPLETE (2026-10-05)

Done and parked items are listed in `docs/PHASE6_FINISH.md` ("Done means") and the atlas statuses; open owner questions in `docs/OWNER_QUESTIONS.md`. Original scope:

SRC-001…SRC-016 header autocomplete and smart submit (refs, topics, books; 3-char minimum; Hebrew keyboard
correction), SRC-039…SRC-066 search page (URL params, tabs, filters tree, sort, exact toggle, result cards,
infinite scroll, opening a result highlights terms — TXT-027/SRC-058), SRC-066…SRC-075 entity tabs. Search requests
go to the public search API; cache per query string with the `search` policy.

### Phase 7 — Ask before starting

Topics pages, calendars, Voices (sheets view/editor), collections, profiles, user library, notifications,
accounts. These depend on decisions the owner hasn't made (auth, Voices scope, deployment). Prepare a one-page
proposal with the atlas counts per area and the open questions; don't build until answered.

---

## 8. Known gaps carried over

- Back/forward re-placement (Phase 0.2).
- `/api/related` takes several seconds; the Resources rows appear late (same as the old site). Consider prefetching
  it when a verse is selected, or `/api/link-summary` for a faster first paint — measure first.
- Translations count uses the section's `available_versions` (verse-level could differ for partial translations).
- Compare Text (SHL-037/038, CON-066) is not built; the Tools row is hidden until it is.
- Segment-number collisions in continuous layout; Zohar paragraph numbers (`index_offsets_by_depth`).
- Sidebar language toggle (`lang2` for the first panel) is read but has no UI yet.

## 9. When to stop and ask

- Anything that sends data to Sefaria on the user's behalf (feedback, notes, sheets, account actions).
- Auth / sign-in design, deployment, pushing to a remote.
- When the live site and the atlas disagree in a way that looks like a product decision rather than a bug.
- When parity would require copying something that is broken or inaccessible — record it, propose the fix, ask
  if it changes behaviour users rely on.
