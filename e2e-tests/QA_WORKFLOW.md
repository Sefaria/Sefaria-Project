# QA Workflow — Test Plans, Generated Tests, and Test Validation

> Process for maintaining a QA baseline without a dedicated QA team. Each
> user-facing story goes through five stages: plan → generate → validate →
> execute → maintain. The story developer owns all five, with one peer review
> gate on the plan and one on the generated code. First applied end-to-end on
> SC-30249 (mobile document-level scrolling); use that as the worked example.

---

## Stage 1 — Test plan from the spec

**Input:** the Shortcut story (background + acceptance criteria), the PR diff,
and the affected components' source.

**Output:** a test plan table with one row per case:

| Column | Rule |
| --- | --- |
| TC ID | `<surface>-###` (e.g. `MW-001` mobile web, `DW-001` desktop web). IDs are permanent — automated tests reference them 1:1. |
| Type | `New Feature` (tests the change itself) vs `Regression` (tests what the change must not break). This distinction drives Stage 3 validation. |
| Priority | P0 = core acceptance criteria + highest-risk regressions; P1 = secondary. |
| Steps / Expected | Concrete refs and URLs (e.g. `sefaria.org/Genesis.3.5`), observable outcomes. Note the implementation detail under test when known (e.g. "getLocalScrollTop() must read window scroll"). |

**Regression rows come from the diff, not the feature description.** SC-30249
changed shared TextColumn plumbing, so the plan needed a full desktop (DW)
regression section even though the story is mobile-only. Ask: "what code paths
does this diff touch that existing behavior depends on?"

**Human gate #1:** the developer + one peer review the *plan* before any test
is written. Reviewing 28 table rows takes minutes; reviewing 28 generated
tests without an agreed plan takes hours.

Store plans where the team agrees to look for them. Current convention:
Google Sheets linked from the Shortcut story. Preferred long-term: markdown in
`e2e-tests/test-plans/sc-<story>.md` so plans are diffable, reviewable in the
PR, and readable by agents.

## Stage 2 — Generate the automated tests

Generate Playwright specs from the plan with Claude Code, under the rules in
[CLAUDE.md](CLAUDE.md) (PageManager POM, `t()` timeouts, `goToPageWithLang`
entry, locator priority, read-the-React-source-first).

- **Test IDs match plan TC IDs 1:1** — `test('MW-004: …')`. The spec file
  header lists every plan case that is *not* automated and why.
- **Classify honestly.** A case emulation cannot observe stays manual. For
  SC-30249, the actual URL-bar collapse (MW-001/002) is real browser chrome —
  invisible to Playwright — so the spec automates the *mechanism* browsers key
  off (MW-003: document-level scroll + clean overflow on html/body) and the
  collapse itself is checked once on a physical phone.
- **Ground every locator in the component source** before writing it
  (`static/js/…`). Guessing locators is where generated tests rot first.
- Desktop cases go in the folder/config for their surface (`library/` etc.),
  mobile cases in `mobile web/` under `playwright.mobileweb.config.ts`.

## Stage 3 — Validate that the tests test the right thing

This replaces the departed QA team's judgment and is **not optional**. A
generated test that passes proves nothing until it has been shown to *fail*
in the right circumstances.

**3a. Negative control — run against an environment WITHOUT the change**
(preprod/production):

- `New Feature` tests **must fail** there. If one passes, it isn't testing the
  change. (SC-30249: all six document-scroll tests failed on preprod — correct.)
- `Regression` tests **must pass** there. That proves the locators, waits, and
  helpers work, independent of the feature. (SC-30249: 7/7 DW tests passed on
  preprod.)

**3b. Positive control — run against an environment WITH the change** (branch
cauldron, or local server after `npm install && npm run build`):

- Everything should pass. A failure here is either a test bug (fix the test —
  probe the live DOM before guessing) or a **real product bug the plan just
  caught** — file it against the story. (SC-30249: MW-004 exposed that
  infinite-scroll-down never fires in window-scroll mode — a genuine
  regression in the branch, caught before merge.)

**3c. For P0 new-feature tests, one mutation check:** temporarily revert the
key line of the fix (or its CSS rule), confirm the test fails, restore. This is
the strongest evidence a test guards the behavior and not the DOM incidentals.

Record the validation outcome (which controls ran, what failed where) in the
PR description next to the test-plan link.

**3d. Data-shaped assertions** get verified against the Sefaria API first —
see CLAUDE.md §2A.

## Stage 4 — Execute and gate

- **Before merge:** run the story's suites against the branch cauldron
  (`SANDBOX_URL=https://www.<cauldron>.cauldron.sefaria.org`). All plan rows
  marked automated must pass; manual rows get checked off in the plan by the
  developer (for mobile stories: on a real device — see the story for the
  LAN `runserver 0.0.0.0:8000` tip).
- **Release gate:** the `Sanity/` suite plus the affected surface's suites
  against staging/preprod, as today.
- Update each plan row's Status column (Pass / Fail / Automated / Manual-Pass)
  before moving the story to done.

## Stage 5 — Maintain

- New-feature tests become regression tests the moment the story merges; they
  stay in the suite.
- Flakes are fixed, not retried into submission and not "fixed" by capping
  workers (CLAUDE.md §2.20).
- Throwaway `__research__` specs and scratchpad validation scripts are never
  committed.
- When a POM method's locator breaks, fix the page object — specs don't change
  unless the *plan* changes.

---

## Worked example — SC-30249

| Artifact | Location |
| --- | --- |
| Story / spec | https://app.shortcut.com/sefaria/story/30249 |
| Test plan (28 cases) | Google Sheet linked from the story |
| Mobile spec (10 automated MW cases) | [mobile web/reader-scroll.spec.ts](mobile%20web/reader-scroll.spec.ts) |
| Desktop regression spec (7 DW cases) | [library/reader-scroll-desktop.spec.ts](library/reader-scroll-desktop.spec.ts) |
| Shared POM | [pages/readerScrollPage.ts](pages/readerScrollPage.ts) (`pm.onReaderScroll()`) |
| Validation result | DW 7/7 pass on preprod (3a); MW mechanism tests fail on preprod (3a); 18/20 checks pass on local fixed build (3b); MW-004/006 caught a real infinite-scroll-down regression (3b) |
