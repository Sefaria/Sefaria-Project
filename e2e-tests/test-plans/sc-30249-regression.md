# SC-30249 — Regression Test Plan

> **Story:** Mobile web: stop preventing mobile browsers from maximizing screen real estate
> **Branch:** `chore/sc-30249/mobile-web-stop-preventing-mobile-browsers2`
> **Scope of this document:** Stage 1 (plan) per [QA_WORKFLOW.md](../QA_WORKFLOW.md), **regression rows only** —
> "what this diff must not break." The new-feature rows (MW-001…MW-016, DW-001…DW-012)
> live in the story's original test-plan sheet and are indexed in §6 so nothing is
> duplicated.
> **Status:** draft — needs Human Gate #1 (developer + one peer) before any test is generated.

---

## 1. Why these rows exist (diff → risk)

Regression rows come from the **diff**, not the feature description. The diff is 3 source
surfaces; every row below traces to one of these hooks.

| Hook | Change | Why it is a regression risk |
| --- | --- | --- |
| **R1** | `#s2:has(.readerApp.singlePanel)` → `position: static; height: auto; min-height: 100vh` ([s2.css:15765](../../static/css/s2.css)) | Removes the fixed app shell on **every mobile page**, not just the reader. `.readerApp.singlePanel` is the app root for all mobile routes. |
| **R2** | `overflow-x: hidden` then `overflow-x: clip` on `#s2` | New clipping context on mobile. On Safari < 16 (no `clip`) the `hidden` fallback applies, which forces `overflow-y: auto` and turns `#s2` back into a scroll container — defeating the feature and possibly breaking inner scrolling. |
| **R3** | `.readerApp.singlePanel > .header .headerInner { position: fixed; top: 0 }` | Header leaves flow on all mobile pages. Content underlap / double-stacking risk everywhere, not only the reader. |
| **R4** | `.readerControlsOuter { position: sticky; top: 0; z-index: 1001 }` | Can overlap or be overlapped by the now-fixed header. |
| **R5** | `.textList { position: fixed; height: 54vh; bottom: 0; z-index: 1002 }` (+ `.fullPanel` 100vh) | Connections overlay geometry changed from in-flow to fixed. Scroll-bleed and stacking risk. |
| **R6** | `.readerNavMenu`, `.homeFeedWrapper` → `position: static; height: auto`; their `.content` → `overflow-y: visible` | `.readerNavMenu` is the container for **search, topics, TOC, book pages, profile, notifications, history, collections** (see `SearchPage.jsx:29`, `TextsPage.jsx:27`, `TopicPage.jsx:557`, `UserProfile.jsx:263`, …). Every one of those surfaces changed scroll model. |
| **R7** | `.readerPanel`, `.readerContent`, `.textColumn` → `height: auto`, `overflow: visible` | Applies to sheet reader / sheet editor panels too, which have their own height assumptions. |
| **R8** | Scroll listener target is chosen once in `componentDidMount` ([TextColumn.jsx:43](../../static/js/TextColumn.jsx#L43)) from `!this.props.multiPanel`; nothing re-binds it | If `multiPanel` flips mid-session (desktop window resize, tablet rotation across the 843 px breakpoint), the handler stays bound to the wrong target. |
| **R9** | Desktop `windowHeight` changed from `$container.outerHeight()` → `this.getClientHeight()` (= `node.clientHeight`) ([TextColumn.jsx:302](../../static/js/TextColumn.jsx#L302)) | `clientHeight` excludes border and scrollbar; `outerHeight()` includes border. The infinite-scroll-down trigger threshold shifted on **desktop**. |
| **R10** | Highlight detection moved from jQuery `.offset()` to `getBoundingClientRect()` (both layouts) | Shared code path; affects which segment the header/URL reports on desktop as well as mobile. |
| **R11** | `setScrollTop` on mobile is `window.scrollTo(0, getNodeDocOffsetTop() + target)`, while `setInitialScrollPosition` still computes its target from `$highlighted.position().top` ([TextColumn.jsx:233](../../static/js/TextColumn.jsx#L233)) — `position()` is relative to the **offsetParent** (`#panelWrapBox`, made `position: relative` by the new CSS), not to `.textColumn` | Potential double-count of the gap between `#panelWrapBox` and `.textColumn`, i.e. deep links landing off-target or under the fixed header. **Hypothesis to test, not a confirmed defect.** |
| **R12** | Mobile early-return guard compares `node.offsetHeight` against `window.innerHeight` ([TextColumn.jsx:296](../../static/js/TextColumn.jsx#L296)) | For any text shorter than the viewport, `adjustInfiniteScroll` and `setInitialScrollPosition` both bail out entirely. Short texts are a distinct code path now. |
| **R13** | Whole CSS block is gated on `:has()` | Browsers without `:has()` (Safari < 15.4, Chrome < 105) silently keep the old behavior. Verify that's a clean fallback, not a half-applied layout. |

---

## 2. Series A — Desktop reader (multiPanel) must not regress

Runs under `playwright.config.ts`, folder `library/`. Extends the existing DW set (see §6).

| TC ID | Type | Pri | Hook | Steps / Expected | Method |
| --- | --- | --- | --- | --- | --- |
| DW-013 | Regression | P0 | R9 | Open `/Genesis.1` desktop. Scroll `.textColumn` to the bottom in increments. **Expected:** Genesis 2 loads *before* the column reaches a hard stop; user never sees a dead bottom. Record the `scrollTop` at which the load fires and compare to master (threshold shift from the `outerHeight → clientHeight` swap must not exceed the border/padding delta). | Automated |
| DW-014 | Regression | P0 | R10 | Open `/Genesis.1` desktop. Scroll until a known segment (e.g. `Genesis 1:15`) sits at the vertical middle of the column. **Expected:** header ref and URL report `Genesis.1`, and the `.invisibleHighlight` segment is the one at the middle — not one screen off. | Automated |
| DW-015 | Regression | P1 | R12 | Open a text shorter than the column viewport (e.g. `/Psalms.117`, 2 verses) on desktop. **Expected:** page renders, no infinite-scroll attempts, no console errors, no scroll jitter. Early-return path (`getScrollHeight() <= getClientHeight()`) exercised. | Automated |
| DW-016 | Regression | P1 | R1, R8 | ~~Open a second text panel~~ → **revised at Stage 2:** open `/Genesis.1`, open the connections sidebar, scroll the column. **Expected:** the column's `scrollTop` advances while `window.scrollY` stays 0. *There is no documented URL or POM path for a second text panel in this suite; guessing one is how generated tests rot (CLAUDE.md rule 10), so the row was narrowed to the invariant it actually cares about. Second-text-panel coverage stays open as a follow-up.* | Automated |
| DW-017 | Regression | P1 | R9, R10 | Open `/Genesis.1` desktop, scroll to mid-chapter, then toggle layout (Continuous ↔ Segmented) or change font size. **Expected:** reading position preserved within ~1 screen (`restoreScrollPositionByPercentage` via `prevScrollPercentage`). | Automated |
| DW-018 | Regression | P1 | R10 | Open `/Genesis.1` + connections panel, scroll to mid-chapter, close the connections panel. **Expected:** the same segment is still on screen. | Automated |
| DW-019 | Regression | P2 | R8 | Open `/Genesis.1` on a desktop viewport, then resize the browser below 843 px **without reloading**, scroll, then resize back. **Expected:** reader scrolls in both states, no console errors, no frozen scroll. This is the direct probe for the never-rebound listener. | Automated |
| DW-020 | Regression | P1 | R10 | Repeat DW-014 with Hebrew interface on the `.org.il` domain (RTL). **Expected:** identical highlight/URL tracking; no horizontal overflow. | Automated |
| DW-021 | Regression | P2 | R7 | Open a source sheet on desktop, scroll to the end. **Expected:** unchanged — `.readerContent`/`.readerPanel` rules are singlePanel-scoped and must not apply. | Automated |

## 3. Series B — Mobile reader (singlePanel) regressions

Runs under `playwright.mobileweb.config.ts`, folder `mobile web/`.

| TC ID | Type | Pri | Hook | Steps / Expected | Method |
| --- | --- | --- | --- | --- | --- |
| MW-017 | Regression | P0 | R12 | Open a text shorter than the viewport (`/Psalms.117`) on mobile. **Expected:** renders correctly, no console errors, header ref correct, and *either* the next section loads on scroll *or* the page legitimately has nothing to scroll — but not a broken half-state. Note: MW-003's `docTallerThanViewport` assertion does not hold here, so this needs its own assertions. | Automated |
| MW-018 | Regression | P0 | R5 | Tap a segment to open the connections overlay. **Expected:** overlay pins to the bottom at 54vh, above all other chrome; the document behind does **not** scroll while the overlay is open (no scroll-bleed); expanding to `fullPanel` covers the viewport; Back restores the prior scroll position, not the top. | Automated |
| MW-019 | Regression | P1 | R3, R4 | Load `/Genesis.1` on mobile at `scrollY = 0`. **Expected:** the fixed header and the sticky reader controls do not overlap each other, and the first segment is fully visible — not hidden behind either. | Automated |
| MW-020 | Regression | P1 | R11 | Scroll to mid-chapter on mobile, change font size / toggle layout. **Expected:** reading position preserved within ~1 screen. | Automated |
| MW-021 | Regression | P0 | R11 | Deep-link to a segment far down a long chapter (e.g. `/Genesis.24.40`). **Expected:** the highlighted segment is in the viewport **and not underneath the fixed header / sticky controls** — measure `rect.top >= header height`, not merely `>= 0`. This is the direct probe for the `position()`-vs-`getNodeDocOffsetTop()` double-count in R11. | Automated |
| MW-022 | Regression | P1 | R8 | On a tablet-width device (iPad, ~810×1080), load the reader in portrait, rotate to landscape and back, crossing 843 px. **Expected:** scrolling works in both orientations; header/controls re-pin; no console errors. | Manual (device). The emulated half — viewport resize across 843 px in one session — is automated as **DW-019**. |
| MW-023 | Regression | P1 | R2 | Load the reader on iOS Safari 15.x (no `overflow-x: clip`). **Expected:** the page still scrolls end-to-end and nothing is double-clipped. The URL-bar collapse is *expected not to work* on this build — record it as accepted, not as a bug. | Manual (device / BrowserStack) |
| MW-024 | Regression | P2 | R13 | Load the reader in any browser without `:has()` support. **Expected:** clean fall-back to the pre-change fixed-shell layout; no partially applied styles. | Manual |

## 4. Series C — Mobile non-reader surfaces (the largest uncovered gap)

`.readerNavMenu` and `.homeFeedWrapper` are re-flowed by this diff (R6), and `#s2` loses its
fixed shell on **every** mobile route (R1). None of these surfaces have coverage in the
current SC-30249 specs. New series prefix `MWS-` ("mobile web surface"); all run under
`playwright.mobileweb.config.ts`.

| TC ID | Type | Pri | Hook | Steps / Expected | Method |
| --- | --- | --- | --- | --- | --- |
| MWS-001 | Regression | P0 | R1, R6 | `/texts` on mobile: scroll to the bottom of the category list. **Expected:** the last category and the footer are reachable; no content clipped below the fold; no horizontal overflow. | Automated |
| MWS-002 | Regression | P0 | R6 | Book page `/Genesis` on mobile: scroll the chapter grid to the end and tap the last chapter. **Expected:** full list reachable and tappable; navigation works. | Automated |
| MWS-003 | Regression | P0 | R6 | Search results on mobile: run a search, scroll results to the end (paging/infinite), open the filter panel and scroll it. **Expected:** both the results list and the filter panel scroll independently and completely. | Automated |
| MWS-004 | Regression | P1 | R6 | A topic page (`/topics/torah` — the slug the Library Topics suite already uses) on mobile: scroll to the bottom. **Expected:** full content reachable; sticky sub-nav (if any) behaves. | Automated |
| MWS-004b | Regression | P1 | R6 | *(added at Stage 2 — the landing page and a topic page are different components)* `/topics` landing on mobile: scroll to the bottom. | Automated |
| MWS-005 | Regression | P0 | R1, R6 | **Revised at Stage 2:** `.homeFeedWrapper` is `UserStats` — the Torah Tracker page (`/torahtracker`, UserStats.jsx:53, ReaderApp.jsx:1317), not a "home feed". Logged-in mobile: scroll it to the end. **Expected:** `.homeFeedWrapper` computes `position: static`; all content reachable. | Automated (logged-in) |
| MWS-006 | Regression | P1 | R6 | Logged-in mobile `/saved` and `/history` (both **Voices**-module surfaces rendered by `UserHistoryPanel`): scroll each to the end. **Expected:** all content reachable; no fixed-height clipping. *Profile and notifications remain unautomated — profile needs a stable slug for the test account.* | Automated (saved + history); Manual (profile, notifications) |
| MWS-007 | Regression | P0 | R7 | Mobile sheet reader: scroll a long sheet to the end. Then open the sheet editor, focus a text block and type. **Expected:** sheet scrolls fully; the on-screen keyboard does not leave the fixed header floating over the caret; the page does not jump on focus. | Automated (reader) + Manual (editor, real device) |
| MWS-008 | Regression | P0 | R1, R2, R3 | Mobile hamburger drawer: open, scroll it, close. **Expected:** drawer renders above the document, is not clipped by `overflow-x: clip` on `#s2`, scrolls internally, and the page behind does not lose its scroll position on close. Existing `HAM-*` suite must stay green. | Automated (re-run `mobile web/hamburger-menu.spec.ts` as the gate) |
| MWS-009 | Regression | P1 | R1, R3 | Mobile overlays: cookies banner, sign-up modal, login redirect, GuideOverlay. **Expected:** each positions correctly with `#s2` static — no modal stranded off-screen or scrolled away with the document. | Automated |
| MWS-010 | Regression | P1 | R1 | Navigate mobile: reader → `/texts` → back → reader. **Expected:** no stale `window.scrollY` leaking between surfaces (landing mid-page on a freshly opened menu). | Automated |
| MWS-011 | Regression | P2 | R1, R6 | Mobile Voices module (`voices.<sandbox>`): home, a sheet, a topic. **Expected:** unchanged scrolling — confirm the singlePanel rules don't misbehave on the second module. | Automated |

## 5. Series D — Device / browser matrix (manual, Stage 4)

The feature's *point* — URL-bar collapse — is real browser chrome and is unobservable under
emulation. These rows are the physical-device pass; run once before merge.

| TC ID | Type | Pri | Steps / Expected |
| --- | --- | --- | --- |
| BR-001 | New Feature | P0 | iOS Safari (current): scroll the reader down. URL bar collapses; scroll up, it returns. No content jump when it collapses. |
| BR-002 | Regression | P0 | iOS Safari 15.x: reader scrolls end-to-end (R2 fallback path). URL-bar collapse not expected. |
| BR-003 | New Feature | P0 | Chrome Android (current): as BR-001, plus the bottom nav bar. |
| BR-004 | Regression | P1 | Firefox Android: reader scrolls; no layout breakage. |
| BR-005 | Regression | P2 | Samsung Internet: reader scrolls; no layout breakage. |
| BR-006 | Regression | P1 | iPad Safari: portrait/landscape rotation across 843 px (pairs with MW-022). |
| BR-007 | Regression | P1 | On each of BR-001/BR-003: repeat one row from Series C (e.g. MWS-003 search) to confirm non-reader surfaces behave on real chrome. |

---

## 5a. Series E — adopted from the story's original plan (2026-07-28)

Six rows the original 28-case sheet specified but never automated. They cover behavior none of
Series A–D reaches, so they were implemented rather than merely indexed in §6.

| TC ID | Type | Pri | Steps / Expected | Method | Result |
| --- | --- | --- | --- | --- | --- |
| DW-006b | Regression | P0 | Open `/Genesis.1`, tap a segment, drill category → commentator → **Open**, which mounts a second `.textColumn` and pushes `p2=`. **Expected:** both panels scroll independently; `window.scrollY` stays 0. *Restores the original DW-006's full intent; DW-016 keeps the narrower sidebar-only variant. The UI path was probed live before being written.* | Automated | **Pass** |
| DW-007 | Regression | P0 | Open the connections sidebar on `Genesis 1:1`, scroll the column. **Expected:** the URL advances to a later segment and the per-category connection counts change with it. *Counts are computed for the highlighted segment — verified live: 1:1 → "Commentary (698)", 1:12 → "Commentary (82)" — making them the user-visible proof that the sidebar follows `adjustHighlightedAndVisible`, the function this diff rewrote.* | Automated | **Pass** |
| DW-008 | Regression | P1 | Scroll mid-chapter, resize the window narrower, then wider. **Expected:** reading position preserved. *`layoutWidthChanged` is the **only** trigger for `restoreScrollPositionByPercentage` (TextColumn.jsx:107-109), which calls both `getScrollHeight()` and `setScrollTop()` — two functions this diff rewrote. No other row in any series reaches that path.* | Automated | **Pass** |
| DW-010 | Regression | P1 | Scroll `/Genesis.1` until the URL carries a deep ref, navigate to `/Exodus.1`, press Back. **Expected:** reading position restored. | Automated | **Pass** |
| MW-012 | Regression | P1 | Scroll `/texts` on mobile, open the nav drawer, attempt to scroll. **Expected:** the surface behind stays put. *The original row said "the text column behind", but a live probe showed the mobile **reader renders no `.headerInner` and no hamburger** — only `.readerControlsOuter` — so the drawer is only reachable from a nav surface. Same invariant, on a page where it runs. See §11.6.* | Automated | **Pass** |
| MW-013 | Regression | P1 | Mobile twin of DW-010. **Expected:** position restored. *On mobile the saved position is a window offset rather than a column `scrollTop` — the substitution this diff made.* | Automated | **Pass** |

Rows from the original plan deliberately **not** adopted: DW-004 (near-duplicate of DW-003 — same
restore mechanism, different chapter), DW-012 (covered in substance by DW-017 / MW-020), MW-014
(rotation — manual, tracked as MW-022).

## 6. Already covered — do not duplicate

| Existing ID | Covers | File |
| --- | --- | --- |
| MW-003 | Document is the scroll container (URL-bar collapse mechanism) | [mobile web/reader-scroll.spec.ts](../mobile%20web/reader-scroll.spec.ts) |
| MW-004, MW-005 | Infinite scroll down / up on mobile | same |
| MW-006 | Header + URL track visible section (mobile) | same |
| MW-007 | Deep link scrolls to highlighted segment (mobile) | same |
| MW-008, MW-009 | Connections overlay open / close | same |
| MW-010, MW-015 | No horizontal wobble (EN + RTL) | same |
| MW-011 | Top chrome pinned | same |
| MW-016 | Book title at top, no phantom loader | same |
| MW-001, MW-002 | URL-bar collapse itself — **manual**, superseded by BR-001/BR-003 here | — |
| MW-012, MW-013, MW-014 | Hamburger drawer scroll / back-forward restoration / rotation — **unautomated in the original plan**; MWS-008 and MW-022 below pick up the first and third | — |
| DW-001 … DW-003, DW-005, DW-006, DW-009, DW-011 | Desktop scroll regression baseline | [library/reader-scroll-desktop.spec.ts](../library/reader-scroll-desktop.spec.ts) |
| DW-004, DW-007, DW-008, DW-010, DW-012 | Unautomated in the original plan (connections sync, resize, back/forward, language switch) — DW-019 here covers the resize case properly | — |

---

## 7. Known open defect (must close before this plan can pass)

`adjustInfiniteScroll`'s down-branch compares `$lastText.position().top`
([TextColumn.jsx:303](../../static/js/TextColumn.jsx#L303)) — document-relative and therefore
**constant while the window scrolls** — against `getClientHeight() + 80`
([TextColumn.jsx:311](../../static/js/TextColumn.jsx#L311)). The up-branch works because it uses
`getLocalScrollTop()`. The spec file header records MW-004 / MW-006 as failing for this reason
as of 2026-07-15, and the code still reads `position().top` on the current branch — re-confirm
at Stage 3b rather than assuming.

**Consequence for this plan:** MW-004, MW-006, and DW-013 all depend on the down-branch. Fix
direction is to measure the last text viewport-relative (`getBoundingClientRect().bottom`) when
`isWindowScroll()`. Until then, Series A/B cannot reach a clean pass.

---

## 8. Validation protocol (Stage 3 — not optional)

Every row above is typed `Regression`, which sets the expected control outcomes:

**3a. Negative control — run against preprod/production (no change):**
regression rows **must pass**. A regression row that fails on preprod is testing the change,
not the baseline — re-type it as `New Feature` or fix the test. (Exceptions: MW-017…MW-024 and
MWS-001…MWS-011 assert behavior that is *unchanged in outcome* but reached by a different
mechanism, so they should pass on both sides. If one fails on preprod, the assertion is coupled
to the implementation — loosen it.)

**3b. Positive control — run against the branch cauldron or a local build:**
everything should pass. A failure is either a test bug or a real product bug filed against the
story. Expect §7 to bite here.

**3c. Mutation check for the P0 rows** (DW-013, DW-014, MW-018, MW-021, MWS-001, MWS-003,
MWS-005, MWS-007, MWS-008): temporarily revert the specific CSS rule or JS line the row guards,
confirm the row fails, restore.

Record which controls ran and what failed where in the PR description.

## 8a. Stage 3b positive control — run 2026-07-28

Environment: local `runserver` on the branch (`localhost:8000`), local Mongo, bundle verified to
contain `isWindowScroll`. Chromium / Pixel 5 for mobile.

| Suite | Result |
| --- | --- |
| `library/reader-scroll-desktop.spec.ts` | **16 / 16 pass** (DW-013…DW-021 all green) |
| `mobile web/reader-scroll.spec.ts` | **14 / 16 pass** — MW-017…MW-021 all green; the 2 failures are MW-004 / MW-006, the §7 defect |
| `mobile web/mobile-surfaces-scroll.spec.ts` | **11 / 12 pass** — MWS-006 blocked by the local environment, see below |

**§7 confirmed, still open.** MW-004 fails with `.textRange.basetext[data-ref="Genesis 2"]` never
attaching after 20 scroll passes to the document bottom — infinite-scroll-down does not fire in
window-scroll mode. MW-006 fails downstream of it. Unchanged since 2026-07-15.

**MWS-006 is environment-blocked, not a product failure.** It lands on "Log in to Sefaria":
the session cookie set for `localhost` is not sent to `voices.localhost`, because the two share
no registrable domain in Chromium's cookie model, so `fixCookieDomainsForCrossSubdomain` has
nothing to rewrite. It should pass on a cauldron. Related gap: `playwright.mobileweb.config.ts`
declares no `globalSetup`, so mobile runs never provision `auth_*.json` themselves — logged-in
mobile rows depend on a prior desktop-config run having written them.

**Six test defects the run caught and fixed** (each was the test being wrong, not the product):

| Row | What the run showed | Fix |
| --- | --- | --- |
| DW-015 | Column opens at `scrollTop ≈ 90` even on a two-verse text — `setInitialScrollPosition` scrolls to hide the top placeholder. "Short text" ≠ "shorter than its column". | Assert quietness (no window scroll, no runaway section loads, no errors) instead of `scrollTop === 0`. |
| DW-017 / MW-020 | `pm.onSourceTextPage().setContentLanguage()` targets `getByRole('button', {name: 'Toggle Reader Menu Display Settings'})`, which no longer exists — the toggle is a `<span class="readerOptions">` (Misc.jsx:1284). The method had no other callers, so it was already dead. | New `setSourceTranslationMode()` on the SC-30249 POM, anchored on `.readerOptions` + `input[value="…"]` (English-stable, per CLAUDE.md rule 15). Left the stale shared method alone — see §11. |
| DW-019 | Resizing past 843px never flips the layout. `multiPanel` is decided **server-side from the User-Agent** (reader/views.py:344) and never recomputed; ReaderApp's only resize listener sets the panel cap. | Row rewritten to pin what exists: the layout survives a resize and its scroller keeps working. **R8 downgraded** — see §11. |
| MWS-001 | Surfaces render trailing chrome below their last content item, so "visible once scrolled to the end" is the wrong assertion. | `expectReachableByScrolling()` — scroll the element into view, then assert it is in the viewport. |
| MWS-004b / MWS-011 | Scanning every descendant of `#s2` for hidden overflow reports design-intent clamps (`div.cardDescription` on /topics, `div#aboutCover` on Voices). Neither appears in the SC-30249 diff. | `expectNoClippedContent()` narrowed to the **ancestor chain** from the content root up to `#s2` — which is the actual R1/R6 risk. |
| MW-017 | On Pixel 5 (innerHeight 727) even a two-verse text yields a `.textColumn` taller than the viewport, so TextColumn's early-return guard never triggers for real texts. | Assert the user-visible contract, not the unreachable branch. **R12 downgraded** — see §11. |

**One pre-existing test defect fixed:** `tapSegmentToOpenConnections()` asserted
`toHaveClass(/highlight/)`, which is case-sensitive and so does **not** match
`invisibleHighlight` — the class actually applied. MW-008 and MW-009 were failing on it before
any of this work. Now matches `/invisibleHighlight|highlight/`, consistent with
`expectHighlightedSegmentInViewport`.

## 9. Execution

```bash
npx playwright test --project=chrome-library library/reader-scroll-desktop.spec.ts
```

```bash
npx playwright test --config=playwright.mobileweb.config.ts --project=chrome-mobile-library
```

```bash
npx playwright test --config=playwright.mobileweb.config.ts --project=mobile-sanity
```

## 9a. Generated artifacts (Stage 2 — done)

| Artifact | What it holds |
| --- | --- |
| [pages/mobileSurfacesPage.ts](../pages/mobileSurfacesPage.ts) (`pm.onMobileSurfaces()`) | New POM for the MWS series: `expectScrollsToEnd`, `expectNoClippedContent`, `expectNavMenuContentNotAScroller`, `expectReachableAtDocumentEnd`, `expectNotCoveredByTopChrome`. |
| [pages/readerScrollPage.ts](../pages/readerScrollPage.ts) | Extended with `expectNextSectionLoadsBeforeHardBottom`, `getSegmentRefAtViewportMiddle`, `getVisibleSegmentRefs`, `expectReadingPositionPreserved`, `expectConnectionsOverlayPinnedToBottom`, `expectTopChromeDoesNotOverlap`, `expectSegmentBelowTopChrome`, `expectActiveScrollerResponds`. |
| [library/reader-scroll-desktop.spec.ts](../library/reader-scroll-desktop.spec.ts) | DW-013 … DW-021 appended (16 tests total in the file). |
| [mobile web/reader-scroll.spec.ts](../mobile%20web/reader-scroll.spec.ts) | MW-017 … MW-021 appended (16 tests total in the file). |
| [mobile web/mobile-surfaces-scroll.spec.ts](../mobile%20web/mobile-surfaces-scroll.spec.ts) | MWS-001 … MWS-011 (12 tests, new file). |

**Load-bearing assertion:** `expectNoClippedContent()` walks every visible element inside `#s2`
and fails on any that hides more than 8px of its own overflow while taller than 150px — the
precise signature of "content the user can never reach because an ancestor is a fixed-height
clipper." That is the failure mode removing the app shell can cause on a surface whose CSS
assumed the shell, and it needs no per-surface locators. If Stage 3a surfaces a pre-existing
legitimate clipper, add it to that method's `IGNORED_SELECTORS` rather than loosening the
thresholds.

**Data verified via the Sefaria API** (CLAUDE.md §2A): sheet 5156 is `public` with 41 sources,
so it is genuinely taller than a phone viewport. `Psalms.117` (2 verses) is the short-text
fixture for the R12 early-return path.

## 11. Findings for the PR (not test bugs)

1. **R8 (never-rebound scroll listener) is a non-issue — downgrade P2 → informational.**
   `multiPanel` comes from the server's User-Agent check (reader/views.py:344) and is constant
   for the life of the page; the only way it changes is a fresh load, which re-runs
   `componentDidMount` with the right target. The CSS (`.readerApp.singlePanel`) and the JS
   (`isWindowScroll()`) therefore read the same constant and cannot disagree mid-session. This
   is good news for the diff and is now pinned by DW-019.

2. **R12 (short-text early-return guard) is effectively unreachable — downgrade P1 → P2.**
   On a phone the `.textColumn` is taller than the viewport even for the shortest text in the
   library, so `getScrollHeight() <= getClientHeight()` never holds for real content.

3. **`.noOverflowX` re-introduces the exact CSS trap the diff's own comment warns about.**
   `s2.css:451` sets `overflow-x: hidden`, which forces the other axis from `visible` to `auto` —
   the reason the SC-30249 block deliberately uses `clip` on `#s2`. Topic pages carry
   `.content.noOverflowX`, so their content div computes `overflow-y: auto`. It is harmless
   today only because that element's height is auto and it never overflows. Worth converting to
   `overflow-x: clip` with a `hidden` fallback, matching the new `#s2` rule.

4. **`pm.onSourceTextPage().setContentLanguage()` is dead and broken.** Its locator predates a UI
   change and it had zero callers. Left untouched here rather than silently rewriting a shared
   POM mid-task — worth deleting or repointing at `.readerOptions` in a follow-up.

5. **`playwright.mobileweb.config.ts` has no `globalSetup`.** Logged-in mobile tests silently
   depend on a prior desktop-config run to have written `auth_*.json`.

6. **The mobile reader renders no site header at all.** A live probe of `/Genesis.1` on a Pixel 5
   found no `.headerInner` and no hamburger button — only `.readerControlsOuter` (font size,
   translations). Two consequences: the diff's `.readerApp.singlePanel > .header .headerInner
   { position: fixed }` rule (R3) has no effect on the reader and only matters on nav surfaces;
   and any assertion pairing `.headerInner` with `.readerControlsOuter` is exercising only the
   latter on reader pages. MW-011 and MW-019 still hold — they pin the sticky controls — but
   their header half is vacuous there. R3 is genuinely tested by the MWS series, not the reader
   series.

7. **The original plan's MW-001 precondition is unsafe.** It permits "Chrome DevTools mobile
   emulation" for verifying URL-bar collapse. Emulation cannot observe real browser chrome, so
   that row would report a false pass on the story's single most important case. It must be a
   physical-device check (Series D, BR-001/BR-003).

## 10. Exit criteria

1. Every P0 row passes on the branch cauldron, and the §7 defect is fixed.
2. Every P1 row passes or has a filed, triaged ticket.
3. Series D (BR-001 … BR-007) checked off on physical devices by the developer.
4. The `@sanity` suite passes on both the desktop and mobile configs.
5. Every row's Status column is filled in before the story moves to done.
