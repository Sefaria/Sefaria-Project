# Inventory 02 — Reader Application Shell & Panel System

Scope: `static/js/ReaderApp.jsx` (2702 lines), `ReaderPanel.jsx` (1541, incl. `ReaderControls`), `ReaderDisplayOptionsMenu.jsx`, `LayoutButtons.jsx`, `FontSizeButton.jsx`, `SourceTranslationsButtons.jsx`, `ComparePanelHeader.jsx`, `ConnectionsPanelHeader.jsx`, `Header.jsx`, `HeaderAutocomplete.jsx`, `GeneralAutocomplete.jsx`, `context.js`, `Hooks.jsx`, `sefaria/VersionPreferences.js`, `common/*.jsx`, shell-relevant parts of `Misc.jsx`, plus shell-mounted helpers (`client.jsx`, `TextColumnBanner.jsx`, `SiteWideBanner.jsx`, `BannerImpressionProbe.jsx`, `auth/GoogleOneTap.jsx`, `auth/utils.js`, `constants.js`, `sefaria/signupModalContent.js`). All paths are relative to `static/js/` unless stated otherwise.

Read the "Surprising findings / dead code" section first. It lists behaviors a rebuild could get wrong by copying the current code literally.

---

## 0. Surprising findings / dead code / latent bugs (flag first)

- **`handleAppClick` is dead code** (ReaderApp.jsx:1173-1181). It calls `this.eventIsAnalyticsEvent` and `this.handleAnalyticsEvent`, and neither is defined anywhere in the file. Nothing references `handleAppClick`. The root `onClick` is `handleInAppLinkClick` (ReaderApp.jsx:2587).
- **`socket.io-client` `io` is imported but never used** (ReaderApp.jsx:40). This is a leftover from Beit Midrash/chat. `state.beitMidrashStatus` is still read for the panel-box width calc (`calc(width - 330px)`, ReaderApp.jsx:2553), but nothing ever sets it.
- **`generateCurrentlyReading()` / `getDisplayString()` are unused leftovers** from Beit Midrash "currently reading" presence (ReaderApp.jsx:2178-2202).
- **`rerender()` is unused** (ReaderApp.jsx:2337).
- **`toggleSheetEditMode`, `openSidePanel`, `openDisplaySettings` are passed as props but never defined** (ReaderPanel.jsx:1186, 1119, 1131; ReaderControls propTypes `openSidePanel` isRequired at 1532). `this.openDisplaySettings` is undefined on ReaderPanel.
- **`ReaderControls` receives `hasSidebar={this.state.hasSidebar}`** (ReaderPanel.jsx:1185). The panel state never contains `hasSidebar`; it is a prop. As a result `openTextConnectionsPanel`'s guard "don't reopen if already open" (ReaderPanel.jsx:1310) always passes.
- **Bug in `shouldHistoryUpdate`:** `prev.versionFilter(next.versionFilter)` calls an array as a function (ReaderApp.jsx:447). It is only reached when `next.mode` is "Translation Open"/"Version Open", which are connectionsModes, not modes, so the branch is effectively dead.
- **Bug in `makeHistoryState`:** `&sbsq{i}=` is missing a `$`, so the URL gets the literal `{i}` (ReaderApp.jsx:858).
- **Bug: in the 2-panel short-form URL path, `aliyot` is appended to `url` instead of `hist.url`,** so it is dropped (ReaderApp.jsx:816-818).
- **`didDefaultPanelSettingsChange` returns `undefined`** (falsy) when settings exist but nothing changed (ReaderApp.jsx:1564-1578).
- **`ReaderNavigationMenuCloseButton` does not exist as a component name.** The equivalent is `CloseButton` with class `readerNavMenuCloseButton` (Misc.jsx:1233-1263).
- **No dispatcher for the `sefaria:bootstrap-url` DOM event exists in the repo.** ReaderApp listens for it (ReaderApp.jsx:230, 1246), probably for an external widget or bot (the comment says "Route bot refs"). `sefaria:settings-updated` is dispatched by `templates/account_settings.html:318`.
- **No `beforeunload` handler.** Unsaved-editor protection uses only `window.confirm` on in-app navigation and panel close (ReaderApp.jsx:1141-1151, 1288, 1337, 1958).
- **No text-to-speech** anywhere in the shell.
- **No global hotkeys** other than Esc (closes a panel), Tab detection, and the menu/radio key handling described in §15.
- **Colour theme:** `settings.color` ("light" default) is applied as a CSS class on each panel (ReaderPanel.jsx:1159) and is read from a cookie server-side (reader/views.py:362). No current UI changes it; dark/sepia exist only as cookie/CSS hooks.
- **`ReaderPanel.componentWillReceiveProps` reads `nextProps.searchQuery` and `nextProps.initialMenu`** (ReaderPanel.jsx:88-93). ReaderApp passes neither. As a result `menuOpen` is set to `undefined` and then immediately overwritten by `setState(nextProps.initialState)`.
- **`TopicPageAll` receives a typo'd prop `intiialWidth`** (ReaderPanel.jsx:1040).
- **`ReaderPanel` passes `showBaseText={this.props.onNavTextClick || this.showBaseText}`**, and ReaderApp never passes `onNavTextClick` (ReaderPanel.jsx:1010).

---

## 1. App bootstrapping & top-level structure

- **Entry.** `client.jsx` strips the `no_applink` query param via `history.replaceState` (client.jsx:14-18). It initializes Sentry with sample rates from `remoteConfig.sentry` (client.jsx:20-35) and initializes the Django CSRF helper (client.jsx:40).
  - It uses `ReactDOM.hydrate`, or `render` when an `#appLoading` placeholder exists (client.jsx:41-44).
  - When `DJANGO_VARS.inReaderApp` is set, it renders the full ReaderApp with server props after `Sefaria.unpackDataFromProps` (client.jsx:45-50).
  - Otherwise it renders ReaderApp in **headerMode** on top of a static Django page, with `multiPanel = window.width > 600` (client.jsx:52-63).
  - It can also render an arbitrary exported component into a `DJANGO_VARS.containerId` (client.jsx:66-71). Exported static page components are listed at ReaderApp.jsx:2682-2702.
- **Server-side multiPanel rule:** `multiPanel = !request.user_agent.is_mobile && "mobile" not in request.GET` (reader/views.py:347). Add `?mobile` to force mobile/single-panel mode.
- **Render tree** (ReaderApp.jsx:2577-2630):
  - `StrapiDataProvider` > `AdContext.Provider(value=getUserContext())` > `#readerAppWrap`, which contains:
    - Skip link `<Button href="#main" className="skip-link">` ("reader_app.skip_to_main_content") (2583)
    - `<InterruptingMessage/>` (Strapi modal) (2584)
    - `<Banner onClose={setContainerMode}/>` (Strapi banner) (2585)
    - `<GoogleOneTap googleClientId>` (2586)
  - Root `div.readerApp` with classes `multiPanel`/`singlePanel` and `interface-{lang}`, plus `onClick=handleInAppLinkClick` (2567-2570, 2587). It contains:
    - `<Header>`
    - optional `ChatbotExperimentBanner`
    - `<main id="main" role="main">` holding either `AuthPage` (when `showAuth`) or `.panelContainer > #panelWrapBox > .readerPanelBox*`
    - optional `<lc-chatbot>` web component
    - `<SignUpModal>`
    - `<CookiesNotification/>`
  - Outside the root div: `<BannerImpressionProbe/>`.
- **Library Assistant chatbot** (`lc-chatbot`) renders only when all of these hold (ReaderApp.jsx:2573, 2608-2621):
  - `chatbot_enabled` and `chatbot_user_token` props are set
  - not on the mobile breakpoint
  - the active module is Library
  - `remoteConfig.chatbot.hide !== 1`
  - Attributes passed: `user-id`, `api-base-url`, `origin`, `is-moderator`, `placement="right"`, `default-open`, `mode="floating"`, `max-input-chars`, `max-prompts`, and `interface-lang` (short code).
  - When the `chatbot_version` prop is set, the API base URL becomes `https://{version}.ai-server.coolifydev.sefaria.org/api` (2575).
  - `copy` events from `LC-CHATBOT` are ignored by the copy handler (2241).
- **ChatbotExperimentBanner** shows only when all of these hold (ReaderApp.jsx:2574):
  - the module is Library
  - `show_join_chatbot_banner` is set
  - not mobile
  - `!Sefaria.in_chatbot_experiment`
  - Banner behavior is detailed in §17.
- **Exports:** `ReaderApp`, `sefariaSetup`, `unpackDataFromProps`, `loadServerData`, and static pages (EditCollectionPage, ContestLandingPage, PBSC2020/2021LandingPage, PoweredByPage, RambanLandingPage, EducatorsPage, DonatePage, WordByWordPage, JobsPage, TeamMembersPage, ProductsPage, SheetsLandingPage, NewsletterPage, UpdatesPanel) (ReaderApp.jsx:2680-2702).
- **ReaderApp props / defaults** (ReaderApp.jsx:2633-2678):
  - `multiPanel` (default true), `headerMode` (false), `interfaceLang` ("english")
  - `initialRefs`, `initialFilter`, `initialMenu`, `initialCollection`, `initialCollectionData`, `initialQuery`
  - `initialSearchTab`/`Filters`/`Field`/`SortType`/`FilterAggTypes`
  - `initialTopic`, `initialProfile`, `initialNavigationCategories`, `initialSettings`, `initialPanels`, `initialDefaultVersions`, `initialPath` ("/"), `initialPanelCap` (2), `topicTestVersion`, `initialLinkerEditorBook`, `sheetsWithRef`
  - Also used: `initialTab`, `initialTopicSort`, `initialNavigationTopicCategory`, `initialNavigationTopicTitle`, `initialNavigationTopicLetter`, `initialTopicTitle`, `initialCollectionName`/`Slug`/`Tag`, `initialTranslationsSlug`, `translationLanguagePreference`, `notificationCount`, `authResetUid`, `authResetValid`, `remoteConfig`, `chatbot_*`, `show_join_chatbot_banner`, `is_moderator`, `_debug`.

## 2. App-level state (ReaderApp)

Constructor (ReaderApp.jsx:121-139) and later setState calls:

- `panels`: array of panel states (see §3).
- `headerMode`: whether the app is only a header over a static page.
- `defaultVersions`: `{indexTitle: {lang: {versionTitle, languageFamilyName}}}`, a per-book cache of the chosen version (1707-1715). It is cloned from `initialDefaultVersions`.
- `defaultPanelSettings`: settings template for new panels (see §6).
- `layoutOrientation`: "rtl" if interfaceLang is hebrew, else "ltr". It drives panel `left`/`right` offsets and horizontal scroll direction (118, 2446).
- `path`, `panelCap` (max visible panels = `floor(window.outerWidth / 360)`), `windowWidth`.
- `initialAnalyticsTracked`, `showSignUpModal`, `modalContentKind`.
- `translationLanguagePreference`.
- `editorSaveState` ("saved" etc.; set by the sheet editor through `setEditorSaveState`) (132, 141-143).
- `notificationCount` (header badge) (133, 1943-1945).
- `showAuth`, `authPath`, `authSource` (in-app auth page; see §13).
- `mobileNavMenuOpen` (2109-2111).
- `beitMidrashStatus` (vestigial; see §0).
- Instance fields:
  - `MIN_PANEL_WIDTH = 360` (54)
  - `_aboutSidebarPaths` (a Set built from `Sefaria._siteSettings.ABOUT_SIDEBAR_PAGES`) (55-57)
  - `replaceHistory` flag, `justPopped`, `scrollIntentTimer`, `panelScrollIntentTimer[]`, `scrollPositionTimer`, `_lastOpenURLNavigatedInApp`

## 3. Panel state shape (`makePanelState`, ReaderApp.jsx:148-212)

Every field and its default:

- `mode`: "Text" | "TextAndConnections" | "Connections" | "Sheet" | "Menu" (also "SheetAndConnections" appears in comments only; it is not implemented as a mode).
- `refs` [] — array of ref strings.
- `filter` [] — connection filter (e.g. ["Rashi"]).
- `versionFilter` [] — selected version in the sidebar.
- `connectionsMode` "Resources".
- `connectionsCategory` null.
- `currVersions` `{en:null, he:null}`. Each value is `{versionTitle, languageFamilyName}` or null.
- `highlightedRefs` [].
- `highlightedNode` null (sheet node).
- `scrollToHighlighted` false.
- `currentlyVisibleRef`: **always reset to `refs[0]`**. Any incoming `currentlyVisibleRef` is ignored here (161). Callers override it afterward (1796).
- `recentFilters` (defaults to `filter`), `recentVersionFilters` (defaults to `versionFilter`).
- `menuOpen` null. Values used across the code: "navigation", "voices", "sheetsWithRef", "book toc", "extended notes", "search", "topics", "allTopics", "profile", "notifications", "collection", "editCollection", "collectionsPublic", "translationsPage", "calendars", "sheets", "updates", "modtools", "linkerEditor", "user_stats", "saved", "history", "notes", "display" (legacy comment).
- `navigationCategories` [], `navigationTopicCategory` "".
- `sheetID` null, `sheetsWithRef` null (`{en, he}`), `nodeRef` null.
- `navigationTopic`, `navigationTopicTitle`, `navigationTopicLetter`, `topicTitle`.
- `collectionName`, `collectionSlug`, `collectionTag`, `translationsSlug`, `collectionData`.
- `searchQuery` null, `showHighlight` null.
- `searchState`: a SearchState whose type is derived from the active module (`SearchState.moduleToSearchType`).
- `compare` false (compare/“other text” panel), `openSidebarAsConnect` false.
- `bookRef` null (book TOC target).
- `settings`: cloned from the given settings or the defaults.
- `displaySettingsOpen` false (always reset).
- `initialAnalyticsTracked`, `selectedWords` "", `sidebarSearchQuery`, `selectedNamedEntity`, `selectedNamedEntityText`.
- `textHighlights` (strings to highlight from a search result).
- `profile`, `tab`, `topicSort`, `webPagesFilter`, `sideScrollPosition`, `topicTestVersion`.
- `filterRef`: the full commentary ref, e.g. "Rashi on Genesis 1:1:4", kept when the commentary ref was converted to base text plus filter.
- `connectionData` (e.g. linker admin span, `previousMode`), `linkerEditorBook`.
- **Version auto-fill:** when making a panel (after construction) whose visible language has no version set, it fills `currVersions[lang]` from the per-book `defaultVersions` cache (ReaderApp.jsx:203-210).
- **ReaderPanel-local-only state** (ReaderPanel.jsx:55-62): `width` (1000 multi / 500 single initially), `backButtonSettings`, `data` (loaded text data for the current ref), `forceGuideOverlay`, `error`, `noteBeingEdited`, `highlightedRefsInSheet`, `previousCategories`.

## 4. Initial panels construction (ReaderApp constructor)

- If `initialMenu` is set, panel[0] is a "Menu" panel populated with menu/search/topic/profile/collection/translations/linkerEditor initial props. Its searchState is built from the initial search filters, field, agg types, and sort, with type set by module (ReaderApp.jsx:59-91).
- `initialPanels` from the server are cloned and appended (95-96).
- **Language inference from versions:** a panel without settings but with `currVersions` gets language bilingual (both versions), hebrew (he only), or english (en only) (98-105).
- Settings are merged onto defaults (106).
- Any `*AndConnections` mode sets `highlightedRefs = refs` (108-110).
- `menuOpen === "book toc"` gets `tab = props.initialTab`; this is a known hack (111-113).

## 5. Panel modes & what renders (ReaderPanel.render, ReaderPanel.jsx:714-1243)

- **Error state:** a bilingual "Something went wrong" message plus the error text (715-731).
- **Text / TextAndConnections:**
  - Renders `TextColumn` with: srefs, currVersions, highlightedRefs, currentlyVisibleRef, `showHighlight = state.showHighlight || highlightedRefs.length > 1`, basetext, bookTitle/heBookTitle, `withContext`, `loadLinks`, `prefetchNextPrev`, settings clone, hasSidebar, filter, textHighlights, translationLanguagePreference, and navigatePanel.
  - Callbacks: setOption, showBaseText, updateTextColumn, segment/citation/linker-admin/named-entity clicks, setTextListHighlight, setCurrentlyVisibleRef, setSelectedWords.
  - It is keyed by book title, so changing books remounts it (752-796).
- **Sheet:** renders `Sheet` (id, highlightedNode, highlightedRefs, highlightedRefsInSheet, scrollToHighlighted, onSegmentClick, openSheet, setSelectedWords, contentLang, style (fontSize), historyObject, toggleSignUpModal, editor save state, showGuide) and **keys it by sheet id** (797-818).
- **Connections / TextAndConnections:**
  - Renders `ConnectionsPanel` (820-887). It gets srefs (refs in Connections mode, highlightedRefs in TextAndConnections), filter, connectionsMode, recentFilters, connectionsCategory, connectionData, contentLang, title (current book), currVersions, `fullPanel=multiPanel`, allOpenRefs, and `canEditText`.
  - `canEditText` is true when the hebrew version is not locked (hebrew mode), the english version is not locked (english mode), or the user is a moderator and the mode is not bilingual (823-826).
  - It also receives: scroll position, web pages filter, nodeRef, sheet click, openNav, note editing, text click (`handleTextListClick`, which opens without commentary→base conversion), selectedWords, sidebarSearchQuery, named entity, master panel layout/lang/mode, version filters, `viewExtendedNotes("Connections")`, `setPreviousSettings`, `filterRef`, and `backButtonSettings`.
- **Menus** (`menuOpen`):
  - "navigation" → `TextsPage`. In compare mode, openNav becomes openComparePanel and openTextTOC becomes `openCompareTextTOC`; it is keyed by categories (889-907).
  - "sheetsWithRef" → `SheetsWithRefPage`, with search state and a result click that calls handleSheetClick (908-917).
  - "book toc" → `BookPage`. Props: tab, setTab, close=closeMenus, title=bookRef, currVersions, settingsLanguage, category, compare plus an onCompareBack that returns to navigation with `previousCategories`, `narrowPanel=!multiPanel`, selectVersion, showBaseText, `viewExtendedNotes("toc")` (918-943).
  - "extended notes" (when not in Connections mode) → `BookPage` in extended-notes mode, with back = `backFromExtendedNotes` (945-962).
  - "search" with a non-empty `searchQuery` → `ElasticSearchQuerier` (query, tab, searchState, filters/sort/field updaters, onResultClick, openURL, close, compare). **Search with an empty query renders nothing** (964-982).
  - "topics" (983-1034):
    - with `navigationTopicCategory` → `TopicCategory`
    - with `navigationTopic` → `TopicPage` (tab, sort, setTopic, setNavTopic, openSearch, translationLanguagePreference, topicTestVersion)
    - neither, Library module → `TopicsLandingPage`
    - neither, Voices module → `TopicsPage`
  - "allTopics" → `TopicPageAll(letter)` (1035-1048).
  - "notifications" → `NotificationsPanel(setUnreadNotificationsCount)` (1050-1055).
  - "collection" → `CollectionPage` (name, slug, tag, tab, setCollectionTag, searchInCollection, `updateCollectionName`, which replaces history) (1057-1075).
  - "collectionsPublic" → `PublicCollectionsPage` (1077-1082).
  - "translationsPage" → `TranslationsPage(slug)` (1084-1087).
  - "editCollection" → `EditCollectionPage(collectionData)` (1088-1094).
  - "user_stats" → `UserStats` (Torah Tracker) (1095-1096).
  - "modtools" → `ModeratorToolsPanel` (1098-1102).
  - "linkerEditor" → `LinkerEditorPage(initialBook, onBookChange)` (1104-1111).
  - "saved" | "history" | "notes" → `UserHistoryPanel` (1113-1123).
  - "voices" → `SheetsHomePage` (the Voices module home) (1124-1135).
  - "profile" → `UserProfile(profile, tab)` (1137-1146).
  - "calendars" → `CalendarsPage` (1148-1153).
  - "sheets", "updates" have history URLs (632-636, 627-631) but **no render branch in ReaderPanel**. "updates" is served by the static `UpdatesPanel` export.
- `.readerContent` (with the fontSize style) wraps `items` only when there is no `menu` (1222-1225). A menu replaces content entirely.
- **Panel root:** `div.readerPanel` with `role="region"`, `id="panel-{n}"`, `onKeyDown=handleKeyPress`, and `data-anl-batch` analytics JSON (1180-1181).
  - Classes: `serif`, `narrowColumn` (width < 730), the content language (`hebrew`/`english`/`bilingual`), the current layout (`segmented`/`continuous`/`stacked`/`heLeft`/`heRight`), the colour (`light`…), and a text-direction class (`rtl`/`ltr`) when the panel is monolingual or has no text (1156-1166).
- **GuideOverlay** renders whenever `getGuideType()` returns a type (1229-1238). See §14.

## 6. Reader settings (display options), defaults & persistence

- **Defaults** (ReaderApp.jsx:975-994). The state copy wins, then `props.initialSettings`, then these hard-coded values:
  - `language: "bilingual"`
  - `layoutDefault: "segmented"`
  - `layoutTalmud: "continuous"`
  - `layoutTanakh: "segmented"`
  - `aliyotTorah: "aliyotOff"`
  - `vowels: "all"`
  - `punctuationTalmud: "punctuationOn"`
  - `biLayout: "stacked"`
  - `color: "light"`
  - `fontSize: 62.5`
- **Server-provided initialSettings come from cookies** with the same defaults; language comes from `request.contentLang` (reader/views.py:353-363).
- **`setOption(option, value)`** (ReaderPanel.jsx:530-549):
  - `fontSize`: "smaller" divides by 1.15 and "larger" multiplies by 1.15 (geometric step).
  - `layout`: the option name is remapped to the **category-specific key** via `getLayoutCategory()`, which returns `layoutTanakh` or `layoutTalmud` for those primary categories and `layoutDefault` otherwise (526-529).
  - Any option other than fontSize closes the display settings menu (`displaySettingsOpen=false`).
  - `language`: also writes the `contentLang` cookie, sets `replaceHistory=true`, and calls `setDefaultOption` so **new panels inherit the language**.
  - **Every option is written to a cookie of the same name** (`$.cookie(option, value, {path:"/"})`). That is how settings persist across sessions (547).
- **Default-propagation:** when a panel's `settings` differ from the defaults, `setPanelState` copies them into `defaultPanelSettings`, so later panels inherit them (ReaderApp.jsx:1559-1561, 1564-1578). `setDefaultOption` updates a single key (1716-1721).
- **`currentLayout()`** (ReaderPanel.jsx:637-645):
  - bilingual: returns `biLayout` if the panel width > 500, else "stacked"
  - Connections panels: always "segmented" (no continuous in the sidebar)
  - otherwise: the category-specific layout key
- **Auto biLayout flip:** when the panel is bilingual and not stacked, and the loaded data's primary and translation directions are equal (both rtl or both ltr) and differ from before, it sets biLayout to `heRight` (primary rtl) or `heLeft` (ReaderPanel.jsx:113-126).
- **Content-language override** (`getContentLanguageOverride`, ReaderPanel.jsx:145-161):
  - menus "topics"/"allTopics"/"calendars"/"collection": bilingual for an English interface, hebrew for a Hebrew interface.
  - any other open menu, or a Connections panel not in TextList mode: hebrew interface → hebrew; english interface → english if bilingual, else the original language.
  - This value is what goes into `ReaderPanelContext.language`.
- **Connections panels are never bilingual.** `openTextListAt` coerces them to hebrew/english (ReaderApp.jsx:1861). Opening a text from a Connections panel while the master is bilingual restores bilingual (ReaderPanel.jsx:270-274).
- **Library menu (`showLibrary`) forces english language** when `!Sefaria._siteSettings.TORAH_SPECIFIC` (non-Torah white-label deployment) (ReaderApp.jsx:2010-2012).
- **URL `lang` override when following links:** `openURL(..., overrideContentLang=true)` maps `lang=bi/en/he` into the default language. It is used for links inside `.translationsPage` (ReaderApp.jsx:1368-1372, 1235).
- **`translationLanguagePreference`** (ReaderApp.jsx:2144-2157):
  - Setting it writes the cookies `translation_language_preference` and `translation_language_preference_suggested=1`. Passing null resets and removes both cookies.
  - It tracks the event "Reader / Set Translation Language Preference" and persists to the profile with `editProfileAPI({settings:{translation_language_preference, ..._suggested}})`.
  - It is passed to text fetching (`getTextFromCurrVersions`), TopicPage, ConnectionsPanel, and TextColumn.
  - The `sefaria:settings-updated` event (from the account settings page) can update it live, along with `readingHistory` (→ `Sefaria.is_history_enabled`) and `textualCustom`/`diaspora` (→ `Sefaria.updateCalendars`) (ReaderApp.jsx:1259-1271).
- **VersionPreferences** (sefaria/VersionPreferences.js):
  - Maps corpus → {lang: vtitle}.
  - `getVersionPref(ref)` looks up the index's `corpus`; any failure (sheets, missing index) returns null.
  - `update` is immutable and returns a new instance; every construction writes the `version_preferences_by_corpus` cookie (JSON).
  - Note: ReaderApp itself uses only the `defaultVersions` per-book cache. VersionPreferences is consumed elsewhere (Sefaria singleton).

## 7. Display options menu (ReaderDisplayOptionsMenu, LayoutButtons, FontSize, SourceTranslations)

- Opened from `DisplaySettingsButton` inside a `DropdownMenu(positioningClass="readerDropdownMenu")` in ReaderControls' right buttons (ReaderPanel.jsx:1463-1478). It reads its values from `ReaderPanelContext`.
- The menu is `role="dialog"` with aria-label "common.text_display_options", `tabIndex=-1`, and `data-prevent-close` (so clicks inside don't close the dropdown) (ReaderDisplayOptionsMenu.jsx:122-131).
  - On mount it focuses the checked radio button, else the first enabled button or switch (100-104).
  - Arrow keys are stopped from propagating (radios handle them). Tab/Escape are trapped through `Util.trapFocusWithTab`; close works by `document.body.click()` (15-21, 106-120).
- **Source/Translation toggle (`SourceTranslationsButtons`)**:
  - Shown when TORAH_SPECIFIC, or when the text lacks either Hebrew or English (`showLangaugeToggle`; on non-Torah sites it is hidden if both exist) (27-33, 132-139).
  - Three radios: "Source" (hebrew), "Translation" (english), "Source with Translation" (bilingual). **The bilingual option is hidden in side panels** (mode not Text/Sheet) (SourceTranslationsButtons.jsx:9, 24-26).
  - Radio name/id are suffixed with panelPosition for uniqueness.
- **Side panels** (mode not Text and not Sheet) show **only** the language toggle; the layout, aliyot, font, vowels, cantillation, and punctuation options are hidden (ReaderDisplayOptionsMenu.jsx:24, 140).
- **Layout buttons** (LayoutButtons.jsx; constants.js:1-13):
  - The layout state is:
    - `mono` when not bilingual
    - `mixed` when the primary and translation directions differ, or the panel is a Sheet
    - `bi-rtl` when both texts are rtl
    - `bi-ltr` when both texts are ltr
  - Options per state:
    - mono: continuous, segmented
    - bi-rtl: stacked, heRight
    - bi-ltr: stacked, heLeft
    - mixed: stacked, heLeft, heRight
  - Icons come from `/static/icons/{state}-{option}.svg`. Mixed states use direction-aware names (`beside-rtlltr` etc.). Sheets with no primary default to rtl; a missing translation direction is inferred as the reverse (LayoutButtons.jsx:19-31).
  - The option key is `biLayout` when bilingual, else `layout` (remapped by category).
  - Labels: "show text as a paragraph", "segmented", "stacked", "rtl text right/left of ltr".
  - Layouts are hidden when (width ≤ 600 and bilingual) or (Sheet and not bilingual) (ReaderDisplayOptionsMenu.jsx:43-46).
- **Aliyot toggle:** shown only for Genesis–Deuteronomy and Onkelos Genesis–Deuteronomy, and not on sheets. It toggles `aliyotTorah` between aliyotOn and aliyotOff (48-59). The URL carries `aliyot=0/1` for Torah refs (ReaderApp.jsx:686-688).
- **Font size:** − and + buttons with aria labels; the step is ×/÷1.15 (FontSizeButton.jsx). The menu does not close on font change.
- **Vowels toggle:** shown only if the sample text (first leaf of `he` or `text`, for the visible side) contains nikud `[ְ-׃ׇ]`. It toggles `vowels` between none and partial (70-78).
- **Cantillation toggle:** shown if the sample contains te'amim `[֑-֯]`. It is disabled when vowels are off and toggles `vowels` between partial and all (80-89). So `vowels` is a three-state setting: all / partial / none.
- **Punctuation toggle:** shown only when the text's `primary_category === "Talmud"` and the source is visible. It toggles `punctuationTalmud` between punctuationOn and punctuationOff (91-98).
- Toggle switch rows are `ToggleSwitchLine` (checkbox `role="switch"`, aria-labelledby) (common/ToggleSwitch*.jsx).
- **ComparePanelHeader** (an alternative header used by compare-panel menus):
  - Search mode has a back chevron (MenuButton compare), a search input that opens search on Enter or button click, and a display settings dropdown that is **not shown for a Hebrew interface** (ComparePanelHeader.jsx:19-43).
  - Category mode shows a colour line, back, the category title (ContentText), and display settings (a hidden placeholder in a Hebrew interface) (44-57).

## 8. Multi-panel layout, widths, panel cap, horizontal scroll

- `panelCap = floor(window.outerWidth / 360)`, recomputed on `resize` (ReaderApp.jsx:1015-1024, 216).
- **Widths** (ReaderApp.jsx:2389-2417):
  - panels ≤ cap: even percentage widths
  - more panels than cap: 360px each, plus `wrapBoxScroll` with box width = windowWidth px
  - Special ratios:
    - [Text|Sheet, Connections | search menu | compare] → 68% / 32%
    - [Text|Sheet, Connections, Text|Sheet] → 37 / 26 / 37
    - [Text|Sheet, Text|Sheet, Connections] → 37 / 37 / 26
- Each panel box is absolutely positioned with `left` (LTR) or `right` (RTL) offset = sum of previous widths (2444-2446). The box gets class `sidebar` when it is a Connections panel (2485).
- **Panel React key** = index + book title. Panels remount when they shift position or change book (2482-2484).
- **Auto horizontal scroll to a new panel** when panels exceed the cap and a panel was added. It computes the first changed index and scrolls `#panelWrapBox` so the new panel is fully visible, RTL-aware (ReaderApp.jsx:280-308).
- `setPaddingForScrollbar`: with a single panel, `.textColumn` and `.sheetsInPanel` get paddingLeft = scrollbar width to keep them centered under the header; multi-panel clears the padding (1025-1036). It runs after each history update.
- `ConnectionsPanelHeader.setMarginForScrollbar` does the same for the connections header, RTL-aware (ConnectionsPanelHeader.jsx:30-40).
- ReaderPanel measures its own width on mount, on resize, and when `layoutWidth` changes (ReaderPanel.jsx:77-78, 97-99, 580-583). The width is used for `narrowColumn` (<730), the biLayout fallback (>500), and the layout toggle visibility (≤600).

## 9. Panel operations (open / replace / close / compare / connections)

- **`openPanel(ref, currVersions, options, replaceHistory)`** replaces ALL panels (it clears `this.state.panels` directly, then calls `openPanelAt(0, …, replace=true)`) (ReaderApp.jsx:1722-1729). It is used by header ref navigation, mobile links, and openURL.
- **`openPanelAt(n, ref, currVersions, options, replace, convertCommentaryRefToBaseRef=true, replaceHistory, saveLastPlace=true, forceOpenCommentaryPanel=false)`** (1730-1808):
  - If `ref` is an **index/book title** → a `menuOpen:"book toc"` panel with `bookRef = index.title`.
  - If `ref` parses to book "Sheet" → a Sheet panel with `sheetID` and `highlightedNode` from the sections.
  - Otherwise a Text panel:
    - **Commentary → base text conversion:** if `Sefaria.isCommentaryRefWithBaseText(ref, force)` holds, the ref is split with `getBaseRefAndFilter`. "Rashi on Genesis 1:1:4" becomes ref "Genesis 1:1", filter ["Rashi"], and `filterRef` keeps the full ref. The commentary opens alongside.
      - Multi-panel: a second **Connections** panel is pushed (`connectionsMode:"TextList"`, `connectionsCategory:"Commentary"`).
      - Mobile: a single panel in **"TextAndConnections"** mode with highlightedRefs = refs.
      - `showHighlight=true` (1809-1821).
    - **Array refs:** `currentlyVisibleRef = normRef(array)`, and highlightedRefs are the split ranging refs of all entries.
    - `currentlyVisibleRef` is always humanized (1796).
  - Inserts at `n+1`, or replaces at `n` when `replace` is true. A connection panel is appended at the end of the array (1799-1803).
  - Calls `saveLastPlace` when enabled (1805-1807).
- `openPanelAtEnd` (1823-1825) is used by openURL when `replace=false` (links inside sheet content).
- `replacePanel(n, …)` = openPanelAt with replace (1826-1829).
- **`handleSegmentClick(n, ref)`** (multi-panel only; 1052-1065):
  - sets the text-list highlight on panel n
  - does nothing more if any panel is in "Add Connection" mode (`currentlyConnecting`)
  - otherwise opens or updates the Connections panel at n+1
  - **a11y:** focuses the first focusable element in the new panel if there is no text selection and the anchor node is not a text node
- **`openTextListAt(n, refs, textListState)`** (1840-1875):
  - If panel n is not already Connections, it splices in a new one (saving last place for the parent with sidebar=true).
  - The new panel inherits from the parent Text/Sheet panel: filter, versionFilter, recentFilters, recentVersionFilters, currVersions.
  - connectionsMode becomes "Add Connection" if the parent `openSidebarAsConnect`.
  - The language is coerced to non-bilingual, and extra state (e.g. named entity) is merged in.
- **`setTextListHighlight(n, refs)`** updates the highlight and, if the next panel is Connections with no menu, re-points it at the refs (1876-1886).
- **`closePanel(n)`** (1955-1989):
  - If n is 0 and the sheet editor has unsaved changes, it asks for confirmation and aborts on cancel.
  - The last panel closing empties the panels, which then **routes to `showRoot()`** (library or voices home).
  - Closing a Connections panel clears the parent's filter and highlightedRefs.
  - After the splice, if the next panel is a Connections or compare panel, it is closed too.
- **Compare closing:** a compare panel's close button runs `convertToTextList`. It closes the compare panel and reopens a connections list for the base highlight; for Sheet bases it uses the highlighted node's source ref (2469, 1990-2006).
- **`openComparePanel(n, connectAfter)`** replaces panel n with a "navigation" menu panel with `compare:true` and `openSidebarAsConnect`. Event: "Reader / Other Text Click" (1830-1839).
  - Triggered from `setConnectionsMode("Add Connection")` when only one text is open (ReaderPanel.jsx:554-557), and from the ConnectionsPanel "Other Text" control.
  - In a compare panel: TextsPage back calls closePanel; selecting a book opens `openCompareTextTOC` (book toc with compare, remembering the categories) (ReaderPanel.jsx:444-453, 891-892); the compare book TOC's back returns to navigation with the previous categories (919-924); `showBaseText` does not convert commentary refs (268).
- `handleCitationClick(n, citationRef, textRef, replace, currVersions)` (1077-1088):
  - closes panel n+1 if `replace` or if it is Connections
  - highlights textRef in panel n
  - opens the citation after n with `scrollToHighlighted:!!replace`
  - In single-panel mode ReaderPanel calls `showBaseText` instead (ReaderPanel.jsx:187-193).
- `handleCompareSearchClick(n,…)`: search results inside non-first panels replace that panel instead of clobbering everything (1102-1105, 2452).
- `handleSidebarSearchClick(n, ref)`: a sidebar search result replaces the **master panel (n-1)** with highlight, scrollToHighlighted, and showHighlight set (1106-1116).
- `openNamedEntityInNewPanel` → `openTextListAt(n+1, [ref], {connectionsMode:"Lexicon", selectedNamedEntity, selectedNamedEntityText})` (1089-1092; ReaderPanel.jsx:231-242). The single-panel equivalent switches to TextAndConnections.
- `closeNamedEntityInConnectionPanel(n)`: when the highlight changes, a named-entity sidebar resets to Resources (1071-1076; ReaderPanel.jsx:319-321).
- `closeConnectionPanel(n)` closes n+1 if it is Connections (1066-1070).
- `setConnectionsFilter(n, filter, updateRecent)` (1887-1910):
  - Moves the filter to the front of `recentFilters`, deduped using `toggle`.
  - Sets connectionsMode to "EssayList" if the filter has the suffix `|Essay`, else "TextList". No filter → "ConnectionsList".
  - Mirrors filter and recentFilters onto the base panel.
- `setVersionFilter(n, filter, prevConnectionsMode)` (1916-1934):
  - Adds to `recentVersionFilters` unless coming from About.
  - Mode becomes "Version Open" if coming from About, else "Translation Open". Clearing the filter → "Translations".
  - Mirrors onto the base panel.
- `setSideScrollPosition(n,pos)` remembers the sidebar scroll position (1911-1915).
- `setSelectedWords(n, words)` sets the next panel's `selectedWords` when it has no menu, for the Lexicon/dictionary lookup (1935-1942). Single-panel mode sets it on the own panel. Words are trimmed (ReaderPanel.jsx:339-356).
- **`selectVersion(n, versionTitle, versionLanguage, languageFamilyName)`** (1639-1662):
  - Sets `currVersions[lang]` and caches it in `defaultVersions` for that book. Event: "Reader / Choose Version / {book} / {vtitle} / {lang}". Null selects the default version.
  - **Auto language switch** (`_getPanelLangOnVersionChange`, 1605-1622): if the panel is bilingual, has both versions, or the chosen version's language is not currently visible → bilingual; otherwise the version's language. Connections panels collapse bilingual to the version's language.
  - Multi-panel: the dependent panel (master↔connections) gets the same currVersions and its own language recomputation. Mobile has no dependent panel.
- `navigatePanel(n, ref, currVersions)` sets refs, currentlyVisibleRef, and highlightedRefs on panel n and cascades to the dependent panel (array → full range highlight; TextAndConnections → highlight [ref]) (1663-1686).
- `viewExtendedNotes(n, method, title, vLang, vTitle, family)` sets bookRef and a single version, then opens "extended notes" either as a menu ("toc") or as a connectionsMode ("Connections"). `backFromExtendedNotes` returns to "book toc" (1687-1706).
- **ReaderPanel-local panel navigation:**
  - `handleBaseSegmentClick(ref, showHighlight)` (ReaderPanel.jsx:170-182):
    - TextAndConnections → closes connections (back to Text)
    - Text + multi-panel → sets showHighlight and opens the sidebar (event "Reader / Open Connections Panel")
    - Text + mobile → switches to TextAndConnections
  - `openConnectionsInPanel` replaces history when already in TextAndConnections ("don't push history for change in Connections focus") (222-230).
  - `showBaseText(ref, replaceHistory, currVersions, filter, convert, forceOpenCommentaryPanel)` (259-292):
    - A Sheet ref routes to `openSheet`.
    - When replaceHistory is set, it saves last place first.
    - It calls `openPanelAt(panelPosition, …, replace=true, …, saveLastPlace=false)` and carries the current settings.
  - `openSheet(sheetRef)` parses "Sheet id:node" into mode Sheet (293-310).
  - `handleSheetClick(sheet, node, highlightedRefsInSheet)` opens a sheet in the same panel (247-255).
  - `handleSheetSegmentClick(source)` highlights a node; highlightedRefs is the source's split ref, or `Sheet id:node` (183-186).
  - `updateTextColumn(refs)` handles infinite scroll ref changes with replaceHistory (311-315).
  - `setCurrentlyVisibleRef` uses replaceHistory (584-590).
  - `closeMenus()`: menuOpen becomes null, or "navigation" if there are no refs; clears categories and topic category (357-365).
  - `closeSheetMetaData` (366-375).
  - `openMenu(menu)` sets mode Text and resets nav/topic fields (376-386).
  - `setNavigationCategories`, `setNavigationTopic` (topic category), `setTopic` (topic page with topicTestVersion), `setCollectionTag`, `setTab` (with a race-condition workaround for TabView mounting before history is pushed, 595-606), `onSetTopicSort`, `setLinkerEditorBook` (push history), `updateCollectionName` (replace history), `setWebPagesFilter` (→ "WebPagesList"), `setConnectionsCategory` (sets the filter for link dots and switches to "ConnectionsList"), `editNote` (→ "Edit Note").
  - `setConnectionsMode(mode, connectionData)` (550-569):
    - "Add Connection" with only one open ref opens the compare panel instead.
    - Login-required modes for anonymous users become "Login" (event "Tools / Prompt Login"); otherwise the event is "Tools / {mode} Click".
    - "Resources" clears the filter. It also stores `connectionData`.
  - `handleLinkerAdminCitationClick(sourceRef, lang, charRange, spans)` (194-207):
    - Picks the span with `llm_ambiguous_option_valid !== false`, else the first span.
    - Stores it on `Sefaria._linkerAdminSelectedCitation`.
    - Opens the connections panel in "LinkerAdmin" mode with connectionData.
    - Rewrites URL params through `Sefaria.util.setLinkerAdminUrlParams` and `history.replaceState`.
  - Text data loading: `conditionalSetTextData()` clears `data` and, for Text/TextAndConnections or connectionsMode "Advanced Tools", calls `Sefaria.getTextFromCurrVersions(currentlyVisibleRef, currVersions, translationLanguagePreference, true)`. It re-runs when versions, currentlyVisibleRef, or connectionsMode change (66-74, 108-112).
  - `currentBook()` = data.indexTitle, else the parsed ref's index/book. `currentCategory()` = "Sheets" for sheets, else the index `primary_category` (619-636).

## 10. Single-panel (mobile) vs multi-panel differences

- `multiPanel` decides:
  - segment click: sidebar panel vs in-panel TextAndConnections
  - citation click
  - named-entity open
  - selected-words routing
  - commentary-ref opening (2 panels vs TextAndConnections)
  - selectVersion dependent-panel cascade
- **Mobile links:** every in-app link replaces the panel through `openURL(href, true)`. In multi-panel, links **inside sheet content (`.sheetItem`) open a new panel at the end**; all others replace (ReaderApp.jsx:1215-1244).
- `onSegmentClick` is null for mobile panels (2447).
- **ReaderControls mobile:** a MenuButton (hamburger → mobile nav menu) instead of a CloseButton. Connections panels in single-panel mode hide the reader header entirely (`hideHeader`) (ReaderPanel.jsx:1399, 1455-1460).
- **Header hidden on mobile** while viewing a text (first panel mode Text/TextAndConnections with no menu) unless the mobile nav menu is open. ReaderControls then acts as the header (Header.jsx:223-232).
- **Mobile header:** hamburger, centered logo (TORAH_SPECIFIC only), and a language toggle (aleph/aye) only for "navigation", "saved", "history", and "notes" menus with a non-Hebrew interface. It toggles the first panel between hebrew and english (Header.jsx:323-345; ReaderApp.jsx:2112-2119).
- ConnectionsPanelHeader mobile variant: the header has a category-colour top border in TextList mode, Resources is centered, and `RecentFilterSet` renders as a header for recent commentators (ConnectionsPanelHeader.jsx:158-181).
- `getGuideType` returns null on mobile or for panelPosition ≠ 0 (ReaderPanel.jsx:492-494).
- Breakpoint check (`Sefaria.getBreakpoint() === MOBILE`) gates the chatbot, the chatbot banner, the header variant, and Popover placement.

## 11. URL / history state, deep links, back/forward, scroll restoration

- **`updateHistoryState(shouldReplace)`** runs on mount (replace) and after every update unless the last update was a popstate (ReaderApp.jsx:214, 269-313, 893-931):
  - Resets the `replaceHistory` flag first.
  - Skips when `shouldHistoryUpdate()` is false.
  - Preserves the URL `#hash`.
  - Replace → `history.replaceState`, plus a delayed pageview if the URL changed.
  - Push → never pushes an identical URL; otherwise `pushState` and `trackPageview`.
  - Sets `<title>` and adjusts scrollbar padding.
- **`shouldHistoryUpdate`** compares, per panel (414-483):
  - mode, menuOpen, bookRef (book toc)
  - the last ref (Text), highlightedRefs (Text), the last highlighted ref (TextAndConnections)
  - filter (Connections/TextAndConnections), refs (Connections)
  - currentlyVisibleRef, connectionsMode, connectionData (JSON), currVersions
  - searchQuery, tab, topicSort, collectionName, collectionTag, linkerEditorBook
  - searchState (appliedFilters/field/sortType)
  - language, navigationTopicCategory, highlightedNode, aliyotTorah, navigationTopic, navigationCategories (array compare)
  - auth show/path changes
  - **Sheet title arrival:** it re-pushes when a sheet's title loads and the document title is still the placeholder.
- **URL scheme per menu** (makeHistoryState, 515-671); `&tab=` is appended for non-search menus:
  - navigation → `/texts[/Cat/Sub]` (title from translated categories, or "home")
  - voices → `/`; sheets → `/` (title "home")
  - sheetsWithRef → `/sheets-with-ref/{encoded en ref}` + search-state URL params with prefix `s`
  - book toc → `/{Book_Title}`
  - extended notes → `/{Book}&notes{i}=1` (book from currentlyVisibleRef in Connections mode)
  - search → `/search&q={query}&tab={text|sheet}&search_tab={results tab}` + search params with prefix `t` (text) or `s` (sheet). `tab` means search type here, so the results tab is `search_tab`.
  - topics → `/topics/{slug}` (or `/topics/{testVersion}/{slug}`) + `&sort=`; category → `/topics/category/{slug}`; landing → `/topics`; allTopics → `/topics/all/{letter}`
  - profile → `/profile/{slug}`; notifications → `/notifications`
  - collection → `/collections/{slug}&tag={tag with # → %23}`; editCollection → `/collections/{slug}/settings` or `/collections/new`; collectionsPublic → `/collections`
  - translationsPage → `/translations/{slug}` (title = the Hebrew title)
  - calendars → `/calendars`; updates → `/updates`; modtools → `/modtools`
  - linkerEditor → `/linker-editor&book=`
  - user_stats → `/torahtracker`; saved → `/saved`; history → `/history`; notes → `/texts/notes`
- **Text:** URL = normRef(highlighted range if it overlaps currentlyVisibleRef, else currentlyVisibleRef); title = human ref; version params; `aliyot` for Torah (672-688).
- **Connections:**
  - `sources` = the filter joined with "+", or the connectionsMode if it is a URL-representable sidebar mode, else "all".
  - URL-representable sidebar modes: Sheets, Notes, Translations, Translation Open, Version Open, About, AboutSheet, Navigation, WebPages, extended notes, Topics, Torah Readings, manuscripts, Lexicon, SidebarSearch, Guide, LinkerAdmin.
  - "ConnectionsList" filters get the suffix " ConnectionsList".
  - WebPagesList → `WebPage:{filter}`.
  - `filterRef`, `versionFilter`, Lexicon `selectedWords`/`selectedNamedEntity`/`selectedNamedEntityText`, and the SidebarSearch query are recorded. A SidebarSearch panel borrows the previous panel's refs.
  - Title "{ref} with {mode}" (localized via CONNECTION_MODE_STRING_IDS) unless "all"/ConnectionsList (690-723).
- **TextAndConnections** (mobile) is the same idea but within one panel (725-750).
- **Sheet:** panel 0 → `/sheets/{id}[.{node}]`; later panels → `sheet&s={id.node}` (752-762).
- `lang` per non-menu panel = the first 2 letters of the language (766).
- **No panels (headerMode)** → the current path and query are preserved with mode "Header" (771-782).
- **Merging panels into one URL** (784-891):
  - Panel 0 provides the base URL + `ven`/`vhe` version params + `&with=` (mobile TextAndConnections) + `&lang=` + `&aliyot=` + `&debug_mode=linker`.
  - **Short form for Text/Sheet + Connections as the first two panels** (`/Genesis.1?with=Rashi`). Sheet+commentary keeps the sheet URL. Extras: `&vside=` (sidebar version), `&lookup=`, `&namedEntity=`, `&sbsq=`, `&namedEntityText=`, `&with=`.
  - Later connections panels → `&p{i}=…&w{i}=…&vside{i}&lookup{i}…&lang{i}&aliyot{i}`.
  - Other panels → `&p={url}` with every `=` in the sub-URL suffixed by the index (`&p2=`, `&lang2=`, …).
  - Titles join with " and ".
  - `?` characters in titles are encoded as `%3F`, and the first `&` becomes `?`.
- **Popstate** (316-354):
  - Sets `justPopped` (skips the next history write) and rehydrates `SearchState` objects (history drops class instances).
  - Clones panels to avoid aliasing history.state.
  - Restores the `.content` scrollTop from `state.scrollPosition` and triggers scroll.
  - Labels the search analytics flow source as `back_click` when returning *into* search.
- **Scroll restoration:** a scroll handler on `.content` (re-bound after each update) debounces 300ms and writes `scrollPosition` into the current history state through `replaceState` (270, 965-974).
- **Deep-link `openURL(href, replace, overrideContentLang, moduleTarget, signupSource)`** (1330-1456):
  - Confirms unsaved sheet-editor changes first; cancel → "handled" with no navigation.
  - Resolves the full URL with the module subdomain (`Sefaria.util.fullURL`).
  - Non-Sefaria URLs, or links targeting another module, open in a **new tab**.
  - In the Voices module, About-sidebar pages (site setting `ABOUT_SIDEBAR_PAGES`) open in a new Library-module tab (`noopener,noreferrer`).
  - `/login`, `/register` → in-app AuthPage with `next` (see §13). Any other path hides auth.
  - Routes:
    - `/` → showRoot
    - `/texts` → library; `/texts/{cats…}` → library categories
    - `/history`, `/saved`, `/texts/notes`
    - `/collections`; `/collections/{slug}` (excluding `/settings` and `/new`) with `tag`
    - `/my/profile` → own profile (with `tab`); `/profile/{slug}` (`tab`)
    - `/notifications`, `/calendars`, `/torahtracker`, `/linker-editor?book=`
    - `/sheets/{id}` → Sheet panel
    - `/topics`, `/topics/category/{slug}`, `/topics/all/{letter}`, `/topics/{slug}` (`tab`)
    - `/translations/{slug}`
    - any ref path (`%3F` → `?`) → text panel with `ven`/`vhe` versions from the query and `showHighlight` when the ref is ranged
    - anything else → returns false (normal browser navigation)
  - `lastOpenURLNavigatedInApp()` distinguishes real in-app navigation from new-tab or cancel cases (1457-1465).
- **`bootstrapUrl(href, {replaceHistory})`** handles external `sefaria:bootstrap-url` events (1246-1258, 1272-1303):
  - Validates the URL.
  - Accepts only the same host or `*sefaria.org`.
  - Refs go through `handleNavigationClick(humanRef)` (respecting replaceHistory); other paths go through openURL.
- **Link interception:**
  - The root onClick is `handleInAppLinkClick` (1182-1245). It ignores:
    - default-prevented events
    - legacy Sheet Builder pages (`typeof sjs !== "undefined"`)
    - non-`<a>` targets
    - links with a non-`_self` target
    - links without href
  - It reads `data-target-module` and `data-signup-source` (via `closest`).
  - In headerMode, links on the static page outside React are bound to the same handler with jQuery (220-224).
  - A capture-phase document click handler (`handleInAppClickWithModifiers`) lets ctrl/cmd/shift/alt-clicks fall through to the browser (229, 1152-1172). It stops propagation, rewrites `data-target-module` hrefs to the full module URL, and reports a modified search-result click for analytics.
  - A right-click (`contextmenu`) on `a[data-target-module]` rewrites the href to the correct subdomain, so "open in new tab" works (234, 1305-1328).
- `setContainerMode()` in headerMode (995-1014):
  - With panels or auth showing: removes `#s2.headerOnly`, sets body `overflow:hidden` and `.inApp`, removes `.hasBannerMessage`.
  - Otherwise: adds `headerOnly`, sets body `overflow:auto`, removes `inApp`.
  - Called on update, popstate, and Banner close.
- `setSinglePanelState(state)` replaces all panels with one panel and sets **`headerMode:false`**. That is how a static page "becomes" the app (2076-2080).

## 12. Menus/pages opened from the app (state setters)

- `showLibrary(categories)`, `showVoices()`, `showRoot()` (voices vs library by `Sefaria.activeModule`) (2007-2026).
- `showSearch(query)` (2027-2042):
  - Labels the analytics flow source `nav_bar` only when not already on search.
  - Reuses the existing searchState (filtersValid false) or creates a new one by module type.
- `searchInCollection(query, collection)`: sheet search with applied filter [collection] and aggType "collections" (2043-2048).
- `showSaved`, `showNotes`, `showHistory`, `showTopics`, `showNotifications`, `showCalendars`, `showUserStats`, `showLinkerEditor(book)`, `showCollections` (2049-2075).
- `openTopic(slug)`: async `Sefaria.getTopic`, then a topics panel with primaryTitle and topicTestVersion (2081-2085).
- `openTopicCategory(slug)` (title from `topicTocCategoryTitle`), `openAllTopics(letter)`.
- `openProfile(slug, tab="sheets")`: async `profileAPI`.
- `openCollection(slug, tag)`, `openTranslationsPage(slug)` (2086-2108).
- Search-state plumbing per panel: `updateQuery` (invalidates filters), `updateSearchState`, `updateAvailableFilters` (registers available, registry, orphan filters, aggregationsToUpdate; filtersValid true), `resetSearchFilters` (unselects all nodes and clears applied filters/aggTypes/registry), `updateSearchFilter` (toggles a node and recomputes applied filters), `updateSearchOptionField`, `updateSearchOptionSort` (1469-1541).
- `unsetTextHighlight(n)` clears search-term highlighting (1466-1468).

## 13. In-app auth (login/register) shell integration

- `resolveInitialAuthState` (auth/utils.js:61-68): `showAuth` is true if the path is `/login` or `/register` (trailing slash allowed), or if `authResetUid` is present (password reset confirm). `authPath` = the current path and search.
- `openURL` on an auth path calls `handleAuthNavigate(withNext(path, next), signupSource)` (ReaderApp.jsx:1375-1379, 144-147). This hides the sign-up modal.
  - `next` is the current path, or, when already on auth, the existing `next`.
  - `safeNext` rejects cross-origin `next` values (auth/utils.js:43-51).
- History: auth states push `{showAuth, authPath, authSource, panels: []}` with URL = authPath (488-493, 417-418).
- While auth is showing, `main` renders `<AuthPage initialPath authSource resetValid onNavigate/>` instead of the panels (2596-2602).
- **Sign-up funnel source attribution:** `data-signup-source` on a link or ancestor. Examples: "nav_bar" (header Sign up), "login_prompt", `signup_modal_{kind}`. AuthNavLink passes 'nav_bar' (Header.jsx:26-35). A typed or direct `/register` has a null source (ReaderApp.jsx:136-138).
- `resumePendingSignUpAttempt()` runs on mount (245).
- **Google One Tap** (auth/GoogleOneTap.jsx):
  - Skipped on /login and /register, and only shown once per session (sessionStorage `sefaria_interruptive_ui_shown`).
  - Waits 1.2s, then re-checks the auth path.
  - **Suppressed if interruptive UI is present** (cookie notice, site-wide banner, `.modal`, aria-modal dialog); it is then marked as shown.
  - Posts the credential to the allauth provider-token endpoint with CSRF and reloads on success.
  - Fires the signup funnel analytics: flow_started, method_chosen, process_started/ended, flow_ended.
  - Waits for the `google-identity-loaded` event if GIS is not loaded yet.

## 14. Modals, banners, nudges, guides triggered from the app

- **SignUpModal** (Misc.jsx:2004-2055; ReaderApp.jsx:1038-1047, 2559-2565):
  - `toggleSignUpModal(kind)` is passed down to every panel.
  - Kinds (signupModalContent.js): AddConnection, ViewHistory, AddToSheet, AddTranslation, Follow, Notes, Save, Default. Each has an h2, h3, and a bullet list with icons.
  - CTA → `/register?next={current}` with `data-signup-source="signup_modal_{kind}"`; the "Already have an account? Sign in" link → `/login?next=`.
  - Closes on overlay click or the × button (keyboard accessible).
  - Known triggers in shell files: SaveButton for anonymous users (Save, Misc.jsx:1379), FollowButton (Follow, 1580). Other triggers live in child components.
- **InterruptingMessage** (Strapi modal, Misc.jsx:2128-2270):
  - Shown after `showDelay` seconds if eligible (`isEligible` + `!isPathExcluded`).
  - Header and body (markdown) per interface language, plus en/he buttons that open in a new tab.
  - Closing (× or button) writes localStorage `modal_{name}=true` and fires `modal_interacted_with_{close_clicked|modal_button_clicked}` (gtag + sa_event). An impression fires `modal_viewed` via OnInView (100% visible).
- **Banner** (Strapi banner, Misc.jsx:2272-2393):
  - Same eligibility rules; optional background colour; markdown text; en/he buttons; ×.
  - Adds body class `hasBannerMessage` when the page is a headerOnly static page.
  - Stores localStorage `banner_{name}`. Events: `banner_interacted_with_*` and `banner_viewed`.
  - On close it calls ReaderApp.setContainerMode.
- **Strapi data** (context.js:134-296): see §18.
- **CookiesNotification** (Misc.jsx:2816-2856): shown until the `cookiesNotificationAccepted` cookie is set (20 years, shared cookie domain). Bilingual text with a privacy-policy link (the Hebrew link is module-aware).
- **GlobalWarningMessage**: shows `Sefaria.globalWarningMessage` HTML with a close × under the header (Misc.jsx:615-628; Header.jsx:373).
- **ReaderMessage**: a generic like/dislike feedback prompt keyed by a `{name}Accepted` cookie (Misc.jsx:2770-2811). Not mounted by the shell.
- **TextColumnBannerChooser** (rendered under ReaderControls for Text panels; ReaderPanel.jsx:1480-1487; TextColumnBanner.jsx):
  - **Translation-language-preference suggestion:** shown if there is a `translation_language_preference_suggestion` and no `translation_language_preference_suggested` cookie.
    - "Prefer to see {lang} translations when available?" Yes → set the preference and show a thank-you message. No/× → sets the cookie and `editProfileAPI({translation_language_preference_suggested:true})`.
  - **Else "Want to change the translation?" banner** when `Sefaria.openTransBannerApplies(book, language)` holds and the `open_trans_banner_shown` cookie is missing. "Go to translations" opens the Translations sidebar; × sets the cookie.
- **GuideOverlay / GuideButton**:
  - The guide type is chosen by a central mapping in ReaderPanel. Currently only "editor" exists: Sheet mode where `shouldUseEditor(sheetID)` holds, multi-panel, panel 0 (ReaderPanel.jsx:477-522).
  - GuideButton (bulb icon, tooltip "guide.show_guide") in ReaderControls and Sheet forces the overlay (`forceGuideOverlay`) (Misc.jsx:1403-1420).
- **ChatbotExperimentBanner / SiteWideBanner** (SiteWideBanner.jsx):
  - Hidden on /login, /register, /password/reset/confirm.
  - Logged in: "Try it" → `editProfileAPI({settings:{library_assistant:true}})` then reload. Anonymous: "Log in to try" → `/login?next=/enable-library-assistant?next={current}`.
  - **"Maybe later" backoff:**
    - Each "Maybe later" increments a counter; 3 clicks dismiss forever.
    - Re-show requires both gates from `NUDGE_SCHEDULE` (overridable by `promoMaybeLaterJSON`): {1: 2 sessions & 7 days, 2: 4 sessions & 21 days}.
    - Sessions = gaps of at least `promoSessionLengthSeconds` (default 30 min).
    - State lives in localStorage `promo_backoff_{cookie}_*`, with a migration from the legacy dismissal cookie.
  - Cookie names: `chatbot_experiment_banner_dismissed` (logged in) and `signup_promo_banner_dismissed` (anonymous).
  - Events: `promo_viewed` (once per session per cookie) and `promo_clicked` with `feature_name` (join/login/maybe_later/close/learn_more). Campaign "LA Stand Alone Promo", project "Library Assistant".
  - Renders nothing during SSR.
- **LoginPrompt** (Misc.jsx:1964-1983): a "Please log in" panel with login/signup buttons and `next`. Used when connectionsMode becomes "Login".

## 15. Keyboard handling & accessibility

- **Skip link** to `#main` (ReaderApp.jsx:2583); `<main id="main" role="main">`.
- **`user-is-tabbing` body class** is added on the first Tab keypress (Header.jsx:206-219). In multi-panel mode, when nothing has focus and the user is tabbing, focus moves to the last panel's first focusable element after each update (ReaderPanel.jsx:100-103).
- **New panel focus:** a panel mounted at position > 0 focuses its first focusable element (ReaderPanel.jsx:79-82). A segment-click-opened sidebar does the same (ReaderApp.jsx:1059-1064).
- **Escape in a panel closes that panel** (`handleKeyPress`, keyCode 27 → `closePanel`) (ReaderPanel.jsx:646-650). Note this applies to any panel, including the text.
- When display settings open, focus goes to the `.on` option in `.readerOptionsPanel` (legacy selector) (ReaderPanel.jsx:105-107).
- **DropdownMenu** (common/DropdownMenu.jsx:160-285):
  - The button gets click, tabIndex 0, and Space/Enter handling.
  - Opening focuses the first menu element. Tab cycles and Escape returns focus to the button (`trapFocusWithTab`).
  - Escape closes from anywhere (document keydown, capture phase).
  - Click outside closes (passive close event); clicking an item closes unless it has `data-prevent-close="true"`.
  - Optional `analyticsFeatureName` adds the `data-anl-feature_name` and `modswitch_open`/`close` events.
  - Note: `onClose?.(true)` passes `true` instead of `{type:'passive'}` on a tab-trap close (243).
- **ToggleSet/ToggleOption** (legacy display toggles): arrow keys move focus between options, Enter clicks, Tab wraps within `div[role=dialog]`, Escape clicks `.mask`; event "Reader / Display Option Click" (Misc.jsx:835-942).
- **TabView:** `role=tablist/tab/tabpanel`, aria-selected, roving tabindex, arrow-key navigation through `Util.handleTabKeyDown`. With `currTabName === null` it calls `setTab(firstTab, true)` on mount, which replaces history (Misc.jsx:400-504).
- **RadioButton:** native radio with `Util.handleRadioKeyDown` (common/RadioButton.jsx).
- **Button:** an `<a role=button tabIndex=0>` when href is set (Space-key activation via `handleLinkSpaceKey`, rel noopener for _blank, `data-target-module`, `data-active-module`), else `<button>`. Icon-only buttons require `ariaLabel` (PropTypes validator) (common/Button.jsx).
- `CloseButton`/`ToolTipped`/`LanguageToggleButton` support Enter/Space through `Util.handleKeyboardClick`; ToolTipped is `role=button tabIndex=0` with aria-label (Misc.jsx).
- `ReaderControls` title: `role="heading" aria-level=1 aria-live="polite"`, with link aria-label "Show Connection Panel contents for {title}" (ReaderPanel.jsx:1424-1425).
- Header `role="banner"`; nav aria-labels "Primary navigation" and "Mobile navigation menu"; search box `role="search"` (Header.jsx:286, 356, 432; HeaderAutocomplete.jsx:288-291).
- `common/modal.jsx`: native `<dialog>` with `showModal`, Escape and backdrop click close.
- `LoadingMessage` uses `aria-live="polite"`.

## 16. Header (desktop)

- **Hidden** on mobile while reading a text (see §10). Has a box shadow, except a category colour line in "book toc" (Header.jsx:347-354).
- **Left/nav section:**
  - Logo (TORAH_SPECIFIC only; aria label `header.sefaria_{module}_logo`).
  - Text links: Library → "Texts", "Topics"; Voices → "Topics", "Collections". Links carry `data-target-module=activeModule`.
  - **Donate** link (DonateLink, source "Header") (Header.jsx:236-289).
- **DonateLink** (Misc.jsx:173-197):
  - Link variants: default (en 451346 / he 468442), sustainer (457760 / 478929), dayOfLearning (/sponsor, /sponsorhe).
  - Appends `?c_src={source}`; opens in a new tab.
- **Right section** (Header.jsx:291-319):
  - **HeaderAutocomplete** search box (§17).
  - **Sign up** button: anonymous users in the Library module only (`/register`, `data-signup-source="nav_bar"`).
  - **Create** button: Voices module → `/sheets/new`.
  - **Help** icon (TORAH_SPECIFIC) → help center (HE/EN_US URLs from site settings). Note `targetModule=VOICES`.
  - **InterfaceLanguageMenu** (globe), for anonymous users on TORAH_SPECIFIC sites (Misc.jsx:1300-1336):
    - English/עברית links go to `/interface/{lang}?next={current}` (NextRedirectAnchor).
    - Shows the current preferred translation language with a reset (×) that calls `setTranslationLanguagePreference(null)`.
  - Logged-in icon: Library → **Saved** (bookmark, `/saved`); Voices → **Notifications** bell (`/notifications`), which switches to the `notifications-1_mdl` icon when `notificationCount > 0` (the unread badge).
  - **ModuleSwitcher** (grid icon) (Header.jsx:150-202):
    - Items: logo → /about; **Library** (blue dot, `/`, opens a new tab if not the current module); **Voices** (green dot); **Developers** (purple dot, developers.sefaria.org, new tab); "More from Sefaria ›" → /products (new tab).
    - Analytics: `modswitch_item_click`, `modswitch_open/close`. A passive close (Escape or outside click) fires gtag `modswitch_close`.
  - **Profile dropdown**:
    - Logged out (profile icon): Log in / Sign up (in-app auth with source nav_bar), Site language toggle, New Additions (`/updates`, Library only), Help (new tab) (43-76).
    - Logged in (ProfilePic) (78-148):
      - Name: bold, prevent-close; in Voices it links to the profile.
      - Library: Account Settings (`/settings/account`), Torah Tracker (`/torahtracker`).
      - Voices: Profile, Saved, History, Account Settings (Library module).
      - Site language toggle; New Additions (Library); Help; Log Out (`Sefaria.getLogoutUrl()`).
- **DropdownLanguageToggle**: "Site language" with English / עברית links (active state); NextRedirectAnchor to `/interface/{lang}?next=` (common/DropdownMenu.jsx:292-316). **Changing the interface language is a full server round-trip**, not client state.
- **Header impression analytics:** `header_viewed {impression_type:"regular_header"}` (sa_event + gtag) once per session when 100% visible (`useOnceFullyVisible`, sessionStorage key `sa.header_viewed`) (Header.jsx:257-261). CategoryColorLine shares the same session key with impression_type "category_color_line" (Misc.jsx:1633-1646).
- **GlobalWarningMessage** renders inside the header.
- **MobileNavMenu** (Header.jsx:425-593; slides open with class `closed` toggled):
  - Search box (HeaderAutocomplete with `onNavigate=close` and the **Hebrew virtual keyboard hidden**).
  - Library links: Texts, Topics, Learning Schedules (/calendars). Voices links: Topics, Collections.
  - Donate (source "MobileNavMenu").
  - Logged-in Library: "Saved, History & Notes" (/saved). Logged-in Voices: Profile (with picture), "Saved & History", Notifications (unread icon).
  - Account Settings; the interface language toggle (English • עברית).
  - Get Help (new tab); About Sefaria (`/mobile-about-menu`).
  - Cross-module switcher (Voices on Sefaria ↔ Library); Developers on Sefaria; More from Sefaria (/products).
  - Logout, or Sign up/Log in links (in-app auth, closes the menu).

## 17. Header search autocomplete (HeaderAutocomplete + GeneralAutocomplete)

- Built on downshift `useCombobox` (GeneralAutocomplete.jsx). Suggestions are fetched on every input change; Enter can be intercepted through an `onEnter` hook.
- **Suggestions only for input of 3 or more characters** (HeaderAutocomplete.jsx:404-406).
  - Calls `Sefaria.getName(input, undefined, types, topic_pool)`.
  - **Module-specific allowed types:** Library = Topic, ref, TocCategory, Term; Voices = Topic, User, Collection (42-45). The topic pool comes from `getTopicPoolNameForModule`.
- Each completion gets value/label/url. URL mapping by type and module (104-116):
  - Collection (Voices) → `/collections/{key}`
  - TocCategory (Library) → `/texts/{cat/…}`
  - Topic/PersonTopic/AuthorTopic → `/topics/{slug}`
  - ref (Library) → `/{Ref_with_underscores}`
  - User (Voices) → `/profile/{slug}`
  - Items with no URL are filtered out.
- PersonTopic is merged into Topic. Results are sorted by a fixed type order (search, ref, Collection, TocCategory, Topic, PersonTopic, AuthorTopic, User, Term) and grouped under titles (Books, Collections, Categories, Topics, Authors, Terms, Users).
- **The first item is always a "Search for: “query”" override** whenever any completions exist (427-433).
- Icons per type; a User shows the profile picture or a placeholder (7-17, 47-53). Hebrew/English result styling depends on the label script.
- **Enter key** (195-228):
  - With a highlighted non-search item: navigates to the object (gtag `search_navto` "Nav To by Keyboard").
  - Otherwise: submits the query.
- **Submit logic** (491-503, 453-490):
  - A highlighted "search" item → plain search.
  - `enforceSearch` (clicking the Search-for item) → plain search.
  - Otherwise `getQueryObj`:
    - repairs case variants and gershayim variants (recursively)
    - **Ref** (when allowed in the module) → `onRefClick(ref)`, which opens the text (book → TOC); events "Search Box Navigation - Book/Citation" and gtag `search_submit` "Autolink"
    - **Topic slug** → `openTopic`
    - **Person / Collection / TocCategory** → redirect by URL
    - else → full-text search
- Search: tracks "Search / Search Box Search" and gtag `search_submit` "Search Results", trims the query, and opens the search panel (`showSearch`). **On the legacy Sheet Builder (`sjs` defined), it does a hard redirect to `/search?q=`** (505-515). The box is cleared after any submit or navigation, and `onNavigate` closes the mobile menu.
- `redirectToObject`: encodes `?` as `%3F`, tries `openURL`, and falls back to `window.location` (517-526).
- Search button click with empty input focuses the field (230-237).
- **Hebrew virtual keyboard:**
  - The input gets class `keyboardInput` for an English interface; the keyboard initiator icon shows only while focused (and not hidden).
  - The value is read from `#searchBox .keyboardInput` as a fallback.
  - Blur is ignored while the keyboard (`#keyboardInputMaster`) is open (195-276).
- Analytics: `search_focus`, `search_defocus` (with text), `search_navto` (Nav To by Mouse/Keyboard), `search_submit`.
- Input: `maxLength=75`, placeholder "Search", class `hebrewSearch` for a Hebrew interface. Suggestions show only while focused and the menu is open (567).

## 18. Contexts & hooks

- **ReaderPanelContext** (display name "ContentLanguageContext"; default `{language:"english"}`) (context.js:16-19). Each panel provides: `language` (override), `isMenuOpen`, `setIsMenuOpen`, `setOption`, `textsData`, `layout`, `panelMode`, `aliyotShowStatus`, `vowelsAndCantillationState`, `punctuationState`, `width`, `panelPosition` (ReaderPanel.jsx:736-749).
- **AdContext**: `getUserContext()` (ReaderApp.jsx:2342-2379) returns:
  - `isDebug`, `isLoggedIn`, `interfaceLang`, `dt` (ms)
  - `keywordTargets`: deduped, lowercased categories, books, and refs from each panel's currentlyVisibleRef / bookRef / navigationCategories / navigationTopic / topic category
  - Used for sidebar ad keyword targeting and click analytics in `ToolTipped`.
- **StrapiDataProvider** (context.js:134-296):
  - Runs only if `STRAPI_INSTANCE` is defined.
  - POSTs a GraphQL query to `/api/strapi/graphql-cache?start_date&end_date` (a ±14-day window), querying banners, modals, and sidebarAds **per supported locale** (aliased `en_banners` etc.).
  - Groups rows by `documentId`.
  - Treats GraphQL errors (and no data) as failures, so that dismissals are not wiped.
  - **Prunes stale dismissal keys** in localStorage only when no rows were discarded.
  - Selects one modal and one banner through `selectContent` with the viewer context (audience, locale, country, sustainer, new/returning, dismissals).
  - Exposes `{dataFromStrapiHasBeenReceived, strapiData:{sidebarAds}, modal, banner}`.
- **Hooks.jsx:**
  - `useContentLang(defaultToInterfaceOnBilingual, override)` resolves the shown language from context and text data (primaryLang / translationLang); ambiguous cases fall back to the interface language.
  - `useDebounce`.
  - `useScrollToLoad` (skip/limit pagination within 600px of the bottom).
  - `usePaginatedDisplay` (client-side paging on scroll, default 800px margin).
  - `useIncrementalLoad` / `usePaginatedLoad` (chunked fetching with cancellation by identity element).
- **useOnceFullyVisible(onVisible, sessionKey)** fires once per session when an element is 100% visible (Misc.jsx:36-60). **OnInView** fires on each rising edge to fully visible (2063-2105).

## 19. ReaderControls (in-panel text header)

- Shown unless the panel is TextAndConnections, Sheet, has a menu open, or `hideNavHeader` is set (ReaderPanel.jsx:1172-1177). So the Sheet header comes from Sheet itself.
- **Title:**
  - Sheet → sheet icon + title ("Loading…" until loaded; `getSheetTitle`), auto dir.
  - Text → `{indexTitle}{section}` / Hebrew equivalent through ContentText (bilingual defaults to the interface language).
  - The link href is `/sheets/{id}` or `/{Book}`, with `data-target-module` (Voices for sheets).
  - Clicking the title opens the connections panel for the currentRef (event "Reader / Open Connections Panel from Header"). For sheets it calls `onSheetTitleClick(0)` (1308-1318, 1423-1453).
- **Subtitle:**
  - `CategoryAttribution` (e.g., a translation credit for some categories, unlinked).
  - The **version title** of the shown translation when the language is english or bilingual and the panel is not a sheet. It prefers `shortVersionTitle` / `shortVersionTitleInHebrew`, is found among `data.available_versions` (non-source with a matching versionTitle), and is parenthesized when an attribution exists. A merged version (`data.sources`) shows none (1319-1350, 1442-1450).
- **Left buttons:** CloseButton (multi-panel) or MenuButton (mobile); a hidden placeholder SaveButton for symmetry (1455-1460).
- **Right buttons:**
  - GuideButton when a guide applies.
  - **SaveButton** (bookmark) with the history object (ref, versions, language, sheet owner/title): toggles the saved item, prompts the SignUpModal(Save) if not signed in, prevents double posts, event "Saved / saving" (Misc.jsx:1352-1396).
  - Display settings dropdown.
- **CategoryColorLine** above (except in a connections header), coloured by the current category (1505).
- **Connections header** (multi-panel Connections mode) → `ConnectionsPanelHeader` (1407-1421). See below.
- `connectionsMode` is passed as "Connection Text" when a filter exists and the mode is "Connections" (1207).
- **ConnectionsPanelHeader** (ConnectionsPanelHeader.jsx):
  - Title/back logic:
    - `backButtonSettings` (custom back from children such as a sheet view) → chevron + backText.
    - "Resources" → static title "Resources / קישורים וכלים".
    - TextList with a previous category, or a mapped previous mode → back link to it. Mappings: Translation Open→Translations, extended notes→Translations, WebPagesList→WebPages, or `connectionData.previousMode`. The label is shown only in multi-panel; the href uses the `with=` param.
    - Otherwise → "‹ Resources" back link (`with=all`).
  - Right buttons (multi-panel):
    - **Language toggle** (aleph/aye) only on TORAH_SPECIFIC sites, hidden in Resources/ConnectionsList for a non-English interface; its href flips the `lang2` URL param.
    - **Close (circled X)** with href = URL without `with`.
  - Back links support keyboard activation.

## 20. Analytics events fired from the shell

- **Mount:** `reader_app_mounted` (sa_event + gtag) once per session (sessionStorage `sa.reader_app_mounted`). `intersection_observer_not_supported` once per browser (localStorage `sa.intersection_observer_api_checked`) (ReaderApp.jsx:246-258).
- **Visitor marking:** a logged-in user → `markUserAsReturningVisitor`; a new visitor → `markUserAsNewVisitor` (237-243). This feeds Strapi audience targeting.
- **Pageview dimensions** (`trackPageview`, 355-413), set via `Sefaria.track`:
  - page type (menuOpen or mode; "Static" with no panels)
  - number of panels (e.g., "2" or "3.2" text.connection)
  - refs and book names (joined " | ")
  - primary category ("X Commentary" for commentaries) and secondary category
  - content languages and version titles per text panel
  - sidebars (filters or "all")
  - The actual `Sefaria.track.pageview` call is commented out. It fires on push, on replace after 3s of unchanged refs (`checkScrollIntentAndTrack`), and initially.
- **Recently viewed / reading history:**
  - `saveLastPlace(panel, n, openingSidebar)` → `Sefaria.saveUserHistory(getHistoryObject)` (2161-2167). It skips Connections panels and text panels without refs.
  - The history object has: ref (the highlighted range if a sidebar is open, else currentlyVisibleRef), versions, book, language, sheet_owner, sheet_title. Sheets use `Sheet {id}:{node}` (2120-2143).
  - It runs for all initial panels on mount, on open, on sidebar open, and **after a 3s intent delay when a panel's ref changes** (`checkPanelScrollIntentAndSaveRecent`, 948-959).
  - `didPanelRefChange` rules: Connections→Text is false (already logged); Text↔Sheet is true; version change is true; highlight change is true; sheet id/node change is true (1579-1604).
- **Copy:** gtag `copy_text {length, panelType, book, category}`, `bilingual_copy_text` (both .en and .he selected), `spanning_copy_text` (more than one segment in a language) (2208-2236).
- **Print:** gtag `print` on `beforeprint` (217, 2204-2206).
- **Other events:**
  - "Reader": Choose Version, Open Connections Panel, Open Connections Panel from Header, Other Text Click, Change Language, Set Translation Language Preference, Display Option Click
  - "Tools": `{mode} Click`, Prompt Login
  - "Search Box …"; "Saved / saving"
- `data-anl-batch` on each panel: `{panel_type, panel_number, content_lang, panel_name}`. Topics are special-cased: "Topic Navigation", `topics_{tab}`, "Topic Landing" (ReaderPanel.jsx:684-713).
- Search analytics: flow source labels `nav_bar`/`back_click`, `endFlow('abandoned')` on in-app navigation away, reporting of modified-click results (ReaderApp.jsx:1164, 1225-1227, 1240-1242, 2035-2037, 336-338).
- Modal/banner/promo/header/category-line/banner-probe impression and interaction events (see §14, §16).
- **BannerImpressionProbe** (BannerImpressionProbe.jsx): an invisible 1px fixed element rendered after 2s plus a random 300-800ms. When fully visible it fires `banner_probe_viewed` once per session. It exists to measure the banner-visibility baseline and ad-blocking.
- `ToolTipped` clicks go through `TrackG4.gtagClick` with the AdContext (Misc.jsx:1458-1468).

## 21. Copy/paste customization (`handleCopyEvent`, ReaderApp.jsx:2239-2336)

- Ignored when the copy comes from INPUT, TEXTAREA, or LC-CHATBOT.
- Clones the selection ranges into a container, then:
  - In non-continuous panels, each `.contentSpan` becomes a `<div dir=rtl|ltr>` (direction detected from the text).
  - In Hebrew panels the container is set to `dir=rtl`.
  - `.poetry` wrappers are collapsed (fixes pasting into Google Docs in Chrome).
  - In continuous panels: `<br>` elements are removed and `.segment`, `.rangeSpan`, `.segmentText`, `.contentSpan` are collapsed.
  - Removed: `.segmentNumber`, `.linkCount`, `.clearFix`, `.footnote-marker`, and hidden footnotes (not `display:inline`). Open footnotes are prefixed with " *".
  - `a.namedEntityLink` and `a.refLink` are stripped to plain text, and all spans except `.rangeSpan` are collapsed.
- Sets both `text/plain` (via `htmlToText`) and `text/html` on the clipboard and prevents the default copy.

## 22. Unsaved changes protection (sheet editor)

- `shouldAlertBeforeCloseEditor()`: true when panel 0 is a Sheet, `editorSaveState !== "saved"`, and `shouldUseEditor(sheetId)` holds (ReaderApp.jsx:1947-1954).
- When true, `window.confirm("You have unsaved changes that may be lost. Continue?")` guards `openURL`, `bootstrapUrl`, and `closePanel(0)` (1141-1151, 1288-1292, 1337-1341, 1958-1962). There is no browser-level `beforeunload` (§0).

## 23. Misc shell components (Misc.jsx) referenced by the shell

- **InterfaceText** (100-167):
  - Renders `span.int-en` or `span.int-he` by interface language.
  - Accepts `text`/`html`/`markdown` objects `{en,he}` with a fallback to the other language (adds class `enInHe`/`heInEn`), a single string child (translated with `Sefaria._`), or `<EnglishText>`/`<HebrewText>` children.
  - Markdown uses ReactMarkdown with configurable disallowed elements (default `p`); links get rel noopener.
- **CategoryColorLine** colours by category through `Sefaria.palette.categoryColor` and fires a once-per-session impression.
- **MenuButton**: hamburger, or a chevron (RTL-aware) in compare mode. **SearchButton**: magnifier.
- **CloseButton**: "×", `circledX` image, or chevron; href plus preventDefault; aria-label "common.close".
- **DisplaySettingsButton**: an "A/א" language icon on TORAH_SPECIFIC sites, else the text "Aa"; `aria-haspopup`; placeholder mode hides it (1266-1297).
- **LanguageToggleButton**: aleph/aye images, href is optional (723-750).
- **ToggleSet**: legacy segmented radio group (835-876).
- **TabView**, **DropdownModal**, **DropdownButton**, **DropdownOptionList** (sorting UI), **LoadingMessage**, **LoadingRing**.
- **common/Popover**: Floating UI. Desktop places it at the bottom; mobile places it left (English) or right (Hebrew), with an arrow; PopoverClose closes it.
- **common/Input**: the auth design-system input (password reveal, trailing link, inline error with role=alert). **common/Captcha**: an error-state wrapper for reCAPTCHA. **common/Card** and **TopicTOCCard**: topic cards (strip "Parashat"/"פרשת", analytics `navto_topic:click`).
- **LangSelectInterface / LangRadioButton**: a Source / Translation / Source with Translation popover used outside the shell (e.g., sheets/topics). It closes on selection or blur and emits analytics `lang_toggle_select` (Misc.jsx:3398-3474).
