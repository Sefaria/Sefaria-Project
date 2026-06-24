# Voices Topics — E2E Tests

End-to-end tests for **Voices topic pages** (`voices.<sandbox>/topics/<slug>`). Covers test IDs **TOV-001 → TOV-019** — the non-skipped subset of the Voices Topics test plan (rows annotated `SKIP` / `SKIP FROM HERE DOWN` are intentionally excluded).

---

## 1. What it tests

| Spec file | Test IDs | Feature area |
| --- | --- | --- |
| [voices-topics.spec.ts](voices-topics.spec.ts) | TOV-001 → TOV-019 (non-skipped, excluding TOV-015) | Topic display, language support, sheet listing, sorting (URL param + UI), related-topic navigation, A–Z browse, cross-module language persistence |
| [voices-topics-landing.spec.ts](voices-topics-landing.spec.ts) | TOV-015 | Trending Topics sidebar on `/topics` landing (lives here, not on individual `/topics/<slug>`) |

### Per-test detail

| Test | What it asserts |
| --- | --- |
| **TOV-001** | `/topics/torah` loads with `<h1>Torah</h1>`, `.topicDescription` populated (>100 chars), `.topicImage img.imageWithCaptionPhoto` visible with non-empty `src` and `alt`. URL matches `/topics/torah` |
| **TOV-002a** | English interface: `body.interface-english`, title text "Torah", description present |
| **TOV-002b** | Hebrew interface (`chiburim.<sandbox-il>/topics/torah`): `body.interface-hebrew`, title text "תורה" |
| **TOV-003** | Topic image visible at default desktop, after resize to tablet (768×1024), and after resize to mobile (375×667). Deep mobile chrome coverage still lives in the mobile suite per [`e2e-tests/mobile web/README.md`](../../mobile%20web/README.md); here we only assert the `<img>` itself survives the breakpoint crossing and keeps its `src`/`alt` |
| **TOV-004** | The CSV item targeted page-level "creation date / view count / contributor" metadata — Voices does not surface those at the topic-page level (only per-sheet inside `.authorByLine`). The test adapts to assert the observable contract: ≥1 `.storySheetListItem` renders, each with `.sheetTitle a` and `.authorName a` |
| **TOV-005** | Site header is `position: static` (not sticky). Test scopes the assertion to: after `window.scrollTo(0, document.body.scrollHeight)`, the topic `<h1>` remains attached to the DOM. The literal "header sticky on scroll" UX from the CSV is not implemented by the product (and the CSV row already noted "I'm not sure this is true") |
| **TOV-006** | First 3 sheet blocks each expose: `.sheetTitle a` (non-empty), `.authorName a` (visible). Source: `Story.jsx` `SheetBlock` (line 318) |
| **TOV-007** | Click first sheet's `.sheetTitle a` → URL transitions to `/sheets/<id>`. The anchor itself carries `data-target-module="voices"` and `target="_self"`, so same-tab navigation |
| **TOV-009** | Anonymous user sees zero literal "draft" / "unpublished" markers in the rendered list — Voices applies publication filtering server-side. The CSV's "logged-in author sees own drafts on topic page" leg is **permanently out-of-scope, not a coverage gap**: Django's `sheets_by_tag_api` ([sourcesheets/views.py:948,960](../../../../Sefaria-Project-Master/sourcesheets/views.py#L948)) hardcodes `public=True` regardless of the requester's session, so drafts never appear on `/topics/<slug>` for ANY user. Author drafts live on the profile page (`/profile/<slug>`) and would be tested in a separate profile-page suite |
| **TOV-010a** | Visits `?sort=Relevance`, `?sort=Newest`, `?sort=Views` sequentially and asserts the set of three first-sheet titles has size ≥ 2. Strict three-way uniqueness would over-constrain (the most-viewed sheet could also be the most-relevant), so the assertion is on the contract: the sort param actually re-orders the list. The URL is the source of truth (`TopicPage` reads `topicSort` on mount) |
| **TOV-010b** | UI interaction test: click the filter tab → `.filter-bar-new` opens → click `.sort-option` for "Newest" → assert all three observable outcomes: (1) URL updates to `?sort=Newest`, (2) `.active` class moves to Newest, (3) first sheet title changes from the Relevance baseline. This covers the click path that TOV-010a's URL-driven version skips |
| **TOV-011a** | Hebrew interface puts Hebrew-titled sheets first. Source: `sheetSort` ([TopicPage.jsx:135](../../../../Sefaria-Project-Master/static/js/TopicPage.jsx#L135)) — when `Sefaria.interfaceLang === 'hebrew'`, `titleLanguage === 'hebrew'` rows sort earlier. Asserts the first sheet's title contains a Hebrew character (`/[֐-׿]/`) |
| **TOV-011b** | Mirror direction: English interface puts English-titled sheets first (the en branch of `sheetSort` flips polarity at TopicPage.jsx:145–148). Stronger assertion than the single-title check used for 11a — asserts ≥3 of the first 5 surfaced sheets are en-titled (no Hebrew characters). On `torah` the top-relevance row already happens to be English-titled, so a single-title check would pass even if `sheetSort`'s en branch broke. The majority-of-5 check actually catches a regression that pushes Hebrew titles upward |
| **TOV-012** | Sidebar `.topicSideColumn .link-section` exposes ≥3 `/topics/<slug>` anchors. Clicking the first navigates to that topic page |
| **TOV-015** | Lives in [`voices-topics-landing.spec.ts`](voices-topics-landing.spec.ts). Visits `/topics` (Voices module → `TopicsPage.jsx` renders sidebar modules `[TrendingTopics, JoinTheConversation]`). Asserts `[data-anl-feature_name="Trending"]` contains a `.topic-landing-sidebar-list` with 5–15 `/topics/<slug>` links; clicking the first navigates. **Originally drafted against the topic-page sidebar (which only has Related Topics); moved here on the second iteration to match CSV intent honestly** |
| **TOV-016** | `/topics/all/a` renders `.TOCCardsWrapper` with ≥1 card. Clicking `a[href="/topics/all/b"]` from the alphabet index transitions URL → `/topics/all/b` and the new wrapper appears |
| **TOV-019** | Land on `chiburim.<sandbox-il>/topics/torah` in Hebrew (`body.interface-hebrew`). Navigate to `www.<sandbox-il>/topics/torah` (Library module). Body class still contains `interface-hebrew` — the cookie is set on `.sefaria.org.il` and survives the subdomain switch |

### Tests intentionally NOT automated

| Row | Why excluded |
| --- | --- |
| TOV-008 | CSV row explicitly says "SKIP THIS TEST FOR NOW" |
| TOV-013 | CSV row explicitly says "SKIP THIS TEST FOR NOW" |
| TOV-014 | CSV row explicitly says "SKIP THIS TEST FOR NOW" |
| TOV-017 | CSV row explicitly says "SKIP THIS TEST" |
| TOV-018 | CSV row explicitly says "SKIP THIS TEST FOR NOW" |
| TOV-020 | CSV row explicitly says "SKIP THIS TEST FOR NOW" |
| TOV-021 → TOV-029 | CSV row says "SKIP FROM HERE DOWN" |

Total active tests: **17** (TOV-001 → TOV-019, minus rows the CSV explicitly skipped; TOV-002 / TOV-010 / TOV-011 are each split — language variants for 002, URL-param + UI for 010, hebrew + english for 011 — hence 17 distinct tests). Current pass rate: **17 / 0 / 0** at full parallelism (8 workers, no retries).

---

## 2. Running

```bash
# Whole Voices Topics suite (Chromium)
npx playwright test --project=chrome-voices-topics

# One test by ID
npx playwright test --project=chrome-voices-topics -g "TOV-010"

# UI / debug
npx playwright test --project=chrome-voices-topics --ui
npx playwright test --project=chrome-voices-topics --debug

# Cross-browser
npx playwright test --project=firefox-voices-topics
npx playwright test --project=safari-voices-topics

# Slow environment
TIMEOUT_MULTIPLIER=2 npx playwright test --project=chrome-voices-topics
```

Project entries live in [`playwright.config.ts`](../../../playwright.config.ts) under `chrome-voices-topics` / `firefox-voices-topics` / `safari-voices-topics`. All three set `baseURL` to `MODULE_URLS.EN.VOICES`.

---

## 3. Reference text, source files, and design decisions

### Reference topic

| Slug | Why |
| --- | --- |
| `torah` | Production-stable: 1690 numSources via `/api/topics/torah` (verified 2026-05-25), populated `description.en` (551 chars), populated `image` block with `image_uri` and bilingual `image_caption`, 20+ sheets at default page size, populated `links` for the Related sidebar |

API verification commands used while building the suite:

```bash
curl -s "https://www.sefaria.org/api/topics/torah?annotated=false" | head -c 2000
curl -s "https://voices.sefaria.org/topics/torah"            # SSR HTML skeleton
```

### Source-of-truth React components

| Test surface | File / section |
| --- | --- |
| Topic page shell, sheet/source tab selection | [`static/js/TopicPage.jsx`](../../../../Sefaria-Project-Master/static/js/TopicPage.jsx) — `TopicPage` (line 543), `TopicHeader` (line 389), `TopicSideColumn` (line 975), `sheetSort` (line 135), `useAllPossibleSourceTabs` (line 464) |
| Sheet card markup (`.storySheetListItem`, `.sheetTitle`, `.authorByLine`) | [`static/js/Story.jsx`](../../../../Sefaria-Project-Master/static/js/Story.jsx) — `SheetBlock` (line 318) |
| `Sefaria.activeModule` branching (Sheets-tab-only on Voices) | [`static/js/sefaria/sefaria.js`](../../../../Sefaria-Project-Master/static/js/sefaria/sefaria.js) — `shouldDisplayInActiveModule` (2921), `sortTopicsCompareFn` (2930) |
| TopicPage A–Z browse (`/topics/all/<letter>`) | [`static/js/TopicPageAll.jsx`](../../../../Sefaria-Project-Master/static/js/TopicPageAll.jsx) |

### Non-obvious design choices

| Decision | Rationale |
| --- | --- |
| `waitForLoaded()` blocks on `.storySheetListItem` (data-bearing child), not `.topicPanel` (wrapper) | CLAUDE.md §8.1 / Resource Panel gotcha 8.1: the panel container mounts immediately with `LoadingMessage` inside it; only the first sheet appearing confirms the React side-effect resolved |
| TOV-005 asserts the title stays *in DOM* (`toBeAttached`) rather than visible-on-screen after scroll | The site header is `position: static` and the topic page content is short enough that the h1 is still in viewport after scroll — but neither of those facts is a product *contract*. The user-meaningful guarantee for tall lists is that the title element doesn't get torn out of the tree, so that's what we assert |
| TOV-010 asserts `Set([rel, new, views]).size >= 2` instead of strict 3-way uniqueness | A single sheet can legitimately be both the most-relevant and most-viewed; locking the test to 3-way uniqueness would couple it to live production data ordering. The contract being asserted is "the sort param actually changes ordering", which size≥2 captures |
| Sort coverage is split across two tests (TOV-010a + TOV-010b) | URL-param sort (10a) and UI-click sort (10b) catch orthogonal failure modes. If the React state→URL sync breaks, 10b fails; if `TopicPage`'s URL-on-mount reader breaks, 10a fails; if `FilterableList` stops emitting events on click, 10b fails. The sort options live in `<span class="sort-option">` rows inside `.filter-bar-new .filter-sort-wrapper`, rendered when the filter tab toggles `showFilterHeader=true` ([Misc.jsx:329](../../../../Sefaria-Project-Master/static/js/Misc.jsx#L329) `FilterableList`) |
| TOV-009 author-draft leg is permanently dropped, not deferred | Verified via [`sourcesheets/views.py:948,960`](../../../../Sefaria-Project-Master/sourcesheets/views.py#L948): `sheets_by_tag_api` hardcodes `public=True` regardless of authentication. The bulk-sheet response on the topic-page render path doesn't even include a `status` field. The CSV's premise ("drafts visible to author on topic page") is incorrect about how Sefaria works — drafts surface on the profile page, not on topic pages. No throwaway-account or mock workaround is justified because the feature doesn't exist |
| TOV-015 lives on the landing page, not the topic page | Trending Topics is a `TopicsPage.jsx` sidebar module attached only on `/topics` (Voices branch). The CSV's premise targets Trending Topics specifically — preserving that requires running the test where the module actually renders, not retargeting to the topic-page Related Topics sidebar (which is a different module with a different data source). Hence the separate `voices-topics-landing.spec.ts` file |
| TOV-011 split into a/b with different assertion shapes | 11a (hebrew) asserts the first title contains a Hebrew character — sufficient on the hebrew side because `sheetSort`'s hebrew branch is symmetric. 11b (english) asserts ≥3 of the first 5 titles are en-titled because on `torah` the top-relevance row is already english-titled; a single-title check would pass even if `sheetSort`'s english branch broke entirely. The stronger 5-row check actually catches a regression that pushes Hebrew titles upward |

---

## 4. Architecture notes

This suite follows the canonical conventions in [`e2e-tests/CLAUDE.md`](../../CLAUDE.md). Voices-topic-specific points worth knowing:

- **Single panel container.** `.topicPanel` is the React-rendered shell. Inside it, `.navTitle h1` (title), `.topicDescription` (markdown-rendered description), `.topicTabContents .storySheetListItem` (sheet cards), and `.topicSideColumn` (sidebar) are the four anchors the tests assert against.
- **Sort is URL-state, not React local state.** `?sort=Relevance|Newest|Views` is read by `TopicPage` on mount. Navigating with a different sort param re-renders with that order — much more reliable than driving the sort dropdown UI.
- **No langToggle on Voices.** `TopicPage.jsx:773` gates the lang-toggle tab on `Sefaria.activeModule === LIBRARY_MODULE`. Voices's tab strip is just `[Sheets, filter icon]`.
- **`SheetBlock` is the per-row markup.** `.storySheetListItem > .saveLine > .sheetTitle a` is the navigation target; `.authorByLine .authorName a` is the byline. `.storyBody` is the optional summary.
- **The sidebar is `.topicSideColumn`.** Its first child is `.topicImage`; subsequent children are `.link-section` blocks (the only one populated for `torah` is "Related").

---

## 5. Adding a new Voices Topics test

1. **Reuse the POM.** Most assertions you'll need are on `pm.onVoicesTopic()` — see [`pages/voicesTopicPage.ts`](../../pages/voicesTopicPage.ts). Add new methods there rather than putting raw locators in the spec.
2. **Mode anchor vs data loaded.** `pm.onVoicesTopic().waitForLoaded()` already waits for `.storySheetListItem` — the actual data-bearing child. If you add a new assertion against per-item content, scope it after that wait.
3. **Don't skip for missing data.** Per CLAUDE.md rule 12, if a feature surface is empty on production, either pick a different reference topic (see [`constants.ts`](../../constants.ts) `VALID_TOPICS` for a verified-good slug list) or adapt the assertion shape. `test.skip` is reserved for harness limitations.
4. **Verify data first.** Before writing a data-shaped assertion, hit `/api/topics/<slug>?annotated=false` and confirm the field exists. Five-minute API check beats three failed test runs.
5. **API verification beats clicking sort UI.** When testing per-sort behavior, navigate with `?sort=` and assert on observable ordering changes, not on the sort dropdown's interaction model.
6. **English-stable anchors.** Per CLAUDE.md rule 15, prefer `.storySheetListItem` (class) and `data-target-module` over `getByText('Sheets')` so Hebrew interface tests don't need a parallel set of locators.

---

## 6. Related files

- [`pages/voicesTopicPage.ts`](../../pages/voicesTopicPage.ts) — the page object
- [`pages/pageManager.ts`](../../pages/pageManager.ts) — `pm.onVoicesTopic()` registered here
- [`playwright.config.ts`](../../../playwright.config.ts) — `chrome-voices-topics`, `firefox-voices-topics`, `safari-voices-topics` projects
- [`CLAUDE.md`](../../CLAUDE.md) — house rules for this suite
- [`Full testing by Feature/Resource Panel/README.md`](../Resource%20Panel/README.md) — closest stylistic precedent; the same iterative-research / API-first / mode-anchor playbook applies here
