# Handoff: working method for the Sefaria reader rebuild

**The plan is no longer here.** What is left, in what order, and the launch gates are in `docs/reader-future/LAUNCH_PLAN.md`
(repo root); how the work runs in parallel lanes is in `docs/reader-future/PARALLEL_PLAN.md`; decisions are in
`docs/reader-future/DECISIONS.md`. Per-feature status is in `docs/features/rebuild-status.json` (all 961 features, since
2026-11-10). This file keeps the rules and the working method (§1–6, §9), which still apply. The phase plan that was §7 and the gap
list that was §8 (early October 2026) are in git history.

Read this file, then `docs/ARCHITECTURE.md` and `docs/WORKSPACE.md`.

---

## 1. The goal and the rules

**Goal:** a new client for Sefaria (React + TanStack Start, this repo) with true parity with the current
reader at www.sefaria.org, built section by section, always tested, always checked against the live site.

**Non-negotiables** (these come from the product owner; do not relax them):

1. **The Feature Atlas is the source of truth.** `docs/features/features.json` (961 features). When you find that
   an entry is wrong, incomplete or missing — or that the rebuild differs on purpose — fix the atlas _in the same
   commit_ and log it in `docs/features/CHANGELOG.md`. Details in §4.
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
npx playwright test              # e2e against the dev server; API answers through the cassette proxy (scripts/api-cassette.mjs)
                                 # (parallel lanes: use the rn-shared pw-start.sh / pw-wait.sh scripts, never port 3100)
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

| Need                                       | Look at                                                                                                  |
| ------------------------------------------ | -------------------------------------------------------------------------------------------------------- |
| Reader route, loader, canonical redirects  | `src/routes/$.tsx`, `src/features/reader/reader-route.ts`                                                |
| Workspace (panels, sizing, URL codec)      | `src/lib/workspace/*`, `src/lib/layout/tree.ts`, `src/features/workspace/*`                              |
| A text panel (header, column, its sidebar) | `src/features/reader/TextPanel.tsx`                                                                      |
| Scroll engine (focus, anchors, URL sync)   | `src/features/reader/use-reading-scroll.ts`, `TextColumn.tsx`, `src/lib/reader/column.ts`                |
| Sidebar container and views                | `src/features/reader/ConnectionsPane.tsx`, `src/ui/ConnectionsPanel/*`, `src/ui/TranslationsView/*`      |
| Sidebar data                               | `src/lib/connections/*` (links, summary, related resources, `with=` grammar)                             |
| Text model and pipeline                    | `src/lib/text/*` (`model.ts`, `prepare.ts`, `queries.ts`, `commentary.ts`)                               |
| Versions                                   | `src/lib/versions/translations.ts`                                                                       |
| Settings (cookies, display menu rules)     | `src/lib/reader/settings.ts`, `src/features/reader/settings-context.tsx`                                 |
| Query-string format (old site's)           | `src/lib/reader/search-serializer.ts` (`+` is a space; no JSON quoting)                                  |
| API client (vendored; see `docs/VENDOR.md`) | `vendor/sefaria-toolkit/client` — use its namespaces (`text`, `related`, `index`, `lexicon`, `topic`, …) |
| Atlas tools                                | `docs/features/tools/` (`build.py`, `apply_<date>.py`, template)                                         |
| Old client                                 | `/Users/akiva/Sefaria/dev/Sefaria-Project/static/js` (the atlas cites file:line for every feature)       |

---

## 4. Keeping the atlas true

For every correction or addition:

1. Write an **idempotent** script `docs/features/tools/apply_<yyyy_mm_dd>[x].py` (copy the pattern of
   `apply_2026_10_05.py`): `add_details(id, [...])` for verified facts, summary rewrites for wrong summaries,
   `add({...})` for new features (next free number in the area; `status: "rebuild-only"` for things only the
   rebuild has). Run it twice — the second run must change nothing.
2. Append a dated section to `docs/features/CHANGELOG.md`: _Corrected_, _Added_, _Bugs recorded_, _Test tags fixed_.
3. Rebuild and publish:
   ```bash
   ATLAS_HTML=<scratchpad>/sefaria-feature-atlas.html python3 docs/features/tools/build.py
   ```
   This regenerates `docs/features/FEATURES.md`, marks features covered by tests, and mirrors `features.json`,
   `FEATURES.md` and `CHANGELOG.md` to `/Users/akiva/Sefaria/dev/Sefaria-Project/client-rebuild-inventory/`.
   Then republish the HTML to the **existing** artifact https://claude.ai/artifact/Hwe1LNomGobeZ4tseqEf51
   (Artifact tool, `url` set to that link, after reading it once) so the link the team has keeps working.

Do this at the end of each phase at least, and immediately for anything surprising.

**In a parallel lane** (PARALLEL_PLAN §5) do not edit `features.json`, `rebuild-status.json` or `CHANGELOG.md`: write
`docs/features/tools/apply_<yyyy_mm_dd>_<lane>.py` (print each changed ID with its name; a second run prints nothing; honour
`ATLAS_DIR` so it can be tested on a copy) and `docs/features/changelog.d/<lane>.md`. The integrator runs and folds them in.

---

## 5. The per-feature loop

For each feature (or tight group):

1. **Read** its atlas entries (`python3 -c "…"` over `features.json`) and the legacy code they cite.
2. **Look at the live site** with a throwaway Playwright script in your scratchpad (or `scripts/_x.mjs`, deleted
   before commit). Set the English interface for comparisons:
   ```js
   await ctx.addCookies([{ name: 'interfaceLang', value: 'english', domain: 'www.sefaria.org', path: '/' }]);
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
7. **Run everything**, update the atlas and the feature's rebuild status (§4), commit.

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

## 7. The plan → `docs/reader-future/LAUNCH_PLAN.md`

Replaced on 2026-11-10. Phases 0–6 of the old plan are done or folded into the launch plan's workstreams; Phase 7's "ask before
starting" questions were answered by the owner (LAUNCH_PLAN §4, DECISIONS.md: Voices is out of scope, 2026-11-10). The remaining
work per feature is the `partial` and `todo` entries of `rebuild-status.json`; LAUNCH_PLAN workstream G works that list.

## 8. Known gaps → `rebuild-status.json`

Every gap this section listed is now an atlas status with a note once `tools/apply_2026_11_10_f-atlas.py` has run (e.g. Compare
Text: SHL-037/038, CON-066, todo; extended notes: SHL-055, VER-021, todo; segment-number collisions: TXD-046, done). `npm run features:coverage -- --status` prints the table by area.

## 9. When to stop and ask

- Anything that sends data to Sefaria on the user's behalf (feedback, notes, sheets, account actions).
- Auth / sign-in design, deployment, pushing to a remote.
- When the live site and the atlas disagree in a way that looks like a product decision rather than a bug.
- When parity would require copying something that is broken or inaccessible — record it, propose the fix, ask
  if it changes behaviour users rely on.
