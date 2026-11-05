# Inventory 05 — Library browsing (TOC), Book pages, Calendars, Translations, Topics, Nav sidebar

Repo: `/Users/akiva/Sefaria/dev/Sefaria-Project` (master @ bb47dd77a). All paths below are relative to repo root; JS paths relative to `static/js/` unless stated.
Read in full: TextsPage.jsx, TextCategoryPage.jsx, BookPage.jsx, NavSidebar.jsx, CalendarsPage.jsx, TranslationsPage.jsx, TopicsPage.jsx, TopicPage.jsx, TopicPageAll.jsx, TopicLandingPage/*.jsx, TopicsLaunchBanner.jsx (graphics files skimmed), TopicEditor.jsx, CategoryEditor.jsx, AdminEditor.jsx, common/TopicTOCCard.jsx, WordSalad.jsx, RowedWordSalad.jsx, Story.jsx, UpdatesPanel.jsx, relevant Misc.jsx components, relevant sefaria.js functions, reader/views.py views, sefaria/model/topic.py client-relevant behavior.

---

## 1. Library root page — `TextsPage` (TextsPage.jsx)

URL `/texts` (root) and `/texts/<Cat>/<SubCat>...` (category). One component handles both: if `categories.length` it delegates to `TextCategoryPage` (TextsPage.jsx:25-39) wrapped in `.readerNavMenu`.

### 1.1 Root category grid
- Iterates `Sefaria.toc` (top-level categories) (TextsPage.jsx:42-62). Each is a `.navBlock.withColorLine` with inline `borderColor` = `Sefaria.palette.categoryColor(cat.category)` (colored top line per category).
- Title link: `href=/texts/<Category>`; click → `setCategories([cat.category])` (SPA nav, preventDefault). `data-cat` attr (used for Selenium). Keyboard: space key activates link via `Util.handleLinkSpaceKey` (TextsPage.jsx:53).
- Title shown via `ContentText` bilingual (`en: cat.category`, `he: cat.heCategory`) with `defaultToInterfaceOnBilingual` (in bilingual mode it shows interface-language title only).
- Short description under each: `enShortDesc` / `heShortDesc` (TextsPage.jsx:57-59).
- Grid layout via `ResponsiveNBox` (TextsPage.jsx:64-67) — column count responsive to width (see §13 Misc).

### 1.2 Header/title area
- `compare` mode (panel opened as "compare"/second panel library): shows `ComparePanelHeader` with `search={true}`, `onBack`, `openSearch` instead of title (TextsPage.jsx:69-74); no NavSidebar; no dedication; no library message; no about.
- Title: `<h1>` "Browse the Library" (`texts_page.browse_the_library`) inside `CategoryHeader type="cats" toggleButtonIDs={["subcategory","reorder"]}` — i.e., admin-only edit buttons "add subcategory" and "reorder" appear next to heading for editors (TextsPage.jsx:76-83; see §12 CategoryHeader).
- Language toggle button (`LanguageToggleButton`) shown only if interface lang != hebrew AND site setting `TORAH_SPECIFIC` (TextsPage.jsx:81-82).
- Class `noLangToggleInHebrew` always on.

### 1.3 Mobile/single-panel extras
- `about`: if NOT multiPanel and not compare, an inline `AboutSefaria` sidebar module (hideTitle) is rendered at top of content (TextsPage.jsx:85-86).
- `RecentlyViewed` with `mobile={true}` rendered inline above categories when not multiPanel (TextsPage.jsx:114).

### 1.4 Daily dedication banner (`Dedication`, TextsPage.jsx:134-181)
- Only when `Sefaria._siteSettings.TORAH_SPECIFIC` and not compare (TextsPage.jsx:88).
- Computes date key "now + 6 hours" in local time (so dedication flips at 6pm local), ISO `YYYY-MM-DD`.
- Initial data from `Sefaria._tableOfContentsDedications[date]` (server-provided cache).
- If missing: loads Google Charts (`google.charts.load('current')`) and queries a hard-coded public Google Sheet (`docs.google.com/spreadsheets/d/11c9Yw9F...`) with `select A, B, C` → columns date/en/he; fills `Sefaria._tableOfContentsDedications` for all rows; displays today's entry.
- Renders `.dedication` with `InterfaceText markdown={{en, he}}` (markdown supported). Hidden if neither en nor he.

### 1.5 Library message
- `Sefaria._siteSettings.LIBRARY_MESSAGE` raw HTML rendered via dangerouslySetInnerHTML in `.libraryMessage` (not in compare) (TextsPage.jsx:90-92).

### 1.6 Sidebar (root)
Order (TextsPage.jsx:94-101): `AboutSefaria` (multiPanel only) → `Promo` → `RecentlyViewed` (multiPanel only, with `toggleSignUpModal`) → `Translations` → `LearningSchedules` → `Resources`; then `SidebarFooter` (NavSidebar default). Sidebar omitted in compare mode.

---

## 2. Category page — `TextCategoryPage` (TextCategoryPage.jsx)

### 2.1 Category path normalization / special cases
- `["Talmud"]` alone → treated as `["Talmud","Bavli"]`; `["Tosefta"]` alone → `["Tosefta","Vilna Edition"]` (TextCategoryPage.jsx:24-28). (Visiting /texts/Talmud shows Bavli contents.)
- `aboutCats`: for `["Talmud", X]` the About module uses `["Talmud"]` (TextCategoryPage.jsx:29-30).
- Title: for Talmud/Tosefta depth-2, page title is just "Talmud"/"Tosefta" (Hebrew via `Sefaria.hebrewTerm`) (TextCategoryPage.jsx:34-37).
- If category === "Commentary": title is `<parent cat> Commentary`, Hebrew `hebrewTerm(parent) + " " + hebrewTerm("Commentary")` (TextCategoryPage.jsx:39-42); nestLevel starts at 1 (so commentary subcategories render as links/nested; TextCategoryPage.jsx:51).
- Otherwise title = category, Hebrew via `Sefaria.hebrewTerm`.

### 2.2 Layout pieces
- `CategoryColorLine` with top-level category color (TextCategoryPage.jsx:81).
- Compare mode: `ComparePanelHeader` with category, `onBack` → `setCategories(aboutCats.slice(0,-1))`, catTitle/heCatTitle; title area replaced by just the subcategory toggle (TextCategoryPage.jsx:58, 70-76).
- Title `<h1>` wrapped in `CategoryHeader data={cats} type="cats"` (admin edit button for the category; default toggleButtonIDs = ["subcategory","edit"]) (TextCategoryPage.jsx:59-64).
- Sub-category toggle (`SubCategoryToggle`) under title (TextCategoryPage.jsx:65).
- Language toggle only when multiPanel && interface!=hebrew && TORAH_SPECIFIC (TextCategoryPage.jsx:66-67).
- Long category description (`tocObject.enDesc/heDesc`) shown at top ONLY when NOT multiPanel (on desktop it's in sidebar `AboutTextCategory`) (TextCategoryPage.jsx:87-90).
- `CategoryAttribution categories={cats} asEdition` — attribution/edition line (e.g., "Edition: William Davidson") (TextCategoryPage.jsx:91; Misc §13).
- `TextCategoryContents` recursive list (TextCategoryPage.jsx:92-99).
- `.contentInner.followsContentLang` — category page follows *content* language (bilingual/hebrew/english) rather than interface language.

### 2.3 SubCategoryToggle (TextCategoryPage.jsx:307-337)
- Hard-coded map:
  - Talmud (depth 2): Bavli / Yerushalmi displayed as "Babylonian / בבלי", "Jerusalem / ירושלמי".
  - Tosefta (depth 2): "Vilna Edition" / "Lieberman Edition" displayed "Vilna / דפוס וילנא", "Lieberman / מהדורת ליברמן".
- Only rendered when path length equals 2 and first cat in map. Active toggle styled `.navToggle.active`; click → `setCategories([cat0, sub])`. (No href — span with onClick.)

### 2.4 Recursive contents — `TextCategoryContents` (TextCategoryPage.jsx:117-255)
- Content language Hebrew → `hebrewContentSort` (§2.6).
- For each item:
  - **Category item**:
    - If `item.isPrimary` OR nestLevel > 0 (i.e., inside Commentary or special nested cats): 
      - If category has exactly one child and that child is a text (no `category`): render the text directly as `TextMenuItem` (skip if hidden) (TextCategoryPage.jsx:133-148). (Single-text categories collapse into the text.)
      - Else render a `MenuItem` link to subcategory `/texts/<path>` (click → setCategories) with en/he title and short descs (TextCategoryPage.jsx:151-162).
    - Else (non-primary category at top nest): render an inline nested section `.category` with `<h2>` (inside `CategoryHeader data={newCats} type="cats"` → admin edit button per subcategory heading), plus short description: if ≤5 words, shown inline in parentheses in the h2 `(desc)`; if >5 words, shown as a separate `.categoryDescription.long` block below heading. Then recurse with nestLevel+1 (TextCategoryPage.jsx:166-196). Note short desc picked by content lang (`heShortDesc` if contentLang hebrew).
  - **Collection item** (`item.isCollection`): `MenuItem` linking to `/collections/<slug>` with `module="sheets"` → `data-target-module` set (cross-module link) (TextCategoryPage.jsx:200-211).
  - **Hidden text** (`item.hidden`): skipped (TextCategoryPage.jsx:214-215).
  - **Text**: `TextMenuItem`; click → `openTextTOC(item.title)` (opens BookPage in panel) else falls back to href `/<normRef(title)>` (TextCategoryPage.jsx:218-231).
- Grouping: consecutive text/link items are grouped into a `ResponsiveNBox` grid; nested `div` categories break the run (TextCategoryPage.jsx:235-253). (Bug: one call passes `intialWidth` misspelt.)

### 2.5 MenuItem / TextMenuItem
- `MenuItem` = `.navBlock` with `a.navBlockTitle` (data-cat for categories, `data-target-module` = module or `Sefaria.activeModule`) and optional `.navBlockDescription` (TextCategoryPage.jsx:268-288). No color line on these.
- `TextMenuItem` href `/` + `Sefaria.normRef(title)`; title shortened via `getRenderedTextTitleString` (TextCategoryPage.jsx:291-304).

### 2.6 Title shortening `getRenderedTextTitleString` (TextCategoryPage.jsx:340-382)
- Special: "Pesach Haggadah" → displayed "Pesach Haggadah Ashkenaz" / "הגדה של פסח אשכנז".
- Whitelist (not shortened): 'Imrei Yosher on Ruth', 'Duties of the Heart (abridged)', 'Midrash Mishlei', 'Midrash Tehillim', 'Midrash Tanchuma', 'Midrash Aggadah', 'Pesach Haggadah Edot Hamizrah', "Baal HaSulam's Preface to Zohar", "Baal HaSulam's Introduction to Zohar", 'Zohar Chadash', 'Midrash Shmuel', 'Midrash Tannaim on Deuteronomy'; also any text whose last category is "Siddur".
- Otherwise strip a leading category name (any category in the current path, plus 'Jerusalem Talmud', 'Tosefta Kifshutah'; Hebrew equivalents 'תלמוד ירושלמי', 'תוספתא כפשוטה' + hebrewTerm of each cat) plus optional connector (`, `, `; `, ` on `, ` to `, ` of ` / Hebrew `, `, ` על `). E.g., in "Rashi" category "Rashi on Genesis" → "Genesis". Unless the title equals a category name exactly.
- Strips suffix " (Lieberman)" / " (ליברמן)".

### 2.7 Hebrew sort `hebrewContentSort` (TextCategoryPage.jsx:385-418)
- When content language is Hebrew. If every item has `base_text_order`, keep order. Otherwise sort: items with explicit `order` → positive orders first, unordered, negative last; categories vs texts keep English relative order; otherwise alphabetical by `heTitle`; fallback English order. (Mutates items with `enOrder`.)

### 2.8 Category sidebar (`getSidebarModules`, TextCategoryPage.jsx:421-442)
- First: `AboutTextCategory` (multiPanel only) with aboutCats.
- Custom per path: `Tanakh` → `WeeklyTorahPortion`; `Talmud|Bavli` → `DafYomi`.
- Default: `Promo`, `Visualizations` (filtered by categories), `SupportSefaria`. Not shown in compare.

---

## 3. Book page / Text Table of Contents — `BookPage` (BookPage.jsx)

Rendered for menu modes `"book toc"` (full book page, `/<Title>` index URL e.g. `/Genesis`) and the in-reader text TOC (`mode` other than "book toc", e.g. opened from reader header — "text toc"). `isBookToc()` (BookPage.jsx:143-145) gates Versions tab, sidebar, full versions load.

### 3.1 Data loading
- `Sefaria.getIndexDetails(title)` (→ `/api/v2/index/<title>?with_content_counts=1&with_related_topics=1`, see §15) on mount (BookPage.jsx:75-86); initial state from cache `getIndexDetailsFromCache`.
- Book TOC & not compare: `Sefaria.getVersions(title)` → flattened → `currObjectVersions` (full objects of the currently selected en/he versions from props.currVersions) (BookPage.jsx:79-100).
- Rerender on settings language change (BookPage.jsx:62-66).
- `getCurrentVersion()` (BookPage.jsx:101-136) builds current-version attribution object (lang falls back if no text in chosen lang; fields: versionTitle, versionSource, versionStatus, license, sources (merged), versionNotes, digitizedBySefaria, versionTitleInHebrew, shortVersionTitle(InHebrew), versionNotesInHebrew, extendedNotes(Hebrew); `merged = !!sources`). Only for non-book-toc. (Currently appears unused in render — legacy.)
- `openVersion(version, language, versionLanguageFamily)` → `props.selectVersion(...)` then `props.close()` (BookPage.jsx:137-142).

### 3.2 Header (non-compare) `.tocTop` (BookPage.jsx:244-267)
- Title heading (`role=heading aria-level=1`) in `CategoryHeader type="books" toggleButtonIDs={["section","edit"]} data={title}` → admin buttons: "add section" & "edit" (opens `EditTextInfo` index editor, §3.10).
- Language toggle when multiPanel && toggleLanguage provided && interface != hebrew && TORAH_SPECIFIC.
- Category link `.tocCategory` (bilingual category name via hebrewTerm). URL rules (BookPage.jsx:157-169):
  - category "Commentary": find first category equal to "Commentary" or containing ` on <baseCategory>` (e.g. "Rishonim on Talmud"), link to path up to that.
  - "Targum" or "Guides": path up to that category.
  - "Talmud": path up to Talmud + 1 (e.g. /texts/Talmud/Bavli).
  - else `/texts/<category>`.
- `CategoryAttribution categories asEdition` (BookPage.jsx:259).
- Index dedication: `indexDetails.dedication.{en,he}` HTML rendered in `.dedication` (BookPage.jsx:261-266).

### 3.3 Compare-mode header (BookPage.jsx:220-239)
- `readerControls` bar: left `MenuButton` (compare back), center title, right display settings dropdown (`DisplaySettingsButton` + `ReaderDisplayOptionsMenu` in `DropdownMenu`) — only for non-Hebrew interface; Hebrew shows placeholder.

### 3.4 Read button (BookPage.jsx:171-187)
- Hidden in compare or before indexDetails.
- If `Sefaria.lastPlaceForText(title)` (user history) → "Continue Reading" linking to that ref; else "Start Reading" → `indexDetails.firstSectionRef`. Space key activates.

### 3.5 Tabs (BookPage.jsx:189-198, 278-297)
- `TabView` with `largeTabs`: "Contents" always; "Versions" only in book toc. Tab state from `props.tab`/`props.setTab` (URL-driven). (There is no "About" tab: About content is in the sidebar module `AboutText` on desktop, or inline `.about` block (AboutText hideTitle) on mobile — BookPage.jsx:273-276.)
- Contents tab → `TextTableOfContents`; Versions tab → `VersionsList`.
- Loading → `LoadingMessage`.

### 3.6 Sidebar (book toc only, not compare) (BookPage.jsx:200-206, 305-306)
- `AboutText` (multiPanel only) → `Promo` → `RelatedTopics(title)` → `DownloadVersions(sref=title)` (omitted for dictionaries, i.e. `indexDetails.lexiconName`).

### 3.7 `TextTableOfContents` (BookPage.jsx:333-508) — also exported, used elsewhere (e.g., connections panel/TOC in reader)
- Loads index details; default active struct tab = `indexDetails.default_struct` if exists in `alts`, else "schema" (BookPage.jsx:369-371).
- Scrolls the `.current` element into view (center) on mount/load (BookPage.jsx:363-368).
- Click handling (BookPage.jsx:375-387): any `a.sectionLink` or `a.linked` → reads `data-ref`, humanizes, calls `props.close()` if present, then `navigatePanel(ref, currVersions)` if provided else `showBaseText(ref, false, currVersions, [], true, true)`; preventDefault (links still have real hrefs for SSR/open-in-new-tab).
- **Torah special case** (`isTorah` = Genesis/Exodus/Leviticus/Numbers/Deuteronomy) (BookPage.jsx:392-401, 442-468):
  - Marks every node of `alts["Parasha"]` with `displayFixedTitleSubSections=true` (titles are links + always show aliyah subsections, not collapsible).
  - Renders schema (header "Chapters") AND below it `.torahNavParshiot` the Parasha alt struct with header "Torah Portions", `disableSubCollapse`.
  - No struct toggle shown for Torah.
- **Struct toggle** (`TabbedToggleSet`): options = "schema" (label = `schema.sectionNames[0]` if present else "Contents") unless in `exclude_structs`; plus each alt struct (key name used as label) not excluded; default struct sorted first. Shown only if >1 options and not dictionary/Torah (BookPage.jsx:402-429).
  - `TabbedToggleSet` (BookPage.jsx:518-559): links have `href` with `?tab=<name>` URL param replaced; narrowPanel → rows of 2 (if 4 options) or 3.
- **Dictionary**: if `indexDetails.lexiconName` → `DictionarySearch` box above TOC (lexicon search within the dictionary) (BookPage.jsx:431-438).
- Content switch: "schema" → `SchemaNode` of `indexDetails.schema` (topLevel); alt tab → `SchemaNode` of `alts[tab]`.
- `currentlyVisibleRef` / `currentlyVisibleSectionRef` props highlight the reader's current location (`.current`) when TOC is opened from within reader.

### 3.8 Schema rendering (every shape)
**`SchemaNode`** (BookPage.jsx:562-723):
- Collapsed state per child: top-level / `disableSubCollapse` / leaf → nothing collapsed; else child collapsed unless it contains the currently visible ref, or is `default`, or `includeSections` (BookPage.jsx:574-590). Recomputed when currentlyVisibleRef changes.
- Leaf (no `nodes`): dispatch by `nodeType`: `JaggedArrayNode`, `ArrayMapNode` (alt-struct leaf), `DictionaryNode`.
- With children, for each child:
  - `ArrayMapNode` → `ArrayMapNode` component.
  - has `nodes` → collapsible `.schema-node-toc` with title span (`collapsed/open`, `fixed` if disableSubCollapse; Enter key toggles; role heading level 3) and recursive SchemaNode.
  - `DictionaryNode` → DictionaryNode.
  - depth==1 non-default JA child → a single link (`a.schema-node-toc.linked`) straight to `<refPath>, <title>`; `.current` if matches visible section (BookPage.jsx:663-674). (E.g., intro sections/ "Introduction".)
  - Otherwise (JA child with depth ≥2, or default node) → `.janode` with collapsible title (title omitted for `default` nodes — default node's sections shown directly without header) and `JaggedArrayNode` (refPath excludes title for default).
  - Optional `topLevelHeader` (`.specialNavSectionHeader`, Hebrew via `Sefaria.hebrewTranslation`).

**`JaggedArrayNode`** (BookPage.jsx:726-773):
- `index_offsets_by_depth['1']` offset applied to section numbering (texts starting at non-1 sections).
- `toc_zoom`: zooms TOC out by N levels — shows depth−zoom levels, section names/addressTypes trimmed, current ref zoomed out via `Sefaria.zoomOutRef` (BookPage.jsx:729-742).
- Header: shows `.specialNavSectionHeader` with `topLevelHeader` or `sectionNames[0]` or "Chapters" — only at top level and when depth ≤2 (or explicit topLevelHeader), and not if the same text already appears as a toggle title (BookPage.jsx:743-751).

**`JaggedArrayNodeSection`** (BookPage.jsx:776-849):
- Depth > 2: for each non-empty top section, heading `.sectionName` "<SectionName> <n>" (Hebrew: hebrewTerm(sectionName) + hebrew numeral/daf) then recurse one level down (e.g., Zohar: Volume/Paragraph; Mishneh Torah-type depth-3 texts list chapters within each).
- Depth ≤ 2: grid of section links (`a.sectionLink`), skipping empty sections (`contentCountIsEmpty` — 0 or arrays of zeros → availability indicator: only sections with content are listed). Depth 1: one link per segment (count).
- Section labels via `Sefaria.getSectionStringByAddressType(addressType, i, offset)` — handles Talmud daf addressing ("2a, 2b" — Talmud daf grid), Integer, Folio, etc.; Hebrew numerals/gematria for he.
- `refPathTerminal` for zoomed TOCs: appends first non-empty deeper address so links land at section level.
- `.current` highlighting: matches current section, current ref, or (depth>1) section contains ref.

**`ArrayMapNode`** (alt structure node) (BookPage.jsx:852-938):
- If `refs` present and `includeSections` (default true): list of section links; numbering via `addresses` (explicit) or `offset` + `skipped_addresses`; empty ref "" skipped. Labeled via addressTypes[0]. `.current` if ref contains visible ref.
  - If `displayFixedTitleSubSections` (Torah Parasha): title itself is link to first ref of `wholeRef` (splitSpanningRefNaive), always open, sections (aliyot) beneath.
  - Else collapsible titled block (default open).
- Else: single link to `wholeRef` (e.g., Parasha alt struct for non-Torah, Talmud "Chapters" alt struct where each perek links to its span) with current highlighting.

**`DictionaryNode`** (BookPage.jsx:941-987): if `headwordMap` → header (node title or "Browse By Letter / לפי סדר הא"ב") and letter links (each letter → ref). Current letter derived from current section ref substring.

### 3.9 Versions tab — `VersionsList` (BookPage.jsx:990-1040)
- `Sefaria.getVersions(currentRef)` → flatten; sort by `priority` desc then versionTitle asc.
- Each: `VersionBlock rendermode="book-page"` with currObjectVersions (marks current), `firstSectionRef` (per version first available section), `openVersionInReader` (select version + close), `viewExtendedNotes`. (VersionBlock details belong to the Versions inventory; key behaviors: version title/source/license/notes, "Select/Currently selected" buttons, language, buy/purchase info, extended notes link, version editing for editors.)

### 3.10 Index-level editor — `EditTextInfo` (BookPage.jsx:1073-1508) (admin/editor; opened from CategoryHeader "edit" on book page)
- Uses `AdminToolHeader title="Index Editor"` with Save/Cancel; saving overlay message.
- Fields: English title; Hebrew title (TORAH_SPECIFIC); English description; Short English Description; Hebrew description & Short Hebrew Description (TORAH_SPECIFIC); Category (`CategoryChooser` cascading dropdowns); Authors (TitleVariants tag input; each addition validated against `/api/name/<name>` requiring exact AuthorTopic match, alert with closest matches otherwise); Alternate English titles; Alternate Hebrew titles (TORAH_SPECIFIC); Completion Year (single year or range "1797-1800", negative for BCE "-900--200"; validated on blur); Place of Composition (+ Hebrew); Publication Year; Place of Publication (+ Hebrew); Dependence select (none/Commentary/Targum/Midrash/Guides; clearing resets collective title & base texts); if dependent: Base Text Titles (TitleVariants, each must be a library index) and Collective Title (input + "Create New Collective Title" → New English/Hebrew collective title inputs → POST `/api/terms/<name>` on save; else GET verifies term exists); Text Structure (`SectionTypesBox` section names; add/remove only when `canEdit` which is effectively never → just rename); Delete button.
- Validation (BookPage.jsx:1118-1164): title required; Hebrew title required if TORAH_SPECIFIC; no `.`, `-`, `\`, `/` in title or categories; no digits; category required; English title must not contain Hebrew; `validateMarkdownLinks` on en/he descriptions (AdminEditor); collective title check.
- Save: POST `/api/v2/raw/index/<Title_with_underscores>` (`?update=1` if index has oldTitle) with fields title, authors (slugs), titleVariants, heTitleVariants, heTitle, categories, enDesc, enShortDesc, heDesc, heShortDesc, pubPlace, compPlace, hePubPlace, heCompPlace, dependence, collective_title, base_text_titles, sectionNames, oldTitle (if renamed), pubDate/compDate (only if changed).
  - 202 + `task_id` → async rename: `Sefaria.pollTask(taskId, {onProgress})` shows step messages ("Title change queued — processing in background..."), on done alert + redirect `/admin/reset/<newTitle>`; on failure alert (network vs failure message).
  - Success → alert "Text information saved." → redirect `/admin/reset/<title>` (cache reset). Fail → alert and redirect anyway (timeouts).
- Delete: `DELETE /api/v2/index/<title>` via `apiRequestWithBodyAndAlert` → redirect `/texts`.

### 3.11 Misc
- `ReadMoreText` (BookPage.jsx:1514-1542): truncates after 30 words with "Read More ›" (legacy, unused?).
- ExtendedNotes mode commented out (BookPage.jsx:1545-1555) — extended notes now handled elsewhere (ReaderPanel `extended notes` mode).


### 3.12 TextTableOfContents reuse
- Also rendered inside the reader's Connections panel "table of contents" sidebar (ConnectionsPanel.jsx:37, 344) where `navigatePanel` is used and current location is highlighted/auto-scrolled.
- BookPage also used for menu mode `"extended notes"` (ReaderPanel.jsx:944-961) — with title from bookRef or current book, `backFromExtendedNotes`.
- BookPage in compare mode: opened by `openCompareTextTOC` from TextsPage/TextCategoryPage in a compare panel; back returns to navigation with `previousCategories` (ReaderPanel.jsx:917-943). `category` prop = `Sefaria.index(bookRef).primary_category`.

---

## 4. Nav sidebar (NavSidebar.jsx) — every module

### 4.1 Container
- `NavSidebar` = `<aside class="navSidebar" role="complementary" aria-label=...>`; renders `sidebarModules` list in order (`{type, props}`; `type:null` renders nothing), then `SidebarFooter` unless `includeFooter=false` (NavSidebar.jsx:14-26).
- `SidebarModules` dispatcher maps type string → component (NavSidebar.jsx:37-84). Registry (39 types): AboutSefaria, Promo, Resources, TheJewishLibrary, AboutTextCategory, AboutText, SupportSefaria, SponsorADay, LearningSchedules, Translations, WeeklyTorahPortion, DafYomi, AboutTopics, TrendingTopics, TopicLandingTopicCatList, AZTopicsLink, RelatedTopics, TitledText, Visualizations, JoinTheCommunity, JoinTheConversation, GetTheApp, StayConnected, AboutLearningSchedules, CreateASheet, WhatIsSefariaVoices, VoicesNewsletterSignUp, AboutTranslatedText, AboutCollections, ExploreCollections, DownloadVersions, WhoToFollow, Image, Wrapper, PortalAbout, PortalMobile, PortalOrganization, PortalNewsletter, RecentlyViewed, StudyCompanion.
- `SidebarModule` wrapper `.navSidebarModule` with optional `blue`, `wide` variants; `SidebarModuleTitle` renders `<h1>` with InterfaceText (children string id or en/he props).

### 4.2 Modules
| Module | Behavior | Cite |
|---|---|---|
| TitledText | Title + markdown body + children | NavSidebar.jsx:100-108 |
| RecentlyViewed | Loads `Sefaria.loadUserHistory(20, ...)` if not loaded; dedupes by book, excludes sheets, shows max 3; each link `/<normRef>?<version params>` with he/en ref; gtag `recently_viewed` events; "All history" link `/history` — if logged out, opens sign-up modal (`SignUpModalKind.ViewHistory`) instead. `mobile` variant: list below header and different phrase id. Hidden if no history. | :109-169 |
| Promo | `<Promotions adType="sidebar"/>` (CMS-driven sidebar ad) | :171-175 |
| StudyCompanion | "Study Companion" text + Sign up button → learn.sefaria.org/weekly-parashah with analytics `select_promotion`/`view_promotion` | :177-189 |
| AboutSefaria | "A Living Library of Torah" title (optional), en/he hard-coded blurb, "Learn More ›" → /about; when title shown: "Getting Started (2 min)" video button (EN: `HELP_CENTER_URLS.GETTING_STARTED`, targets Voices module; HE: youtube link) | :192-233 |
| AboutTranslatedText | Per-language title/body lookup for translations pages (ar, de, eo, es, fa, fi, fr, it, pl, pt, ru, yi), fallback to default "living library" blurb | :236-272 |
| Resources | "Resources" h3 + icon links: Mobile Apps (/mobile), Teach with Sefaria (/educators), Visualizations (/visualizations), Torah Tab (/torah-tab), Help (help center, new tab, he/en URL) | :275-286 |
| SidebarFooter | sticky footer links: About, Help, Contact Us (mailto:hello@sefaria.org), Newsletter (library module origin /newsletter), Blog, Instagram, Facebook, YouTube, Shop, Terms, Privacy Policy, Ways to Give, Donate (en/he donate URLs) | :289-322 |
| TheJewishLibrary | static text | :326-332 |
| SupportSefaria | title + text + DonateLink button (heart icon, source "NavSidebar-SupportSefaria"), `blue` variant gives white button | :335-345 |
| SponsorADay | "Sponsor a day of learning" DonateLink `link="dayOfLearning"` | :348-358 |
| AboutTextCategory | "About <Category>"/"אודות" + markdown `enDesc/heDesc`; hidden if no desc in interface language | :361-377 |
| AboutText | Book metadata: authors (links to /topics/<slug>, comma-joined, "Author"/"Authors" label), "Composed: <place>, <date>" (parens stripped; suppressed for Tanakh Torah/Prophets/Writings books), description markdown (enDesc‖enShortDesc). Hidden if nothing. Optional title "About This Text" | :380-430 |
| Translations | "Translations" + blurb + list of language links `/translations/<code>` for ISOMap entries with `showTranslations` (native names) | :433-441, 487-500 |
| LearningSchedules | Weekly Torah Portion: <parasha displayValue> + link to parasha ref; Haftarah links (all calendars starting "Haftarah"); Daf Yomi link; "All Learning Schedules ›" → /calendars | :444-533 |
| WeeklyTorahPortion | Parasha name+link, haftarot; "All Portions ›" → /topics/category/torah-portions | :536-560 |
| DafYomi | "Daily Learning" + Daf Yomi link | :563-575 |
| Visualizations | Filters 7 hard-coded explorer links (Tanakh & Talmud → /explore; Talmud & Mishneh Torah; Talmud & Shulchan Arukh; MT & SA; Tanakh & Midrash Rabbah; Tanakh & MT; Tanakh & SA) to those whose name contains any current category; hidden if none; "All Visualizations ›" | :578-627 |
| AboutTopics | static en/he text; optional title | :630-643 |
| TrendingTopics | `Sefaria.getTrendingTopics()` (library: `/api/topics/trending?n=10&pool=general_<lang>`; voices: `/api/sheets/trending-tags?n=10`), cached per day; links `/topics/<slug>`; analytics attrs | :645-672 |
| TopicLandingTopicCatList | "Browse Topics" (`id=browseTopics` anchor for scroll) list of top-level topic TOC categories → /topics/category/<slug> | :673-699 |
| AZTopicsLink | Title link "All Topics A-Z" → /topics/all/a | :700-716 |
| RelatedTopics | From index details `relatedTopics`; first 5 then "More" expands all; links /topics/<slug> | :719-739 |
| JoinTheCommunity | title + "Explore the Community" button → Voices module origin | :741-756 |
| JoinTheConversation | title + text + CreateSheetsButton (/sheets/new, voices module) | :758-768 |
| GetTheApp | text + /mobile link + iOS/Android AppStoreButtons | :771-787 |
| StayConnected | text + `NewsletterSignUpForm context="sidebar"` + Facebook (he: sefaria.org.il page)/Instagram/YouTube icon buttons | :790-824 |
| CreateASheet | TitledText "Create" with text varying by multiPanel ("mix and match... share digitally" vs "use a computer to..."), button only in multiPanel | :845-858 |
| WhatIsSefariaVoices | TitledText + "Learn More" button to `WHAT_ARE_VOICES_PATHS` | :860-866 |
| VoicesNewsletterSignUp | TitledText + Subscribe button (sefaria.org/newsletter or .org.il) | :868-874 |
| AboutLearningSchedules | static en/he text | :875-889 |
| AboutCollections | text + "Create a Collection" button (/collections/new) when title shown | :892-908 |
| ExploreCollections | text + button /collections | :911-922 |
| WhoToFollow | `Sefaria.followRecommendations` ProfileListings with follow buttons | :925-931 |
| Image | single image | :934-938 |
| Wrapper | arbitrary title + content | :941-946 |
| DownloadVersions | see §4.3 | :957-1055 |
| PortalAbout | title, ImageWithCaption, markdown description | :1058-1068 |
| PortalMobile | title, optional desc, iOS/Android buttons (alt text hard-coded "Steinsaltz app") | :1071-1082 |
| PortalOrganization | title + markdown desc | :1083-1090 |
| PortalNewsletter | title, desc, NewsletterSignUpForm without educator option, subscribe via `Sefaria.subscribeSefariaAndSteinsaltzNewsletter` | :1093-1107 |

### 4.3 Download text module (`DownloadVersions`, NavSidebar.jsx:957-1055) — book page sidebar
- Loads `Sefaria.getVersions(sref)`, flattens, filters out copyrighted (`license` starting "Copyright"), sorts by versionTitle.
- Dropdown 1 "Select Version": each version `"<versionTitle>/<language>"` label `<title (he title if Hebrew UI)> (<actualLanguage name>)`; plus "Merged Version (<lang>)" options for each distinct `language` (en/he) → value `merged/<lang>`.
- Dropdown 2 "Select Format": `txt` (text with tags), `plain.txt` (text without tags), `csv`, `json`.
- Download button disabled until both chosen; href `/download/version/<title> - <lang> - <versionTitle>.<format>` with `download` attribute; on click tracks `Sefaria.track.event("Reader","Version Download", ...)`.
- Backend: `text_download_api` (reader/views.py, see §11).

---

## 5. Calendars / Learning schedules page — `CalendarsPage` (CalendarsPage.jsx), URL `/calendars`
- Data source: `Sefaria.calendars` (server-provided per request, from `get_all_calendar_items`; can be refreshed via `Sefaria.updateCalendars(custom, diaspora)` → `/api/calendars?custom=&diaspora=`, sefaria.js:3643-3650).
- `reformatCalendars()` (CalendarsPage.jsx:101-136): clones; attaches hard-coded descriptions (`calendarDescriptions`, :142-200, keyed by title with " (A)"/" (S)" suffix stripped) unless API gave description; Parashat Hashavua: `displayTitle` = parasha name (displayValue), displayed ref = `ref/heRef`; others: displayTitle = calendar title, plus `enSubtitle` (Talmud/Tanakh) from descriptions. Merges consecutive entries with the same title into one listing with multiple refs (e.g., multi-ref Haftarah, multiple Daf a week etc.).
- Sections (:17-27): 
  - "Weekly Torah Portion": Parashat Hashavua, Haftarah (A) [Ashkenazi], Haftarah (S) [Sephardi], Haftarah.
  - "Daily Learning": Daf Yomi, 929, Daily Mishnah, Daily Rambam, Daily Rambam (3 Chapters), Halakhah Yomit, Arukh HaShulchan Yomi, Tanakh Yomi, Zohar for Elul, Chok LeYisrael, Tanya Yomi, Yerushalmi Yomi.
  - "Weekly Learning": Daf a Week.
  - Calendars not in these lists are not shown. Seasonal ones (e.g., Zohar for Elul) only appear when server returns them.
- `CalendarListing` (:70-98): `.navBlock.withColorLine.calendarListing` colored by `calendar.category`; title link to first ref URL; optional subtitle (translated ids `calendar_listing.tanakh/talmud`); list of refs each with book icon linking `/<ref.url>`; description.
- Layout: `ResponsiveNBox` per section; mobile shows `AboutLearningSchedules` inline; sidebar: AboutLearningSchedules (multiPanel), StayConnected, SupportSefaria, Promo.
- NOTE: descriptions duplicated in MobileContentServer exporter (comment :139-141).

---

## 6. Translations page — `TranslationsPage` (TranslationsPage.jsx), URL `/translations/<lang code>`
- Data: `Sefaria.getTranslation(slug)` → `/api/texts/translations/<lang>` (cached) (sefaria.js:3539-3543). Note: called on every render (TranslationsPage.jsx:13).
- Title `<h1>`: `Sefaria.getHebrewTitle(slug)` — per-language title from ISOMap (e.g., "Textos Judíos en Español"), fallback "Jewish texts in <slug>" (sefaria.js:922-924).
- Single tab "Texts" (`TabView` largeTabs; filter-tab rendering code references undefined `showFilterHeader` — dead).
- For each top-level TOC category (in `Sefaria.toc` order) present in the response:
  - `<h2>` corpus name.
  - "Prioritized": items under `Uncategorized` whose title is a direct child text of that top-level category → bullet list first.
  - For each sub-category of the corpus (TOC order) present in translations: `<details>` (open by default unless lang is "en") with `<summary>` category name and bullet list of `{title,url}` links sorted by `order[0]`.
  - "Uncategorized" `<details>` for remaining items.
- Links are full URLs to the reader with the translation version (`.translationsPage` class used by ReaderApp to handle link clicks — opening with that version; ReaderApp.jsx:1235-1236 `isTranslationsPage`).
- Sidebar: `AboutTranslatedText` with slug (localized blurb).
- Translations nav also from sidebar `Translations` module.

---

## 7. Topics — routing & which component renders
- Routes (sefaria/urls_shared.py:53-57): `/topics` → `topics_page`; `/topics/category/<slug>` → `topics_category_page`; `/topics/all/<letter>` → `all_topics_page`; `/topics/b/<slug>` → `topic_page_b` (A/B "test version" b); `/topics/<slug>` → `topic_page`. Legacy: `/sheets/tags` → /topics, `/sheets/tags/<tag>` → /topics/<tag> (301) (urls_shared.py:60-61; reader/views.py:1151-1173).
- Client routing (ReaderApp.jsx:1421-1431, 2059-2104): `/topics` → `menuOpen:"topics"`; category → `navigationTopicCategory` + title from `Sefaria.topicTocCategoryTitle(slug)`; all → `menuOpen:"allTopics"`, `navigationTopicLetter`; topic → fetches `Sefaria.getTopic(slug)` first, then sets `navigationTopic`, `topicTitle`, `topicTestVersion`.
- History URL (ReaderApp.jsx:561-582): topic → `topics/<slug>` (or `topics/<testVersion>/<slug>`) + `&sort=<topicSort>` + `&tab=<tab>`; category → `topics/category/<slug>`; root `topics`; all → `topics/all/<letter>` with title "Explore Jewish Texts by Topic - <letter>".
- ReaderPanel (ReaderPanel.jsx:983-1048): `menuOpen==="topics"`:
  - `navigationTopicCategory` → `TopicCategory`.
  - `navigationTopic` → `TopicPage` (props: tab, setTab, onSetTopicSort, topicSort, translationLanguagePreference, topicTestVersion, toggleSignUpModal, multiPanel...).
  - else **library module → `TopicsLandingPage`**; **voices module → `TopicsPage`** (old grid of TOC cards).
  - `menuOpen==="allTopics"` → `TopicPageAll`.

## 8. Topics landing page (library module) — `TopicsLandingPage` (TopicLandingPage/TopicsLandingPage.jsx)
- Layout (:14-57): `<h1>` "Explore by Topic"; sections in order:
  1. **Search** (`TopicLandingSearch`) with `numOfTopics = Sefaria.numLibraryTopics` (server prop).
  2. **Topic salad** (`TopicSalad`).
  3. **Featured topic** (`FeaturedTopic`).
  4. **Newsletter** (`TopicLandingNewsletter`).
  5. **Random topic cards with description row** (`RandomTopicCardWithDescriptionRow`).
  6. Temporal: **This week's Torah portion** (`TopicLandingParasha`) + **On the Jewish calendar / seasonal** (`TopicLandingSeasonal`).
- Sidebar: `TopicLandingTopicCatList` (Browse Topics), `TrendingTopics`, `AZTopicsLink`.
- Analytics attrs: `data-anl-project="topics"`, `data-anl-panel_name`, `data-anl-panel_type="Topic Landing"`, feature names per section.

### 8.1 TopicLandingSearch (TopicLandingSearch.jsx)
- Uses `GeneralAutocomplete` (Downshift-based) with:
  - `getSuggestions(input)`: ignore ≤1 char; `Sefaria.getName(word, 20, ["Topic"], "library", exactContinuations=true, orderByMatchedLength=true)` (→ `/api/name/...`); detect Hebrew input to pick he/en; each suggestion: title (first letter capitalized; trailing "(disambiguation)" removed if equal to one of its topic-TOC category names), category path text "(Cat > SubCat)" from `Sefaria.topicTocCategories(slug)`.
  - Rendered item: hashtag icon + title + gray category path; click/Enter opens topic via `openTopic(slug)`; Enter with no highlighted item opens first suggestion.
  - Input placeholder "Search <N> Topics A-Z" (en, N localized number) / "חיפוש לפי נושא" (he); maxLength 75; `SearchButton` icon.
- "Explore all topics" prompt below → smooth-scrolls the `.content` container to `#browseTopics` (sidebar Browse Topics module) offset by header height + 16px (:126-141, 157-159).

### 8.2 TopicSalad (TopicSalad.jsx)
- Fetches `Sefaria.getTopicsByPool("general_<en|he>", 50)` (random order, uncached) → `/api/topics/pools/<pool>?n=50`.
- Animated `RainbowLine` while loading (upper), static lower rainbow after.
- MultiPanel: `WordSalad` with `numLines=5`, bullets between items on same line (computed via offsetTop) and CSS clamp `--num-lines`. Mobile: `RowedWordSalad` single horizontally scrollable row.
- Items link `/topics/<slug>`.

### 8.3 FeaturedTopic (FeaturedTopic.jsx)
- `Sefaria.getFeaturedTopic()` → `/_api/topics/featured-topic?lang=<en|he>` (cached per day) (Django `TopicOfTheDay`).
- Shows header "Featured Topic", image (`topic.secondary_image_uri` — the 4:3 cropped secondary image; alt = image caption), title, markdown description, "Go to Topic ›" link. Hidden if no topic.

### 8.4 TopicLandingNewsletter (TopicLandingNewsletter.jsx)
- Heading "Stay curious: get the timeless topics newsletter"; inputs first name, last name, email; Enter key submits; validation messages (names required; valid email).
- Subscribes via `Sefaria.subscribeSefariaNewsletter(first, last, email, educator=false, lists)` → POST `/api/subscribe/<email>` with `lists` = `["Weekly Topics Newsletter"]` (English interface only; Hebrew = []) (sefaria.js:956-968).
- States: "Subscribing...", "Subscribed! Welcome to our list.", error (role=alert). Analytics `form_start`, `form_submit`.

### 8.5 RandomTopicCardWithDescriptionRow
- multiPanel → 3 cards, mobile → 10. Fetches `numTopics^3` topics from pool `general_<lang>`; keeps those with description in interface lang; `Card` with title, markdown description, bottom link "Explore <title> ›". (Relative hrefs `topics/<slug>`.)

### 8.6 TopicLandingParasha
- `Sefaria.getUpcomingDay('parasha')` → `/api/calendars/topics/parasha?lang=xx` (→ `parasha_data_api`: this week's parasha with topic slug, diaspora param default 1) cached per date.
- `TopicLandingCalendar` card: header "This week's Torah portion", title = parasha displayValue, description, link → `topics/<parasha topic>`; extras: "Learn More about <Parasha> ›", `ParashahLink` (current week's ref from `Sefaria.calendars`), "Read the Portion" button `/<parasha.url>`, "Browse All Torah Portions" → /topics/category/torah-portions.

### 8.7 TopicLandingSeasonal
- `Sefaria.getSeasonalTopic()` → `getUpcomingDay('holiday')` → `/api/calendars/topics/holiday?lang=xx` → `seasonal_topic_api` (Django `SeasonalTopic`: topic, optional secondary_topic, display start/end dates (diaspora-aware), date prefix/suffix).
- Card header "On the Jewish Calendar", topic title/description/link; "Learn more about <title> ›"; date message "<prefix> <secondary topic link> <suffix>" and formatted date range (Intl `formatRange`, en/he month-day) only when secondary topic exists; "Explore the Jewish Calendar" → /topics/category/jewish-calendar2. Dates created timezone-agnostically (`Util.createTimeZoneAgnosticDate`).

## 9. Topics TOC grid (voices module root) — `TopicsPage` (TopicsPage.jsx)
- Cards for each `Sefaria.topic_toc` top-level category via `TopicTOCCard` + extra card "All Topics A-Z" → `/topics/all/a` (or `א` in Hebrew) with description (:17-27).
- Title "Explore by Topic" in `CategoryHeader type="topics" toggleButtonIDs=["subcategory","reorder"]` → admin can add a top-level topic category or reorder the root topic TOC.
- Mobile: inline `AboutTopics`. Sidebar: `TrendingTopics`, `JoinTheConversation`.

### 9.1 TopicTOCCard (common/TopicTOCCard.jsx)
- `Card` with title link `/topics/category/<slug>` if topic has children else `/topics/<slug>`; description = `categoryDescription` for categories, `description` for leaves (markdown; `showDescription` flag).
- Strips leading "Parashat " / "פרשת " from titles (Torah portion grid shows bare names).
- Hidden if missing en or he title.
- Click: categories → `setNavTopic(slug, {en,he})`; leaves → `setTopic(...)`.
- `Card` (common/Card.jsx): title link with analytics, markdown description with disallowed elements (`['p']`, plus `'a'` in Voices module — links stripped because topic links are stored with library domain; sefaria.js:3946-3950), optional bottom link.

## 10. Topic category page — `TopicCategory` (TopicPage.jsx:225-273)
- Loads `Sefaria.getTopic(topic)` (for admin editing data) and subtopics `Sefaria.topicTocPage(slug)`.
- Subtopics filtered by `Sefaria.shouldDisplayInActiveModule` (topic.shouldDisplay && pools include module pool: library→"library", voices→"sheets") and sorted by `Sefaria.sortTopicsCompareFn` (displayOrder, top-level ignored; tie → alphabetical by interface-lang title, stripping leading `"`/`#`; Hebrew missing titles sorted last) (sefaria.js:3002-3036).
- Rendered as `TopicTOCCard` grid. Title h1 in `CategoryHeader type="topics" data={topicData}` (admin: add subcategory / edit).
- Sidebar: AboutTopics, Promo, TrendingTopics, SponsorADay; **special:** for `torah-portions` in English, inserts `StudyCompanion` after AboutTopics (:248-250).
- Analytics `data-anl-panel_category` from topic category path.
- Server (reader/views.py:1013-1037): 404 if topic slug not found; title/desc SEO.

## 11. Topic page — `TopicPage` (TopicPage.jsx:543-624)

### 11.1 Data
- `Sefaria.getTopic(slug, {with_html:true})` → `/api/v2/topics/<slug>?annotate_time_period=1&ref_link_type_filters=<about|popular-writing-of>&with_html=1&with_links=1&annotate_links=1&with_refs=1&group_related=1&with_indexes=1` (sefaria.js:3073-3089).
  - **Author special case:** if the topic's TOC category is `authors` and module is library, `ref_link_type_filters = ['popular-writing-of']` only (hides "about" Sources on author pages) (sefaria.js:3070-3079; server mirror reader/views.py:3902-3912).
- Processor `processTopicsTabsData` (sefaria.js:3093-3185) buckets ref links into tabs:
  - Voices module: only sheet links → `sheets` tab ("Sheets").
  - Library module (non-sheet links): `popular-writing-of` → "Top Citations" tab; `about` → "Notable Sources" if link has a published description (title or prompt) in interface lang, else "Sources".
  - Library: "Sources" becomes superset = notable + plain (titled "All Sources" if created only from notable).
  - Moderator: "Admin" tab = copy of Sources.
  - `order` normalized: availableLangs, numDatasource, tfidf, pr, curatedPrimacy{he,en}.
- If topic has `parasha` → `Sefaria.getParashaNextRead(parasha)` → `/api/calendars/next-read/<parasha>` (date, aliyot, haftarah) (:564).
- If topic has `portal_slug` → `Sefaria.getPortal(slug)` → `/api/portals/<slug>`; sidebar replaced by portal modules (:576-580). (Note: getPortal called on every render.)
- Cancelable load; resets when slug changes.
- Server `topic_page` (reader/views.py:3542-3591): normalizes slug; 404 if topic missing or not in the active module's pool; initialTab default `notable-sources`; initialTopicSort default `Relevance`; `noindex` if topic fails `should_display(min_sources=MIN_SOURCES_FOR_TOPIC_DISPLAY)`; SEO desc includes topic description. `topicData` prop = `_topic_page_data(...)` which **returns None** (missing `return`, reader/views.py:3905-3906) — server computes and discards; client always fetches.

### 11.2 Header — `TopicHeader` (:389-446)
- h1 title (primaryTitle; "Loading..." placeholder) in `CategoryHeader type="topics" toggleButtonIDs={["source","edit","reorder"]}` + admin action buttons: **Generate** (if links have `ai_context` but no prompt → POST `/api/topics/generate-prompts/<slug>` with ref_topic_links; alert) and **Publish** (unpublished but reviewed links → set `published=true`, POST `/api/ref-topic-links/bulk`; confirm → reload) (:329-387).
- AI marker: `AiInfoTooltip` (outline 24) when any about-link has published `ai_title` in current lang, library module only — hover popup "Some of the text on this page..." + Learn More (/ai) + Feedback (formstack) links.
- Category link (`topicCategory`) to `/topics/category/<parent slug>` (SPA via setNavTopic) unless it's a category itself.
- **TopicSponsorship** (:275-316): hard-coded dedication text for parasha topics (bereshit, lech-lecha, toldot, vayigash, achrei-mot, vaetchanan, vzot-haberachah) — only for topics with `ref` (parashot). Markdown.
- Description markdown (with HTML, disallowed elements per module).
- Topic image on mobile (non-multiPanel) under description (`TopicImage` = ImageWithCaption).
- Topics with `ref` (parashot/holidays with a ref): blue button linking to the ref in library module — text "Read the Portion" if parasha else the ref (he ref with geresh/gershayim stripped); plus English-only "Get the Free Study Companion" button (learn.sefaria.org/weekly-parashah, promotion analytics).

### 11.3 Tabs — `TopicPageTabView` (:638-830)
- Possible source tabs (`useAllPossibleSourceTabs`, :464-509): `popular-writing-of` (Top Citations), `admin`, `notable-sources`, `sources`, `sheets`. Each has sortOptions: refs → Relevance, Chronological; sheets → Relevance, Views, Newest. Tabs only appear if present in topicData.tabs.
- Extra tabs (:745-786):
  - **"Works on Sefaria"** (`author-works-on-sefaria`) prepended when topic has `indexes` (AuthorTopic aggregated works) and library module → list of `AuthorIndexItem` (title link to index or category URL in library module, description) (:448-461, 684-690). Backend `AuthorTopic.get_aggregated_urls_for_authors_indexes` groups works by category/collective title (e.g., "Rashi on Talmud") (sefaria/model/topic.py:794-880).
  - **Filter** pseudo-tab (funnel icon, right-justified) — not shown on notable-sources or works tabs; toggles the filter/sort header.
  - **Language toggle "A"** pseudo-tab (library module, not on works tab) — opens `LangSelectInterface` popover: Source / Translation / Source with Translation → sets local `langPref` hebrew/english/bilingual.
- Tab selection is URL-driven (`tab` prop / `setTab`); pseudo-tabs handled via `onClickArray`.
- Incremental loading: `useIncrementalLoad` per tab fetches text in chunks of `Sefaria._topicPageSize=70` refs via `Sefaria.getBulkText(refs, asSizedString=true, 500, 600, translationLanguagePreference)` (text trimmed to 500-600 chars) or `getBulkSheets(ids)` for sheets; results cached into `topicData.tabs[key].loadedData`; `_refsDisplayedByTab` remembers how many were displayed (restore on back).
- Empty → returns null; loading → LoadingMessage.

### 11.4 Tab content — `TopicPageTab` → `FilterableList` (:832-867)
- `pageSize=20` scroll pagination on the page's scroll container; `showFilterHeader` toggled by filter tab → new filter bar: text input (search within sources) + "Sort by" options.
- Filters: refs match text in en, he, ref, or the ref's categories (`refFilter` :81-88); sheets match title, summary, publisher name/position/organization (`sheetFilter` :91-97).
- Sorting (`refSort` :100-132): items with `order` first; Chronological → `comp_date`, then `order_id`; Relevance → curatedPrimacy (interface lang) desc, then (English UI) sources having English first, then pagerank `pr`, then `numDatasource*tfidf`.
- Sheet sort (`sheetSort` :135-159): first prefer sheets whose title/content language matches interface language; Views → views desc; Newest → dateCreated desc; Relevance → log(views)*relevance.
- Sort is lifted to ReaderPanel (`onSetTopicSort`, `topicSort`) and persisted in URL `&sort=`.
- First `details` element (first curated source) is forced open on data load (:836-841).

### 11.5 Source cards — `TopicTextPassage` (Story.jsx:167-212) via `refRenderWrapper` (TopicPage.jsx:180-213)
- Render modes: `admin` (isAdmin=true, show descriptions, show language-missing sources), `notable-sources` (descriptions, hide sources missing in langPref), `sources`/`popular-writing-of` (no descriptions, hide missing-language).
- Content: bilingual text via `ContentText` (Hebrew first in bilingual), override to the only available language; whole body links to `/<ref>?<version params>`; ref citation (`subHeading`) link; category color bar (`ColorBarBox` by ref's category).
- Curated (has description title in interface lang) + displayDescription → `SummarizedStoryFrame`: `<details>` with summary showing curated title + primary category (uppercase); inside, the learning **prompt** text then the source. (Guard for deleted indexes, sc-38063.)
- Hidden when source lacks the selected language and hideLanguageMissingSources.
- Admin (moderator) tools per source: `ReviewStateIndicator` per lang (Reviewed / Not Reviewed / Edited button; click marks reviewed via POST `/api/ref-topic-links/<ref>` with `review_state:"reviewed"`) and `PencilSourceEditor` (opens `SourceEditor`).
- `dataSources` tooltip text ("This source is connected to <topic> by <sources>") computed but `afterSave` element unused.
- Analytics batch per item: position, ai/human, item_id (ref), content_id (index title), content_type (categories).
- Sheet cards: `SheetBlock` — title link `/sheets/<id>`, Save button (history object "Sheet <id>"), summary, `ProfileListing` (author image/name/position/org with follow button).

### 11.6 Side column — `TopicSideColumn` (:975-1009), non-portal topics
- `TopicMetaData` (:1114-1172): topic image in sidebar on multiPanel; "Lived" section (timePeriod name + yearRange, for PersonTopics with annotate_time_period); "Learn More" links: Wikipedia (enWikiLink/heWikiLink), Jewish Encyclopedia (jeLink), National Library of Israel (enNliLink/heNliLink) — picks interface-lang URL, falls back to other lang with " (Hebrew)" / " (English)" suffix; open in new tab.
- `ReadingsComponent` (:1058-1105) for parasha topics with next-read data: "Readings" header, next read date (Gregorian locale + Hebrew calendar date string), Torah ref link, aliyot links 1-7 and "M" (maftir; Hebrew numerals, 'מ'), Haftarah link(s) — all targeted at library module.
- Related-topic link groups (`preprocessLinksByType` :894-973): from `topicData.links` grouped by link type (server `group_links_by_type`); only types with `shouldDisplay` and at least one link displayable in active module; links filtered by module, sorted (has interface-lang title first, then order.tfidf); plural title when >1; if no groups → fallback group of the topic's category siblings (first 20 from topic TOC; title = category name or "Explore Topics"/"נושאים כלליים"); groups sorted with "Related" first then alphabetical.
- `TopicSideSection` shows first 10, "More"/"Less" toggle. `TopicLink` → `/topics/<slug>` or `/topics/category/<slug>`, SPA click (setTopic / setNavTopic), analytics `related_click`.
- `Promotions` (sidebar ads) under side column.

### 11.7 Portal topics
- Topic with `portal_slug` (e.g., Steinsaltz-type portals): sidebar = `PortalNavSideBar` with modules in order about → mobile → organization → newsletter, each only if present in portal object (`PortalAbout`, `PortalMobile`, `PortalOrganization`, `PortalNewsletter`). Portal model fields: about{title,title_url,image_uri,image_caption,description}, mobile{title,description,android_link,ios_link}, organization{title,description}, newsletter{title,description,api_schema?} (sefaria/model/portal.py).

### 11.8 Other topic-page analytics
- Root container `data-anl-batch` = {project:"topics", content_lang, panel_category}.

## 12. All Topics A-Z — `TopicPageAll` (TopicPageAll.jsx), URL `/topics/all/<letter>`
- Loads all topics `Sefaria.topicList()` → `/api/topics?limit=0` (server `topics_list_api` → `get_all_topics(limit, active_module, min_sources)`; minified with titles; cache 1h); computes `normTitles`.
- Filter input "Search Topics" with reset button (shows when filter non-empty); filter applies only when ≥2 chars; matches any title (all languages) substring; results keep server order (by #sources) with interface-lang-titled first.
- Without filter: shows topics whose interface-language primary title starts with the URL letter, alphabetical (nikkud stripped).
- `AlphabeticalTopicsNav`: A–Z or Hebrew א–ת (final letters excluded) links `/topics/all/<letter>`.
- Excludes topics not displayable in active module. Grid of `TopicTOCCard`s; "There are no topics here." when empty.
- Sidebar: Promo, TrendingTopics, GetTheApp, SupportSefaria.

---

## 13. Admin / editor tools (moderator-only, inline)

### 13.1 `CategoryHeader` (Misc.jsx:997-1047) — the universal admin-button host
- Only when `Sefaria.is_moderator`. Wraps a heading; shows small admin buttons (`AdminEditorButton`) that appear on mouse-enter of the heading and auto-hide after 3s (`useHiddenButtons`).
- Button IDs: `subcategory` "Add sub-category", `source` "Add a source", `section` "Add section", `reorder` "Reorder sources", `edit` "Edit", plus custom `actionButtons` (e.g., Generate/Publish).
- Actions by `type`:
  - edit: `books` → `EditTextInfo` (index editor); `sources` → `SourceEditor`; `cats` → `CategoryEditor` for existing category (prefilled from TOC object: title, he title, desc, short desc, isPrimary); `topics` → `TopicEditor` for existing topic (prefill from topic data: titles incl. disambiguation, descriptions, category descriptions, alt titles, author properties, era, image, secondary image; parent slug via `TopicToCategorySlug`; `origWasCat` if topic has `displays-above` links).
  - subcategory: `cats` → new `CategoryEditor` under current path; `topics` → new `TopicEditor` with parent slug.
  - source: `SourceEditor` for new topic source.
  - section: navigates to `/add/<title>` (legacy add-section editor).
  - reorder: `ReorderEditorWrapper`: root topics (POST `/api/topic/reorder`, redirect /topics, items `Sefaria.topic_toc`); root categories (POST `/api/category?reorder=1`, redirect /texts, items `Sefaria.toc`); topic sources (POST `/api/source/reorder?topic=<slug>&lang=<interfaceLang>`, redirect back to topic with `sort=Relevance&tab=<tab>`, items = first 30 non-sheet sources sorted by relevance).
- Used in: TextsPage title (subcategory, reorder), TextCategoryPage h1 & each nested subcategory h2, BookPage title (section, edit), TopicsPage (subcategory, reorder), TopicCategory h1, TopicHeader (source, edit, reorder + Generate/Publish), TextPassage (sources edit).

### 13.2 `AdminEditor` (AdminEditor.jsx) — generic form shell
- Header (`AdminToolHeader`: title, Cancel, Save); "Saving..." overlay; renders `items` list by name from `options_for_form` (:6-68): English/Hebrew Caption, Title, Hebrew Title, English/Hebrew Description (markdown, link-validated), Prompt ("Source Description"), Previous Prompt (read-only), Context for Prompt (`ai_context`), Previous Title (read-only), English/Hebrew Short Description (TOC), English/Hebrew Alternate Titles (tag input), Birth Place (+Hebrew), Place of Death (+Hebrew), Birth Year, Death Year (number inputs), Era dropdown (GN/RI/AH/CO); plus special slots "Category Menu", "Picture Uploader", "Secondary Picture Cropper"; `extras`; Delete button (confirm) when not new.
- Hebrew fields hidden when not `TORAH_SPECIFIC`.
- Input values sanitized (all HTML tags stripped) (:130-135).
- `validateMarkdownLinks` (:93-124): for each `[text](url)` in markdown fields: `/topics/...` links validated against topic completions, others via `/api/name/` (refs pass); unknown → confirm dialog.

### 13.3 `TopicEditor` (TopicEditor.jsx)
- Fields: Title, Hebrew Title, English/Hebrew Description, Parent Topic select (all topic categories from `Sefaria.slugsToTitles()` + "Choose a Parent Topic" + "Main Menu"), English/Hebrew Alternate Titles; if category (originally a category or parent "Main Menu") → English/Hebrew Short Description (categoryDescription); if parent is `authors` → author fields (birth/death place/year, era); Picture Uploader; English/Hebrew Caption; Secondary Picture Cropper; Reorder subtopics (existing topics with children).
- Title disambiguation: "Title (disambiguation)" parsed into `{text, disambiguation}` for primary and alt titles.
- Validation: must change something; parent required; English title required; captions ≤300 chars.
- Save: reorders subtopics first (POST `/api/topic/reorder`, redirect /topics) if any; then POST `/api/topic/new` (new) or `/api/topics/<origSlug>` (edit) with `{category, titles, secondary_image_uri, image?, description?, categoryDescription?, author keys?, origSlug, origCategory}` → redirect `/topics/<newSlug>` (or `onCreateSuccess`).
- Picture upload (`TopicPictureUploader`): jpg/png/gif only → POST multipart `/_api/topics/images/<slug>` (with `old_filename` to replace) → GCS `topics/<slug>-<uuid>.png`; Remove → DELETE `?old_filename=`. Changing picture forces save before closing.
- Secondary picture (`TopicPictureCropper`): only if primary image; `ImageCropper` 4:3 ratio crop of primary → POST `/_api/topics/images/secondary/<slug>`; shown on Topics Landing (featured topic). Remove supported.
- Delete topic: DELETE `/api/topic/delete/<slug>` → /topics.
- Also used by `TopicSearch.jsx` (create topic from sheet tagging UI).
- Backend: `add_new_topic_api` (sets isTopLevelDisplay when category is root, creates `displays-under` IntraTopicLink, author place/time, `description_published=True`, `data_source="sefaria"`, rebuilds autocompleter & topic TOC) (reader/views.py:3656-3692); `topics_api` POST → `update_topic` (staff only) (:3712-3742); `reorder_topics` sets displayOrder = index*10 (:3810-3819).

### 13.4 `CategoryEditor` / `ReorderEditor` / `Reorder` (CategoryEditor.jsx)
- `Reorder`: list with up/down arrow images swapping neighbours; display by type (cats: title/category; topics: en; sources: "<curated title> - <ref>" or he ref).
- `ReorderEditor`: full-screen "Reorder Editor"; posts `{subcategoriesAndBooks: titles, path: []}` / `{topics}` / `{sources}`.
- `CategoryEditor`: fields Title, Hebrew Title, English/Hebrew Description, Parent Category (`CategoryChooser`), English/Hebrew Short Description; Reorder children (existing); **Primary Status** toggle (True/False: "If true, this category will display its contents on its own category page") → `isPrimary`.
  - Save → POST `/api/category/<full/path>` (`?update=1` for existing, `&reorder=1` if children reordered) with `{isPrimary, enDesc, heDesc, enShortDesc, heShortDesc, heSharedTitle, sharedTitle, path, origPath, subcategoriesAndBooks}`; non-TORAH_SPECIFIC sites fabricate heSharedTitle. Redirect `/texts/<path>`.
  - Delete only when empty → DELETE `/api/category/<path>` → /texts.
  - Backend `category_api` (reader/views.py:2859-2961): staff or API key; creates Term if needed; refuses merging two same-named categories; reorder via `update_order_of_category_children`.
- `CategoryChooser` (Misc.jsx:2948-3005): cascading `<select>` menus starting at TOC root ("Table of Contents" placeholder), only valid paths kept.
- `TitleVariants` (Misc.jsx:3008-3046): ReactTags tag input (Enter to add; duplicates rejected; overridable add/delete/validate).

### 13.5 `SourceEditor` (SourceEditor.jsx) — topic source (RefTopicLink) editor
- Fields: Previous Title (read-only, if existing), Title, Previous Prompt (read-only), Prompt (source description), Context for Prompt; ref `Autocompleter` (ref completions via `/api/name/<input>?type=ref`, color-coded; shows "add" when section/segment ref typed).
- Validate ref via cache/`Sefaria.getRef`. Save: POST `/api/ref-topic-links/<ref>` with `{new_ref, topic, is_new, interface_lang, description:{title,prompt,ai_context,review_state:"edited"}}` → redirect `/topics/<topic>?sort=Relevance&tab=<tab>`. Delete: DELETE `/api/ref-topic-links/<ref>?topic=&interface_lang=` → topic page.
- Backend `topic_ref_api` (reader/views.py:3864-3897): link type auto `popular-writing-of` for AuthorTopics else `about`; staff only for writes.

### 13.6 Index editor `EditTextInfo` — see §3.10. Version editing (pencil on VersionBlock in book-page mode, moderators): edit versionTitle, Hebrew title, short titles, source, license, direction, isSource, isPrimary, digitizedBySefaria, priority, locked, notes (en/he), purchase URL/image; save POST `/api/version/flags/<title>/<lang>/<vtitle>`; delete version DELETE `/api/texts/<title>/<lang>/<vtitle>` (VersionBlock/VersionBlock.jsx:120-170, 222-292).

---

## 14. Updates panel ("New Additions to the Library") — `UpdatesPanel` (UpdatesPanel.jsx)
- Mounted standalone via `templates/static/updates.html` (`reactComponentName='UpdatesPanel'`); history case `"updates"` exists in ReaderApp.jsx:621-625. **No URL route found** mapping `/updates` to that template in sefaria/urls*.py — page appears orphaned (verify).
- Infinite scroll on window (600px margin) loading `/api/updates?page=N` (page_size 10) until `count < page_size`.
- Each item rendered by `Notifications` (NotificationsPanel.jsx:117-130) by type: `index` ("New Text: <title>" link + HTML body), `version` ("New English/Hebrew version of <title>: <version>"), `general` (HTML).
- Moderator: `NewUpdateForm` (radio Index/Version/General; Index Title; Version Title + language en/he; English/Hebrew description textareas; validation: general requires both langs, index requires title, version requires version+language) → POST `/api/updates`; delete icon per item → DELETE `/api/updates/<id>`.
- Sidebar modules defined (Promo, StayConnected) but NavSidebar not rendered (unused var).

## 15. Story.jsx remnants (reused components)
- Stories feed removed Nov 2022 (Story.jsx:19-20). Remaining exports: `SheetBlock`, `StorySheetList` (list of SheetBlocks; compact/cozy/smallfonts variants), `TextPassage` (ref title with SaveButton and admin `CategoryHeader type="sources"` edit, color bar, text; used elsewhere), `TopicTextPassage` (§11.5). `SaveLine` = children + `SaveButton` (tooltip; save to user's saved items; sign-up modal if logged out) + afterChildren.

## 16. TopicsLaunchBanner (TopicsLaunchBanner.jsx) — currently unused
- Not imported anywhere (dead code). Behavior: 2025 topics launch banner; English UI only; not on `/topics` or `/sheets*`; session-storage dismissal key `banner_2025-topics_launch`; appears after 2s with height transition; adds `hasBannerMessage` body class when header-only layout; desktop & mobile SVG graphics (word-cloud of topic names) with "Explore" link to /topics; close button; gtag `banner_viewed` / `banner_interacted_with_*`.

---

## 17. Misc.jsx components used by these pages
| Component | Behavior | Cite |
|---|---|---|
| `ResponsiveNBox` | measures own width (and on resize): >1500px → 3 cols, >500 → 2, else 1; wraps `NBox` | Misc.jsx:2437-2466 |
| `NBox` | n-column flex rows, pads last row with placeholders unless `stretch`; optional gap | :2395-2414 |
| `TwoOrThreeBox` | 3 cols if width > threshold (500) else 2 (legacy) | :2416-2434 |
| `TabView` | controlled/uncontrolled tabs (`currTabName`/`setTab`), `null` currTabName → sets first tab; role=tablist/tab/tabpanel, keyboard nav (`Util.handleTabKeyDown` arrows/Home/End), `onClickArray` overrides for pseudo-tabs, `clickTabOverride`, `justifyright` tabs | :400-504 |
| `FilterableList` | filter + sort + scroll pagination; old design (search bar + Sort dropdown modal) vs new design (`showFilterHeader` defined: filter input + inline sort options with keyboard support & analytics); `getData` or `data`; renderHeader/Footer/EmptyList; `onSetSort`/`externalSortOption` for lifted sort; sort labels localized (Alphabetical, Recent, Views, Relevance, Chronological, Newest) | :226-397 |
| `CategoryAttribution` | currently only Talmud/Bavli → "The William Davidson Talmud"/"Edition" link `/william-davidson-talmud` (sefaria.js:2743-2763) | :2610-2622 |
| `CategoryColorLine` | top colored bar by category; fires `header_viewed` impression (sa_event + gtag) once fully visible | :1633-1646 |
| `LanguageToggleButton` | aleph/aye icon link toggling panel content language | :723-750 |
| `ColorBarBox` | left border colored by ref's category | :753-755 |
| `LoadingMessage` | "Loading..."/"טוען מידע..." aria-live | :2588-2607 |
| `AiInfoTooltip` | AI star icon (solid/outline, 18/24) with hover message, Learn More (/ai), Feedback (formstack) | :1487-1542 |
| `ImageWithCaption` / `ImageWithAltText` | image + InterfaceText caption; alt from caption or "illustrative image" | :3334-3347 |
| `LangSelectInterface` | radio popover Source / Translation / Source with Translation; closes on blur/selection; analytics | :3398-3474 |
| `AppStoreButton` | iOS/Android buttons | :3349-3360 |
| `Dropdown` | select-like dropdown used by DownloadVersions | :2469+ |
| `AdminToolHeader`, `CategoryChooser`, `TitleVariants` | see §13 | :2926-3046 |
| `ToolTipped` | button wrapper with gtag click tracking | :1458-1468 |
| `SimpleLinkedBlock` | bilingual link block (optional new tab) | :792-807 |
| `InterfaceText` | interface-language text from {en,he}, html, markdown (disallowedMarkdownElements), or string ids | :100-167 |
| `ContentText` (ContentText.jsx) | follows *content* language (bilingual shows both, or interface lang when `defaultToInterfaceOnBilingual`); `overrideLanguage`, `bilingualOrder` | ContentText.jsx |

---

## 18. Sefaria.js functions relied upon
| Function | Purpose | Cite |
|---|---|---|
| `Sefaria.toc` (server prop) / `_cacheFromToc` | full library TOC tree; caches index records, search TOC order, category Hebrew terms | sefaria.js:1390-1419 |
| `tocObjectByCategories(cats)` / `tocItemsByCategories(cats)` | walk TOC by category path; contents cloned | :2719-2742 |
| `commentaryList(title)` | commentaries in TOC with `dependence=='Commentary'` whose `refs_to_base_texts` include title | :2695-2718 |
| `categoryAttribution` | Talmud/Bavli William Davidson | :2743-2763 |
| `hebrewTerm(name)` | category/term/version/index Hebrew name with fallbacks + hard-coded few ("Quoting Commentary", "Modern Commentary", "Sheets", "Notes", "Community") | :3655-3677 |
| `hebrewTranslation(str)` | keyed string ids or terms | :3697-3713 |
| `index(title)` | cached TOC index records (title, heTitle, categories, primary_category, dependence, base_text_titles, order, hidden, enShortDesc...) | :1372-1380 |
| `getIndexDetails(title)` / `FromCache` | `/api/v2/index/<title>?with_content_counts=1&with_related_topics=1` → schema w/ content_counts, alts, default_struct, exclude_structs, firstSectionRef, authors, compDateString, compPlaceString, pubDateString, dedication, lexiconName, relatedTopics, heCategories, collective_title, base_text_titles | :1439-1449; text.py:260-337 |
| `getVersions(ref)` | `/api/texts/versions/<ref>` cached, bucketed by language | :931-945 |
| `lastPlaceForText(title)` | `Sefaria.last_place` (server prop) | :2985-2988 |
| `getSectionStringByAddressType(type,i,offset)` | Talmud daf (2a…), Year (+1241, Hebrew gematria w/ gershayim), Folio, default integer/Hebrew numeral | :355-373 |
| `zoomOutRef`, `splitSpanningRefNaive`, `refContains`, `sectionRef`, `normRef`, `humanRef` | ref utilities for TOC | :302-314 etc. |
| `calendars` (server prop), `updateCalendars(custom, diaspora)`, `calendarRef` | learning schedules | :3639-3650 |
| `getUpcomingDay('parasha'|'holiday')` | `/api/calendars/topics/<day>?lang=` cached per day | :3041-3051 |
| `getParashaNextRead(parasha)` | `/api/calendars/next-read/<parasha>` | :3053-3059 |
| `getTranslation(lang)` | `/api/texts/translations/<lang>` | :3539-3543 |
| `ISOMap`, `getHebrewTitle(slug)`, `translateISOLanguageName` | translation-language metadata (showTranslations flags; titles) | :889-924 |
| `topic_toc` (server prop) + `topicTocPage(parent)`, `topicTocCategories(slug)`, `displayTopicTocCategory(slug)`, `topicTocCategoryTitle(slug)`, `isTopicTopLevel`, `slugsToTitles()` | topic TOC indexing (children by parent, parent chains) | :3222-3307 |
| `getTopic(slug, opts)`, `getTopicFromCache`, `processTopicsTabsData`, `_deriveTabDataForTopicLink`, `_CAT_REF_LINK_TYPE_FILTER_MAP` | topic page data | :3068-3189 |
| `topicList()` | `/api/topics?limit=0` with normTitles | :2990-3001 |
| `shouldDisplayInActiveModule`, `getTopicPoolNameForModule`, `getLangSpecificTopicPoolName`, `sortTopicsCompareFn` | module-aware topic filtering/sorting | :2287-2299, 3002-3036 |
| `getTopicsByPool(pool, n, order)` | `/api/topics/pools/<pool>?n=&order=`; cached only for non-random order | :2271-2286 |
| `getFeaturedTopic`, `getSeasonalTopic`, `getTrendingTopics` (library vs voices) | landing modules | :3190-3221 |
| `getPortal(slug)` | `/api/portals/<slug>` cached | :947-955 |
| `getBulkText(refs, asSizedString, min, max, transLangPref)`, `getBulkSheets(ids)` | topic tab sources | :596, 849 |
| `postRefTopicLink`, `apiRequestWithBody(AndAlert)` | admin writes | :973-1000 |
| `subscribeSefariaNewsletter`, `getTopicLandingNewsletterMailingLists`, `subscribeSefariaAndSteinsaltzNewsletter` | newsletters | :956-1030 |
| `pollTask(taskId)` | Celery task polling `/api/async/<id>` every 3s (index rename) | :3599-3638 |
| `_tableOfContentsDedications` | daily library dedications cache | :3037 |
| `getDisallowedMarkdownElements()` | ['p'] or ['p','a'] in Voices | :3946-3950 |
| `numLibraryTopics`, `trendingTopics`, `followRecommendations`, `last_place`, `userHistory` | server-provided props | :4013-4052 |
| `palette.categoryColor`, `palette.refColor`, `palette.indexColor` | category colors | :4078-4087 |

---

## 19. Backend views (reader/views.py unless noted)
| URL | View | Notes |
|---|---|---|
| `/texts` | `texts_list` (:1320-1324) | menu "navigation"; props from `get_user_history_props` (recently viewed) |
| `/texts/<cats>` | `texts_category_list` (:977-1010) | redirects "Tanach"→"Tanakh"; `/texts/recent` legacy; unknown path → falls back to `texts_list`; SEO desc = enDesc/heDesc → short desc → default; JSON-LD breadcrumbs (`ld_cat_crumbs`) |
| `/texts/notes`, `/texts/recent` | notes / old redirect | urls_library.py:20-21 |
| `/<Index title>` | `catchall` → `text_panels` → `make_panel_dict` (:489-599, 803-960) | book-level ref → panel `menuOpen:"book toc"` with `indexDetails` (content counts + relatedTopics) and `versions`; `?notes=1` → "extended notes"; `?tab=` → initialTab; desc = index desc + "Read the text of X online..." ; wrong module → redirect to library module; non-canonical URL → redirect |
| `/calendars` | `calendars` (:1326-1329) | menu page |
| `/translations/<slug>` | `translations_page` (:1257-1294) | hard-coded per-language title/desc (ar,de,en,eo,es,fa,fi,fr,he,it,pl,pt,ru,yi); 404 others (e.g., ro, tr which ISOMap lists with showTranslations=1 → **sidebar links 404**) |
| `/topics`, `/topics/category/<slug>`, `/topics/all/<letter>`, `/topics/<slug>`, `/topics/b/<slug>` | `topics_page`, `topics_category_page`, `all_topics_page`, `topic_page`, `topic_page_b` | see §7-12 |
| `/parashat-hashavua`, `/todays-daf-yomi` | redirects to current calendar refs (:4679-4690) | |
| `/download/version/<title> - <lang> - <vtitle>.<fmt>` | `sefaria/views.py:text_download_api` (:1689-1702) | formats json/csv/txt/plain.txt; `merged` versionTitle → merged export; refuses copyrighted; `Content-Disposition: attachment` |
| `/download/bulk/versions/` | staff bulk zip by title/version regex | sefaria/views.py:1706-1747 |
| `/api/v2/index/<title>` | `index_api` (:2102-2175) | GET with content counts/related topics; POST (staff/API key) save, title change async via Celery (202 + task_id); DELETE staff |
| `/api/category/<path>` | `category_api` (:2859-2961) | GET/POST/DELETE |
| `/api/texts/translations/<lang>` | `translations_api` (:4752-4841) | aggregation over versions with `actualLanguage==lang` (+ `enComplete` for en); groups by first two categories (pads "Uncategorized"); excludes "Reference"; for en/he, commentaries bundled by collective title linking to `/texts/<...collective>`; else link to first section with `?ven=<family>|<vtitle>&lang=bi`; includes order, versionTitle |
| `/api/calendars` | `calendars_api` (:2978-3009) | diaspora, custom, timezone, year/month/day |
| `/api/calendars/next-read/<parasha>` | `parasha_next_read_api` (:3012-3023) | |
| `/api/calendars/topics/parasha` | `parasha_data_api` (:2965-2975) | includes topic slug |
| `/api/calendars/topics/holiday` | `seasonal_topic_api` (:3841-3861) | |
| `/api/topics` | `topics_list_api` (:3594-3609) | |
| `/api/topics/<slug>`, `/api/v2/topics/<slug>` | `topics_api` (:3712-3742) → `sefaria/helper/topic.py:get_topic` (:40-101) | omits orphaned ref links; strips unpublished description; groups links by type (TopicLinkType displayName/pluralDisplayName/shouldDisplay; `groupRelated` types merged into "Related"); refs sorted by relevance and **similar/overlapping refs merged** (except learning-team sources); `indexes` for AuthorTopic; `possibilities` for ambiguous topics (not rendered by client) |
| `/api/topics/pools/<pool>` | `topic_pool_api` (:3764-3777) | voices→sheets pool mapping; Django `sample_topic_slugs` |
| `/_api/topics/featured-topic` | `featured_topic_api` (:3780-3789) | Django TopicOfTheDay |
| `/api/topics/trending` | `trending_topics_api` (:3791-3807) → GA4 pageviews of `/topics/*` last 28 days (sefaria/helper/topic.py:470-498), filtered by pool | |
| `/api/topics/generate-prompts/<slug>` | staff, Celery LLM prompt generation | :3628-3643 |
| `/api/topic/new`, `/api/topic/delete/<slug>`, `/api/topic/reorder`, `/api/source/reorder` | staff topic admin | :3656-3708, 3810-3819, 3899-3903 |
| `/api/ref-topic-links/<ref>`, `/api/ref-topic-links/bulk` | topic source CRUD / bulk publish | :3821-3897 |
| `/_api/topics/images[/secondary]/<slug>` | staff image upload/delete to GCS topics bucket | :4296-4323 |
| `/api/portals/<slug>` | `portals_api` (:3953-3959) | |
| `/api/updates[/<id>]` | `updates_api` (:3271-3333) | GET paged; POST staff/API key; DELETE staff |
| `/api/terms/<name>` | `terms_api` (:3026+) | used by index editor collective titles |
| `/api/name/<name>` | `name_api` | autocomplete for author validation, topic search, link validation |

### 19.1 Topic model behaviors the client depends on (sefaria/model/topic.py)
- Subclasses: `Topic`, `PersonTopic` (subclass "person": time period/place annotation → `timePeriod`, Hebrew birth/death place auto-filled from Place), `AuthorTopic` (subclass "author": authored indexes & aggregated works list; `is_author`) (:205-216, 680-885).
- Fields: titles (with disambiguation, transliteration flag), description (+ `description_published` gate), categoryDescription, isTopLevelDisplay, displayOrder (default 10000), numSources, shouldDisplay, parasha, ref {en,he,url}, good_to_promote, isAmbiguous, data_source, image {image_uri (must be GCS img.sefaria.org/topics/...), image_caption{en,he}}, secondary_image_uri, portal_slug (validated), properties (enWikiLink, heWikiLink, jeLink, enNliLink, heNliLink, birthPlace, deathPlace, birthYear, deathYear, era, ...), pools (Django-managed: "library", "sheets", "general_en", "general_he", ...).
- `should_display(min_sources)`: shouldDisplay !== False and (numSources ≥ min, or has description, or data_source=="sefaria") (:449-450).
- `contents(minify)`: minified form used in topic TOC & lists includes slug, shouldDisplay (true if has children), displayOrder, pools, categoryDescription, published description (:582-612).
- Link types (IntraTopicLink): `displays-under`/`displays-above` (TOC hierarchy), `is-a`, `related-to` etc.; grouped into side-column sections with displayName/pluralDisplayName/shouldDisplay from TopicLinkType; RefTopicLink linkTypes `about` and `popular-writing-of` (authors' "Top Citations"); descriptions per lang {title, prompt, ai_title, ai_context, published, review_state}.
- Topic TOC (`library.get_topic_toc_json`) is rebuilt after admin edits.
- Book "Related Topics" (`get_topics_for_book`, sefaria/helper/topic.py:501-518): topics linked to any ref in the book, excluding `parashat-*`, ranked by user votes, top 18 (cached 24h).

### 19.2 TOC model notes (sefaria/model/category.py, text.py)
- Category nodes: category, heCategory, enDesc/heDesc, enShortDesc/heShortDesc, isPrimary, searchRoot, order, enComplete/heComplete (completeness ignores Commentary subtrees) (category.py:270-283, 505-530).
- Text nodes: title, heTitle, categories, primary_category, dependence, order, base_text_titles, base_text_order, refs_to_base_texts, collectiveTitle/heCollectiveTitle, commentator, corpus, firstSection, enComplete/heComplete, authors, base_text_mapping, **hidden** (text.py:860-910).
- Collections with a `toc` field and `listed` are injected into the TOC as `TocCollectionNode` (`isCollection`, slug, title, heTitle, short descs) (category.py:287-299, 608-660).

---

## 20. Edge cases / special-cased titles & categories (consolidated)
- Talmud → Bavli default; Tosefta → Vilna Edition default; subcategory toggle Bavli/Yerushalmi, Vilna/Lieberman (TextCategoryPage.jsx:24-28, 307-337).
- "Commentary" category title = "<parent> Commentary"; nestLevel=1 (TextCategoryPage.jsx:39-51).
- Title shortening whitelist & Pesach Haggadah rename & Siddur exemption & " (Lieberman)" suffix strip & "Jerusalem Talmud"/"Tosefta Kifshutah" prefix strip (TextCategoryPage.jsx:340-382).
- Hebrew sort skip when all have `base_text_order` (TextCategoryPage.jsx:393-396).
- Sidebar: Tanakh → WeeklyTorahPortion; Talmud|Bavli → DafYomi (TextCategoryPage.jsx:424-431).
- Book page category link rules for Commentary ("X on <base>"), Targum, Guides, Talmud (BookPage.jsx:157-169).
- Torah books: Chapters + "Torah Portions" (Parasha alt struct, aliyot shown, fixed) and no struct toggle (BookPage.jsx:392-468).
- Dictionaries: DictionarySearch, letter grid, no Download module, no toggle (BookPage.jsx:154, 205, 423, 431-438, 941-987).
- `default_struct`, `exclude_structs`, `toc_zoom`, `index_offsets_by_depth`, `includeSections`, `addresses`, `skipped_addresses`, `offset`, address types Talmud/Folio/Year (BookPage.jsx; sefaria.js:355-373).
- AboutText hides composition date/place for Tanakh Torah/Prophets/Writings (NavSidebar.jsx:386-389).
- Download: copyrighted versions excluded; merged per language.
- Calendars: Haftarah (A)/(S) suffix-stripped description lookup; Parashat Hashavua uses parasha name as title; consecutive same-title entries merged.
- Translations page: `en` details collapsed by default, others expanded; Reference category excluded; commentaries bundled for en/he.
- Topics: author pages show only Top Citations + Works on Sefaria (library); torah-portions category gets StudyCompanion; parasha topics: sponsorship text, Read the Portion, Study Companion button, Readings sidebar; portal topics replace sidebar; "Parashat " prefix stripped in TOC cards; final Hebrew letters excluded from A-Z nav; A-Z filter ≥2 chars; TopicLandingSearch strips disambiguation that equals category name.
- Voices module: TopicsPage instead of landing; trending = trending sheet tags; only Sheets tab; markdown links stripped in cards; topic pool "sheets".
- Library dedication flips at 6pm local; from Google Sheet fallback.

## 21. Surprising findings / likely bugs (flag for rebuild)
1. `_topic_page_data` lacks `return` → `topicData` server prop is always None while the server still computes it (reader/views.py:3905-3906).
2. `/updates` page: `UpdatesPanel` + `templates/static/updates.html` exist but no URL route found in sefaria/urls*.py (orphaned?).
3. `TopicsLaunchBanner` is not imported anywhere (dead).
4. Translations sidebar links include `ro` and `tr` (ISOMap showTranslations=1) but `translations_page` 404s for them (reader/views.py:1262-1286 vs sefaria.js:903,907).
5. `TranslationsPage` calls `Sefaria.getTranslation` on every render (cached promise, but sets state each time) and references undefined `showFilterHeader` in tab renderer (TranslationsPage.jsx:13, 49).
6. `TopicPage` calls `Sefaria.getPortal` during render each time (TopicPage.jsx:577).
7. `ResponsiveNBox` prop misspelt `intialWidth` in one call (TextCategoryPage.jsx:242).
8. `SectionTypesBox` `canEdit={index.current === {}}` always false (BookPage.jsx:1498).
9. `BookPage.getCurrentVersion` / `ReadMoreText` appear unused; ExtendedNotes in BookPage commented out.
10. TopicPage computes `dataSourceText` tooltip (`afterSave`) but never renders it (TopicPage.jsx:186-194).
11. Ambiguous topic `possibilities` returned by API but not rendered by the client.
12. `UpdatesPanel` defines sidebarModules but renders no NavSidebar.
