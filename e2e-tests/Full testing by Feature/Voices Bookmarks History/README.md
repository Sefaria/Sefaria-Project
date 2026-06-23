# Voices Bookmarks & History — E2E Tests

End-to-end tests for **bookmarking Source Sheets on the Voices module**, the **/saved** list, and the **/history** list (`voices.<sandbox>`). Covers test IDs **VBM-001 → VBM-010** from `Voices_Module_Bookmarks_History_Test_Plan - Bookmarks.csv`.

**10 active tests, all passing**, stable across repeated runs at full parallelism (8 workers).

---

## 1. What it tests

| Spec file | Test IDs | Surface |
| --- | --- | --- |
| [sheet-page-bookmarks.spec.ts](sheet-page-bookmarks.spec.ts) | VBM-001, 003, 004 (logged in), 009 (logged out) | The bookmark control in a sheet's 3-dot **Options** menu |
| [saved-page.spec.ts](saved-page.spec.ts) | VBM-005, 006, 008, 010, 007 (persistence) | The **/saved** list — inline bookmark icon, ordering, navigation, display, cross-session persistence |
| [history-page.spec.ts](history-page.spec.ts) | VBM-002 | Bookmarking from a **/history** row (twin of VBM-005) |

### Per-test detail

| Test | What it asserts |
| --- | --- |
| **VBM-001** | Open a sheet → 3-dot **Options** → **Save** → confirmation modal reads "Saved sheet." → the sheet then appears on `/saved` with a filled bookmark icon, correct title, and author |
| **VBM-002** | Seed an unsaved `/history` row → its inline bookmark icon is outline → click it → flips to filled → the sheet appears on `/saved`. The `/history` twin of VBM-005 (same `SheetBlock`/`SaveButton`) |
| **VBM-003** | On page load (no interaction beyond opening the menu): a *saved* sheet's menu shows a **filled** icon + "Remove"; an *unsaved* sheet shows an **outline** icon + "Save" |
| **VBM-004** | On a saved sheet, **Options → Remove** → modal reads "Sheet no longer saved." → the sheet is gone from `/saved` |
| **VBM-005** | On `/saved`, clicking a row's inline bookmark icon flips it to the outline state; after a refresh the row is removed from the list |
| **VBM-006** | Bookmark sheets A → B → C (spaced so server `time_stamp`s differ) → on `/saved` they appear newest-first: C, then B, then A (asserted as *relative* order, see §4) |
| **VBM-007** | Bookmark in one browser context; open a **second, independent** context for the same account → the bookmark is still on `/saved`. Proves bookmarks are server-side and survive a new session |
| **VBM-008** | Clicking a `/saved` row's title link navigates to the correct `/sheets/<id>` and the sheet's title renders |
| **VBM-009** | **Logged out**: clicking **Save** in the Options menu opens the sign-up prompt ("Want to return to this text?"); no save modal appears and nothing is silently bookmarked |
| **VBM-010** | `/saved` shows the correct, non-blank, non-"undefined" title **and** author for bookmarks from different authors |

---

## 2. Running

```bash
# Whole suite (Chromium)
npx playwright test --project=chrome-voices-bookmarks

# One test by ID
npx playwright test --project=chrome-voices-bookmarks -g "VBM-006"

# UI / debug
npx playwright test --project=chrome-voices-bookmarks --ui
npx playwright test --project=chrome-voices-bookmarks --debug

# Cross-browser
npx playwright test --project=firefox-voices-bookmarks
npx playwright test --project=safari-voices-bookmarks

# Slow environment
TIMEOUT_MULTIPLIER=2 npx playwright test --project=chrome-voices-bookmarks
```

Projects (`chrome/firefox/safari-voices-bookmarks`) are defined in [`playwright.config.ts`](../../../playwright.config.ts) with `baseURL = MODULE_URLS.EN.VOICES`. Current pass rate: **10 passed / 0 failed**, stable across repeated runs at full parallelism (8 workers).

---

## 3. `/history` — how it works (and a transient blank to know about)

`voices.sefaria.org/history` and `/saved` are the same component (`UserHistoryPanel.jsx`): both render a `.savedHistoryList` of `SheetBlock` rows into the reader app. `showHistory()` / `showSaved()` are identical (`setSinglePanelState({menuOpen})`), so once the page renders, the row markup and the inline `.saveButton` behave the same on both.

Two `/history`-specific facts shaped the test:

- **History keeps duplicate rows per sheet.** `dedupeItems` (UserHistoryPanel.jsx) only collapses *consecutive* same-sheet entries, so repeated views of one sheet leave several rows. All `/history` POM helpers therefore target `.first()` (the newest row); the `/saved` list is deduped server-side and stays unique.
- **History recording is timed.** A real view fires `saveLastPlace` on mount, plus a **3-second** scroll-intent re-record (`checkIntentTimer`, ReaderApp.jsx — the "look at it for >3s" behavior). To get a deterministic, unsaved row to act on, VBM-002 seeds one via the same endpoint the reader uses (`POST /api/profile/sync`, `seedSheetHistory`) instead of relying on dwell timing or read-after-write propagation.

> **Transient blank.** While building this suite, `/history` intermittently rendered a blank page (empty `#s2`) under heavy concurrent load against the same account, even though the client store was populated. It has since rendered reliably across many runs (full-load, `load`, and `networkidle`; all wait modes; 10/10 at full parallelism). If `/history` ever shows blank again, suspect a transient server/SSR hiccup under load rather than a code path difference — `/saved` and `/history` share the same render path.

---

## 4. Design decisions & gotchas

### Shared server-side state → disjoint sheets + relative assertions

The QA account's saved list is **real server-side state shared by every parallel worker**. Two consequences shaped the suite:

- **Each test owns a disjoint set of public sheets** ([test-sheets.ts](test-sheets.ts)) so concurrent tests never collide on the same item. All ids were verified `status: "public"` + HTTP 200 on Voices.
- **Assertions are existence/relative, never absolute.** VBM-006 asserts the *relative* order of its three sheets (`expectSavedRelativeOrder`), tolerating other entries a concurrent worker may interleave. No test asserts an exact list length or absolute position.
- **Every test cleans up after itself** in `afterEach` (or a `finally`) via `clearSavedSheets`, leaving the account as it was found.

### The bookmark control is in the 3-dot menu, not a standalone icon

The CSV describes a "flag/ribbon icon near the title". On the current Voices sheet reader it lives in the **Options** (3-dot) dropdown as a **Save/Remove** item (source: [`SheetContent.jsx`](../../../../Sefaria-Project-Master/static/js/sheets/SheetContent.jsx) → `<SheetOptions editable={false}>` → [`SheetOptions.jsx`](../../../../Sefaria-Project-Master/static/js/sheets/SheetOptions.jsx)). Clicking it opens a `SaveModal` ([`SheetModals.jsx`](../../../../Sefaria-Project-Master/static/js/sheets/SheetModals.jsx)) that toggles the save and reports "Saved sheet." / "Sheet no longer saved." The page has **three** `.headerDropdownMenu` wrappers (module switcher, user menu, sheet options); the POM scopes to the one containing the language-invariant ellipses icon.

### Icon state is read from the `<img src>`, not the label

`bookmark-filled.svg` = saved, `bookmark.svg` = not saved (source: `getSaveButtonImage` in [`Misc.jsx`](../../../../Sefaria-Project-Master/static/js/Misc.jsx)). These are interface-language-invariant, so assertions key off `src` (per [CLAUDE.md §2.15](../../CLAUDE.md)). The "Save"/"Remove" label is checked too, but only because this suite is English-only.

### `/saved` inline bookmark icon is hover-gated

`.savedHistoryList .saveButton` is `visibility: hidden` until the row is hovered (`.savedHistoryList .story:hover .saveButton`, s2.css). `clickSavedEntrySaveButton` hovers the row before clicking. Attribute assertions (`toHaveAttribute('src', …)`) work regardless of visibility, so state reads don't need the hover.

### Don't reopen the Options menu right after the save modal

Confirm a save via the modal message and then via `/saved` — do **not** close the modal and reopen the dropdown to re-read the icon. That sequence proved flaky (the dropdown's focus/Escape handling races with the `<dialog>` close). VBM-003 reads the menu's icon state on a fresh page load instead, where no modal is involved.

### Preconditions are seeded via the real API, then the page is reloaded

Setup/teardown use the same call the UI uses (`Sefaria.toggleSavedItem` → `POST /api/profile/sync`) because the save backend **is** the feature under test and can't be mocked. The dropdown's Save item computes its state at React render time, so after seeding state the sheet is **reloaded** so the rendered menu reflects it.

---

## 5. Source-of-truth React components

| Surface | File |
| --- | --- |
| Sheet-page Options menu + Save item | [`sheets/SheetOptions.jsx`](../../../../Sefaria-Project-Master/static/js/sheets/SheetOptions.jsx), [`sheets/SheetContent.jsx`](../../../../Sefaria-Project-Master/static/js/sheets/SheetContent.jsx) |
| Save confirmation modal | [`sheets/SheetModals.jsx`](../../../../Sefaria-Project-Master/static/js/sheets/SheetModals.jsx) (`SaveModal`, `GenericSheetModal`) |
| `SaveButton` (inline icon) + sign-up prompt | [`Misc.jsx`](../../../../Sefaria-Project-Master/static/js/Misc.jsx) (`SaveButton`, `SignUpModal`) |
| `/saved` & `/history` list | [`UserHistoryPanel.jsx`](../../../../Sefaria-Project-Master/static/js/UserHistoryPanel.jsx), row markup in [`Story.jsx`](../../../../Sefaria-Project-Master/static/js/Story.jsx) (`SheetBlock`, `SaveLine`) |
| Save API | [`sefaria/sefaria.js`](../../../../Sefaria-Project-Master/static/js/sefaria/sefaria.js) (`toggleSavedItem`, `getSavedItem`) |
| Server views/routes | [`reader/views.py`](../../../../Sefaria-Project-Master/reader/views.py) (`saved_content`, `user_history_content`) |

---

## 6. Related files

- [`pages/voicesBookmarksPage.ts`](../../pages/voicesBookmarksPage.ts) — the page object (`pm.onVoicesBookmarks()`)
- [`pages/pageManager.ts`](../../pages/pageManager.ts) — `onVoicesBookmarks()` registered here
- [test-sheets.ts](test-sheets.ts) — disjoint public-sheet assignments per test
- [`playwright.config.ts`](../../../playwright.config.ts) — `chrome/firefox/safari-voices-bookmarks` projects
- [`CLAUDE.md`](../../CLAUDE.md) — house rules
- [`Full testing by Feature/Voices Topics/README.md`](../Voices%20Topics/README.md) — closest stylistic precedent
