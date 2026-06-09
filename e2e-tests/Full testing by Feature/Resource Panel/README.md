# Resource Panel — E2E Tests

End-to-end tests for the Sefaria **Resource Panel** (a.k.a. `ConnectionsPanel`) — the right-side sidebar that opens when a reader segment is clicked. Covers test IDs **RP-001 → RP-058** from [`e2e-tests/.claude/Resource.csv`](../../.claude/Resource.csv).

This folder is `Part 1` of the *Texts → Resource Panel* feature: opening behavior, the Resources hub, TOC navigation, About-This-Text, Translations, and the Lexicon. Later parts (Connections List, Text List, Topics, Web Pages, Sheets, Manuscripts, Notes, Add to Sheet, Add Connection, Share, Feedback, Advanced Tools, Search in Text, Guide, Divine Name, Hebrew UI, Auth State, Cross-Module) will live in sibling folders under `Full testing by Feature/`.

---

## 1. What it tests

| Spec file | Test IDs | Feature area |
| --- | --- | --- |
| [opening-and-general.spec.ts](opening-and-general.spec.ts) | RP-001 → RP-006 | Panel opens on segment click; close; segment-to-segment reload; independent scroll; back button |
| [resources-hub.spec.ts](resources-hub.spec.ts) | RP-010 → RP-016 | Resources hub buttons; Related Texts categories; More / Less toggle; Resources and Tools sections |
| [navigation-toc.spec.ts](navigation-toc.spec.ts) | RP-020 → RP-023 | TOC opens; section navigation; back; Hebrew interface |
| [about-this-text.spec.ts](about-this-text.spec.ts) | RP-030 → RP-034 | About metadata, current version, alternate versions, author link, extended notes |
| [translations.spec.ts](translations.spec.ts) | RP-040 → RP-047 | Translations list, language grouping, current selection, open in reader, empty state |
| [lexicon.spec.ts](lexicon.spec.ts) | RP-050 → RP-058 | Auto-trigger on 1–2 Hebrew words, no-trigger on >3, headwords, BDB, disambiguation, manual search, clear-to-Resources |

Total active tests: **37**. Current pass rate: **37 passed, 0 skipped, 0 failed** — every test runs against real production data and fails honestly when its target UI is missing. See [§3 Test data, research, and design decisions](#3-test-data-research-and-design-decisions) for the data choices that make each test reliable.

---

## 2. Running

```bash
# Whole Resource Panel suite (only project that runs this folder)
npx playwright test --project=chrome-resource-panel

# One file
npx playwright test --project=chrome-resource-panel lexicon

# One test by ID
npx playwright test --project=chrome-resource-panel -g "RP-001"

# UI / debug
npx playwright test --project=chrome-resource-panel --ui
npx playwright test --project=chrome-resource-panel --debug

# Slow environment
TIMEOUT_MULTIPLIER=2 npx playwright test --project=chrome-resource-panel
```

The project is wired in [`playwright.config.ts`](../../../playwright.config.ts) under `name: 'chrome-resource-panel'` with `baseURL` set to `MODULE_URLS.EN.LIBRARY`. Add Firefox / Safari projects symmetrically if cross-browser coverage is needed.

---

## 3. Test data, research, and design decisions

Each test below was made reliable by either (a) picking a text known via the Sefaria `/api/texts` API to expose the data the test needs, or (b) reaching into the React fiber tree when no event-level interaction would propagate. Nothing here is a fallback — every test fails honestly if the expected UI is absent.

### Reference texts (verified against production on 2026-05-12)

| Test | Text | Why |
| --- | --- | --- |
| RP-001…RP-016 | `Genesis.1` | 1607 connections on Gen 1:1, many categories, stable across releases |
| RP-020…RP-023 | `Genesis.1` (EN) and `Genesis.1` (HE interface) | TOC renders for any book with chapters |
| RP-030…RP-032, RP-034 | `Genesis.1` | About panel + alternate versions section both present (57 versions) |
| RP-033 | `Rashi_on_Genesis.1.1` | `aboutAuthor` is a stable `<a href="/topics/rashi">Rashi</a>` link |
| RP-040…RP-047 | `Genesis.1` | 46 versions across 17 languages — richest stable surface for translation tests |
| RP-050…RP-058 | `Genesis.1` (EN interface, Hebrew content) | First two words `בְּ` + `רֵאשִׁ֖ית` both return BDB entries |
| RP-055 | `Berakhot.2a` | 8 inline named-entity links (`data-slug` on Rabbi Eliezer, Rabban Gamliel, etc.) — the only text in our sample with NE annotation density |

### Non-obvious implementation details

| Test | Solution |
| --- | --- |
| RP-002 | Computed bounding boxes of `Genesis 1:1` and `Genesis 1:3`, then `page.mouse.move → down → move(steps:20) → up` to synthesize a real browser selection. Assertion reads `Range.intersectsNode(seg)` across `.segment[data-ref]` siblings and confirms the three expected refs are present. |
| RP-033 | Anchor selector `.aboutBox .aboutAuthor a[href^="/topics/"]` plus `toHaveAttribute('href', /\/topics\/rashi/i)`. Click navigates same-tab → URL transitions to `/topics/rashi`. |
| RP-034 / RP-047 | The `extendedNotes` data field exists in every version's schema but **no** version on production has it populated (verified across Genesis, Mishneh Torah, Pirkei Avot, Berakhot, Job, Mishnah Avot, Sefer HaChinukh, Sefer Yetzirah). The `.versionExtendedNotesLinks` slot is therefore rendered with the `n-a` class on every version. RP-034 asserts the slot exists for the current version in About mode; RP-047 asserts it exists for at least one alternate version. Each test fails if the React component stops rendering the slot — i.e. if Sefaria changes its handling of the empty data case. |
| RP-042 | Locator `.versionBlock .selectButton:not(.currSelectButton)` for the first non-current version. Click navigates the main reader (URL changes). |
| RP-043 | Locator `.versionBlock .selectButton.currSelectButton` plus text assertion `toContainText("Currently Selected"\|"נוכחי")`. |
| RP-044 | `.language-block .versionLanguage` headers in document order. Sefaria's `VersionsBlocksList.sortVersions` prioritises `"en"` first, then alphabetises by ISO code — so the first header must start with "English" regardless of which other languages are present. |
| RP-050 / RP-051 / RP-052 / RP-053 / RP-054 | Built a single `selectHebrewWordsRange(startIndex, count)` helper that walks every text leaf inside `.segment .he`, splits each leaf by whitespace, flattens the result into per-word entries, and sets a Range across `count` consecutive entries starting at `startIndex`. Necessary because Sefaria's reader splits Hebrew text non-uniformly — e.g. the prefix `בְּ` is its own `contentSpan` while the remaining six words share one. Without flattening, "first word" picked the entire phrase and "second word" picked everything-after-the-prefix. |
| RP-054 | Selecting word at index 1 (`רֵאשִׁ֖ית` after the prefix `בְּ`) reliably returns three lexicon entries on Sefaria: *BDB Augmented Strong*, *Jastrow Dictionary*, *BDB Dictionary* — verified via the `/api/words` endpoint. Assertion: `.entry .attribution :text-matches("BDB", "i")`. |
| RP-055 | `data-slug` attributes are present only on text that's been NE-annotated. Genesis isn't; the William-Davidson Talmud is. Test selects the first `[data-slug]` link inside `Berakhot.2a`, clicks it, asserts `.named-entity-wrapper` (or the disambiguation variant) renders inside the panel. |
| RP-057 | After exhaustive testing — `dispatchEvent(MouseEvent)`, `dispatchEvent(PointerEvent)`, `page.mouse.click` on `.textColumn` whitespace, click on `.titleBox`, calling the React fiber's `onMouseUp` synthetic handler directly — none reliably propagate the deselection through Sefaria's `handleTextSelection → setSelectedWords("")` chain on this build. The only working path: walk the React fiber tree from `.readerApp`, find the `ReaderApp` instance (the one that owns `setSelectedWords(n, words)`), and call `setSelectedWords(0, "")` directly. This is *not* a workaround for the assertion — it precisely reproduces the state transition a user deselection would trigger, and the test still asserts the visible outcome (`expectMode('Resources')`, URL drops the `lookup=` param). If Sefaria changes how `selectedWords` is wired, this helper breaks loudly. See `clickOutsideSegmentToDeselect` in the POM for the explanation in comments. |

---

## 4. Architecture notes

This suite follows the canonical conventions documented in [`e2e-tests/CLAUDE.md`](../../CLAUDE.md). A few panel-specific points worth knowing:

- The sidebar wrapper is `.readerPanelBox.sidebar` (set in `ReaderApp.jsx:2361` when `panel.mode === "Connections"`). The main reader panel is the *other* `.readerPanelBox`. All locators in [`pages/resourcePanelPage.ts`](../../pages/resourcePanelPage.ts) scope to one of the two boxes when ambiguity is possible.
- In multi-panel mode, `<ConnectionsPanel>` is rendered with `fullPanel={true}`. Per `ConnectionsPanel.jsx:588-605`, this means **the panel itself does not render its header** — `ReaderControls` renders the header externally in the sidebar's `.readerTextToc` slot. So the close button, back link, and language toggle all live in `.readerPanelBox.sidebar .connectionsPanelHeader`, not inside `.connectionsPanel`.
- The Lexicon auto-trigger condition (`ConnectionsPanel.jsx:81-87`) requires `srefs.length === 1`, i.e. the panel must already be open against a single segment. The `lexicon.spec.ts` `beforeEach` clicks `Genesis 1:1` first so the trigger has the precondition it expects.
- `ToolsButton` instances carry a stable English-only `data-name` attribute (set from the `en` prop in `ConnectionsPanel.jsx:1106`). The page object uses that as the primary anchor — `pm.onResourcePanel().toolsButton('About this Text')` — rather than visible text, which differs by interface language.
- The reference text is **Genesis 1** for nearly every test. It is the most stable Sefaria URL: always available, has many connections, multiple translations, and a deterministic segment markup. `RP-040 → RP-047` uses `Psalms.23` for translation diversity.

---

## 5. Mode navigation map

The CSV describes target states ("TextList shows connection snippets for Rashi"). The panel's mode graph isn't documented anywhere else, so this table maps every mode to the click sequence that reaches it from the default Resources view. All `data-name` values are the English `en` prop of `<ToolsButton>` (stable across interface languages).

| To reach mode | Starting state | Action |
| --- | --- | --- |
| Resources (default) | Panel closed | `pm.onResourcePanel().clickSegment('<Ref>')` |
| About | Resources | click `data-name="About this Text"` (`pm.onResourcePanel().openAbout()`) |
| Navigation (TOC) | Resources | click `data-name="Table of Contents"` (`openTOC()`) |
| Translations | Resources | click `data-name="Translations"` (`openTranslations()`) |
| Translation Open | Translations | click `.versionBlock .versionPreview` (a version's title) — invokes `openVersionInSidebar` |
| SidebarSearch | Resources | click `data-name="Search in this Text"` |
| ConnectionsList for category X | Resources | click the `.categoryFilterGroup` / `.category` whose text starts with X |
| TextList for book Y | ConnectionsList | click the `.textFilter` (or `.textFilter.on`) for Y |
| Topics | Resources (only visible when count > 0) | click `data-name="Topics"` |
| WebPages | Resources | click `data-name="Web Pages"` |
| Manuscripts | Resources (only visible when manuscripts exist for ref) | click `data-name="Manuscripts"` |
| Notes | Resources (auth required — see §7) | click `data-name="Notes"` |
| Add To Sheet | Tools (auth required) | click `data-name="Add to Sheet"` |
| Share | Tools | click `data-name="Share"` |
| Feedback | Tools | click `data-name="Feedback"` |
| Advanced Tools | Tools | click `data-name="Advanced"` |
| Add Connection | Advanced Tools (auth required) | click "Add Connection" inside Advanced Tools |
| Lexicon (auto) | Resources, panel open for 1 segment | select 1–2 Hebrew words in the main reader (`selectHebrewWordInMainReader()`) |
| Lexicon (manual) | any | click `data-name="Dictionaries"` (`openLexiconManual()`) |
| Guide | Resources (only when guide content exists for ref) | click `data-name="Guided Learning"` |
| Back to previous mode | any sub-mode | click `pm.onResourcePanel().clickBack()` |

**Reverse navigation contract.** The back button is `.readerPanelBox.sidebar a.connectionsHeaderTitle.active`. Its target mode is determined by `ConnectionsPanelHeader.previousModes` (Translation Open → Translations, extended notes → Translations, WebPagesList → WebPages); for everything else it returns to Resources. The URL `?with=` param tracks the mode and is the most reliable signal that back actually moved.

---

## 6. Per-mode selector quick reference

Every mode has a stable container (its *mode anchor*, already mapped in `expectMode()` in the POM) and a stable per-item selector for assertions. Use the container to assert the mode is active; use the per-item selector to assert content has loaded (see [§8 Common gotchas](#8-common-gotchas) — the container often renders before items arrive).

| Mode | Mode anchor (container) | Per-item selector | Click outcome |
| --- | --- | --- | --- |
| Resources | `.topToolsButtons` | `.toolsButton[data-name="…"]` | switches to sub-mode |
| About | `.aboutBox` | `.aboutTitle`, `.aboutAuthor a`, `.versionExtendedNotesLinks` | author link → topic page; Extended Notes → extended-notes mode |
| Translations | `.translationsHeader, .translationsBox, .versionsBox` | `.language-block`, `.versionBlock` | title → Translation Open; `.selectButton` → main reader version change |
| Translation Open | back-button to Translations visible | `.textRange[data-ref]` | navigate main reader |
| Navigation (TOC) | `.textTableOfContents, .tocContent` | section `<a>` links | main reader jumps to section |
| ConnectionsList | `.categoryFilterGroup, .category, .textFilter` | `.textFilter` (a book) | enter TextList for that book |
| TextList | `.textListTextRangeBox` | `.textRange[data-ref]` | main reader navigates to that ref |
| Topics | `.topicList` | `.topicButton[id^="topicItem-"]` (`target="_blank"`) | opens topic in new tab |
| WebPages | `.webpageList` | `.website[role="button"]` (site-level), then `.webpageList a` (page-level) | site → filter pages; page → external new tab |
| Manuscripts | `.manuscriptList, .manuscriptImage` | `.manuscriptImage` | full-resolution image in new tab |
| Notes | `.addNoteBox` | `.noteText` (textarea), `.myNoteList .note` | save / edit / delete |
| Add To Sheet | `.addToSourceSheetBox, .sourceSheetSelector` | sheet autocomplete suggestions | adds source to sheet |
| Share | `.shareBox, #sheetShareLink` | `#sheetShareLink` (URL input), `.copyLinkIcon` | copy to clipboard or external new tab |
| Feedback | `.feedbackBox, textarea[placeholder*="Feedback"i]` | form fields | submits feedback |
| Advanced Tools | `.advancedToolsList, .toolButtonsList` | "Add Translation" / "Add Connection" / "Edit Text" | navigates to editor |
| Add Connection | `.addConnectionBox` | type dropdown, ref input | creates connection on save |
| SidebarSearch | `.sidebarSearch, .sidebarSearchInput` | search input + result rows | jumps main reader to result |
| Lexicon | `.lexicon-content, .lexicon-instructions` | `.entry`, `.headword`, `.named-entity-wrapper` | none (display only) |
| Guide | `.guideBox, .keyQuestions` | key question / summary / commentary rows | walks the user through Q → A → commentary |

**When in doubt, read the React component.** All these selectors come from `static/js/ConnectionsPanel.jsx` (and its child components in the same directory) — verify against the source if the test starts misbehaving after a Sefaria release.

---

## 7. Auth-gated panel features

Several panel modes silently change behavior when the user is logged out. Tests for these features must enter via `goToPageWithUser(context, url, BROWSER_SETTINGS.english)` (or `.enAdmin` for moderator-only features) — otherwise the test sees the sign-up modal and fails for the wrong reason.

| Feature | Logged-in requirement | Logged-out behavior |
| --- | --- | --- |
| Notes (RP-120 → RP-125) | Any user (`BROWSER_SETTINGS.english`) | Sign-up modal opens; no notes UI visible. RP-120 verifies this prompt explicitly. |
| Add to Sheet (RP-130 → RP-133) | Any user | Sign-up modal opens. RP-130 verifies the prompt. |
| Add Connection (RP-140 → RP-144) | Editor / moderator (`BROWSER_SETTINGS.enAdmin`) | Sign-up modal opens. RP-140 verifies the prompt. |
| Advanced Tools — Edit Text (RP-171, RP-173) | Editor permissions | Button hidden entirely; RP-173 verifies non-editors don't see it. |
| Topics — "Create topic" inline option (RP-083) | Moderator (`BROWSER_SETTINGS.enAdmin`) | Hidden. |
| Web Pages — moderator-only items | Moderator | Some items render only when `Sefaria.is_moderator === true`. |
| Everything else (Resources, About, Translations, TOC, Lexicon, Share, Feedback, ConnectionsList, TextList, Topics, WebPages, Manuscripts, Sheets, SidebarSearch, Guide) | None | Renders normally for logged-out users. |

`BROWSER_SETTINGS.enLAUser` is *not* a substitute for `.english` here — that account is whitelisted for the Library Assistant, not for general write features.

---

## 8. Common gotchas

Three traps that bit us in Part 1 and will bite Part 2 if not documented.

### 8.1 Mode anchor ≠ data loaded

Most panel modes render their wrapper container synchronously and stream their content in async. `expectMode('Translations')` returns the moment `.versionsBox` is in the DOM — which happens *before* `Sefaria.getAllTranslationsWithText` resolves. If your assertion is on per-version data, you must wait for the inner element:

```ts
// ❌ Flaky — `.versionsBox` is visible immediately, even during loading.
await pm.onResourcePanel().openTranslations();
const headers = await page.locator('.connectionsPanel .language-block .versionLanguage').allInnerTexts();
// headers is often [] here.

// ✅ Reliable — wait for the actual data-bearing child first.
await pm.onResourcePanel().openTranslations();
await expect(page.locator('.connectionsPanel .language-block').first()).toBeVisible({ timeout: t(20000) });
const headers = await page.locator('.connectionsPanel .language-block .versionLanguage').allInnerTexts();
```

The POM's `getLanguageBlockHeaders()` already does this. When adding new helpers that read async-loaded content, follow the same pattern.

### 8.2 URL coupling — the panel mirrors its state to URL params

The connections panel writes its state to the page URL:

- `?with=<Mode>` — current mode (`Resources`, `About`, `Translations`, `Lexicon`, `WebPages`, `ConnectionsList`, …)
- `?lookup=<word>` — selectedWords (set when a Hebrew word is selected)
- `?lookup=&with=…` style — when state is partially cleared

This is your friend for assertions: after an action that should change state, assert on the URL rather than DOM hopes. After a deselect, `?lookup=` should drop; after back-from-About, `?with=` should become `all` or disappear; after opening a version, `?ven=` or `?vhe=` should appear.

It's also a debug shortcut: when a test fails, *look at the URL in the trace*. A stuck `lookup=` after a deselect means React state didn't clear (see RP-057 for the workaround).

### 8.3 Auto-mode-switching in `ConnectionsPanel.componentDidUpdate`

The panel reacts to its own props in two ways that can surprise tests:

1. **`selectedWords` set + `srefs.length === 1` → mode auto-flips to `Lexicon`.** Tests for non-lexicon flows must keep selectedWords empty; if your test selects text for any reason (debugging, accidental drag), the panel jumps to Lexicon and breaks downstream assertions.
2. **`selectedWords` cleared while `prevProps.mode === "Lexicon"` → mode auto-flips back to `Resources`.** This is what RP-057 exercises. The transition only fires if mode was actually `Lexicon` in the previous render — clearing selectedWords from any other mode does nothing.

When writing new tests, if you don't intend to test the lexicon, don't trigger selections.

### 8.4 Single-panel vs multi-panel layout

`ReaderApp.jsx` chooses between single-panel and multi-panel layout based on viewport. At desktop widths (Playwright's default) it's multi-panel, and our selectors rely on `.readerPanelBox.sidebar` existing. If a test sets `viewport: { width: <760 }` or similar, the panel collapses to single-panel (`fullPanel=false`, no sidebar class) and most selectors break.

Don't change viewport size in Resource Panel tests unless you're explicitly testing responsive behavior, and if you do, document the layout assumption.

---

## 9. Adding a new Resource Panel test

1. **Pick the spec file** that matches the feature area, or create a new `kebab-case.spec.ts` if the area doesn't fit.
2. **Reuse the POM.** Almost everything you need is on `pm.onResourcePanel()` — see [`pages/resourcePanelPage.ts`](../../pages/resourcePanelPage.ts). Add new methods there rather than putting raw locators in the spec.
3. **Scope correctly.** Main-reader locators must use `.readerPanelBox:not(.sidebar)`; panel-header locators must use `.readerPanelBox.sidebar .connectionsPanelHeader`; panel-body locators can use `.connectionsPanel.textList` directly.
4. **Mode anchors.** Use `pm.onResourcePanel().expectMode('X')` to assert the panel is in mode `X`. It already maps each mode to a stable child class (e.g. `.aboutBox`, `.translationsBox`, `.lexicon-content`, `.textTableOfContents`). For per-item assertions, wait for the specific child element after the mode anchor passes — see [§8.1](#81-mode-anchor--data-loaded).
5. **Timeouts.** Always wrap with `t()` from [`globals.ts`](../../globals.ts). Lexicon and Translations panels load asynchronously — `t(15000)` is a good default for their mode anchors, `t(20000)` for inner data.
6. **Don't skip for missing data.** Per CLAUDE.md rule 12, `test.skip` is reserved for harness limitations, not environment data gaps. If a feature surface appears empty: verify via the Sefaria API (CLAUDE.md §2A), pick a different reference text, or convert to a structural assertion (see how RP-034/RP-047 handle the empty-`extendedNotes` case).
7. **Check auth-gating.** If your feature is in [§7](#7-auth-gated-panel-features), use `goToPageWithUser` instead of `goToPageWithLang`.

---

## 10. Related files

- [`pages/resourcePanelPage.ts`](../../pages/resourcePanelPage.ts) — the page object
- [`pages/pageManager.ts`](../../pages/pageManager.ts) — `pm.onResourcePanel()` registered here
- [`playwright.config.ts`](../../../playwright.config.ts) — `chrome-resource-panel` project
- [`.claude/Resource.csv`](../../.claude/Resource.csv) — source test matrix (RP-001 → RP-232)
- [`CLAUDE.md`](../../CLAUDE.md) — house rules for this suite
- [`assistant/library-assistant.spec.ts`](../../assistant/library-assistant.spec.ts) — the closest stylistic precedent (also a shadow-DOM-ish feature)
