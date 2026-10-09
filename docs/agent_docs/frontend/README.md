# React Frontend Architecture
> Sources: `static/js/client.jsx`, `static/js/ReaderApp.jsx`, `static/js/ReaderPanel.jsx`, `static/js/context.js`, `static/js/Hooks.jsx`, `static/js/sefaria/sefaria.js`, and ~80 `.jsx` component files in `static/js/`

## Purpose
Sefaria's frontend is a React single-page application that renders a multi-panel text reader, navigation menus, search, sheets, topics, collections, user profiles, and community features. It uses server-side rendering (SSR) with client-side hydration -- Django renders initial HTML, then React hydrates the DOM and takes over routing and state management.

## Key Components

### Entry Point: `client.jsx`
- Runs on DOM ready (`$(function() {...})`)
- Reads `DJANGO_VARS.props` and `DJANGO_VARS.inReaderApp` (injected by Django templates)
- Calls `Sefaria.unpackDataFromProps(DJANGO_VARS.props)` to populate the client-side data cache before rendering
- Uses `ReactDOM.hydrate` when SSR HTML is present; falls back to `ReactDOM.render` when a loading placeholder is shown
- Two modes:
  1. **Full ReaderApp** (`DJANGO_VARS.inReaderApp === true`): renders `ReaderApp` with all props
  2. **Header-only** (static pages): renders `ReaderApp` with `headerMode: true` on top of Django-rendered content
- Also handles template-specific component rendering via `DJANGO_VARS.containerId` and `DJANGO_VARS.reactComponentName`

### Root Component: `ReaderApp` (class component, ~2567 lines)
- Manages an array of `panels` in `this.state.panels`, where each panel is a full state object describing what that panel displays (text, connections, menu, sheet, etc.)
- Handles browser history (`pushState`/`popState`) -- the app is a fully client-side router
- Orchestrates multi-panel layout: calculates panel widths (68/32 split for text+connections, 37/26/37 for three panels, etc.)
- Delegates all panel-level state changes through bound callbacks passed as props to `ReaderPanel` (e.g., `setPanelState`, `openPanelAt`, `handleSegmentClick`)
- Wraps everything in `StrapiDataProvider` (CMS content) and `AdContext.Provider` (user targeting context)
- Renders `Header`, an array of `ReaderPanel` instances, sign-up modals, banners, cookies notification, and optional chatbot

### Panel Component: `ReaderPanel` (class component, ~1522 lines)
- Receives its state from `ReaderApp` via `initialState` prop; uses `conditionalSetState` to either update local state or call back to `ReaderApp.setPanelState`
- Modes: `"Text"`, `"TextAndConnections"`, `"Connections"`, `"Sheet"`, `"Menu"`
- Menu routing via `this.state.menuOpen`: `"navigation"`, `"book toc"`, `"search"`, `"topics"`, `"allTopics"`, `"community"`, `"collection"`, `"notifications"`, `"userProfile"`, `"publicCollections"`, `"translationsPage"`, `"calendars"`, `"sheets"`, `"sheetsWithRef"`, `"homeFeed"`, `"updates"`, `"modtools"`, `"userStats"`, and others
- Provides `ReaderPanelContext` to children with language, display settings, text data, layout, and panel mode
- Handles content language override logic (e.g., topics/community pages force bilingual in English interface)

### Component Inventory (~80 `.jsx` files)
Grouped by function:

**Text Display:**
- `TextColumn.jsx` -- infinite-scroll text rendering
- `TextRange.jsx` -- renders a single text segment
- `ContentText.jsx` -- bilingual text content wrapper
- `TextList.jsx` -- list of linked texts in connections panel
- `VersionsTextList.jsx` -- version comparison list

**Navigation & Browse:**
- `TextsPage.jsx` -- library browse / table of contents
- `BookPage.jsx` -- individual book landing page
- `TextCategoryPage.jsx` -- category page
- `CalendarsPage.jsx` -- learning schedules / calendar readings

**Connections & Commentary:**
- `ConnectionsPanel.jsx` -- sidebar showing related texts, resources
- `ConnectionsPanelHeader.jsx` -- header for connections panel
- `ConnectionFilters.jsx` -- filter controls for connections

**Topics:**
- `TopicPage.jsx` -- individual topic page + `TopicCategory`
- `TopicPageAll.jsx` -- all topics listing
- `TopicsPage.jsx` -- topics landing
- `TopicSearch.jsx` -- topic search

**Search:**
- `SearchPage.jsx` -- search results page
- `SearchResultList.jsx` -- search result rendering
- `SearchFilters.jsx` -- search filter UI
- `SearchTextResult.jsx`, `SearchSheetResult.jsx` -- result cards
- `ElasticSearchQuerier.jsx` -- search query execution
- `SidebarSearch.jsx` -- in-panel search
- `DictionarySearch.jsx` -- dictionary lookup

**Sheets:**
- `sheets/Sheet.jsx` -- sheet display/editor
- `sheets/SheetsHomePage.jsx` -- sheets landing
- `sheets/SheetsWithRefPage.jsx` -- sheets referencing a text
- `AddToSourceSheet.jsx` -- add-to-sheet widget

**User:**
- `UserProfile.jsx` -- user profile page
- `UserHistoryPanel.jsx` -- reading history
- `UserStats.jsx` -- user statistics
- `NotificationsPanel.jsx` -- notifications

**Collections:**
- `CollectionPage.jsx` -- collection display
- `EditCollectionPage.jsx` -- collection editor
- `PublicCollectionsPage.jsx` -- public collections listing
- `CollectionsWidget.jsx` -- collection selector widget

**Header & Navigation:**
- `Header.jsx` -- top navigation bar
- `HeaderAutocomplete.jsx` -- search autocomplete in header
- `NavSidebar.jsx` -- sidebar navigation

**Admin/Editor:**
- `AdminEditor.jsx` -- admin editing tools
- `CategoryEditor.jsx` -- category editor
- `TopicEditor.jsx` -- topic editor
- `SourceEditor.jsx` -- source text editor
- `ModeratorToolsPanel.jsx` -- moderator tools
- `Editor.jsx` -- general editor

**Display & UI:**
- `Misc.jsx` -- shared UI components (CloseButton, MenuButton, SaveButton, SignUpModal, Banner, etc.)
- `ReaderDisplayOptionsMenu.jsx` -- font size, layout, language settings
- `Promotions.jsx` -- promotional banners/modals from Strapi CMS
- `StaticPages.jsx` -- contest pages, landing pages, donate page, etc.
- `GuideOverlay.jsx`, `GuideBox.jsx` -- guided learning overlays

## State Management

**No Redux. No external state library.** The app uses:

1. **Component state in `ReaderApp`**: the `panels` array is the central state. Each panel object contains ~40 properties (mode, refs, filters, versions, settings, menu state, etc.). `ReaderApp` owns this array and passes setter callbacks to each `ReaderPanel`.

2. **`conditionalSetState` pattern**: `ReaderPanel` checks if `this.props.setCentralState` exists. If yes (multi-panel mode), state changes go up to `ReaderApp`. If no (standalone/embedded mode), state is managed locally.

3. **React Contexts** (defined in `context.js`):
   - `ReaderPanelContext` -- carries content language, display settings, text data, layout mode, and panel position. Used by text rendering components to know which language to show.
   - `AdContext` -- user targeting data for promotional content (sustainer status, new/returning visitor, etc.)
   - `StrapiDataContext` -- CMS data (banners, modals, sidebar ads) fetched from Strapi via a GraphQL cache endpoint

4. **The `Sefaria` singleton** (`sefaria/sefaria.js`): a global namespace object that acts as client-side data cache, API layer, and utility library. Attached to `window.Sefaria` for console access. This is the closest thing to a "store" -- it caches texts, refs, index data, sheets, topics, versions, links, and more.

## How Django Props Pass Into React (SSR Hydration)

1. **Django view** (e.g., `reader/views.py`) builds a `props` dict with initial data: panel states, text content, index details, user info, TOC, terms, settings, etc.
2. **Django template** serializes props as `DJANGO_VARS = { inReaderApp: true, props: {...} }` in a `<script>` tag, plus `DJANGO_DATA_VARS` for additional server data.
3. **`Sefaria.setup()`** runs on module load: reads `DJANGO_DATA_VARS`, builds `booksDict`, caches TOC and Hebrew terms.
4. **`Sefaria.unpackDataFromProps(props)`** runs before render: iterates `props.initialPanels`, caching each panel's text content, versions, index details, and sheet data into `Sefaria._texts`, `Sefaria._versions`, `Sefaria._indexDetails`, etc. Also unpacks base user props (`_uid`, `interfaceLang`, `is_moderator`, `saved`, `calendars`, etc.) directly onto the `Sefaria` object.
5. **`Sefaria.getBackgroundData()`** fires after unpacking: fetches `/api/background-data` to get additional data not included in the initial props.
6. **`ReactDOM.hydrate`** attaches React to the server-rendered HTML in `#s2`, matching the existing DOM and adding event listeners.

## Non-Obvious Patterns

- **`react-class` base**: many components extend `Component` from `react-class` (not `React.Component`). This library auto-binds methods and provides some convenience features. New code should still use this pattern for consistency, or use function components with hooks.
- **Panel cloning**: panel state objects are deeply cloned (`Sefaria.util.clone`) before modification to avoid reference-sharing bugs, especially with browser history state.
- **History management**: `ReaderApp` manually calls `history.pushState`/`replaceState` with serialized panel states. On `popState`, it reconstructs `SearchState` objects (which don't survive JSON serialization) and clones panels before setting state.
- **Multi-panel vs single-panel**: determined by `props.multiPanel` (based on viewport width > 600px). In single-panel mode, connections open within the same panel (`TextAndConnections` mode). In multi-panel mode, a new panel is added to the array.
- **`headerMode`**: when true, `ReaderApp` renders only the `Header` component on top of a static Django-rendered page. Clicking a link in the header navigates via `ReaderApp`'s in-app link handling.
- **Custom hooks** in `Hooks.jsx`: `useContentLang` (resolves display language from context), `useDebounce`, `useScrollToLoad` (infinite scroll pagination), `usePaginatedDisplay` (client-side pagination of already-loaded data), `useIncrementalLoad` (chunked async data loading with cancellation).
- **jQuery still present**: `sefariaJquery` is used throughout for AJAX calls (`$.getJSON`, `$.ajax`), DOM manipulation, and scroll handling. Migration to fetch/native APIs is incomplete.

## Relationships
- `ReaderApp` owns N `ReaderPanel` instances, each rendering one of: `TextColumn`, `Sheet`, `ConnectionsPanel`, or a menu component
- All text/ref data flows through the `Sefaria` singleton -- components call `Sefaria.getText()`, `Sefaria.ref()`, `Sefaria.index()`, etc.
- The `ReaderPanelContext` bridges `ReaderPanel` state to deeply nested text rendering components
- Search is handled by `Search` class (`sefaria/search.js`) instantiated on `Sefaria.search`, querying both Sefaria's Elasticsearch and Dicta's external search service

## Common Tasks

**Adding a new menu/page type:**
1. Create a new `.jsx` component in `static/js/`
2. Import it in `ReaderPanel.jsx`
3. Add a case in `ReaderPanel.render()` for your `menuOpen` value
4. Add navigation logic in `ReaderApp` (e.g., a method to set the panel's `menuOpen` state)
5. Add URL handling in `ReaderApp.makeHistoryState()` and the Django view

**Adding a new display setting:**
1. Add the setting to `ReaderApp.getDefaultPanelSettings()`
2. Add UI control in `ReaderDisplayOptionsMenu.jsx`
3. Read the setting in the consuming component via `this.state.settings.yourSetting` or from `ReaderPanelContext`

**Adding a new API data type to SSR hydration:**
1. Add the data to the Django view's `props` dict
2. Handle it in `Sefaria.unpackDataFromProps()` to cache it client-side
3. Add a getter/cache pattern in `sefaria.js` (e.g., `Sefaria._myData = {}; Sefaria.getMyData = function(key) { ... }`)
