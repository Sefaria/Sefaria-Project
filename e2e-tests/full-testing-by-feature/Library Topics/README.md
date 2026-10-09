# Library Topics — E2E Tests

End-to-end tests for **Library topic pages** (`www.<sandbox>/topics/<slug>`) and the Library `/topics` landing. Covers test IDs **LIB-001 → LIB-029** from the Library Topics test plan (`e2e-tests/.claude/…LIBRARY_TOPICS_TEST_PLAN…csv`).

Library topic pages share the same React component (`TopicPage.jsx`) as Voices topic pages, but render **text sources** (not sheets), add a **source-language toggle**, and sort sources by `Relevance` / `Chronological`. This suite is the Library-module counterpart to [Voices Topics](../Voices%20Topics/README.md).

---

## 1. What it tests

| Spec file | Test IDs | Feature area |
| --- | --- | --- |
| [topic-display.spec.ts](topic-display.spec.ts) | LIB-001, 002a/b, 003, 004, 005 | Page load, bilingual title/description, image responsiveness, category metadata, scroll behavior |
| [source-listing.spec.ts](source-listing.spec.ts) | LIB-006, 007, 008, 009, 010a/b, 011 | Source metadata, click-through to reader, infinite scroll, text filter, sort (URL + UI), source-language toggle |
| [discovery-navigation.spec.ts](discovery-navigation.spec.ts) | LIB-012, 013, 014, 016 | Related-topics sidebar, category-link navigation, search autocomplete, A–Z browse |
| [library-topics-landing.spec.ts](library-topics-landing.spec.ts) | LIB-015 | Trending Topics sidebar on the `/topics` landing (not on individual `/topics/<slug>`) |
| [cross-module.spec.ts](cross-module.spec.ts) | LIB-017, 018, 019, 020 | Library↔Voices slug consistency, content-type difference (sources vs sheets), language persistence, deep-link params |
| [error-handling.spec.ts](error-handling.spec.ts) | LIB-021, 022, 023 | 404 handling, empty-topic state, network-failure degradation |
| [accessibility-responsive.spec.ts](accessibility-responsive.spec.ts) | LIB-024, 025, 026, 027 | Keyboard nav, a11y substructure, mobile (375px) & tablet (768px) responsiveness |
| [performance-analytics.spec.ts](performance-analytics.spec.ts) | LIB-028, 029 | Interactive load without failed responses / console errors, analytics (`data-anl`) hooks |

**Total active tests: 31** (LIB-002 and LIB-010 are each split into two — language variants for 002, URL-param + UI for 010). Pass rate: **31 / 0 / 0** at full parallelism (4 workers, no retries), verified 2026-06-15.

### Per-test detail

| Test | What it asserts |
| --- | --- |
| **LIB-001** | `/topics/torah` loads with `<h1>Torah</h1>`, `.topicDescription` > 100 chars, `.topicImage img` visible with non-empty `src`/`alt`, URL matches `/topics/torah`, and the browser tab title contains "Torah" (`"Torah \| Texts from the Sefaria Library"`) |
| **LIB-002a** | English interface (`www`): title "Torah", description present, `body.interface-english` |
| **LIB-002b** | Hebrew interface (`www.<il>`): title "תורה", `body.interface-hebrew` |
| **LIB-003** | Topic image visible + keeps `src`/`alt` at desktop, tablet (768×1024), and mobile (375×667). Deep mobile-chrome coverage lives in the mobile config ([mobile web/README.md](../../mobile%20web/README.md)); here we only assert the `<img>` survives the breakpoint crossing |
| **LIB-004** | CSV targeted page-level "creation date / contributor / statistics" — Library does not surface those at the page level. Adapted to the observable contract: the topic **category** line ("Values") links to `/topics/category/<slug>`, and ≥1 source renders with reference + body |
| **LIB-005** | Site header is `position: static` (not sticky), so the literal "header sticky on scroll" UX isn't a product contract. Adapted (same as TOV-005): the topic `<h1>` stays attached to the DOM after scrolling to the bottom |
| **LIB-006** | First 3 source cards each expose a reference link (`.headerWithAdminButtons a` → `/<Ref>`) with non-empty text + href and a `.storyBody` passage. Anonymous view surfaces no "draft"/"unpublished" markers |
| **LIB-007** | Click first source's reference → URL transitions to the source's `/<Ref>` reader; browser Back returns to `/topics/torah` |
| **LIB-008** | On the **Sources** tab, scrolling the inner `.content.noOverflowX` container appends more `.story.topicPassageStory` cards (19 → ~259) — infinite-scroll pagination |
| **LIB-009** | On the Sources tab, opening the filter strip and typing a non-matching term empties the list (count 0); clearing the filter restores it. (Proves `FilterableList`'s `refFilter` text filter works without coupling to which sources happen to be loaded) |
| **LIB-010a** | `?sort=Relevance` vs `?sort=Chronological` yield a different first source (Relevance → Joshua 1:7-8, Chronological → Deuteronomy 31:24-26 on `torah`). Source sort options are `['Relevance', 'Chronological']` |
| **LIB-010b** | UI path: switch to Sources tab → open filter strip → click "Chronological" → assert `.sort-option.active` moves to Chronological AND the first source changes from the Relevance baseline |
| **LIB-011** | Source-language toggle: the "A" popover (`LangSelectInterface`: Source / Translation / Source-with-Translation). On an English interface the default is **Translation** (English), so the baseline shows ~no Hebrew; selecting **Source** flips the rendered source text to Hebrew (Hebrew-content fraction rises) |
| **LIB-012** | Sidebar `.topicSideColumn .link-section` ("Related") exposes ≥3 `/topics/<slug>` links; clicking the first navigates |
| **LIB-013** | CSV asked for a "Library > Topics > {Topic}" breadcrumb. The Library topic page renders no such trail; the hierarchy element is the **category** line ("Values" → `/topics/category/values`). Adapted to assert that link displays and navigates |
| **LIB-014** | Header search → downshift autocomplete (`.autocomplete-dropdown`) surfaces a Topic suggestion (`a[href^="/topics/"]`) for "torah"; clicking it navigates to `/topics/<slug>` |
| **LIB-015** | Lives in [library-topics-landing.spec.ts](library-topics-landing.spec.ts). Visits `/topics` (Library landing); asserts `[data-anl-feature_name="Trending"]` lists topic links and the first navigates. Trending Topics is a landing-page/category sidebar module, not on individual `/topics/<slug>` pages — same placement decision as Voices's TOV-015 |
| **LIB-016** | `/topics/all/a` renders `.TOCCardsWrapper` with ≥1 card; clicking the alphabet "b" link transitions URL → `/topics/all/b` |
| **LIB-017** | CSV envisioned a per-topic "View Sheets" button on the Library page — that affordance does not exist. Adapted to the meaningful contract: the same slug on Voices (`voices/topics/torah`) renders **sheets** (`.storySheetListItem`), i.e. the module switch changes content type cleanly |
| **LIB-018** | Slug consistency: `/topics/torah` shows the same title ("Torah") on both Library (sources) and Voices (sheets) |
| **LIB-019** | Hebrew interface persists across a module switch: land on `www.<il>/topics/torah` (`interface-hebrew`), navigate to `chiburim.<il>/topics/torah`, body class stays `interface-hebrew` (cookie set on `.sefaria.org.il`) |
| **LIB-020** | Deep-linked `?sort=` is honoured (Chronological ≠ Relevance first source); an unknown param (`?bogusparam=…`) does not break the page (title + sources still render) |
| **LIB-021** | `/topics/nonexistenttopic2026zzz` returns **HTTP 404** with a "Page Not Found" heading, no `.topicPanel`, and the global "Topics" nav link still reachable (user not stranded) |
| **LIB-022** | Empty-topic state via API interception (no reliably-empty published topic exists on prod): strip `refs` from the topic API response → no source tabs render (`TopicPageTabView` returns null), but the header still renders and the page doesn't crash. Production state is never mutated (CLAUDE.md rule 18) |
| **LIB-023** | Network-failure degradation: abort the topic API → the app shell does not white-screen (global nav present, body non-empty, no source cards). Sefaria exposes no explicit "retry" button, so the CSV's retry-button premise is not asserted — the graceful-degradation contract is |
| **LIB-024** | Keyboard: Tab from the top lands focus on a visible interactive element; a source reference link is keyboard-activatable (focus + Enter navigates to the reader) |
| **LIB-025** | Screen-reader behavior can't be driven without assistive tech (CLAUDE.md §13 harness limitation). Asserts the automatable a11y substructure: a single meaningful topic `<h1>` and image alt text |
| **LIB-026** | At 375px: no horizontal scroll, title in DOM, source cards still rendered (stacked) |
| **LIB-027** | At 768px (and 1024px landscape): no horizontal scroll, image + sources survive the reflow |
| **LIB-028** | Strict LCP/TTI budgets are environment-dependent → not gated. Asserts the meaningful contract: first sources render, the `load` event fires, and no failed (4xx/5xx) first-party document/script/api responses or critical console errors occur. Measured time logged (~1.8s observed) |
| **LIB-029** | GA event firing isn't observable without the analytics pipeline. Asserts the analytics wiring is present: source rows carry `data-anl-batch`, reference links carry `clickto_reader` events, related-topic links carry `related_click` events |

### Notable adaptations (CSV intent vs. product reality)

Per CLAUDE.md rule 12, no test is `skip`ped for a data gap — each was adapted to the observable product contract and documented inline. The adaptations:

| Row | CSV premise | Reality / adaptation |
| --- | --- | --- |
| LIB-004 | Page-level creation date / contributor / statistics | Library surfaces topic **category** + per-source metadata, not page-level authorship — asserts those |
| LIB-005 | Header sticky on scroll | Header is `position: static` — asserts title stays in DOM after scroll |
| LIB-013 | "Library > Topics > X" breadcrumb trail | No breadcrumb trail; the category line is the hierarchy element — asserts it navigates |
| LIB-017 | "View Sheets" button on Library topic | No such button; cross-module is via shared slug — asserts the slug renders sheets on Voices |
| LIB-022 | Empty topic with 0 sources | No reliably-empty published topic on prod — intercepts the topic API to simulate it (no prod mutation) |
| LIB-023 | Network-timeout retry button | No retry UI exists — asserts graceful degradation (no white-screen) instead |
| LIB-025 | Screen-reader announcements | Requires assistive tech (un-automatable) — asserts a11y substructure (single h1, image alt) |
| LIB-028 | LCP < 2.5s / TTI < 3s budgets | Environment-dependent on shared prod infra — asserts interactive load + no failed responses/console errors, logs timing |
| LIB-029 | GA events fire on interaction | Event firing un-observable — asserts `data-anl-*` hooks are present |

---

## 2. Running

```bash
# Whole Library Topics suite (Chromium)
npx playwright test --project=chrome-library-topics

# One test by ID
npx playwright test --project=chrome-library-topics -g "LIB-010"

# UI / debug
npx playwright test --project=chrome-library-topics --ui
npx playwright test --project=chrome-library-topics --debug

# Cross-browser
npx playwright test --project=firefox-library-topics
npx playwright test --project=safari-library-topics

# Slow environment
TIMEOUT_MULTIPLIER=2 npx playwright test --project=chrome-library-topics
```

Project entries live in [`playwright.config.ts`](../../../playwright.config.ts) under `chrome-library-topics` / `firefox-library-topics` / `safari-library-topics`. All three set `baseURL` to `MODULE_URLS.EN.LIBRARY`.

---

## 3. Reference text, source files, and design decisions

### Reference topic

| Slug | Why |
| --- | --- |
| `torah` | Production-stable: 1703 numSources via `/api/topics/torah` (verified 2026-06-15), populated `description.en` (551 chars after markdown), populated `image` block with `image_uri` + bilingual `image_caption`, `category` = "Values", 19 curated Notable Sources, and a 10-link "Related" sidebar |

API verification commands used while building the suite:

```bash
curl -s "https://www.sefaria.org/api/topics/torah?annotated=false" | head -c 600
curl -s "https://www.sefaria.org/api/v2/topics/torah?with_links=1&with_refs=1&group_related=1"
```

### Source-of-truth React components (sibling `Sefaria-Project-Master`)

| Test surface | File / section |
| --- | --- |
| Topic page shell, source/lang tabs, filter/sort setup | `static/js/TopicPage.jsx` — `TopicPage` (543), `TopicHeader` (389), `TopicPageTabView` (638), `setupAdditionalTabs` (745), `refSort` (100), `useAllPossibleSourceTabs` (464), `TopicSideColumn` (975) |
| Source-card markup (`.story.topicPassageStory`, `.headerWithAdminButtons`, `.storyBody`) | `static/js/Story.jsx` — `TopicTextPassage` (165), `StoryFrame` (76), `SummarizedStoryFrame` (85, the `<details>` accordion) |
| Source-language popover (`.langSelectPopover`, `.radioChoice`) | `static/js/Misc.jsx` — `LangSelectInterface` (3585), `LangRadioButton`; `TabView` (393) wires the popover's onClick via `onClickArray` on the `[role="tab"]` wrapper |
| Header search autocomplete (`.autocomplete-dropdown`, topic suggestions) | `static/js/HeaderAutocomplete.jsx` — `SearchSuggestionInner` (152) renders `<a href="/topics/<slug>">` |

### Non-obvious design choices (the gotchas that bit during the build)

| Decision | Rationale |
| --- | --- |
| `waitForLoaded()` blocks on `.story.topicPassageStory` (data-bearing child), not `.topicPanel` (wrapper) | The panel mounts immediately with a `LoadingMessage`; only the first source appearing confirms the data fetch resolved (CLAUDE.md §11) |
| Source-metadata assertions use `toBeAttached`, not `toBeVisible`, for ref links / bodies | On the default **Notable Sources** tab, cards are `SummarizedStoryFrame` `<details>` accordions and only the **first** is auto-expanded (TopicPage.jsx:836); the rest are in-DOM but `hidden`. Requiring visibility would wrongly fail on collapsed cards |
| Filter-strip / sort-UI tests `switchToTab('Sources')` first | The real text-filter tab is suppressed while the active tab is `notable-sources` (TopicPage.jsx:760). The langToggle "A" tab also changes class (`.tab.popover.filter` → `.tab.popover`) between tabs |
| The langToggle is opened by clicking the `[role="tab"]` **wrapper**, not the inner `.tab.popover` | `TabView` attaches the toggle's onClick to the `[role="tab"]` wrapper (Misc.jsx:459). Clicking the wrapper opens the popover and the component focuses `.langSelectPopover` on mount, keeping it open. `openLangToggle()` retries the click until the popover appears (the strip can be mid-re-render right after a tab switch) |
| LIB-011 uses the default (Translation) as the English baseline and only toggles to **Source** | On an English interface `langPref` defaults to `english` → the popover's "Translation" option is already `.active`. Selecting Translation is a no-op (no `change` event, popover stays open). Only the Source selection is meaningful, so the test toggles once and asserts the Hebrew-content fraction rises |
| LIB-008 scrolls `.content.noOverflowX`, not `window` | `FilterableList`'s incremental load listens on its `scrollableElement` (the inner `.content.noOverflowX`, `scrollHeight` > `clientHeight`), not the document — `window.scrollTo` alone does not trigger it |
| LIB-022 / LIB-023 intercept the topic API instead of relying on prod data | No reliably-empty published topic exists, and a real network outage can't be provoked — both code paths are exercised by `page.route` without mutating production (CLAUDE.md rule 18) |
| LIB-010 split into a (URL param) + b (UI click) | URL-param sort (10a) and the FilterableList click path (10b) catch orthogonal failure modes — same rationale as Voices's TOV-010 |

---

## 4. Architecture notes

This suite follows the canonical conventions in [`e2e-tests/CLAUDE.md`](../../CLAUDE.md). Library-topic-specific points:

- **Single panel container.** `.topicPanel` is the React shell. Inside: `.navTitle h1` (title), `.topicCategory` (category line + link), `.topicDescription`, `.topicImage img` (image), `.story.topicPassageStory` (source cards), `.topicSideColumn .link-section` (sidebar).
- **Sources, not sheets.** Each source is a `TopicTextPassage` (`.story.topicPassageStory`) with a `.headerWithAdminButtons a` reference link and a `.storyBody` text passage — both linking to the same `/<Ref>` reader URL.
- **Two source tabs + a language toggle.** "Notable Sources" (curated accordions, default), "Sources" (full streaming list), and the "A" source-language popover. The filter/sort strip is only available on the "Sources" tab.
- **Sort is URL-state.** `?sort=Relevance|Chronological` is read by `TopicPage` on mount; navigating with a different sort param re-renders with that order (more reliable than driving the dropdown — though 10b covers the UI path too).
- **Bilingual-safe locators.** Anchors use English-stable classes (`.story.topicPassageStory`, `.headerWithAdminButtons`, `.link-section`) and radio ids (`#source`/`#translation`), not visible text, so Hebrew-interface tests reuse the same POM.

---

## 5. Adding a new Library Topics test

1. **Reuse the POM.** Most assertions live on `pm.onLibraryTopic()` — see [`pages/libraryTopicPage.ts`](../../pages/libraryTopicPage.ts). Add methods there rather than putting raw locators in the spec.
2. **Mode anchor vs data loaded.** `open()` already waits for `.story.topicPassageStory`. Scope new per-item assertions after that.
3. **Don't skip for missing data.** Pick a different verified slug ([`constants.ts`](../../constants.ts) `VALID_TOPICS`) or adapt the assertion shape; document the adaptation inline. `skip`/`fixme` are reserved for harness limitations.
4. **Verify data first.** Hit `/api/topics/<slug>?annotated=false` before writing a data-shaped assertion.
5. **Watch the accordion + tab quirks.** Use `toBeAttached` for collapsed Notable-Sources content; switch to the Sources tab before reaching for the filter/sort strip; open the langToggle via the `[role="tab"]` wrapper.

---

## 6. Related files

- [`pages/libraryTopicPage.ts`](../../pages/libraryTopicPage.ts) — the page object
- [`pages/pageManager.ts`](../../pages/pageManager.ts) — `pm.onLibraryTopic()` registered here
- [`pages/voicesTopicPage.ts`](../../pages/voicesTopicPage.ts) — the Voices counterpart (same component, sheets-only)
- [`playwright.config.ts`](../../../playwright.config.ts) — `chrome/firefox/safari-library-topics` projects
- [`CLAUDE.md`](../../CLAUDE.md) — house rules for this suite
- [`Full testing by Feature/Voices Topics/README.md`](../Voices%20Topics/README.md) — the closest precedent; same iterative-research / API-first / mode-anchor playbook
