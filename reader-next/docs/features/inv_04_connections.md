# Inventory 04 — Connections / Resources Sidebar + Version Selection

Repo: `/Users/akiva/Sefaria/dev/Sefaria-Project`, branch `master` @ `bb47dd77a`. All paths are relative to the repo root; JS paths are under `static/js/` unless stated otherwise.
I read the sidebar files in full. I read the supporting code (ReaderApp / ReaderPanel / sefaria.js / reader/views.py / wrapper.py) in the relevant sections.

---

## 0. Things to know first (surprises, latent bugs, dead features)

1. **The AI translation and AI chatbot POCs are NOT on master.** `fe3d9f5ed0 "feat: poc for AI translation in app"` and `5e23ae1183 "fix: load poc for ai chatbot"` exist only on branch `poc-translation` (local and `origin/poc-translation`). Two related sidebar POCs are on other branches: `f4ef16cd6b` ("✦ Try Assistant" in the Resources panel, branch `origin/mf1-assistant-modal`) and `33c4599d42` (AI translation feedback modal, branch `origin/mf2`). Section 21 describes all of them.
2. **Chavruta (video chat) has been removed completely.** No `chavruta`/`chevruta` appears anywhere in `static/js` or in `reader/views.py`/the url files. The stale branch name `bug/sc-18440/remove-links-to-chevruta` confirms the removal.
3. **The "Sheets" sidebar mode no longer renders anything in-panel.** The Sheets resource button opens `{voices-origin}/sheets-with-ref/{normRef}` in a **new tab** (`ConnectionsPanel.jsx:662-666, 672`). `"Sheets"` is still in the URL `sidebarModes` lists (client `ReaderApp.jsx:500`, server `reader/views.py:535`). There is no `mode === "Sheets"` branch in `ConnectionsPanel.render`, so `?with=Sheets` produces an **empty sidebar**. `"AboutSheet"` is in the same position: it is in the URL list but has no render branch.
4. **Public notes are effectively disabled.** `/api/related` always returns `"notes": []`, with the comment "Hiding public notes for now" (`reader/views.py:2632`). The `PublicNotes` component (`ConnectionsPanel.jsx:1426-1448`) is defined but never rendered. The public/private toggle in `AddNoteBox` is commented out (`ConnectionsPanel.jsx:1355-1366`). Every note that gets saved is private.
5. **There is no in-sidebar "Versions" mode anymore.** Version browsing happens in **About** (source versions only) and **Translations** (translations, with a preview). `CONNECTION_MODE_STRING_IDS` still has a `"Versions"` key (`constants.js:23`), but nothing uses that mode.
6. **Latent temporal-dead-zone (TDZ) bugs.** These only work because Babel probably transpiles `let`/`const` to `var`:
   - `AboutBox.jsx:78,95` assigns to and reads `detailSection` before its `let` declaration at line 130. Note the misspelt `detailsSection` declared at line 75. This is the About box for a **sheet**.
   - `VersionsTextList.jsx:34` reads `currSelectedVersions` inside `useEffect`, but it is declared later at line 60, after an early return. Under var semantics it is `undefined`, so `getRef` falls back to the default versions. The local `enVersion`/`heVersion` (l.28-33) are computed and never used.
7. **The "Version Open" recent-filter binding looks wrong.** `AboutBox.jsx:112` passes `setFilter={this.props.setFilter.bind(null,'About')}`, which makes `'About'` the *filter* argument of `setVersionFilter(filter, prevMode)`. Clicking a chip in the RecentFilterSet while in "Version Open" therefore calls `setVersionFilter('About', '<key>')`.
8. **`ExtendedNotes` in the sidebar can crash.** It calls `this.props.backFromExtendedNotes()` when the version has no extended notes (`ExtendedNotes.jsx:30`), but ConnectionsPanel never passes that prop (`ConnectionsPanel.jsx:570-572`).
9. **Clicking the *current* version's title in About throws.** `openVersionInSidebar` is not passed to the "Current Version" / "Current Translation" `VersionBlock`s (`AboutBox.jsx:204-230`), and `VersionBlockUtils.openVersionInSidebar` calls it unconditionally (`VersionBlock.jsx:54`). Their Select buttons are hidden with CSS (`s2.css:3695`).
10. **The URL builder has a typo for multi-panel sidebar search.** It writes `` `&sbsq{i}=` `` with the `$` missing (`ReaderApp.jsx:858`), so the sidebar search query is lost for any panel after the first. Separately, the server reads `vside` instead of `vside{i}` for panels 2+ (`reader/views.py:881`).
11. **`AddToSourceSheetBox.makeSourceForEden` references an undeclared `source`** (`AddToSourceSheet.jsx:180-192`). This is the legacy Gardens path only.
12. **Pluralisation bug in GuideBox.** It renders "1 Answers" / "0 Answer" because the condition is `length > 0 ? 'Answers' : 'Answer'` (`GuideBox.jsx:22`).
13. **The Torah Readings (Media) empty state shows a "Loading…" spinner forever** instead of an empty message (`Media.jsx:32-35`). The play/pause icons use a relative path `static/img/play.svg` (`Media.jsx:129`), which breaks on nested URLs.
14. **Unused imports in ConnectionsPanel**: `Ad`, `CollectionsModal`, `event` (jquery), `LanguageToggleButton`, `CloseButton`, `SheetListing`, `EnglishText`, `HebrewText`. Sidebar *ads* (`sidebarAds.js`) are **not** rendered in the connections panel. They render through `Promotions` in `NavSidebar` and `TopicPage` (section 20).

---

## 1. Architecture / state model

### 1.1 Where the sidebar lives
- **Desktop (multiPanel):** a separate ReaderPanel with `mode: "Connections"` sits to the right of the text panel. `ReaderApp.openTextListAt(n, refs, textListState)` (`ReaderApp.jsx:1870-1902`) does the following:
  - It splices in a new panel, or reuses one if it already has `mode: "Connections"`.
  - It forces the panel's language to `hebrew` or `english`: "Don't let connections panels be bilingual".
  - It inherits `filter`, `versionFilter`, `recentFilters`, `recentVersionFilters` and `currVersions` from the parent Text/Sheet panel.
  - If the parent has `openSidebarAsConnect`, it opens in `"Add Connection"` mode.
- **Mobile (single panel):** the same ReaderPanel switches to `mode: "TextAndConnections"`, with the connections shown in-panel (`ReaderPanel.openConnectionsInPanel`, `ReaderPanel.jsx:220-228`). History is *replaced* rather than pushed while already in TextAndConnections.
- `ReaderPanel.openConnectionsPanel(ref, additionalState)` picks the desktop or mobile route (`ReaderPanel.jsx:211-219`).
- ReaderPanel renders `<ConnectionsPanel>` with about 60 props (`ReaderPanel.jsx:821-887`). Notable ones:
  - `srefs` is `refs` in Connections mode and `highlightedRefs` in TextAndConnections mode.
  - `fullPanel={multiPanel}`.
  - `canEditText` is computed as: the version is not `locked` for the current language, **or** the user is a moderator and the language is not bilingual (`ReaderPanel.jsx:823-826`).
- **Header placement:**
  - Desktop: `ConnectionsPanelHeader` is rendered inside the panel's `ReaderControls` (`ReaderPanel.jsx:1399-1420`), and ConnectionsPanel skips its own header (`fullPanel`).
  - Mobile: the normal ReaderControls header is hidden for Connections (`hideHeader`), and ConnectionsPanel renders its own header in the non-multiPanel style (`ConnectionsPanel.jsx:593-609`, `ConnectionsPanelHeader.jsx:158-180`).

### 1.2 Panel state fields that drive the sidebar
These are defined in `ReaderApp.makePanelState` (`ReaderApp.jsx:150-200`):
- `connectionsMode`: defaults to `"Resources"`.
- `connectionsCategory`: used with `"ConnectionsList"`.
- `filter`: an array with zero or one element. A filter string can carry a suffix, `"Rashi"`, `"Rashi|Quoting"` or `"<displayedText>|Essay"`.
- `recentFilters`: falls back to `state.filter`.
- `versionFilter` and `recentVersionFilters`: version keys of the form `"vTitle|lang"`.
- `webPagesFilter`
- `sideScrollPosition`
- `connectionData`: arbitrary payload. Used for `previousMode`, Add-To-Sheet sources and the LinkerAdmin span.
- `selectedWords`, `selectedNamedEntity`, `selectedNamedEntityText`
- `sidebarSearchQuery`
- `noteBeingEdited`
- `filterRef`: the full commentary ref, e.g. "Rashi on Genesis 1:1:4", kept when a commentary URL is converted into base text plus a filter.

Component-local state in ReaderPanel: `backButtonSettings`, set by GuideBox (`ReaderPanel.jsx:256-258`).

### 1.3 Mode setters
- **`ReaderPanel.setConnectionsMode(mode, connectionData=null)`** (`ReaderPanel.jsx:550-569`):
  - `"Add Connection"` with only one open text ref goes to `openComparePanel(true)` instead of the mode.
  - It fires `Sefaria.track.event("Tools", mode+" Click")` on every call, including programmatic ones (there is a TODO about this).
  - It requires login for `"Add Connection"`: a logged-out user gets `mode="Login"` plus a `Tools / Prompt Login` event.
  - `"Resources"` clears the filter.
  - It stores `connectionData`, or null.
- **`setConnectionsCategory(category)`** sets the filter, so the base text shows link dots for that category, and switches to `ConnectionsList` (`ReaderPanel.jsx:570-573`).
- **`setFilter(filter, updateRecent)`** (`ReaderPanel.jsx:402-417`): desktop delegates to `ReaderApp.setConnectionsFilter` (`ReaderApp.jsx:1888-1911`):
  - With `updateRecent`, the filter is moved to the front of `recentFilters`.
  - Mode becomes `"EssayList"` if the suffix is `Essay`, otherwise `"TextList"`.
  - A null filter gives `ConnectionsList`.
  - The filter and recentFilters are mirrored onto the base panel, which drives the dots in the base text.
- **`setVersionFilter(filter, prevConnectionsMode)`** (`ReaderPanel.jsx:418-430`, `ReaderApp.jsx:1915-1936`):
  - The filter is added to `recentVersionFilters` unless the previous mode was `'About'`.
  - Mode becomes `'Version Open'` when coming from About, otherwise `"Translation Open"`.
  - A null filter goes back to `"Translations"`.
  - The values are mirrored to the base panel.
- **`setWebPagesFilter(filter)`** sets mode `"WebPagesList"` (`ReaderPanel.jsx:432-434`).
- **`editNote(note)`** sets mode `"Edit Note"` plus `noteBeingEdited` (`ReaderPanel.jsx:574-579`).
- **`setSideScrollPosition`** (`ReaderApp.jsx:1912-1916`).
- **`viewExtendedNotes(n,"Connections",title,lang,vtitle,langFamily)`** sets `connectionsMode="extended notes"` and **replaces `panel.currVersions` with only that version** (`ReaderApp.jsx:1687-1698`).

### 1.4 Full list of sidebar modes (`ConnectionsPanel.render`, `ConnectionsPanel.jsx:268-587`)

| mode | Renders | Notes |
|---|---|---|
| (links not loaded) | `LoadingMessage` | shown until `Sefaria.related(srefs[0])` resolves (l.270) |
| `Resources` | top tools + Related Texts summary + Resources list + Tools list | §2 |
| `Navigation` | `TextTableOfContents` (BookPage) | Table of Contents; uses `currentlyVisibleSectionRef` |
| `ConnectionsList` | `ConnectionsSummary` with `category` + `showBooks` | §3 |
| `TextList` / `EssayList` | `TextList` | §4 |
| `Add To Sheet` | `AddToSourceSheetBox` | §13 |
| `Notes` | `AddNoteBox` + "Go to My Notes" + `MyNotes` | §11 |
| `Edit Note` | `AddNoteBox` with the note prefilled | §11 |
| `Lexicon` | `LexiconBox` | §9 |
| `Topics` | `TopicList` | §10 |
| `WebPages` / `WebPagesList` | `WebPagesList` (filter null vs. site name) | §12 |
| `Torah Readings` | `MediaList` | §14 |
| `LinkerAdmin` | `LinkerAdminBox` | §19 |
| `Advanced Tools` | `AdvancedToolsList` | §16 |
| `Share` | `ShareBox` | §15 |
| `Feedback` | `FeedbackBox` (Misc) | §17 |
| `Add Connection` | `AddConnectionBox` | §16.3 |
| `Login` | `LoginPrompt` | |
| `About` / `Version Open` | `AboutBox` | §6 |
| `Guide` | `GuideBox` | §18 |
| `Translations` / `Translation Open` | `TranslationsBox` | §7 |
| `extended notes` | `ExtendedNotes` | §8.6 |
| `manuscripts` | `ManuscriptImageList` | §14.2 |
| `SidebarSearch` | `SidebarSearch` | §5 |
| `Sheets`, `AboutSheet` | **nothing** (no branch) | see §0.3 |

- "Marginless" CSS modes: Resources, ConnectionsList, Advanced Tools, Share, WebPages, Topics, manuscripts (l.589).
- The outer div is keyed by `mode`, so every mode change remounts the content (l.592).

### 1.5 URL representation (deep-linking into sidebar modes)
- **Client, `ReaderApp.makeHistoryState`** (`ReaderApp.jsx:495-870`):
  - URL-representable modes (`sidebarModes`, l.500-501): Sheets, Notes, Translations, Translation Open, Version Open, About, AboutSheet, Navigation, WebPages, extended notes, Topics, Torah Readings, manuscripts, Lexicon, SidebarSearch, Guide, LinkerAdmin.
  - `with=` takes the joined filter (`+`-separated); the mode name if it is a sidebar mode; or `all`. ConnectionsList appends `" ConnectionsList"` to each category (l.698-702). WebPagesList is written as `WebPage:<site>` (l.695-696).
  - Extra params:
    - `vside=` versionFilter, for Translation Open / Version Open
    - `lookup=` selected words (Lexicon)
    - `namedEntity=`, `namedEntityText=`
    - `sbsq=` sidebar search query
    - `debug_mode=linker`
    - `lang2` (sidebar language, set by the header toggle)
  - Panels after the first use `w{i}`, `vside{i}`, `lookup{i}`, `namedEntity{i}`, `namedEntityText{i}`, and `sbsq{i}` (broken by the typo).
  - Page title: `"<ref> with <mode/filter>"` unless the value is `all` or a ConnectionsList (l.718-721).
- **Server: `reader/views.py:533-543` `get_connections_mode`, `make_panel_dict` l.582-598, and l.823-892:**
  - The `with` param is **ignored in the voices module** (l.824-825).
  - `with=all` gives an empty filter (Resources).
  - `_` is converted to a space.
  - Sidebar-mode names delete the filter; `X ConnectionsList` sets `connectionsCategory`; `WebPage:x` sets `webPagesFilter`.
  - `lang2` sets the connections panel display language.
  - `highlightedRefs` / `showHighlight` are set when there is a filter.
- **Tools buttons are real links.** A `ToolsButton` with `urlConnectionsMode` renders `<a href=replaceUrlParam("with", mode)>`, so ctrl-click opens that mode in a new tab (`ConnectionsPanel.jsx:1113-1115`). Category and text filters also link to `/<ref>?with=<Category> ConnectionsList` or `?with=<Book>` (`ConnectionFilters.jsx:48-49, 112`).

---

## 2. Resources (top-level) view — `ConnectionsPanel.jsx:272-340`

### 2.1 Data computed
- `summary = Sefaria.linkSummary(srefs, nodeRef sheetId)`. The connection summary shows if the summary is non-empty **or** there are essay links (`hasEssayLinks`).
- Resource counts (l.276-284):
  - `sheets`: `Sefaria.sheets.sheetsTotalCount(srefs)`, i.e. public sheets plus my sheets with no double counting (`sefaria.js` sheets l.3520-3528).
  - `webpages`: the count, **or `null` if webpages are not loaded yet**. A null count still *shows* the button, without a number.
  - `audio`: `mediaByRef`
  - `topics`: `topicsByRefCount`
  - `manuscripts`
  - `guides`
  - `translations`: `availableTranslations.length` from `Sefaria.getTranslations(ref)` (versions with `isSource:false`).
- The Resources section shows if the user is a moderator, or if any count is > 0 or null (l.285).
- Tools counts: `notes = Sefaria.notesTotalCount(srefs)`.

### 2.2 Top tool buttons (`topToolsButtons`, l.292-298)
1. **About this Text**: mode About (URL-able)
2. **Table of Contents**: mode Navigation
3. **Search in this Text**: mode SidebarSearch
4. **Translations**: mode Translations, with the count. Hidden when the count is 0 because `ToolsButton` hides when `count === 0`.
5. **Guided Learning**: only if guides exist for the ref. It is `highlighted` and carries an "Experiment" label; mode Guide.

### 2.3 "Related Texts" section (`connection_panel_section.related_texts`)
`ConnectionsSummary` is rendered with `showBooks=false`, collapsible (§3).

### 2.4 "Resources" section — `ResourcesList` (l.668-681)
- **Sheets** (count) has a secondary "open-panel" icon and opens `sheets-with-ref` in a new window via `window.open` on the voices module origin (l.662-666).
- **Web Pages** (count or null): mode WebPages.
- **Topics** (count): mode Topics. Shown **always for moderators** (`alwaysShow`), so they can add topics.
- **Manuscripts** (count): mode manuscripts.
- **Torah Readings** (audio count): mode "Torah Readings".

### 2.5 "Tools" section — `ToolsList` (l.687-700)
- **Add to Sheet**: logged out, it opens the sign-up modal `SignUpModalKind.AddToSheet`. Otherwise it sets mode `"Add To Sheet"` with `{addSource:"mainPanel"}`.
- **Dictionaries**: mode Lexicon.
- **Compare Text**: only when multiPanel. Runs `openComparePanel` (§16.4).
- **Notes** (count, alwaysShow): logged out, sign-up modal `Notes`; otherwise mode Notes.
- **Share**: mode Share.
- **Feedback**: mode Feedback.
- **Advanced**: mode "Advanced Tools".

### 2.6 Flash message
`onSave` after Add Connection does the following (l.217-227):
- clears the links cache (`Sefaria.clearLinks()`) and reloads,
- returns to Resources,
- shows "Success! You've created a new connection." for 3 s.

### 2.7 `ToolsButton` component (l.1095-1163)
- Props: `en`, `he`, `onClick`, `urlConnectionsMode`, `icon` (font-awesome `fa-*`), `image` (`/static/img/*`), `count`, `control` (interface or content text), `typeface`, `alwaysShow`, `greyColor`, `highlighted`, `experiment`, `children`.
- Visibility: rendered only if `count == null || count > 0 || alwaysShow`.
- Every click: `gtag("event","feature_clicked",{name:"tools_button_<en>"})`, `preventDefault`, then onClick.
- Keyboard: Enter/Space via `Util.handleKeyboardClick`. `role=button` when it is not a link.
- Class: `en.camelize()` is added as a CSS class name.
- `ToolsButton.SecondaryIcon` renders a trailing icon from `/static/icons/`.

---

## 3. Connections summary & category filtering — `ConnectionsSummary` (`ConnectionsPanel.jsx:707-839`), `ConnectionFilters.jsx`

### 3.1 Category summary computation — `Sefaria.linkSummary(ref, excludedSheet)` (`sefaria.js:1768-1951`)
- It returns `[]` until links are loaded for every ref.
- Links come from the cache and are de-duplicated (anchorRef|sourceRef|type) across refs. Links from the excluded sheet are dropped, and **essay links are excluded** (`getLinksFromCacheAndPreprocess`, l.1753-1766).
- Per category: `count` and `hasEnglish` (any `sourceHasEn`). Per book, keyed by `collectiveTitle.en`: `count`, `hasEnglish`, `categoryList` and `fullTitle`.
- **Zero-count commentators.** When the ref is narrower than its section, every Commentary book present anywhere in the section is added with count 0, so users see the full list of commentators, greyed out (l.1872-1888).
- Each book gets `book`, `heBook`, `enShortDesc` and `heShortDesc` from the index or full-title index, falling back to `getDescriptionDict` (l.1890-1925).
- **Book sort** (`linkSummaryBookSort`, l.1953-1979): hard-coded "top" lists come first.
  - Tanakh: Rashi, Ibn Ezra, Ramban, Sforno.
  - Talmud: Rashi, Rashbam, Tosafot.
  - Mishnah: Bartenura, then **English Explanation of Mishnah (English sort only)**, then Rambam, Ikar Tosafot Yom Tov, Yachin, Boaz.
  - After that the sort is alphabetical (by `heBook` in Hebrew). With Hebrew content the books are re-sorted with the Hebrew comparator (`ConnectionsPanel.jsx:783-785`).
- **Category order** (l.1930-1945):
  - It starts from the TOC order with **Commentary forced first** and **Targum inserted at index 2**.
  - It is then overridden per primary category of the base text (`categoryOrderOverrides`, l.1771-1837). Examples: Tanakh → Talmud, Midrash, Halakhah. Mishnah → Tanakh, Mishnah, Talmud. Talmud → Tanakh, Talmud, Halakhah. There are entries for Midrash, Halakhah, Kabbalah, Liturgy, Jewish Thought, Tosefta, Chasidut, Musar and Responsa. Second Temple and Reference are empty.
  - The override is applied only when it has more than one entry.
  - Unknown categories go last.
- Results are memoised in `_linkSummaries[normRef/excludedSheet]` and invalidated when the link count grows (`shouldBuildLinkSummaries`, l.1736-1752).
- **Sheet "links"**: when `with_sheet_links=1`, sheets inside library-TOC collections come back as links. Their category is the collection's `dependence` or first category, and `isSheet:true` (`sefaria/client/wrapper.py:146-152, 332-336`).
- **Server link categories** (`wrapper.py:41-101`):
  - `category = linkRef.primary_category`.
  - `type==="essay"` gives category `"Essay"`.
  - A non-commentary-type link whose category is Commentary becomes `"Quoting Commentary"`.
  - `collectiveTitle` is the collective_title for commentary-type links.
  - Links to perek or parasha-level refs are skipped, as are anchors that are not segment-level.
  - "Steinsaltz on X" also inherits X's links (l.315-330).

### 3.2 Top-level summary (Resources view, `isTopLevel`)
- **Quoting Commentary is hidden** at the top level, but its count and the English mark are **added into the Commentary row**. If only Modern/Quoting Commentary exists, a synthetic "Commentary" row is created (l.740-758).
- **Essay links** come first, in an `essayGroup` (l.759-780). `Sefaria.essayLinks(refs, currObjectVersions)` (`sefaria.js:1714-1733`) shows an essay link only if its `anchorVersion.title` is `"ALL"` or matches the **currently displayed version** in that language. Each one renders as a `TextFilter` with these settings:
  - label `displayedText.en/he`
  - green colour `var(--essay-links-green)`
  - suffix `|Essay`
  - no counts
  - Clicking it opens the EssayList.
- **Collapse.** Only the first **4** categories show, followed by a "More" button (`more.svg`). Expanded, the button reads "See Less". State lives in `connectionSummaryCollapsed`, which defaults to true (l.56, 60-62, 804-816).

### 3.3 Category view (`ConnectionsList` mode, `category` set, `showBooks=true`)
- `category === "Commentary"` shows **Commentary and Quoting Commentary together**, Commentary first (l.723-731).
- Any other category is filtered to that category. If nothing matches, it renders a zero-count placeholder, "All X (0)" (l.733-738).
- **`CategoryFilter`** (`ConnectionFilters.jsx:10-90`):
  - Clicking at the top level calls `setConnectionsCategory` and tracks "Connections Category Click".
  - Clicking at the second level, the "All {Category}" row, sets the filter to the category with updateRecent and tracks "Category Filter Click".
  - Display:
    - `--category-color` from `Sefaria.palette.categoryColor`.
    - The label is "All Commentary" / "כל הקישורים ל…" at the second level.
    - Count in parentheses.
    - **"EN" tag** (`EnglishAvailableTag`) if English is available, shown only when `TORAH_SPECIFIC`.
    - A category description from `getDescriptionDict(category)`, styled `lowlight` when the count is 0.
  - The descriptions for "Commentary" and "Quoting Commentary" are hard-coded (`sefaria.js:2010-2013`). Targum's comes from Tanakh's TOC.
  - Below the header, one `TextFilter` per book:
    - Quoting Commentary books use the filter suffix `|Quoting`.
    - Book description `enShortDesc` / `heShortDesc`.
    - `on` state when the book is in the current filter.
- **`TextFilter`** (`ConnectionFilters.jsx:93-156`):
  - Click: `setFilter(name[|suffix], updateRecent)`. Tracks "Text Filter Click", or "Text Filter in Recent Click" when the filter is in the recent list.
  - It is upper-cased when the book equals the category, i.e. the "All" row.
  - `lowlight` when the count is 0.
  - **The active recent filter renders as a non-link `<div>`** so right-click does not offer "Open in new tab" (l.119-121, 140-142).

### 3.4 Filter semantics — `Sefaria._filterLinks` (`sefaria.js:1676-1698`)
- An empty filter returns all links.
- `X|Quoting` means only Quoting Commentary links whose category or collectiveTitle matches.
- `X|Essay` means only essay links whose `displayedText.en` matches.
- If X is a commentator index (`categories[0]` or primary_category is "Commentary"), only links of category Commentary are kept.
- Otherwise a link matches when its category **or** `collectiveTitle.en` is in the filter.

### 3.5 Recent filters — `RecentFilterSet` (`ConnectionFilters.jsx:165-241`)
- A horizontal set of chips: the current filter plus recently used filters.
- Each recent entry is annotated with its index's heTitle and primary_category; the suffix is preserved.
- If the current filter is not in the list, it is prepended with up to 5 entries. **The loop logic is buggy**: it iterates over `topLinks.length`, which is 0, so the current filter is always prepended and the list is replaced by `[annotated]` (l.189-209).
- `updateRecent=false` when clicking a chip.
- Placement:
  - **Desktop:** inside the TextList body when `fullPanel` (`TextList.jsx:187-196`).
  - **Mobile:** in the panel header next to the back link, when `previousCategory` is set and the mode is TextList (`ConnectionsPanelHeader.jsx:168-176`).
- Also used in `VersionsTextList` for recent **version** filters.
- Recent filters are kept on both the connections panel and the base panel, and are copied when a new connections panel opens.

---

## 4. Text list (connected texts) — `TextList.jsx`

- **Loading.** It loads `Sefaria.related(sectionRef)` for the **section** of `srefs[0]`. Selections that span sections are not handled (there is a TODO, l.47-51). It recomputes links when `srefs` or `filter` change (l.36-46).
- **Ref expansion.** `ConnectionsPanel.checkSrefs` does two things (l.253-263):
  - A single ranging ref is split into its segments.
  - A whole-section ref is expanded to all of its segments, so a section-level selection shows the links of every segment.
- **Link selection** (`getLinksAndFilter`, l.93-133):
  - Takes the section links from the cache.
  - Adds `anchorRefExpanded` to each link.
  - Applies `_filterLinks(filter)`.
  - Keeps only links overlapping the selected refs.
  - Excludes links from the current sheet (`nodeRef`).
- **Sort:**
  1. by `anchorVerse`;
  2. within the same index title, sheets sort by title and texts by `commentaryNum`, the server-computed decimal of the last two sections (`wrapper.py:65-68`);
  3. otherwise by `sourceRef`, or by `sourceHeRef` when the content language is Hebrew.
- **Commentary text preload.** If the filter is a single commentator (a "Commentary" index such as Rashi, **not** "Rashi on Genesis", which is the quoting case):
  - set `waitForText=true`;
  - fetch each link's zoomed-out section through `getTextFromCurrVersions` with the translation language preference;
  - render only after one of those fetches resolves.
  - Otherwise there is no wait (l.73-92).
- **States:**
  - Links not loaded: `LoadingMessage`.
  - Zero links: "No connections known [for X, Y here]." in English and Hebrew; the Hebrew uses `hebrewTerm` with the filter suffixes stripped (l.141-144).
  - Waiting for text: `LoadingMessage`.
- **Each link:**
  - **Sheet link** (`isSheet`): `SheetListing` (Misc) with `openInNewTab`, `handleSheetClick`, `connectedRefs`. The author is hidden when the filter equals the collection title (l.149-157).
  - **Text link:**
    - Wrapped in `.textListTextRangeBox`; class `typeQF` when the link type starts with `quotation_auto` (auto-detected quotations).
    - Renders a `TextRange` with these props:
      - `hideTitle` for Commentary links unless the filter is "Commentary" itself;
      - `numberLabel` = anchorVerse, for Commentary only;
      - `textHighlights` = `link.highlightedWords`;
      - `inlineReference` = `link.inline_reference`, which renders an itag number label when the commentator matches (`TextRange.jsx:351-372`);
      - `onCitationClick`;
      - `translationLanguagePreference`;
      - `filterRef`, which scrolls the `[data-ref=filterRef]` element into view on load (`TextRange.jsx:138-144`);
      - `basetext=false`.
    - **Connection buttons** (`ConnectionButtons`, l.300-309):
      - **Open** (`OpenConnectionTabButton`, l.255-279): a link to `/<sref>`. Clicking it calls `onTextClick([sourceRef])`, which opens the text in the main panel without commentary-to-base conversion (`ReaderPanel.handleTextListClick`, `ReaderPanel.jsx:208-210`), and tracks "Click Text from TextList".
      - **Add to Sheet** (logged in only): `setConnectionsMode("Add To Sheet", {addSource:"connectionsPanel", connectionRefs:[sourceRef], versions:{en:null,he:null}})` (l.282-298).
      - **Remove** (moderators only):
        - `confirm`, then `DELETE /api/links/<_id>`;
        - success: alert "Connection deleted.", then `onDataChange`, which runs `clearLinks` and reloads;
        - error: an alert (l.222-252).
      - The server requires staff for DELETE (`reader/views.py:2463-2469`).
- **Reading history for the sidebar (intent tracking):**
  - While in TextList mode, scrolling the `.connectionsPanel .texts` container (debounced 100 ms) checks which `.textRange` elements are visible (100 px threshold).
  - For each visible one, `checkIntentTimer` starts a 3-second timer (`ReaderApp.jsx:960-964`).
  - If the segment is still visible and the filter and refs are unchanged, it calls `Sefaria.saveUserHistory({ref, versions:{en:null,he:null}, book, language: contentLang, secondary:true})`.
  - A Set prevents saving the same segment twice. This also runs right after the links' text loads (`ConnectionsPanel.jsx:131-182`, `TextList.jsx:40-45`).
- **Scroll position persistence:**
  - In the ConnectionsList, WebPages and Sheets modes, scroll position is saved through `setSideScrollPosition` and restored when you switch back to that mode.
  - Entering Resources resets it (`ConnectionsPanel.jsx:99-130`).
- **Citation clicks inside sidebar text.** `onCitationClick` goes to `ReaderApp.handleCitationClick`, which closes the connections panel to the right (or replaces it) and opens the cited ref as a new panel (`ReaderApp.jsx:1077-1088`). On mobile it runs `showBaseText` (`ReaderPanel.jsx:187-193`).

---

## 5. Search in this Text — `SidebarSearch.jsx`

- **Dictionary branch.** If the book is a dictionary (`indexDetails.lexiconName`), the panel shows `DictionarySearch` with `lexiconName` and `navigatePanel` instead. Picking a word navigates the main panel to `"<Title>, <word>"` after checking that the ref exists (`DictionarySearch.jsx:136-151`).
- **Otherwise:**
  - A search input `#searchQueryInput` with a search button.
  - Enter submits.
  - Max length 75.
  - **Virtual Hebrew keyboard** attached via `VKI_attach` when the interface is English.
  - Placeholder "Search in this text".
- **Query flow:**
  - On submit, the filter path is reset, then `query` is set.
  - `Sefaria.bookSearchPathFilterAPI(title)` returns `GET /api/search-path-filter/<title>`, i.e. category path + book (`reader/views.py:5039-5045`).
  - A `SearchState` is built: `type:'text'`, `field:"naive_lemmatizer"`, `appliedFilters:[path]`, `appliedFilterAggTypes:["path"]`, `sortType:"chronological"`.
  - The query is persisted to panel state through `setSidebarSearchQuery` and the URL `sbsq`.
  - The input is pre-filled from `sidebarSearchQuery` on mount.
- **Results.** `ElasticSearchQuerier` with `searchInBook=true`:
  - no topic query;
  - no search analytics;
  - results render as `SearchTextResult`, not cards;
  - tracks "SidebarSearch Query: …" and "Sidebar Search Result Click" (`SearchTextResult.jsx:62-63`, `ElasticSearchQuerier.jsx:332`).
- **Click a result.** `ReaderApp.handleSidebarSearchClick` **replaces panel n-1** (the main text) with that ref, highlights it and scrolls to it, using the result's version (`he` if `isPrimary`, otherwise `en`) and `textHighlights` (`ReaderApp.jsx:1106-1116`).
- Total-results and filter callbacks are only `console.log`ged (`SidebarSearch.jsx:117-118`).
- When writing history, the SidebarSearch panel's `refs` is overwritten with the previous panel's refs (`ReaderApp.jsx:706-711`).

---

## 6. About this Text (+ source version selection) — `AboutBox.jsx`

- **Data:**
  - `Sefaria.getIndexDetails(title)` returns `GET /api/v2/index/<title>?with_content_counts=1&with_related_topics=1`, cached (`sefaria.js:1443-1449`).
  - `Sefaria.getSourceVersions(sectionRef)` returns `getVersions` (`GET /api/texts/versions/<ref>`) filtered to `isPrimary: true` (`sefaria.js:1053-1062`).
  - Both reload when the title, master panel language or current versions change.
  - Current versions are removed from the alternates list (l.54-65).
- **Sheet mode** (sref starts with "Sheet"):
  - Loads the sheet by ID.
  - Shows "About This Text", the stripped title, "By: <owner link>" and the summary HTML.
  - See the TDZ bug in §0.6.
- Shows `LoadingMessage` until the version map is non-empty. **So a text with no primary versions other than the current one shows a perpetual loading state**, because the map has keys but their arrays are empty… Strictly, `Object.keys` will still have keys and render. Verify.
- **Details section:**
  - "About This Text" heading.
  - **Title** linking to the book page `/<title>`.
  - **Category**: `primary_category`, in English and Hebrew.
  - **Author(s)**: per-language lists linking to `/topics/<slug>`, comma-separated, shown only when English authors exist (l.132-138, 171-182).
  - **Description**: markdown `enDesc`, or `heDesc || heShortDesc`, with **all markdown elements allowed** (`disallowedMarkdownElements=[]`).
  - **Composed**:
    - place = `compPlaceString` en/he, else `compPlace`, else `pubPlace`;
    - date = `compDateString`, else `pubDateString`;
    - rendered as "Composed: <place> <date>" / "נוצר/נערך: …".
  - Era and dedication are **not** shown here.
- **Version sections.** The order depends on `masterPanelLanguage`: English puts the translation first.
  - **"Current Version"** (source / `he` slot): `VersionBlock rendermode="about-box"`.
  - **"Current Translation"** (`en` slot, if it has a versionTitle): `VersionBlock` with `viewExtendedNotes`.
  - **"Alternate Source Versions"**, or **"Source Versions"** when there is no current source version: `VersionsBlocksList` with `showLanguageHeaders=false`, `openVersionInReader`, and `openVersionInSidebar`. The latter goes to mode `"Version Open"` with `connectionData {previousMode:"About"}` and calls `setVersionFilter(key,'About')` (l.66-69).
- **Version Open sub-mode:**
  - `VersionsTextList` previews the chosen version's text for the selected refs in the sidebar.
  - The back button returns to About via `previousMode`.
- **Sidebar modules appended:**
  - `RelatedTopics` (`NavSidebar.jsx:719-739`): related topics of the book, first 5, then a "More" link that expands the list.
  - `DownloadVersions` (`NavSidebar.jsx:957-1040`), shown for non-dictionaries only:
    - one dropdown of versions, **public-domain only** (a license that starts with "Copyright" is excluded), plus a "Merged version" per language;
    - one dropdown of formats: txt with tags, plain.txt, csv, json;
    - a download link `/download/version/<title> - <lang> - <vtitle>.<fmt>`, disabled until both are chosen;
    - tracks "Version Download".

---

## 7. Translations — `TranslationsBox.jsx`, `VersionBlockWithPreview`, `VersionsTextList`

- **Data:**
  - `Sefaria.getAllTranslationsWithText(srefs[0])` calls the v3 texts API with `version=translation|all` and no fill-in, then buckets the results by actual language (`sefaria.js:746-749`). The language is taken from a `[xx]` suffix in the versionTitle or from `v.language` (`_sortVersionsIntoBuckets`, l.1086-1098).
  - Within each language **the current translation is sorted first** (l.39-51). Hebrew is excluded from that sort.
  - The data is refetched when `srefs`, `vFilter` or `recentVFilters` change.
- **Sheet sources.** For a sheet source the box shows "There are no Translations for this sheet source".
- **Header.**
  - Title "Translations".
  - The text: "Sefaria acquires translations to enrich your learning experience. Preview or choose a different translation below."
  - A "Learn more ›" link to the help-centre URL `HELP_CENTER_URLS.TRANSLATION_PREFERENCE_EN/HE` from site settings.
- **List.**
  - `VersionsBlocksList` with `inTranslationBox`, which renders each version as `VersionBlockWithPreview`.
  - Languages are sorted alphabetically with **"en" first**.
  - Each language has a header showing the localized ISO language name and the count (`VersionBlock.jsx:415-423`).
- **`VersionBlockWithPreview`** (`VersionBlockWithPreview.jsx`):
  - **Preview text.** The version's text for the ref is shown as an HTML preview with the version's `direction`. It is **truncated with a clickable "…" ellipsis**, decided by comparing `scrollHeight` with the CSS max-height and re-checked on every render (`VersionBlockHeader.jsx:42-67`).
  - Clicking the preview opens **Translation Open**: `setConnectionsMode("Translation Open")` plus `setFilter("vTitle|lang")`. It fires the gtag `onClick_version_title` with change_to/from, categories and book.
  - The preview's href is `/<ref>?v<lang>=…&vside=…&with=Translation Open`, with all current versions kept (`VersionBlock.jsx:25-37`).
  - A `<details>` disclosure. Its summary shows the **short version title** (Hebrew uses shortVersionTitleInHebrew, then versionTitleInHebrew) and a **Select / Currently Selected** button.
  - Expanded, the disclosure shows `VersionMetadata` (title + `VersionInformation` + `VersionImage`) and an **"Open Text"** button. That button opens the ref in the main panel with this version (`onRangeClick(sref,false,{[lang]:{versionTitle,languageFamilyName}})`).
- **Select (make primary in reader).** `VersionBlockUtils.openVersionInMainPanel` (`VersionBlock.jsx:56-76`):
  - fires gtag `onClick_select_version`;
  - in translation render mode calls `openVersionInReader(vtitle,'en',langFamily)`, i.e. `ReaderApp.selectVersion`;
  - **saves a version preference**: for translations only, `Sefaria.setVersionPreference(ref, vtitle,'en')`. This updates `versionPreferences` per **corpus**, tracks "Set Version Preference", and POSTs the profile `version_preferences_by_corpus` (`sefaria.js:1114-1122`).
  - The link href is `/<ref>?v<lang>=<vtitle>` with the other-language version kept.
  - Merged versions have href `#`.
- **`ReaderApp.selectVersion(n, vtitle, lang, langFamily)`** (`ReaderApp.jsx:1639-1661`):
  - sets `panel.currVersions[lang]`;
  - caches the default version per book;
  - tracks "Choose Version";
  - can switch the panel language (`_getPanelLangOnVersionChange`);
  - mirrors to the dependent connections panel on desktop.
  - A null title resets to the default version.
- **Translation Open sub-mode** (`VersionsTextList.jsx`):
  - `RecentFilterSet` of the recently opened versions.
  - A `TextRange` of `humanRef(srefs)` in that version, using `useVersionLanguage` so only that language's column shows.
  - An **Open** button (opens the main panel with that version) and an **Add to Sheet** button that passes `versions: {[language]: vtitle}`.
  - The back button returns to Translations (`ConnectionsPanelHeader.previousModes`).
- **Version key format.** `getTranslateVersionsKey(vTitle, lang)` gives `"vTitle|lang"`, and the deconstruct function splits on `|` (`sefaria.js:1112-1113`).

---

## 8. Version blocks (shared) — `VersionBlock/*`

### 8.1 `VersionBlock` (`VersionBlock.jsx:79-357`), render modes `about-box`, `versions-box`, `book-page`
- **Title:**
  - a merged version shows "Merged from <sources>";
  - otherwise `versionTitle`, or `versionTitleInHebrew` when the interface is Hebrew.
  - Clicking the title in book-page mode opens the version in the main panel; in sidebar modes it opens it in the sidebar.
- **Edit pencil.** Moderators only, and **only in book-page mode** (`l.307`).
- **Language label.** Book-page only: the localized ISO name of `actualLanguage`.
- **Select button.** Text is "Current version/translation" or "Select version/translation". Hidden in the About current section and on the book page via CSS.
- **Version notes.** HTML, chosen by interface language (`versionNotes` / `versionNotesInHebrew`). Plus a **"Read more"** link to extended notes when `extendedNotes` or `extendedNotesHebrew` exists. The link href is `/<title>/<lang>/<vtitle>/notes`; clicking it calls `viewExtendedNotes`. Notes can be hidden with `showNotes=false`, as in the Translations box.
- **Details**, not shown for merged versions: `VersionInformation` + `VersionImage`.
- **Moderator edit form** (book-page only):
  - Fields: Version Title, Hebrew Version Title, Short Version Title, Short Hebrew Version Title, Version Source, License (select of known licenses + current + "(None Listed)"), Direction (ltr/rtl), isSource, isPrimary, Digitized by Sefaria, Priority, Locked (`status="locked"`), Version Notes, Hebrew Version Notes, Purchase Information (Buy URL, Buy Image).
  - SAVE posts `POST /api/version/flags/<title>/<lang>/<vtitle>` with only the changed or truthy attributes. A title change is sent as `newVersionTitle`. On success it reloads the page; errors are shown through `alert` (l.120-150).
  - Server side: staff or API key only, applied through `tracker.update_version_metadata`, and an empty license deletes the license (`reader/views.py:2779-2829`).
  - **Delete Version**: `confirm`, then `DELETE /api/texts/<title>/<lang>/<vtitle>`. This goes through a 301 to `/api/texts/<title>?v<lang>=<vtitle>` (`reader/views.py:2027-2032`), where texts_api handles DELETE for staff (l.1889+). On success it alerts and goes to the book page.
- `VersionsBlocksList` (l.359-480) computes "current" by the key `actualLanguage|versionTitle`.

### 8.2 `VersionInformation` (`VersionInformation.jsx`)
Each row is hidden (`n-a`) when its attribute is missing.
- **Source:** the link host with `www.` stripped.
- **Digitization:** "Sefaria", linking to `/digitized-by-sefaria`.
- **License:** the translated license name (`translateLicense`, `sefaria.js:1123-1137`), linking to `getLicenseMap` (Public Domain, CC0, CC-BY, CC-BY-SA, CC-BY-NC, CC-BY-NC-ND, unknown→#).
- **Revision History:** a link to `/activity/<ref>/<lang>/<vtitle>` (`segment_history` view). It is always shown.
- **Buy in print:** a link to `purchaseInformationURL`.

### 8.3 `VersionImage`
The buy image (`purchaseInformationImage`) links to the purchase URL, or to `versionSource` when there is none. It is hidden when there is no image; its `src` is then `data:,`. Alt text: "Buy now".

### 8.4 `VersionMetadata`
Used inside the preview disclosure: title + information + image.

### 8.5 Version link builder — `VersionBlockUtils.makeVersionLink`
- **Main panel** (`v<lang>=`): keeps only the same-language current-version param.
- **Sidebar** (`vside=`): keeps **all** current-version params and adds `&with=Translation Open`.
- Spaces become `_`.
- Returns null when there are no other params. **Edge case:** with no current versions the link is null.

### 8.6 Extended notes — `ExtendedNotes.jsx` (mode `"extended notes"`)
- Loads all versions of the **title** (`getVersions(title)`) and finds the current en (or he) versionTitle.
- Shows the `extendedNotes` / `extendedNotesHebrew` HTML.
- With both languages present there is a toggle link, "עברית" / "English".
- Missing-language messages: "Extended notes in English do not exist for this version" and the Hebrew equivalent.
- A "Back" link appears only if `backFromExtendedNotes` is passed. It is not passed in the sidebar. The header back goes to "Translations".
- The book-TOC variant (`menuOpen: "extended notes"`) is served at `?notes=1`, with server-side `make_panel_dict` (`reader/views.py:551-559`).

---

## 9. Dictionary / Lexicon — `LexiconBox.jsx`, `DictionarySearch.jsx`

### 9.1 Auto-activation on text selection
1. `TextColumn.handleTextSelection` (`TextColumn.jsx:142-170`) does two things:
   - It highlights the segments covered by the selection, which feeds `setTextListHighlight` and updates the sidebar refs.
   - It sets `selectedWords` from `getNormalizedSelectionString`.
2. Desktop `ReaderApp.setSelectedWords` writes the words into the **next panel only if it exists and is not a menu**. A selection therefore never opens a closed sidebar (`ReaderApp.jsx:1937-1944`).
3. ConnectionsPanel switches to **Lexicon** automatically when all of these hold (`ConnectionsPanel.jsx:79-87`):
   - new selected words matching `/[\s:\u0590-\u05ff.]+/` (Hebrew, space, colon or period);
   - fewer than 3 space-separated words;
   - a single sref.
4. When the selection is cleared while in Lexicon, and there is no named entity, it returns to Resources (l.88-91).
5. The URL keeps the words in `lookup=`.

### 9.2 Lookup
- `shouldActivate` is true when the user searched a word explicitly, or when the selected words contain Hebrew/space/colon and number **≤ 3 words**. The split regex covers whitespace, colon, sof pasuq `\u05c3`, maqaf `\u05be`, paseq `\u05c0` and period (l.83-94).
- `Sefaria.getLexiconWords(words, ref)` normalizes to NFC and calls `GET /api/words/<words>?always_consonants=1&never_split=1&lookup_ref=<ref>`, cached by `words|ref` (`sefaria.js:1563-1572`).
- Server: `LexiconLookupAggregator.lexicon_lookup` with the options `lookup_ref`, `never_split`, `always_split`, `always_consonants` (`reader/views.py:3227-3248`).
- **Category filter.** Entries are kept only if `parent_lexicon_details.text_categories` is empty or contains the joined ref categories, e.g. "Tanakh, Torah". The filter is skipped for manual searches (l.106, 175). There is a TODO calling this limiting.
- **Tracking:** `Lexicon / "Open"` or `"Open No Result"`, with `"/ categories/book"`.
- **States:**
  - "Looking up words..." / "מחפש מילים..."
  - `No definitions found for "<words>".` Note that for a manual search this shows the *selected* words, not the searched word.

### 9.3 Entry rendering — `LexiconEntry` (l.209-373)
- **Headword:**
  - Default: `headword` plus `alt_headwords`, comma-separated, RTL.
  - **BDB** (`parent_lexicon` matches `/^BDB.*?Dict/`) has its own markers:
    - `‡` peculiar
    - `†` all_cited
    - ordinal
    - trailing superscript digits stripped
    - `<sub>` occurrences
    - alternate headwords with occurrences
    - bracket modes `all` / `first_word`
    - `headword_suffix` HTML
- **Morphology** `(…)`, `language_code`, and `language_reference` HTML.
- **Senses.** Recursive `<ol>` with these parts:
  - grammar `(verbal_stem)`
  - definition HTML
  - alternative
  - notes
  - nested senses
- **BDB senses.** `Note.` marker, `pre_num`, `†`, **bold num+form**, `<sub>`occurrences, definition, nested.
- **End notes** and **derivatives** HTML.
- **Attribution.** "Source:" (`source` or `source_url`, linked) and "Creator:" (`attribution` or `attribution_url`, linked).
- **Click behaviour:**
  - Clicking a `.refLink` citation inside an entry calls `onCitationClick(ref)` (opens a panel) and tracks "Citation Link Click".
  - Clicking elsewhere on the entry calls `onEntryClick("<lexicon index_title>, <headword>")` to open the dictionary entry itself as a text, and tracks "Click Dictionary Entry from Lookup".
  - Enter key works too.
- Dictionaries such as Jastrow, Klein and BDB are not hard-coded in the client except BDB's special formatting. Which lexicons apply is decided by the server through `lookup_ref` and `text_categories`.

### 9.4 Named entities in the Lexicon pane
- Clicking an `a.namedEntityLink` in the text (`TextRange.jsx:500-509`):
  - selects the element's text;
  - calls `onNamedEntityClick(slug, sref, text)`, which opens connections with `{connectionsMode:"Lexicon", selectedNamedEntity, selectedNamedEntityText}`. Desktop uses a new or the next panel; mobile stays in-panel (`ReaderPanel.jsx:229-240`);
  - tracks "Named Entity Link Click".
- `Sefaria.getTopic(slug,{annotated:false})` fetches the data.
- For each possibility: the title links to `/topics/<slug>` (new tab).
- A three-dots tooltip gives the data source:
  - Jerusalem Talmud: "…by Sefaria";
  - otherwise: "based on the research of Dr. Michael Sperling". This is hard-coded, with a TODO.
- `timePeriod` name and year range.
- Description markdown, or "No description known for '…'".
- An ambiguous entity (`possibilities`) gets the intro `"<text>" could refer to one of the following:`.
- A new selected word clears the named entity, and the other way round (l.30-40).
- `ReaderApp.closeNamedEntityInConnectionPanel` resets to Resources (`ReaderApp.jsx:1071-1076`).

### 9.5 `DictionarySearch` (search box at top of Lexicon, and SidebarSearch for dictionaries)
- A magnifier button plus an input. Max length 75. Placeholder "Search dictionary".
- **Virtual keyboard** when the interface is English. Its icon shows on focus.
- **jQuery-UI autocomplete:**
  - The input is polled every 330 ms for changes.
  - The dropdown is repositioned below the virtual keyboard when the keyboard is open.
  - English input gets the item "Invalid entry. Please type a Hebrew word.".
  - Source: `Sefaria.lexiconCompletion(term, lexiconName)`, which calls `GET /api/words/completion/<word>[/<lexicon>]`, limit 10 (`sefaria.js:1546-1561`). Server: the cross-lexicon autocompleter or a per-lexicon one (`reader/views.py:3202-3224`).
- **Enter or the search button.** The word is resolved to its dotted form or nearest match through completion, then shown:
  - in the sidebar, as a word list (`showWordList`, i.e. `LexiconBox.searchWord`);
  - for dictionary books, by navigating to the entry.

---

## 10. Topics for this ref — `TopicList` / `TopicListItem` (`ConnectionsPanel.jsx:841-903`), `TopicSearch.jsx`

- Data: `Sefaria.topicsByRef(srefs)` (`sefaria.js:2245-2265`):
  - topics are de-duplicated across the expanded refs;
  - **`dataSources`** are aggregated;
  - sorted by `order.pr` descending;
  - returns `null` if nothing is loaded.
  - The topics arrive in `/api/related` as `topics`, from `get_topics_for_ref(tref, interfaceLang, annotate=True)`.
- Empty state: "No known Topics Here." / "אין קשרים ידועים.".
- Each item:
  - A link to `/topics/<slug>` in a **new tab**.
  - The title in en and he.
  - A three-dots `ToolTipped` with "This topic is connected to "<ref>" by <dataSources joined with &>".
  - The description as markdown (small text).
- **Moderator add-topic** (only when `masterPanelMode === "Text"`): `TopicSearch`.
  - Autocompleter over `Sefaria.getName(word, undefined, ['Topic'])` with the top 4 results, plus a last option "Create a new topic: <word>" (`connections_panel.create_a_new_topic`).
  - The input must exactly match a suggestion; otherwise an alert says "Please select an option through the dropdown menu."
  - Selecting runs `Sefaria.postRefTopicLink(normRef, {topic, interface_lang})`, which calls `POST /api/ref-topic-links/<ref>`. That endpoint is moderator-only and alerts on errors. The new link is pushed into `_refTopicLinks` for each sref and for the section ref, the list refreshes, and an alert says "Topic added." (`TopicSearch.jsx:67-88`).
  - "Create new topic" opens an inline **`TopicEditor`** prefilled with the title. On success the topic is linked.
  - Server: `topic_ref_api` supports GET, DELETE and POST (edit/create), staff only. The link type is `popular-writing-of` for author topics, otherwise `about` (`reader/views.py:3864-3891`).

---

## 11. Notes — `AddNoteBox`, `MyNotes` (`ConnectionsPanel.jsx:1258-1423`), `MyNotesPanel.jsx`, `NoteListing.jsx`

- **Gating.** The Notes button opens the sign-up modal when logged out. `AddNoteBox` shows `LoginPrompt` when logged out (l.1316-1318).
- **Add note.**
  - Textarea with placeholder "Write a note…", auto-focused.
  - "Add Note" button.
  - An empty text does nothing.
  - POST `/api/notes/` with `{json:{text, refs, type:"note", public:!isPrivate}}`. The server squashes `refs` into one ranged `ref`; `isPrivate` defaults to true.
  - Success:
    - `Sefaria.addPrivateNote(data)`, or `clearPrivateNotes` when editing;
    - tracks "Note Save Private/Public";
    - clears the textarea;
    - `onSave` calls `setConnectionsMode("Notes")`.
  - Errors are reported through `alert`.
- **"Go to My Notes"** links to `/texts/notes` (logged in).
- **My notes for these refs.**
  - `Sefaria.privateNotes(srefs, cb)` makes a `GET /api/notes/<ref>?private=1` call for each unloaded ref (`sefaria.js:2054-2099`).
  - Each note renders as `Note` (Misc l.1918-1961): linkified text with newlines converted to `<br>`, and an **edit pencil** for my notes.
  - The pencil calls `editNote(note)`, which switches to mode "Edit Note".
- **Edit Note.**
  - Prefilled textarea, plus **Save**, **Cancel** and **Delete Note**.
  - Delete: `confirm`, then `Sefaria.deleteNote(id)`, which sends `DELETE /api/notes/<id>`, clears the private-notes cache and tracks "Delete Note" (`sefaria.js:2151-2165`).
  - Every action returns to the Notes mode.
- **Note counts** in the Notes button: `notesTotalCount`, public (not mine) plus mine (`sefaria.js:2142-2150`).
- **Server (`notes_api`).** GET with `private` gives public or the user's own notes. POST adds or updates through the `tracker`, with API-key support. Optional `layer` posting creates "discuss" notifications. DELETE requires login (`reader/views.py:2516-2596`). `/api/notes/all?private=1` returns all of a user's notes (l.2599-2610).
- **My Notes page** (`/texts/notes`; `MyNotesPanel.jsx`):
  - Lazy text rendering: 2 notes at first, then 3 more on scroll within 500 px. Every note is rendered as a placeholder so ctrl-F still works.
  - Empty state: "You haven't written any notes yet."
  - Each `NoteListing` (MyNotesPanel's internal version) has "Add to Sheet", which opens a modal `AddToSourceSheetWindow` with the note text as the sheet comment, and links to `/<ref>?with=Notes`.
- **`NoteListing.jsx`** (separate, used on profile/notes lists):
  - a delete (circled-x) action, with confirm;
  - the ref link, which goes to the voices `/sheets/<id>.<node>` for sheet refs, or to library `/<ref>?with=Notes`;
  - note text.
  - `NotesList` renders the empty state.

---

## 12. Web Pages — `WebPagesList` (`ConnectionsPanel.jsx:905-1034`), `WebPage.jsx`

- **Loading.** Web pages are **not** in `/api/related`. They come from `GET /api/related/<ref>/websites`, one call per segment ref:
  - a section-level sref is expanded to its segments;
  - ranges are split;
  - refs already loaded are skipped (`Sefaria.webpagesApi`, `sefaria.js:2190-2206`).
  - The server returns `[]` when the remote config `ENABLE_WEBPAGES` is off (`reader/views.py:2643-2654`).
- **States:**
  - "Loading web pages..."
  - the load error, or "Unable to load web pages."
  - "No web pages known [from <site>] here."
- **Sites view** (mode WebPages, no filter):
  - Grouped by `siteName`, with favicon, name and count.
  - Sorted with sites in the interface language first, then by count.
  - Clicking a site sets the filter, giving `WebPagesList` (URL `with=WebPage:<site>`).
  - Keyboard accessible.
- **Pages view** (filter = site, or "all"). `Sefaria.webPagesByRef` sorts by:
  1. interface-language match,
  2. fewer `anchorRefExpanded` first,
  3. non-range before range,
  4. `linkerHits` descending.
  - Results are memoised in `_processedWebpages` (`sefaria.js:2207-2237`).
- **`WebPage` item:**
  - favicon;
  - title link (new tab);
  - domain;
  - description;
  - **authors**: "Last, First" is reversed, joined with commas and "and" / " ו" (Hebrew);
  - **article source**, with `related_parts`;
  - "Citing: <localized anchor ref>".
  - Hebrew pages get the class `hebrew`.
- **Linker plug.** When `TORAH_SPECIFIC`, a footer reads "Sites that are listed here use the Sefaria Linker", linking to `/linker`.

---

## 13. Add to Sheet — `AddToSourceSheet.jsx`

- **Entry points:**
  - Tools → "Add to Sheet" with `addSource:"mainPanel"`. Uses the srefs, the **current displayed versions** (`currObjectVersions`), the selected words, and `nodeRef` when the main panel is a sheet.
  - Per-link "Add to Sheet" in TextList or VersionsTextList with `addSource:"connectionsPanel"`. Uses `connectionRefs` and `versions`; no selected words (`ConnectionsPanel.jsx:390-414`).
  - The NoteListing modal (`AddToSourceSheetWindow`), with the note text.
  - Global `Sefaria.AddToSourceSheetWindow`, for legacy Gardens.
- **UI:**
  - "Selected Citation": a joined ref list in en and he, or "<sheet title>, Section #n (refs)" for a sheet node.
  - "Add to": a dropdown of the user's sheets, **most recent first**. The default is the first sheet, or "Create a New Sheet" if there are none.
  - The trigger is an accessible listbox: Arrow, Home and End navigate; Enter or Space selects; Escape closes; focus moves between trigger and list; the focused option scrolls into view.
  - **New sheet.** A name input plus "Create" posts `POST /api/sheets/` `{title, options:{numbered:0}, sources:[]}`, then selects the new sheet.
  - **Add to Sheet** button.
  - **GDocs promo** (`GDocAdvertBox`): a "new Google Docs extension" box with Install Now. It is hidden once the `gdoc_installed` cookie is set, and tracks impressions and clicks (`Promotions.jsx:114-145`).
- **Adding:**
  - Logged out: the sign-up modal.
  - No sheet selected: abort.
  - **Version handling:**
    - If both versions share a direction, two separate sources are posted, one per version (`handleSameDirectionVersions`).
    - Otherwise en and he are swapped when the directions are reversed.
    - The source gets `version-he` / `version-en`.
  - **Partial selection.** If words are highlighted and the panel is not bilingual:
    - `sheetsUtils.getSegmentObjs` fetches the segment texts;
    - the first segment is trimmed to the longest suffix that is a prefix of the selection, and the last segment to the longest prefix that is a suffix;
    - "..." ellipses are added;
    - the source text is set for that language only (l.194-223).
  - **Images are not supported.** If any ref's text is a full-segment image, an alert says "We do not currently support adding images to source sheets." (l.266-276).
  - POST `/api/sheets/<id>/add` `{source: JSON, note?}`.
  - A sheet node in the main panel is copied with `POST /api/sheets/<id>/copy_source {sheetID,nodeID}`.
- **Confirm.**
  - "<ref link> has been added to <sheet link>." The links carry `data-target-module` for library or voices.
  - Tracks "Add to Source Sheet Save".
  - Updates the user-sheets cache.
  - Broadcasts `BroadcastChannel('refresh-editor').postMessage("refresh")` so an open sheet editor refreshes.
  - The confirmation resets when the srefs or nodeRef change.

---

## 14. Media & Manuscripts

### 14.1 Torah Readings (audio) — `Media.jsx`
- Data: `Sefaria.mediaByRef(srefs)` from `/api/related` `media` (server `get_media_for_ref`).
- Title "Torah Reading" / "קריאה בתורה".
- **Per clip `Audio`:**
  - source title in en and he; description in en and he;
  - **custom player**: play/pause image button, `elapsed / clip length` (m:ss), range slider from `start_time` to `end_time`;
  - the `<audio>` src uses a `#t=start,end` media fragment and preloads metadata;
  - on load it seeks to the start;
  - **when playback passes the clip end it stops and resets to the start**;
  - license line (the Hebrew label is the typo "עסק רשיון") and a source link.
- The empty state is a perpetual loading message (§0.13).

### 14.2 Manuscripts — `ManuscriptImageList` / `ManuscriptImage` (`ConnectionsPanel.jsx:1574-1640`)
- Data comes from `/api/related` `manuscripts` (`ManuscriptPageSet.load_set_for_client`). There is also `GET /api/manuscripts/<ref>` (`reader/views.py:5392-5398`), but the client does not use it.
- **Each item:**
  - Thumbnail linking to the full image (new tab).
  - Caption: the manuscript title in the interface language.
  - "Location: <page_id with _ replaced by spaces>".
  - "Courtesy of: <description / he_description>".
  - **License** linking to the license map.
  - "Source: <host>".

---

## 15. Share — `ShareBox` (`ConnectionsPanel.jsx:1165-1256`)
- **"Share Link":**
  - A read-only-style input with `window.location.href`.
  - A copy button using `navigator.clipboard`, falling back to `execCommand('copy')`.
  - Mobile selection range set.
- **"More Options":**
  - Facebook sharer.
  - **X** (`twitter.com/share?url=`).
  - Email: `mailto:?&subject=Text on Sefaria&body=<url>`.
  - All three open in a new tab.
- **Dormant sheet-collaboration code.** With `sheetID` the box loads the sheet and, when `shareValue` changes, re-POSTs it to `/api/sheets/` with `options.collaboration`. ConnectionsPanel never passes `sheetID`.

---

## 16. Advanced tools / editing / connections / compare

### 16.1 `AdvancedToolsList` (`ConnectionsPanel.jsx:1036-1092`)
- **Add Translation.**
  - Logged out: sign-up modal `AddTranslation`.
  - Logged in: tracks "Add Translation Click", then navigates to `/translate/<ref>?next=<path>`, which is the `edit_text` view.
- **Add Connection.** Logged out: sign-up modal `AddConnection`; otherwise mode "Add Connection".
- **Edit Text.** Only if `canEditText` and `textsData` exists in `ReaderPanelContext`.
  - Uses the translation when the master language is english, otherwise the primary.
  - Navigates to `/edit/<ref>/<langFamily>/<versionTitle>?next=<path>`.
  - Tracks "Edit Text Click" with a hitCallback.
- **Linker Admin Tools** (moderators only, wrench icon).
  - Sets URL params `with=LinkerAdmin&debug_mode=linker`.
  - If linker debug mode is already on server-side, it only switches the mode in place with `replaceState`; otherwise it reloads.

### 16.2 Login
The "Login" mode renders `LoginPrompt`: "Please log in to use this feature", with Log In / Sign Up links carrying `?next=` (Misc l.1964-1984).

### 16.3 Add Connection — `AddConnectionBox` (`ConnectionsPanel.jsx:1451-1572`)
- Uses `srefs = allOpenRefs`, i.e. every open Text panel's ref (`ReaderApp.jsx:2438`).
- **1 ref:** "Choose a text to connect." plus a **Browse** button that opens the compare panel. `setConnectionsMode` already redirects to the compare panel when only one ref is open.
- **More than 2 refs:** "We currently only understand connections between two texts."
- **2 refs:**
  - Summary "A & B" in en and he. Hebrew refs come from the cache, or are fetched through `getRef` (shown as "..." meanwhile).
  - A **type dropdown**: None, commentary, quotation, midrash, ein mishpat (Ein Mishpat / Ner Mitsvah), mesorat hashas, reference, related (passage).
  - **Add Connection** posts `POST /api/links/` `{json:{refs,type}}`. Success: track "Add Connection", `clearLinks`, `onSave`, flash message. Errors are reported through `alert`.
  - Server: login or API key; saved asynchronously through `save_changes` / `LinkChange` (`reader/views.py:2392-2455`).
- While an "Add Connection" panel is open, clicking segments does **not** open text lists (`currentlyConnecting`, `ReaderApp.jsx:1057, 2168-2177`).

### 16.4 Compare Text
- `ReaderApp.openComparePanel(n, connectAfter)` **replaces the connections panel** with a navigation menu panel, `compare: true` and `openSidebarAsConnect` (`ReaderApp.jsx:1830-1839`). It tracks "Other Text Click".
- Choosing a text there opens it.
- If `openSidebarAsConnect` is set, its sidebar opens in "Add Connection" mode (`ReaderApp.jsx:1865`).
- The compare panel has its own header (`ComparePanelHeader.jsx`; another area) and its own book TOC (`openCompareTextTOC`).

### 16.5 Edit link dots in base text
Covered elsewhere. The filter and category are mirrored to the base panel so link dots and highlights reflect the sidebar filter (`ReaderApp.jsx:1906-1909`).

---

## 17. Feedback / report error — `FeedbackBox` (`Misc.jsx:2662-2760`)
- Intro: "Have some feedback? We would love to hear it."
- **Type dropdown:** content_issue ("Report an issue with the text"), translation_request, bug_report, help_request, feature_request, good_vibes ("Give thanks"), other.
- Textarea "Describe the issue".
- An **email field for logged-out users**, validated by a regex.
- Validation alerts in an `aria-live` region: "Please select a feedback type" and "Please enter a valid email address".
- Submit posts `POST /api/send_feedback` `{refs, type, url, currVersions, email, msg, uid}`.
- The view switches to "Feedback sent!" immediately, optimistically. Tracks "Send Feedback". Errors are reported through `alert`.

---

## 18. Guided Learning (AI learning guide) — `GuideBox.jsx`

- **Data:** `Sefaria.guidesByRef(sref)` from `/api/related` `guides`, i.e. `GuideSet.load_set_for_client` (`reader/views.py:2635`).
  - The `_guides` cache is also used by `getGuide` (the overlay) under `guide_<key>` keys (`sefaria.js:858-864, 2325-2335`).
  - The constructor assumes `guides[0]` exists and will crash if it does not. The tools button only shows when guides exist.
- **Header:** "Guided Learning", an **"Experiment"** label, and an **AI info tooltip** (`AiInfoTooltip`) that says the questions and answers in this guide were AI-generated. The tooltip is hidden while viewing a commentary.
- **Three states with their own history stack:**
  1. **QUESTIONS:** a "Key Questions" list showing each question and "N Answers".
  2. **SUMMARIES:** the chosen question as the title, then each answer's `summaryText` with its commentary index title.
  3. **COMMENTARIES:** a `TextRange` of the chosen `commentaryRef`.
- **Back button integration.** `setState` is overridden to push history and call `setPreviousSettings({onClick: popState, backText})`. The header then shows "‹ Questions" / "‹ Summary" in place of "Resources" (`ConnectionsPanelHeader.jsx:72-93`). When the stack is empty the custom back button is cleared. Changing the ref resets the guide.
- **Analytics (gtag):**
  - `guide_question_clicked` and `guide_answer_clicked`, with `panel_type:"sidebar"`, `panel_number:1.5`, `panel_name:"Learning Guide"`, `panel_category:"Resources | Guide"`, `ref`, `position`, `experiment:true`, `text`, `feature_name:"Key Questions"`, `engagement_type:"consult"`, `item_id:index`.
  - Answer position is `Q.A` as a decimal.

### 18.1 GuideOverlay (not sidebar; page onboarding overlay) — `GuideOverlay.jsx`
- Used for the **sheet editor quick-start guide**. Mapping in `ReaderPanel.getGuideType`: desktop, first panel only, `mode==="Sheet"` and `shouldUseEditor` (`ReaderPanel.jsx:477-526`).
- **Auto-show and manual show:**
  - Shown automatically once per user through the cookie `guide_overlay_seen_<type>` (20-year expiry).
  - It can also be forced from a guide button (`showGuide` / `forceShow`).
- **Content:** `Sefaria.getGuide(type)` calls `GET /api/guides/<key>` (`guides` Django app).
  - **7-second timeout:** if loading is slow, the overlay closes and alerts "Something went wrong…". Load errors get the same alert.
  - **Cards:** title with optional prefix, autoplay/muted/loop/inline video (`Sefaria._v(videoUrl)` per language), and markdown text with newlines turned into breaks.
  - **Circular previous/next pagination**, "n of N".
  - Footer links.
  - Close button.
- **Analytics:** `guide_view_auto`, `guide_view_manual`, `guide_close` (with duration in seconds and card), `guide_nav`, and `guide_click` (footer links and links inside the text). Project: "Quick Start Guide".

---

## 19. Linker Admin (moderator) — `LinkerAdminBox.jsx`

- **Entry points:**
  - Advanced → "Linker Admin Tools".
  - In linker debug mode, a moderator clicks a resolved citation (`a.mutc`) in the text (`TextRange.jsx:486-499`). That picks the span the disambiguator kept and opens the LinkerAdmin sidebar with `connectionData.linkerAdminSpan`; it also stores the span in `Sefaria._linkerAdminSelectedCitation` and updates the URL (`ReaderPanel.jsx:194-207`).
  - Non-moderators, or non-citation spans, get a debug `alert` instead (`sefaria.js:678-689`). That alert dumps the status (SUCCESS/FAILED/AMBIGUOUS), ref, parts, part types, context ref/type, the CRRD test string, and topic slug or category path.
- **Debug mode.**
  - `debug_mode=linker` is added to v3 text API calls (`sefaria.js:644`).
  - `linker_output` is collected into `_linkerOutputMap[ref|lang|charRange]` (`sefaria.js:664-677`).
  - The **toggle switch** reloads the page with the param on or off.
- **"Current Ref":** the selected span's ref, or the currently visible reader ref, so it follows scrolling. The selection is cleared when the visible ref moves away from the selected span's segment.
- **Actions** (all go through `Sefaria.apiRequestWithBody` with a CSRF token):
  - **Re-run linker:**
    - `POST /_api/linker-admin/segment/rerun` once per visible version (he and en, or the span's version);
    - poll each Celery task through `Sefaria.pollTask`, which polls `/api/async/<id>` every 1 s and shows progress (`sefaria.js:3599-3637`);
    - alert, then reload the page.
  - **Delete Link / Recreate Link:**
    - `POST /_api/linker-admin/citation/delete|recreate` `{ref, versionTitle, lang, text, charRange, targetRef}`;
    - delete asks for confirmation first (permanent; it prevents re-creation);
    - the `a.mutc` elements in the reader are restyled live (`spanSucceeded`, `spanFailed`, `spanAmbiguous`, `spanDisambiguated`, `spanDeleted`);
    - if no linker-generated link was found to delete, a warning is shown.
  - **Linker editor** opens `/linker-editor` in a new tab.
  - **Re-parse:** `POST /_api/linker-admin/citation/parse` `{parts, lang, contextRef, prevRefs}`.
    - Ranged parts are flattened into NUMBERED, RANGE_SYMBOL, NUMBERED.
    - An ibid context is passed as `prevRefs`.
  - **+ Ref Dataset:** `POST /_api/linker-admin/dataset/ref`; reports the number of labels.
  - **+ Ref Part Dataset:** `POST /_api/linker-admin/dataset/ref-part`.
- **Display:**
  - A single status line (pending, error or success; "Loading ref parts…").
  - **Linker Resolution(s):** "Disambiguated", "Ambiguous" or the plain title. Options are sorted with rejected ones (`llm_ambiguous_option_valid===false`) last; each shows "Linker → Disambiguator" refs.
  - **Ref Parts** chips, colour-coded by type (NAMED, NUMBERED, DH, RANGE, RANGE_SYMBOL, IBID, RELATIVE, NON_CTS), with a "from curr. book / ibid" context label.
  - **"Options considered":** parsings, valid first, then by the number of matched parts. Invalid ones show their disqualification reason. Each has a collapsible "Ref Part / Node Pairings" with links to the node refs.
  - **CRRD Test String:** click to copy, then "Copied to clipboard" for 2 s. Format: `crrd(["@x","#1",...], lang='en')` (`sefaria.js:710-745`).

---

## 20. Sidebar ads / promos — `sefaria/sidebarAds.js`, `Promotions.jsx`

- **Not shown in the connections panel.** They render in `NavSidebar` (`NavSidebar.jsx:173`) and `TopicPage` (`TopicPage.jsx:598`).
- **Source:** Strapi `sidebarAds`, grouped by documentId with `byLocale`. `buildInAppAdsFromSidebarAds` emits **one ad per locale present** (`sidebarAds.js:6-37`). Fields:
  - `campaignId` (internalCampaignId)
  - `title`, `bodyText`, `buttonText`, `buttonURL`, `buttonIcon`
  - `buttonLocation` (above/below)
  - `hasBlueBackground`
  - `isNewsletterSubscriptionInputForm`, `newsletterMailingLists`
  - trigger: `showTo`, `interfaceLang`, start/end dates, keyword targets with `!`-prefixed **exclude** keywords
  - `debug`
- **Matching** (`Promotions.jsx:72-90`):
  - `showTo` is all, loggedIn or loggedOut.
  - Debug ads only show when `_debug`.
  - Interface language must match.
  - Time window must match.
  - Keywords: (any context keyword in the targets) OR (excludes are non-empty AND no context keyword is excluded).
- **Context keywords** (`ReaderApp.getUserContext`, `ReaderApp.jsx:2342-2378`):
  - the categories, book and ref of each panel's currentlyVisibleRef, bookRef, nav categories or topic;
  - lower-cased and de-duplicated.
- **Render:** `SidebarAd` shows a button or a **NewsletterSignUpForm** above or below the body. Impressions use `OnInView` (`promo_viewed`); clicks send `promo_clicked`.

---

## 21. AI / chatbot / translation features

### 21.1 On master
- **Library Assistant chatbot.** A floating web component `<lc-chatbot>`, mounted once at the ReaderApp level, not in the sidebar (`ReaderApp.jsx:2609-2621`).
  - Shown when: `chatbot_enabled && chatbot_user_token`, not mobile, library module, and remoteConfig `chatbot.hide !== 1`.
  - Attributes: `user-id` (encrypted user token), `api-base-url`, `origin`, `is-moderator`, `placement="right"`, `default-open`, `mode="floating"`, `max-input-chars`, `max-prompts`, `interface-lang`.
  - `chatbot_version` selects the preview server `https://<n>.ai-server.coolifydev.sefaria.org/api`.
  - `ChatbotExperimentBanner` shows when `show_join_chatbot_banner` is set, the user is not already in the experiment, and the page is desktop library (`ReaderApp.jsx:2574, 2589-2594`).
  - Backend helpers: `sefaria/utils/chatbot.py` (token build and decode); `sefaria/helper/library_assistant.py` (enablement); `chatbot_user_token` context processor.
  - The `chatbot/` directory is not tracked (only `__pycache__` and `migrations` remain locally).
- **Guided Learning:** AI-generated Q&A with an AI tooltip (§18).
- **Linker LLM disambiguation:** visible in Linker Admin (§19).

### 21.2 `poc-translation` branch (NOT on master)
- **`fe3d9f5ed0` "poc for AI translation in app".** Adds `static/js/translationQA.js` and changes `TextRange.jsx`, `s2.css`, tests and a design doc (`2026-09-16-community-translation-qa-poc.md`).
  - **Per-segment `TranslationQAControls`** appear under each base-text segment *only* when the rendered English version is in a hard-coded allowlist (`AI_QA_VERSION_TITLES = ["Sefaria AI Translation (POC)"]`):
    - an "AI translation" label;
    - a **"Reads well" checkbox**, persisted in `localStorage` key `sefaria.translationQA.ok:<vtitle>|<ref>`, firing gtag `translation_marked_good`;
    - a **"Report a problem"** button, shown only if the chatbot is available (`Sefaria.chatbot_enabled && chatbot_user_token`). It dispatches the DOM event `chatbot:start-flow` `{flow:"report_issue", ref, en, he}` for the `<lc-chatbot>` widget to open a seeded chat, and fires gtag `translation_issue_reported`.
  - Clicks are swallowed so they do not open the connections panel.
- **`5e23ae1183` "load poc for ai chatbot".** Adds `resolve_chatbot_version(request)`:
  - `?chatbot_version=<n>` is persisted in the session;
  - `?chatbot_version=clear` removes it;
  - both `base_props` (API base URL) and the context processor (script URL) use it so they stay in sync.

### 21.3 Other branches touching the sidebar (NOT on master)
- **`origin/mf1-assistant-modal` (`f4ef16cd6b`).** A **"✦ Try Assistant"** first button in the Resources top tools (`LibraryAssistantToolsButton`), plus a mobile-menu item. Shown to logged-out users in the library module only. It opens the Library Assistant modal through a document event (`openLibraryAssistant`). `ToolsButton` gains a `glyph` prop.
- **`origin/mf2` (`33c4599d42`) "reader feedback on AI translations".**
  - Double-clicking a word in the translation column opens a "Translation Feedback" modal (ref, version, word, suggested change, comment).
  - The modal posts to `/api/translation-feedback`, which saves to the Mongo `translation_feedback` collection.
  - A background thread asks Claude to rate the feedback 1-4 or C.
  - A `/translation-feedback` dashboard lets you accept a suggestion through `tracker.modify_text`.
  - Helm mounts the anthropic key.

---

## 22. Header, navigation & back behaviours — `ConnectionsPanelHeader.jsx`

- **Title / back logic, in priority order:**
  1. `backButtonSettings` (from GuideBox): `‹ <backText>`, calls the custom onClick.
  2. Resources: the static title "Resources" / "קישורים וכלים". On mobile it is centred.
  3. TextList with a `previousCategory`, or any mode with a previous mode: `‹ <prev>`.
     - Previous-mode map: Translation Open → Translations; extended notes → Translations; WebPagesList → WebPages; or `connectionData.previousMode` (Version Open → About).
     - Clicking goes to that previous mode, or to `setConnectionsCategory(prevCategory)` when it was a category.
     - The label text is shown only on desktop; mobile shows the chevron only.
     - The Hebrew label comes from `CONNECTION_MODE_STRING_IDS`, otherwise the raw name.
     - The href is `?with=<prev>`.
  4. Anything else: `‹ Resources`, with href `?with=all`.
  - Chevron direction flips for Hebrew (RTL).
- **Desktop right buttons:**
  - **Language toggle** (`LanguageToggleButton`), shown when:
    - the site is TORAH_SPECIFIC, and
    - it is not the case that the mode is Resources or ConnectionsList while the interface is Hebrew.
    - The toggle sets `lang2` in the URL.
  - **Close (circled X)**: `closePanel`, href with `with` removed.
- **Mobile header:**
  - A top border coloured with the category in TextList.
  - A RecentFilterSet next to the back link.
  - No close button inside it; the mobile close is handled by the panel and ReaderControls.
- **Scrollbar compensation.** The header gets `marginRight` (left for Hebrew) equal to the scrollbar width so it stays centred (l.30-40).
- **Opening the sidebar:**
  - Clicking a segment opens the TextList / Resources at n+1.
  - Clicking the text title in the header opens connections, unless a sidebar is already open; tracks "Open Connections Panel from Header" (`ReaderPanel.jsx:1308-1314`).
  - The header translations shortcut opens mode Translations (`ReaderPanel.jsx:1351-1353`).
  - A commentary URL (e.g. `/Rashi_on_Genesis.1.1.1`) is converted to the base text plus `filter:["Rashi"]`, `filterRef`, `connectionsMode:"TextList"`, `connectionsCategory:"Commentary"`. On desktop that opens two panels; on mobile, TextAndConnections (`ReaderApp.jsx:1760-1823`).
- **Closing.** `closeConnectionPanel(n)` (`ReaderApp.jsx:1066-1070`). On mobile, `closeConnectionsInPanel` returns to mode Text (`ReaderPanel.jsx:241-244`).

---

## 23. Sefaria.js data layer summary (sidebar-related)

| Function | Endpoint | Notes |
|---|---|---|
| `related(ref, cb)` / `relatedApi` (`sefaria.js:2301-2373`) | `GET /api/related/<ref>?with_sheet_links=1` | Bundles links, sheets, notes ([]), topics, manuscripts, media and guides. Each is split per segment through `_saveItemsByRef`, which keeps the larger cached list. `_related[ref]` = original data |
| `relatedPrivate` (l.2375-2429) | `GET /api/related/<ref>?private=1` | My sheets and notes. Marks empty subrefs as loaded |
| `getLinks` (l.1574-1591) | `GET /api/links/<ref>?with_text=0` | Caches index stubs from the links' collectiveTitle and essay displayedText terms |
| `clearLinks` (l.2430-2434) | — | Resets `_related`, `_links`, `_linkSummaries` |
| `linkSummary`, `_filterLinks`, `essayLinks`, `hasEssayLinks`, `linkCount`, `linksLoaded` | — | §3 |
| `getVersions` (l.931-945) | `GET /api/texts/versions/<ref>` | Buckets by `actualLanguage`; fills `_translateVersions` |
| `getSourceVersions` / `getTranslations` / `filterVersionsByAttr` | — | isPrimary / isSource:false |
| `getAllTranslationsWithText` | `GET /api/v3/texts/<ref>?version=translation\|all&fill_in_missing_segments=0` | Translations box |
| `getTextFromCurrVersions` / `_getVersionObjects` (l.790-847) | v3 texts | Version resolution: explicit choice, then the user's **corpus translation preference**, then the translationLanguagePreference language, then the default. withContext refetches the section |
| `setVersionPreference` | profile API | translations only |
| `getIndexDetails` | `GET /api/v2/index/<title>?with_content_counts=1&with_related_topics=1` | About, TOC, sidebar search lexicon detection |
| `getLexiconWords`, `lexiconCompletion` | `/api/words/...` | §9 |
| `privateNotes`, `notes`, `addPrivateNote`, `clearPrivateNotes`, `allPrivateNotes`, `notesTotalCount`, `deleteNote` | `/api/notes/...` | §11 |
| `webpagesApi`, `webpagesLoaded`, `webPagesByRef` | `/api/related/<ref>/websites` | §12 |
| `topicsByRef`, `topicsByRefCount`, `postRefTopicLink` | `/api/ref-topic-links/<ref>` | §10 |
| `mediaByRef`, `manuscriptsByRef`, `guidesByRef` | from related | |
| `sheets.sheetsByRef`, `userSheetsByRef`, `sheetsTotalCount`, `getSheetsByRef` (`/api/sheets/ref/<ref>?include_collections=1`, used by sheets-with-ref) | | |
| `bookSearchPathFilterAPI` | `/api/search-path-filter/<title>` | |
| `getGuide` | `/api/guides/<key>` | overlay |
| `pollTask` | `/api/async/<id>` | linker rerun |
| `getTopic(slug,{annotated:false})` | `/api/v2/topics/<slug>?...` | named entity |
| `saveUserHistory({..., secondary:true})` | user history | sidebar reading history |

---

## 24. Sign-in gating summary

| Feature | Logged-out behaviour |
|---|---|
| Add to Sheet (Tools) | SignUpModal `AddToSheet` |
| Add to Sheet (per-link button) | button hidden |
| Add-to-sheet dropdown / submit | SignUpModal |
| Notes | SignUpModal `Notes`; AddNoteBox shows LoginPrompt |
| Add Translation | SignUpModal `AddTranslation` |
| Add Connection | SignUpModal `AddConnection` (Advanced); `setConnectionsMode` also forces mode `Login` |
| Feedback | allowed, but requires an email |
| Edit Text | requires `canEditText`; the server enforces auth |
| Topics add, link delete, version edit/delete, Linker Admin | moderators only |
| Topics button always visible | moderators only |
| Library Assistant | token-gated (§21) |

## 25. Analytics events (sidebar)

- **`Sefaria.track.event`:**
  - Tools / `<mode> Click` on every `setConnectionsMode`
  - Tools / Prompt Login
  - Reader / Connections Category Click; Category Filter Click; Text Filter Click; Text Filter in Recent Click
  - Reader / Click Text from TextList
  - Tools / Note Save Private|Public; Delete Note
  - Tools / Add Connection
  - Tools / Add to Source Sheet Save
  - Tools / Edit Text Click; Add Translation Click
  - Tools / Send Feedback
  - Lexicon / Open[ No Result] / cats/book
  - Reader / Citation Link Click; Click Dictionary Entry from Lookup; Named Entity Link Click
  - Reader / Choose Version; Set Version Preference; Version Download
  - Search / Sidebar Search Result Click
  - Tools / Sheet Click, My Sheet Click, Sheet Owner Click, Topic Click (SheetListing)
  - Reader / Other Text Click (compare)
  - Reader / Open Connections Panel from Header
- **gtag:**
  - `feature_clicked {name: tools_button_<en>}`
  - `onClick_version_title`, `onClick_select_version`
  - `guide_question_clicked`, `guide_answer_clicked`
  - `guide_view_auto|manual`, `guide_close`, `guide_nav`, `guide_click`
  - `promo_viewed`, `promo_clicked`
- **Reading history:** `saveUserHistory` with `secondary:true` for segments viewed in the sidebar (§4).

## 26. Mobile-specific handling (summary)
- The sidebar is in-panel (`TextAndConnections`). The connections header is rendered by ConnectionsPanel itself, with the RecentFilterSet in the header and a category-coloured border.
- No Compare Text button.
- No language toggle or close button in the sidebar header.
- Back labels show the chevron only.
- Selecting words sets `selectedWords` on the same panel, which auto-switches to Lexicon.
- Citation clicks replace the base text (`showBaseText`) instead of opening a new panel.
- The server treats `mobile` in GET, or a mobile user-agent, as single panel (`reader/views.py:820`).
- `GuideOverlay` is never shown on mobile.
