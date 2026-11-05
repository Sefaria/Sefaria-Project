# Inventory 06: Search and Autocomplete (Sefaria web client)

Repo: `/Users/akiva/Sefaria/dev/Sefaria-Project` (branch `master`, read-only audit, 2026-10-04).
All paths are relative to the repo root. `file:line` citations point at current `master`.

---

## 0. Surprising findings (read these first)

These are behaviors a rebuild could easily get wrong, either by copying a bug or by "fixing" something users rely on.

1. **The search page has four result tabs, not texts/sheets.** In the Library module, `/search` shows **Sources | Books | Authors | Topics** (`static/js/SearchPage.jsx:101-109`). Sources is the Elasticsearch full-text search. Books, Authors and Topics come from a separate `/api/entity-search` endpoint backed by dedicated `topic`, `book` and `category` ES indices (`reader/views.py:4954`, `sefaria/helper/search.py:957`). Sheet full-text search exists only in the **Voices** module, which uses a different page component (`SearchInVoicesPage`) (`static/js/ElasticSearchQuerier.jsx:433-434`).
2. **Hebrew queries also hit Dicta.** A Hebrew query with "All Results" (not exact) on the text index also queries Dicta's Tanakh search (`https://sefaria.loadbalancer.dicta.org.il/search` and `/books`). It then **removes Sefaria's own Tanakh hits** and merges in Dicta's, normalizing scores (`static/js/sefaria/search.js:20, 92-237, 238-240, 245-315`).
3. **The "topic cards" query runs but its results are never shown.** `ElasticSearchQuerier._executeTopicQuery` still makes `/api/name`, `getTopic`, `getIndexDetails` and `getCollection` calls on every query (`ElasticSearchQuerier.jsx:234-254`). The `topics` prop reaches `SearchResultList` (`SearchPage.jsx:609`), which never renders it. This is a dead feature that still costs network requests.
4. **The `qh=` URL param is dead in the modern reader.** Result hrefs carry `&qh=<query>` (`SearchResultList.jsx:64,79`; `SearchTextResult.jsx:95`), but nothing outside legacy `static/js/s1/` reads it. Matched-word highlighting only works on **in-app clicks**, which pass `textHighlights` through `onResultClick`. Opening a result in a new tab or deep-linking it gives **no highlight**. The query is also not URL-encoded in these hrefs.
5. **Pressing Enter on an exact topic name runs a full-text search, not topic navigation.** `getQueryObj` only navigates to a topic when `/api/name` returns `topic_slug` (`HeaderAutocomplete.jsx:133`). The backend sets that only when the input starts with `#` (`reader/views.py:3147-3148, 3100-3103`). So `#Shabbat` + Enter opens the topic, while `Shabbat` + Enter searches. Topics are reached by clicking the suggestion.
6. **Autocomplete group order looks reversed.** `sortByTypeOrder` sorts by **descending** index in `typesOrder` (`HeaderAutocomplete.jsx:89-97`, `return typeBIndex - typeAIndex`). In practice, groups render as Users, Authors, Topics, Categories, Collections, Books (refs). This is the opposite of what the `typesOrder` list suggests. `indexOf` returns -1, never `undefined`, so the "unknown type" fallback branch never runs.
7. **Several latent crashes and bugs in autocomplete navigation:**
   - `getURLForObject` returns `undefined` rather than `null`, so the `.filter(o => o.url !== null)` never removes anything (`HeaderAutocomplete.jsx:416,425`).
   - Enter on an exact Collection name in Library, or an exact TocCategory name in Voices, calls `redirectToObject` with `url === undefined`, and `item.url.replace` throws (`HeaderAutocomplete.jsx:477-485,520`).
8. **Sidebar "search in this text" briefly searches the whole library.** Its first query runs before `/api/search-path-filter` returns, with `filtersValid` false, so no path filter is applied. A second, filtered query follows (`SidebarSearch.jsx:17-53`; `ElasticSearchQuerier.jsx:365`).
9. **Sidebar search history URL bug.** For panels after the first, the history URL uses the literal `` `&sbsq{i}=` `` (the `$` is missing), so the param name is literally `sbsq{i}` (`ReaderApp.jsx:857-858`). The server reads `sbsq` / `sbsq<N>` (`reader/views.py:850,890`).
10. **`SearchState.makeURL({isStart:true})` does nothing.** It calls `url.replace(...)` and throws the result away (`searchState.js:154-156`). Callers always pass `isStart:false`, so there is no visible impact.
11. **Backend sheet-filter `agg_types` bug.** `get_search_params` builds `agg_types += [filter_type] * len(filters)` from the *cumulative* `filters` list (`reader/views.py:1074-1076`). A deep link that mixes collection and topic filters gets mismatched agg types.
12. **Text-filter search box ignores Hebrew.** `hasWordStartingWithOrSelected` strips `[^\w\s\-]` without the `u` flag, which deletes Hebrew letters. A Hebrew query in "Find a filter" therefore matches everything (`SearchFilters.jsx:167-178`). `FilterNode.getLeafNodes` uses the raw, unescaped text as a regex, so special characters can throw (`FilterNode.js:53-55`).
13. **Error states mostly look like empty states.** A failed sources query sets `error: true`, which nothing renders. The total stays 0, so the "No sources found" page appears (`ElasticSearchQuerier.jsx:409-418`; `SearchPage.jsx:744-746`). A failed "load next page" only logs to the console and never clears `isQueryRunning`, so scrolling can get stuck (`ElasticSearchQuerier.jsx:381-401`).
14. **Sources paging has no 10k cap.** Entity tabs stop at Elasticsearch's 10,000-result window (`SearchPage.jsx:92-94,511-517`). Sources infinite scroll pages by 100 until `pagesLoaded*100 >= total` and would request offsets past 10,000, which ES rejects (`ElasticSearchQuerier.jsx:391`).
15. **Not implemented** (stated so nobody hunts for them): recent searches or search history, gematria search, and date or version/language filters on the search page. `/api/knn-search` (semantic search, `api/views.py:191`) exists but the web client does not call it.

---

## 1. Entry points into search

| Entry point | Component | Behavior |
|---|---|---|
| Desktop header search box | `HeaderAutocomplete` in `Header.jsx:292-297` | Autocomplete plus submit, see §2 |
| Mobile nav-menu search box | `HeaderAutocomplete` in `Header.jsx:434-441` | Same, with `onNavigate={close}` (closes the menu after navigating) and `hideHebrewKeyboard` |
| Search-page in-page search bar | `SearchPageSearchBar`, `SearchPage.jsx:30-86` | Plain input, **no autocomplete**, see §5.2 |
| Compare-panel search | `ComparePanelHeader` (`search` prop), `ComparePanelHeader.jsx:19-43` | Plain input. Enter or button calls `openSearch(query)` → `updateQuery`. No autocomplete. Display-settings dropdown shown when the interface is not Hebrew |
| Sidebar "Search in this Text" tool | ConnectionsPanel tools button `ConnectionsPanel.jsx:295` → `SidebarSearch` `ConnectionsPanel.jsx:579-586` | Search scoped to the current book, see §9 |
| Dictionary book TOC / Lexicon sidebar / sidebar search on a dictionary | `DictionarySearch` (`BookPage.jsx:431-438`, `LexiconBox.jsx:188-191`, `SidebarSearch.jsx:85-90`) | Headword autocomplete, see §10 |
| Topics landing page search | `TopicLandingSearch` (`TopicLandingPage/TopicLandingSearch.jsx`) | Topic-only autocomplete, see §11 |
| Collection page "Search the full text of this collection for …" | `CollectionPage.jsx:180-190` → `ReaderApp.searchInCollection` (`ReaderApp.jsx:2043-2048`) | Opens a sheet search pre-filtered to the collection, see §8.4 |
| Moderator "Add Topic" on a ref | `TopicSearch` in `ConnectionsPanel.jsx:850` | See §12 |
| Browser omnibox (OpenSearch) | `templates/base.html:19` → `static/files/opensearch.xml` | `/search-autocomplete-redirecter?q=` and `/api/opensearch-suggestions?q=`, see §13.6 |
| Google sitelinks search box | `templates/static/home.html:21-23` (JSON-LD `SearchAction`) | Target `/search?q={search_term_string}` |
| Direct URL | `/search?q=…` (`sefaria/urls_shared.py:37` → `reader/views.py:1114`) | See §4 |
| Legacy s1 pages | `HeaderAutocomplete.showSearchWrapper`, `HeaderAutocomplete.jsx:505-515` | When the global `sjs` is defined, does a full page load to `/search?q=<encoded>` |

---

## 2. Header autocomplete (`static/js/HeaderAutocomplete.jsx`, `GeneralAutocomplete.jsx`)

### 2.1 Engine
- Built on **Downshift `useCombobox`** (`GeneralAutocomplete.jsx:2,29-43`). Item to string is `item.name`.
- Every input change calls `getSuggestions(inputValue)` and awaits it, with **no debounce and no stale-response guard** (`GeneralAutocomplete.jsx:40-42`). Responses are cached per name and query string in `Sefaria._lookups` (`sefaria.js:1529-1544`).
- `wrappedGetInputProps` lets the caller intercept Enter through `onEnter` (`GeneralAutocomplete.jsx:47-59`). The header does not use `onEnter`; it overrides `onKeyDown` itself.
- The dropdown shows only when Downshift `isOpen` **and** the header box is focused (`shouldDisplaySuggestions={isOpen => isOpen && searchFocused}`, `HeaderAutocomplete.jsx:567`).
- Keyboard: Downshift's defaults handle ArrowUp/ArrowDown highlighting and Escape to close/clear. Highlighting uses one `universalIndex` across all groups (`HeaderAutocomplete.jsx:311-331,378`).

### 2.2 Fetching suggestions (`fetchSuggestions`, `HeaderAutocomplete.jsx:403-438`)
- **Minimum 3 characters.** Fewer returns `[]`.
- Calls `Sefaria.getName(input, undefined, types, topic_pool)`:
  - `types = MODULE_ALLOWED_SEARCH_TYPES[activeModule]` (`HeaderAutocomplete.jsx:42-45`).
    - Library: `['Topic','ref','TocCategory','Term']`.
    - Voices: `['Topic','User','Collection']`.
  - `topic_pool = getTopicPoolNameForModule`: library → `library`, voices → `sheets` (`sefaria.js:2287-2295`).
  - Default server limit is 10 (`reader/views.py:3150`).
- Each completion object becomes `{...o, value: title + "(type)" (refs keep the plain title), label: title, url: getURLForObject(type,key)}`. `PersonTopic` is renamed to `Topic` (`HeaderAutocomplete.jsx:412-425`).
- Objects are then sorted (§2.4). **If at least one completion exists**, a synthetic first row `{value:"SEARCH_OVERRIDE", label:<raw input>, type:"search"}` is prepended. If there are **zero completions, the dropdown is empty** and has no "Search for" row (`HeaderAutocomplete.jsx:427-433`).
- Errors are logged with `console.error` and return `[]`.

### 2.3 URL per result type (`getURLForObject`, `HeaderAutocomplete.jsx:104-116`)
| type | URL | Module restriction |
|---|---|---|
| Collection | `/collections/<key>` | Voices only |
| TocCategory | `/texts/<key.join('/')>` (key is a path array/tuple) | Library only |
| Topic / PersonTopic / AuthorTopic | `/topics/<key>` | any |
| ref | `/<key with spaces→_>` | Library only |
| User | `/profile/<key>` | Voices only |
| anything else (Term) | `undefined` (latent crash, see §0.7) | |

`?` in URLs is encoded as `%3F` (`HeaderAutocomplete.jsx:167,520`).

### 2.4 Grouping, ordering, icons, labels
- `groupByType` keeps type groups in order of first appearance (`HeaderAutocomplete.jsx:55-73`).
- `sortByTypeOrder` (`:75-102`) runs first. As noted in §0.6, it effectively orders `Term > User > AuthorTopic > PersonTopic > Topic > TocCategory > Collection > ref`, with `search` pinned first by prepending.
- Group headers (`SuggestionsGroup`, `:363-399`). The `search` row has no header. Labels come from `type_title_id_map` (`:31-40`):
  - Collection → "Collections"
  - AuthorTopic → "Authors"
  - TocCategory → "Categories"
  - Topic / PersonTopic → "Topics"
  - ref → "Books"
  - Term → "Terms"
  - User → "Users"
- Icons (`type_icon_map`, `:7-17`), from `/static/icons/`:
  - Collection: `collection.svg`
  - AuthorTopic: `iconmonstr-pen-17.svg`
  - TocCategory: `iconmonstr-view-6.svg`
  - Topic / PersonTopic: `iconmonstr-hashtag-1.svg`
  - ref: `iconmonstr-book-15.svg`
  - search: `iconmonstr-magnifier-2.svg`
  - Term: `iconmonstr-script-2.svg`
  - User: `profile.svg`. Users with a profile pic show **the pic URL** instead (`type_icon`, `:47-53`). Users with an empty pic get the CSS class `ac-img-UserPlaceholder` (`:177`).
- Each row (`SearchSuggestionInner`, `:163-187`) is an `<a href={url}>` wrapping the Downshift item. Hebrew-vs-English text gets class `hebrew-result` / `english-result` based on `Sefaria.hebrew.isHebrew(label)`. The highlighted row gets class `highlighted`.
- "Search for" row (`TextualSearchSuggestion`, `:143-161`) renders as `Search for: “<label>”`. In the Hebrew interface the quote marks become ״.

### 2.5 Submitting (Enter / button / click)
- **Enter** (`SearchInputBox.handleSearchKeyDown`, `:210-228`):
  1. Downshift's `onKeyDown` runs first.
  2. If a suggestion is highlighted and it is not the `search` row: fire gtag `search_navto` (`feature_name: "Nav To by Keyboard"`, `link_type`, `text`, `to`) and call `redirectToObject(item)`.
  3. Otherwise, if the input is non-empty, call `submitSearch(inputQuery)`. Empty input does nothing.
- **Magnifier button** (`handleSearchButtonClick`, `:230-237`): with a value, `submitSearch`. With an empty value, focuses search and fires gtag `search_focus`.
- **Click "Search for X" row**: `submitSearch(query, undefined, undefined, enforceSearch=true)`, which always runs a full-text search (`:339-341`).
- **Click any other row**: gtag `search_navto` (`"Nav To by Mouse"`), then `redirectToObject(item)` (`:343-353`).
- `submitSearch` (`:491-503`): if a highlighted `search` row exists, go straight to search. If `enforceSearch`, search. Otherwise `redirectOrSearch`.
- `redirectOrSearch` uses `getQueryObj(query)` (`:118-141, 453-490`):
  1. Calls `Sefaria.getName(query)` **without type filters**.
  2. **Case repair**: `Sefaria.repairCaseVariant` (`sefaria.js:2436-2466`). When the query is not a ref but the first completion matches it case-insensitively as a prefix, it rebuilds the query with the best-matching completion's casing and **recurses**.
  3. **Gershayim repair**: `Sefaria.repairGershayimVariant` (`sefaria.js:2467-2480`). It swaps ״ for `"` and, if a completion matches, recurses with that completion.
  4. Resolution:
     - `is_ref` and the module allows refs (Library only) → `{type:'Ref'}`. Fires gtag `search_submit` (`feature_name:"Autolink"`), tracks `Search Box Navigation - Book` or `- Citation`, clears the box, calls `onRefClick(ref)` (in-app open), then `onNavigate()`.
     - `topic_slug` present (only with a `#` prefix) → `openTopic(slug)`.
     - `d.type` in `Person | Collection | TocCategory` → `redirectToObject`. "Person" is a legacy type the backend never emits.
     - Anything else → `search(query)`. This includes plain topic names, users, and refs in Voices.
- `search()` (`:442-452`): track `Search / Search Box Search`, gtag `search_submit` (`feature_name: "Search Results"`), `showSearchWrapper(query)` (trims, then `showSearch` or a legacy full page load), then **clears the header input**.
- `redirectToObject` (`:517-526`): tracks `Search Box Navigation - <type>`, clears the box, calls `openURL(url)`. If not handled in-app, it sets `window.location = url`.
- `ReaderApp.showSearch` (`ReaderApp.jsx:2027-2042`): sets the analytics flow source `nav_bar` only if search is not already open. Keeps the existing `searchState` but with `filtersValid:false`, or creates a new one for the module's search type. Calls `setSinglePanelState({mode:"Menu", menuOpen:"search", searchQuery, searchState})`, which collapses all panels into one.

### 2.6 Focus, blur and the virtual Hebrew keyboard
- In the English interface, the input gets class `keyboardInput`, so `static/js/lib/keyboard.js` (loaded in `templates/base.html:255`) attaches an on-screen Hebrew keyboard. In the Hebrew interface the class is `hebrewSearch` instead (`HeaderAutocomplete.jsx:278-283`).
- The keyboard-launcher icon (`.keyboardInputInitiator`) is hidden at mount, shown on focus, and hidden on blur, but only in the English interface and when `hideHebrewKeyboard` is false. Mobile passes `true` (`:205-207, 239-249`). It is never toggled while the keyboard is open (`#keyboardInputMaster`).
- Focus sets `searchFocused` (adds class `searchFocused`) and fires gtag `search_focus` (`:250-256`).
- Blur (`:258-276`):
  - If the box unmounted, for example when the mobile menu closed, it returns early.
  - If focus left `#searchBox` and the keyboard is not open, it unfocuses, hides the icon, and fires gtag `search_defocus` with the text.
  - It always restores the input value from the DOM unless the keyboard is open, so keyboard-typed text survives.
- Input: `maxLength=75`. Placeholder "Search". aria-label / title "Search for Texts or Keywords Here". Container is `role="search"` with aria-label "Site search" (`:287-305`).

---

## 3. `/api/name` and the autocomplete backend

### 3.1 Endpoint
- Routes: `api/name/<path:name>` (`sefaria/urls_shared.py:107`, plus the standalone name service `sefaria/urls_name.py:20`). The view is `reader/views.py:3143-3199`.
- Query params:
  - `limit` (default 10, 0 means unlimited)
  - `type` (repeatable)
  - `topic_pool`
  - `exact_continuations=1`
  - `order_by_matched_length=1`
- Leading `#` sets **topic override**: the server strips the `#` and looks up a topic by exact title, case-insensitively, choosing the one with the most `numSources` (`reader/views.py:3100-3103`).
- Response:
  - Always: `lang`, `is_ref`, `completions` (strings), `completion_objects` (`{title,type,key,is_primary,order,topic_pools[,pic]}`).
  - If the input parses as a Ref: `is_book`, `is_node`, `is_section`, `is_segment`, `is_range`, `type:"ref"`, `ref`, `url`, `index`, `book`, `internalSections`, `internalToSections`, `sections`, `toSections`, `examples`. When the node has a numeric continuation, also `sectionNames`, `heSectionNames`, `addressExamples`, `heAddressExamples` (`reader/views.py:3166-3192`).
  - `topic_slug` when the topic override matched.
  - Otherwise, when the full string exactly names a known object: `type` + `key` (`:3193-3197`).
- Client helper: `Sefaria.getName(name, limit, types, topicPool, exactContinuations, orderByMatchedLength)` trims the name, builds the query string (repeated `type=`), and caches in `_lookups` (`sefaria.js:1516-1544`).

### 3.2 `get_name_completions` (`reader/views.py:3084-3141`)
- `lang = he` if the name contains Hebrew, else `en`. Uses `library.full_auto_completer(lang)`.
- Tries `Ref(name)` first. Sheet refs are excluded (`SheetLibraryNode` raises `InputError`).
- **Dictionary refs.** On a virtual lexicon node, or on `DictionaryEntryNotFoundError`, it returns lexicon headword completions in the form `"<Dictionary>, <word>"`, with duplicates removed.
- Otherwise it calls `completer.complete(...)` and `completer.get_object(name)` (an exact normalized match).

### 3.3 `AutoCompleter` (`sefaria/model/autospell.py`)
- Full completer config (`sefaria/model/text.py:4967`): titles, categories, topics, users and collections are on; parasha is off.
- **Indexed object types and base order.** Lower order means higher rank. `PAD = 1,000,000` (`autospell.py:182-277`):
  - Book/ref titles: `1*PAD`. Sheet nodes are excluded.
  - TOC categories (`TocCategory`, key = full path): `2*PAD`. Only "container" categories with at least 2 indices. Boundary nodes such as Commentary, Rishonim and Acharonim are skipped, but their children are kept (`autospell.py:44-66,99-150`).
  - Parasha `Term`s: `3*PAD` (disabled in the full completer).
  - Topics: `4*PAD + (PAD - numSources - 1)`. Authors get a 100-point bonus. Included: topics with `shouldDisplay != false`, `numSources >= 10`, and not authors, **plus all AuthorTopics**.
  - Collections: `6*PAD`. Only `listed:true` and not `moderationStatus:nolist`.
  - Users: `7*PAD - sheet count`, with `pic` = small profile pic. Only users with public sheets, via `aggregate_profiles`.
  - Lexicon word forms (`word_form`): `2*PAD`. Only in the cross-lexicon completer.
- **Completion pipeline** (`Completions._collect_candidates`, `autospell.py:468-506`):
  1. Prefix ("begins with") matches from the title trie. Within a key, primary titles come first, then alternate titles. Ref alt titles of 4 characters or fewer (Gen, Exod) are skipped (`:535-578`). Sorted by order. **Each type gets 3 slots at normal rank**, then later items of that type are pushed down ×100 (`_candidate_order`, `:437-442`). Optionally re-sorted by matched length.
  2. Matches later in the string (n-gram title guessing, no autocorrect).
  3. If the input is under 20 characters (`max_autocorrect_length`), single-edit spelling variants via a Norvig spell checker trained on all titles.
  4. Autocorrected n-gram matches.
  - The pipeline stops once `limit` unique strings are collected.
- **Wrong-keyboard correction.** With no results, it swaps the keyboard layout en↔he (`hebrew.swap_keyboards_for_string`, `sefaria/utils/hebrew.py:358`) and retries once in the other language's completer (`autospell.py:309-336`). Not done with `exact_continuations`.
- Input is normalized (`normalize_chars`: unidecode outside the allowed scope, apostrophes stripped `' ’ ‘ ׳`) (`autospell.py:33-41,90`). Inputs of 200+ characters return nothing.
- **Type filter** (`_has_required_type`, `:453-466`): types are normalized (`AuthorTopic` and `PersonTopic` count as `Topic`). For `Topic` with a `topic_pool`, the object's `topic_pools` must include that pool.
- `/api/words/completion/<word>[/<lexicon>]` (`reader/views.py:3202-3222`): lexicon headword completion, default limit 10. Returns `[[word, word], ...]` across all dictionaries or `[(headword, form), ...]` for one lexicon. Client side: `Sefaria.lexiconCompletion` with callback and cache (`sefaria.js:1545-1561`).

---

## 4. `/search` URL handling and state

### 4.1 Server (`reader/views.py:1112-1132`, `get_search_params` `:1054-1088`)
- Renders `base.html` with props `initialMenu:"search"`, `initialQuery`, `initialSearchTab`, `initialSearchFilters`, `initialSearchFilterAggTypes`, `initialSearchField`, `initialSearchSortType`.
- Page title is `"<q> | Search"` or `"Search"`. Description "Search 3,000 years of Jewish texts…". **`noindex: True`**.
- URL params (any can carry a numeric panel suffix `i`):
  - `q`: query, URL-unquoted.
  - `tab`: **search type**, `text` (default) or `sheet`. This is not the results tab.
  - `search_tab`: the active results tab (`sources|books|authors|topics`).
  - Text search (`tab=text`):
    - `tpathFilters=A|B|…` (each URL-unquoted; agg type `path`).
    - `tsort`.
    - `tvar`: `1` → `naive_lemmatizer`, `0` → `exact`, absent → "" (client default).
  - Sheet search (any other `tab`):
    - `scollectionsFilters`, `stopics_enFilters`, `stopics_heFilters`.
    - `ssort`.
    - `svar` is written by the client but **not read** by the server.
- `@sanitize_get_params`, `@ensure_csrf_cookie`.

### 4.2 Client state (`ReaderApp.jsx`)
- Initial panel (`ReaderApp.jsx:58-74`): `menuOpen` from `initialMenu`, `searchQuery`, `tab = initialSearchTab`. `searchState = new SearchState({type: moduleToSearchType(activeModule), appliedFilters, field, appliedFilterAggTypes, sortType})`.
  - **The search type comes from the active module (`library`→`text`, otherwise `sheet`), not from the `tab` URL param** (`searchState.js:123-125`).
- History serialization (`ReaderApp.jsx:550-560`): `search&q=<enc>&tab=<text|sheet>&search_tab=<tab>` + `searchState.makeURL({prefix:'t'|'s'})`. The first `&` becomes `?` (`:889`). Title is `getPageTitle(query.stripHtml())`. `addTab` skips `&tab=` for search (`:503-509`).
- `makeURL` (`searchState.js:127-158`) emits `&<p><aggType>Filters=<enc|joined>` per agg type (sheet types expanded with `_en`/`_he` suffixes), `&<p>var=<1 if field != fieldExact else 0>`, `&<p>sort=<sortType>`.
- Back/forward: `handlePopState` rehydrates `SearchState` from plain objects. FilterNodes restore `parent` links via `restoreFromSerialization` (`ReaderApp.jsx:324-327`; `FilterNode.js:19-29`). Going back *into* search sets the analytics flow source to `back_click` (`ReaderApp.jsx:332-338`).
- The history push trigger compares `searchQuery`, `tab`, and SearchState `appliedFilters`/`field`/`sortType` (`ReaderApp.jsx:453-459`).
- Results-tab state is panel `tab`, changed via `ReaderPanel.setTab`. It uses replace-vs-push logic for the TabView mount race (`ReaderPanel.jsx:595-606`).
- `ReaderPanel` renders `ElasticSearchQuerier` only when `menuOpen==="search" && searchQuery` (`ReaderPanel.jsx:964-982`). **`/search` with no `q` renders no search menu body.**
- `ReaderPanel.openSearch(query)` sets `menuOpen:'search'` + `searchQuery` (`ReaderPanel.jsx:463-468`). `componentWillReceiveProps` opens search when a `searchQuery` prop arrives (`:88-90`).
- `openURL` does **not** route `/search`. A plain `<a href="/search?...">` falls through to a full page load (`ReaderApp.jsx` openURL path table ~1383-1441).
- State mutators (`ReaderApp.jsx:1471-1541`):
  - `updateQuery`: new query, `filtersValid:false`.
  - `updateAvailableFilters`: registers aggregations, `filtersValid:true`.
  - `resetSearchFilters`: unselects all nodes, clears applied filters and the registry, `filtersValid:false`.
  - `updateSearchFilter`: toggles a node, then recomputes applied filters via `Sefaria.search.getAppliedSearchFilters`.
  - `updateSearchOptionField`: `filtersValid:false`, which forces re-aggregation.
  - `updateSearchOptionSort`.

### 4.3 `SearchState` (`static/js/sefaria/searchState.js`)
- Fields: `type`, `appliedFilters`, `appliedFilterAggTypes`, `availableFilters` (FilterNodes), `filterRegistry` (aggKey→node), `filtersValid`, `orphanFilters`, `fieldExact`, `fieldBroad`, `field`, `sortType`.
- `update()` merges partial updates. When `aggregationsToUpdate` is given and filters are valid, it replaces only the available filters of those agg types (`:80-88`).
- `isEqual({other, fields})` does a shallow array compare.
- `metadataByType` (`:161-228`):
  - **text**:
    - `fieldExact:'exact'`, `fieldBroad`/`field:'naive_lemmatizer'`, aggregation `['path']`, builder `buildAndApplyTextFilters`, default sort `relevance`.
    - Sorts: `relevance` (`sort_method:'score'`, `fieldArray:['pagesheetrank']`, `score_missing:0.04`) and `chronological` (`sort` on `['comp_date','order']` asc).
  - **sheet**:
    - `field:'content'` (no exact field), aggregations `['collections','topics']` with topics suffixed `_en`/`_he` by interface language, builder `buildAndApplySheetFilters`.
    - Sorts: `relevance` (score), `dateCreated` (desc), `views` (desc).

---

## 5. Search page (Library): `static/js/SearchPage.jsx`

### 5.1 Container: `ElasticSearchQuerier` (`static/js/ElasticSearchQuerier.jsx`)
- Page size: **text 100, sheet 20** (`:97`).
- On construction it **restores every consecutively cached page** of the same query args from `Sefaria.search` cache, for instant back-navigation (`:109-127`).
- Mount: starts analytics (main page only), then `_executeAllQueries` (topic query, skipped in searchInBook, plus the main query) (`:129-141,279-284`).
- New query (`componentWillReceiveProps`, `:209-233`):
  - Resets hits and pages, starts an analytics query with the new tab, re-executes, then calls `resetSearchFilters()` unless searchInBook.
  - Otherwise, if `appliedFilters`, `field` or `sortType` changed, **or** `filtersValid` flipped while filters are applied, it re-executes only the main query (`_shouldUpdateQuery`, `:266-271`).
- **Two-phase filter query** (`:305-307,365`): applied filters are only sent once `filtersValid`. A deep link with filters therefore runs (1) an unfiltered query to get aggregations, then (2) the filtered query.
- Aggregations to request (`_getAggsToUpdate`, `:285-294`): none if filters are valid and there is a single agg type (text). Otherwise all, with language suffix.
- Success handler (`:314-354`):
  - Reports analytics `recordApiResult('sources', total)`.
  - On the first page, sets hits/totals and `moreToLoad = total > pageSize`.
  - Legacy track `Search / [SidebarSearch ]Query: <type>`, label `query[ - filters]`, value total.
  - Builds the filter tree from aggregations, then calls `registerAvailableFilters(...)`.
- Next page (`_loadNextPage`, `:381-401`): `start = pagesLoaded*size`. `moreToLoad` turns false when `pagesLoaded*size >= total`.
- Aborts the in-flight query on new query or unmount using `HackyQueryAborter`, which aborts several jQuery XHRs (`search.js:625-637`).
- Sheet hits are normalized to `_source` + `snippet = highlight.content.join('...')` (`:419-431`). This crashes if `highlight` is missing.
- Renders `SearchInVoicesPage` in the Voices module, otherwise `SearchPage` (`:432-465`).

### 5.2 In-page search bar (`SearchPageSearchBar`, `SearchPage.jsx:30-86`)
- Controlled input, synced to the `query` prop.
- Enter or magnifier (Enter/Space on the icon) submits the **trimmed** value, only if non-empty **and different** from the current query → `onQueryChange` (= `ReaderApp.updateQuery`).
- Clear X appears when the value is non-empty. It **clears the input only**, with no search. Keyboard accessible.
- `maxLength 75`, `enterKeyHint="search"`, `role="search"`. aria-labels: "Submit search", "Clear search term".

### 5.3 Layout and tabs
- Tabs: `sources` ("Sources", count = `totalResults.asString()`, e.g. "1,234" or "10,000+" when ES relation is `gte`) plus entity tabs Books/Authors/Topics with counts from `formatEntityCount` (≥10000 → "10,000+") (`SearchPage.jsx:721-728,560-565`; `searchTotal.js`).
- An invalid or missing `tab` falls back to Sources (`activeTab`, `:399-401`). The desktop TabView gets `currTabName=null` and then calls `setTab(first, replaceHistory=true)` on mount (`Misc.jsx TabView ~403-411`).
- **Desktop vs mobile tabs.** Desktop `TabView` (`largeTabs`) is used when `Sefaria.multiPanel` (server User-Agent) **and** `window.innerWidth > 985`. That width is re-measured on resize (`:89-90, 271-281, 437-438, 596`). Otherwise `SearchTabsMobileWeb` (§5.10).
- `TabView`/fragment is keyed by `query`, so it remounts per query (`:795,803`).
- Tab click → `setTab`: records the transition marker, reports analytics (unless it is a programmatic `replaceHistory` call), closes mobile filters, then `props.setTab` (`:567-583`). Back/forward tab changes are reported in `componentDidUpdate` (`:445-458`).
- **Loading skeleton** (`SearchLoadSkeleton.jsx`) replaces the whole tab area while the sources query runs with no hits. It shows 4 tab shimmers, 1 sort shimmer and 11 card shimmers, `aria-hidden`, and sets `.content` to `overflow-y:hidden` while mounted (`SearchPage.jsx:791-792`; `SearchLoadSkeleton.jsx:20-47`).
- Two-column layout: `.sidebarLayout` → `.contentInner` + `.navSidebar` (desktop, non-compare). On mobile or compare, the sidebar shows as a `.mobileSearchFilters` overlay only while `mobileFiltersOpen` (`:813-821`).

### 5.4 Sources tab
- Top matter (`:730-747`):
  - **Exact-match toggle** (`SearchToggle`), on desktop, non-compare, text type only. Labels "All Results" / "Exact Phrase". Segmented control with an animated slider; `useLayoutEffect` sets the initial position so it does not flash; `aria-pressed`; `role="group"` (`SearchToggle.jsx`).
  - Sort/filter control: desktop non-compare `SearchSortBox`, otherwise `MobileFilterIconButton` (sliders icon, aria "Sort & filter results"). On desktop it is disabled when total is 0 or unknown; on mobile it is never disabled (`:612-622,741`).
  - Body: `NoSearchResults mode="sources"` when the total is known and 0, otherwise `SearchResultList`.
- Exact toggle handler (`:640-653`): ignores a no-op click for analytics, reports `toggle`, then `updateAppliedOptionField(exact ? fieldExact : metadata default field)`.
- Sort handler wraps analytics (`sort`, English label) (`:375-386`). Filter handler wraps analytics (`filter`, title, docCount) (`:390-395`).
- Sidebar for Sources: `SearchFilters`, shown when total > 0 **or** on mobile. On mobile, `topSection` is the "Search Type" group containing the exact toggle (`:656-679`).

### 5.5 `SearchSortBox` (sources sort dropdown, `SearchResultList.jsx:195-252`)
- Button: sort icon, current option label (bilingual), chevron. `aria-haspopup`, `aria-expanded`.
- `DropdownModal` closes on outside click. `DropdownOptionList` lists options.
- Choosing the current option is a no-op.
- Disabled variant is a non-interactive div with `aria-disabled`.

### 5.6 Sources result list (`SearchResultList.jsx:112-193`)
- Returns null with no query.
- Text type:
  - **`Sefaria.search.mergeTextResultsVersions(hits)`** (`search.js:430-453`): removes duplicate `_id`s, groups **all loaded hits by ref** (across pages, so a later page's version folds into an earlier card), sorts each group by `version_priority`, keeps the first as the card, and puts the rest in `duplicates`.
  - Filters out hits without `_source.version`.
  - Main page renders `SearchResultCard` with `analyticsPosition` = 1-based index (main page only). searchInBook renders the legacy `SearchTextResult` (§9.3).
- Sheet type renders `SearchSheetResult` (§8.3).
- Wrapped in `InfiniteScroll` (§5.9). Initial-load "Searching..." when running with no results. "0 results." `LoadingMessage` when done with none (seen in sidebar search; the main page shows NoSearchResults instead).

### 5.7 Sources result card (`SearchResultCard.jsx`, mode `sources`; props from `sourceHitCardProps` `SearchResultList.jsx:60-103`)
- **Snippet**: ES highlight fragments (`<b>` tags, `fragment_size` 200) joined with `...`, leading punctuation `[ .,;:!-)\]]` stripped. Falls back to `_source.exact`. Rendered as HTML. Gets `he`/`en` class by Hebrew detection (`SearchResultList.jsx:20-28`).
- **Title**: ref (English) / heRef (Hebrew) via `InterfaceText`, following interface language.
- **Accent bar**: category color via `Sefaria.palette.refColor(name)`. No icon circle in sources mode (`SearchResultCard.jsx:253-261`).
- **Version name** under the snippet. Hebrew interface uses `hebrew_version_title` when present.
- **"N more versions" toggle**: separate i18n strings for 1 vs many ("1 more version" / "{count} more versions"), rotating chevron, `aria-expanded`. Expands a list of rows, each with its own snippet, version name, href and highlights, and each opening **that** version (`:97-101,370-407`).
- **href**: `/<normRef>?v<lang>=<encodeVtitle(version)>&qh=<query>` (query unencoded; `qh` is dead, see §0.4).
- **Click paths** (`:150-251`):
  - Whole card is `role=link`, `tabIndex=0`, aria-label = name. Enter/Space opens. **Ignored if text is selected.**
  - Title/version links: a plain click is intercepted and opened in-app. Modified clicks (Cmd/Ctrl/Shift/Alt) and middle-clicks go to the browser and open a new tab.
  - Open logic (`openResult`, `:165-190`):
    - If `Sefaria.parseRef` knows the index, use the parsed ref. Otherwise `await Sefaria.getRef(tref)` to normalize titles renamed since the last reindex.
    - Then `onResultClick(ref, currVersions, {textHighlights})`.
  - `currVersions` slot: `isPrimary` → `he`, else `en`, with `{languageFamilyName, versionTitle}` (`SearchResultList.jsx:53-58`).
  - `textHighlights` = runs of consecutive `<b>…</b>` from the highlight, tags stripped (`SearchResultList.jsx:33-47`).
  - Legacy track `Search / Search Result Card Click / "<query> - <name>"`.
- **Touch pressed state**: shows `is-pressed` after 100 ms of a stationary touch, with a 150 ms minimum flash for quick taps. Cancelled if the finger moves more than 10 px (scroll) (`:8-86`).
- **Reader-side highlight**:
  - Main panel: `ReaderApp.handleNavigationClick`. Compare panel: `handleCompareSearchClick` → `replacePanel(n,…)`, so it does not clobber other panels (`ReaderApp.jsx:1102-1105,2451`).
  - `TextRange.addHighlights` wraps matches in `<span class="queryTextHighlight">`, tolerating inline HTML tags between words (`TextRange.jsx:554-566`).
  - The highlight is cleared (`unsetTextHighlight`) when the highlighted segment changes (`TextRange.jsx:454-457`).

### 5.8 Entity tabs: Books, Authors, Topics (`SearchPage.jsx`)
- Data per type: `{hits, total, moreToLoad, isLoadingMore}`, or `null` while a fetch is in flight (`:111,263`).
- **All three are fetched in parallel on mount**, so every tab badge fills regardless of the active tab. Not fetched in searchInBook (`:467-506`).
- **Stale-response guard**: a per-type fetch token is bumped on every reset (query, sort or filter change). Responses with an old token are dropped (`:282-287,362,482,487,533,542`).
- `Sefaria.search.entitySearch(query, type, start, {sort, categoryPaths})` (`search.js:586-621`):
  - GET `/api/entity-search?q&type&start&sort&filter=…`.
  - Cached under a key built from type, query, start, sort and the **sorted** filter paths. De-duplicated via `_cachedApiPromise`.
  - An error body is **evicted from the cache** and thrown.
- Paging: `loadNextEntityPage` uses `start = hits.length` and does not bump the token (`:527-558`). `moreToLoad = hits.length < min(total, 10000)` (`:511-517`).
- On error: the first page shows an empty state (`{hits:[], total:0}`) and book counts are cleared. A later-page error just clears `isLoadingMore` (`:486-504,550-557`).
- Loading: `LoadingMessage "Searching..."` while data is null. Empty: `NoSearchResults mode=<type>s` (`:225-232`).
- **Sort per tab** (`SearchSortDropdown.jsx:16-33`), default `relevance` for all:
  - Books: Relevance, "Composition Date (Oldest First)" `year_asc`, "Composition Date (Newest First)" `year_desc`, "A-Z" `alpha`.
  - Authors: Relevance, "Year (Oldest First)", "Year (Newest First)", A-Z.
  - Topics: Relevance, A-Z.
  - Sorting is **server-side over the whole match set**; there is no client sort (`SearchSortDropdown.jsx:35-40`).
  - Changing sort discards pages and refetches page 1 (`SearchPage.jsx:312-328`).
  - Desktop uses `SearchSortDropdown` (div `role=button`, Enter/Space, aria-label "Sort by X"). Mobile uses `MobileFilterIconButton`, which opens `EntitySortPanel` (radio list).
  - Disabled only when loaded **and** empty (`:343-346`).
- **Books category filter sidebar** (`:290-310,330-357,680-705`):
  - Tree built client-side from `Sefaria.toc`: top categories plus one sub-level, with keys `"Cat"` and `"Cat/Sub"`, `aggType "categories"`.
  - Counts come from the API's `categoryCounts`, which cover the whole match set and do not change with paging or filtering. Kept separately so they survive refetches. Zero-count categories are hidden once counts arrive (`hideEmpty`).
  - Toggling a category reports analytics `filter`, flips selection (propagating to parent/children), resets book results and refetches with `filter=` paths. `getAppliedFilters` collapses a fully selected parent to its own key.
  - The sidebar shows on desktop when book data is null or total > 0, and always on mobile. Mobile adds a sort radio list (`mobileSortProps`).
  - A new query rebuilds the tree unselected and clears counts (`:459-464`).
  - `checkOnPartial`: a partially selected parent shows as **checked** rather than indeterminate.
- **Card builders**:
  - **Topic** (`topicHitCardProps`, `:137-152`):
    - Name `title_en || title_he`. Hebrew name `title_he || title_en`. Description en/he.
    - href `/topics/<slug>`.
    - Crumb = parent topic TOC category (`Sefaria.displayTopicTocCategory`) → `/topics/category/<slug>`.
    - Icon `topic.svg`. Black accent bar.
  - **Author** (`authorHitCardProps`, `:155-164`): topic fields plus `iconmonstr-pen-17.svg` and lifespan (`authorLifespan`, `:122-134`):
    - "1135 – 1204 CE" when both years share an era.
    - "500 BCE – 20 CE" when the era differs.
    - A single year when one is missing.
    - Year formatting via `search.year.ce` / `search.year.bce` (`:115-119`).
  - **Book** (`bookHitCardProps`, `:174-215`):
    - Date from `compDate`.
    - Author line: first non-Hebrew name for English, first Hebrew name for Hebrew, linked to `/topics/<authors[0]>?tab=author-works-on-sefaria`.
    - Description.
    - Rows with `hit.url` (author-works or category rows) use that url, type `collection` if `isCategory`, crumbs from `categories` or `categoryLabel_*`.
    - Flat rows: href `/<title_en with spaces→_ and ?→%3F>` (would throw if `title_en` is null). Crumbs are category path links `/texts/<path>`.
    - Icon `book.svg` or `collection.svg`, CSS-masked with the category color.
  - Cards navigate by **`openURL(href)`** (in-app router). If that is unhandled, `window.location.href` (`SearchResultCard.jsx:167-176`). Breadcrumb and author sub-links use the same pattern and stop propagation (`:228-234`).

### 5.9 Infinite scroll (`static/js/InfiniteScroll.jsx`)
- Listens to scroll on the closest `.content` ancestor. Loads more when within **300 px** of the bottom, if `hasMore && !isLoading` and nothing is pending.
- A pending flag prevents duplicate dispatches until `isLoading` flips (`:30-53`).
- Bottom message "Loading more results..." only while appending (`isLoadingMore`).
- Shared by Sources and entity tabs.

### 5.10 Mobile tab strip (`SearchTabsMobileWeb.jsx`)
- Horizontally scrollable `role=tablist` of buttons (`role=tab`, `aria-selected`), each with title and count (count hidden if empty).
- Left and right fade gradients appear depending on scroll position.
- The active tab auto-scrolls into view smoothly (`:11-33`). A trailing spacer element.

### 5.11 Mobile filter panels
- **Sources** (`SearchFilters`, non-multiPanel or compare branch, `SearchFilters.jsx:68-96`):
  - Header: Close X, "Filters".
  - `topSection` ("Search Type" + exact toggle).
  - "Sort by" radio list (`SortRadioList`, `:16-38`).
  - Filter groups.
  - Footer full-width "Show Results" button that closes the panel.
- **Books** (`BookSearchFilters`, `:328-374`): header "Filter", Sort radios, category filters, Show Results.
- **Authors/Topics** (`EntitySortPanel`, `:428-447`): header "Sort", radios, Show Results.
- Switching tab closes the panel (`SearchPage.jsx:581`).

### 5.12 Empty state (`NoSearchResults.jsx`)
- Illustration per mode: `/static/img/no-results-search-illustrations/NoResults{Source|Books|Authors|Topics}.svg`.
- Heading `search.null.<mode>.h1` with `{userquery}` / `[query]` replaced by the query, e.g. "No sources found for “X”".
- Body: "Try a different spelling or shorter search term…"
- CTA button with hrefs **hardcoded**: sources/books → `/texts`, authors → `/people`, topics → `/topics`. These ignore the i18n `.button.link` values (`:6-11`).
- Caption "Something seems wrong? Report a bug or contact us." links to `search.null.caption.bug.link` (Formstack form) and `mailto:hello@sefaria.org` (`:13-26`).

### 5.13 Compare-panel search
- `ComparePanelHeader` with a search box. The back button closes or converts the panel (`SearchPage.jsx:774-779`).
- In compare:
  - No desktop sidebar.
  - The exact toggle is hidden from the top matter and is reachable only through the mobile-style filter overlay.
  - The sources sort is behind the sliders icon.
  - Entity tabs use the desktop dropdown.
  - **Book category filters are effectively unreachable**: there is no button to open the overlay on entity tabs.
  - No analytics.

---

## 6. Sources (text) search backend

### 6.1 `/api/search-wrapper[/es8|/es6]` (`reader/views.py:4927-4951`; routes `sefaria/urls_shared.py:192-194`)
- POST JSON (or form `json=`). Builds an elasticsearch-dsl `Search` on index `type` (`text`/`sheet`) with a 5 s timeout.
- `/es6` and bare `/api/search-wrapper` flatten `hits.total` to an int for old clients. The web client uses `/es8` (`search.js:43`).
- An ES failure returns `{"error": "..."}`.
- `/api/dummy-search` is a canned "please upgrade your app" response for old mobile apps (`reader/views.py:4863-4924`).

### 6.2 Request body built client-side (`Search.get_query_object`, `search.js:399-429`)
`{type, query, field, source_proj:true, slop: exact?0:10, start, size, filters, filter_fields, aggs, sort_method, sort_fields, sort_reverse, sort_score_missing}`. Cached by sorted JSON key (`sefariaQuery|…`).

### 6.3 Query construction (`get_query_obj`, `sefaria/helper/search.py:73-140`)
- Replaces an internal `"` between non-space characters with gershayim `״` (רמב"ם → רמב״ם).
- `match_phrase` on `field` with `slop`. "All Results" uses `naive_lemmatizer` with slop 10. "Exact Phrase" uses `exact` with slop 0.
- Sort:
  - `relevance` → `function_score` with `field_value_factor` on `pagesheetrank`, missing 0.04.
  - `chronological` → sort `comp_date`, `order` asc.
  - Sheets: `dateCreated` desc, `views` desc.
- Aggregations: `terms` per requested agg, size 10,000.
- Filters (`get_filter_obj`/`make_filter`, `:197-232`):
  - Text `path` filters are regexp `path|path/.*` and are **OR'd together**.
  - Sheet filters are `term` and are **AND'd** (`must`), so selecting two collections requires both.
  - A `linked_refs` filter field is supported, expanded to segment refs (`:143-195`). The web UI does not use it.
- Highlight `field`, `fragment_size=200`, `<b>`/`</b>`.

### 6.4 Text index document fields (`sefaria/search.py:1543-1565`)
`ref, heRef, version, lang, version_priority (default 1000), hebrew_version_title, categories, order, path ("<search cats>/<Index title>"), pagesheetrank, comp_date, exact, naive_lemmatizer, languageFamilyName, isPrimary, linked_refs`. Categories may be rewritten under a TOC `searchRoot` (`sefaria/search.py:858-874`).

### 6.5 Dicta merge (client, `search.js`)
- Active when `type==='text'`, the query is Hebrew, **and** not exact (`isDictaQuery`, `:238-240`). Reset per new query (`:336-345`).
- `dictaQuery` (`:92-189`) POSTs to Dicta `/search` with `{query, from, size, limitedToBooks: filters with '/'→'.' and ' '→'_', sort: relevance→'pagerank' else 'corpus_order_path', smallUnitsOnly:true}`.
  - Hits are adapted to Sefaria's shape: version "Tanach with Ta'amei Hamikra", `lang:'he'`, `isPrimary`, `heRef` reformatted from Dicta's path (`reformatDictaRef`, `:84-91`), `comp_date = -10000 + i` (keeps them first chronologically), score = -pagerank.
  - Skipped when the Dicta results are exhausted.
- `dictaBooksQuery` (`:190-237`): POST `/books` with a **3 s timeout**. Returns per-book counts used as `path` buckets. **On failure it sets `queryDictaFlag=false`**, which falls back to Sefaria's own Tanakh hits.
- `mergeQueries` (`:245-315`):
  - Replaces Sefaria's `Tanakh/*` aggregation buckets with Dicta counts.
  - Total = sum of matching buckets when filters are applied, else Sefaria total + Dicta total.
  - Removes Sefaria hits in Tanakh, concatenates Dicta hits, and sorts by `score` (relevance) or `comp_date`.
  - For relevance, rescales Dicta scores to Sefaria's mean and std (the mean computation divides by `sefariaHits.length` for both, a quirk).
- Sefaria scores are negated (`score = -_score`) so that ascending sort means best first (`:64-68`).

### 6.6 Filter tree (`buildFilterTree`, `search.js:466-534`; `FilterNode.js`)
- Combines **applied filters**, which always appear and are seeded with their bucket count (fix sc-44603), with aggregation buckets.
- **Drops paths not present in the client TOC** (`Sefaria._tocOrderLookup`). This covers a TOC that updated before ES did.
- Sorted by TOC order (`Sefaria.compareSearchCatPaths`, `sefaria.js:1420-1438`, built in `_cacheFromToc` with `searchRoot` rewriting, `:1389-1419`).
- Builds a tree of FilterNodes. Hebrew titles come from `Sefaria.hebrewTerm`. Counts are summed up from leaves.
- `applyFilters` marks applied nodes selected. Unknown keys become **orphans** (`:536-544`).
- `getAppliedSearchFilters` collects applied keys and types (`:545-559`).
- FilterNode selection states: 0 none, 1 selected, 2 partial.
  - Selecting propagates to children and re-derives the parent.
  - `getAppliedFilters` returns the selected node's own key, or recurses into partial nodes (`FilterNode.js:70-137`).
  - `getSelectedTitles` provides placeholders "(No Collection)" / "(ללא אסופה)" and "(No Tag)" / "(ללא תוית)" (`:138-160`). These are currently unused by the UI (`SearchFilters.getSelectedTitles` is defined but never called).

---

## 7. Sources filter UI (`SearchFilters.jsx`)

- Desktop: `.searchFilters.navSidebarModule` containing the filter groups only (`:64-67`).
- **Text filters** (`TextSearchFilters`, `:111-124`): one `SearchFilterGroup` named "Texts", heading **"Filters"** (`search_filters.title`), searchable, expandable.
- `SearchFilterGroup` (`:131-211`):
  - Search input (`#filter<Name>`, placeholder "Find a filter" / "Search Topics" / "Search Collections") filters top-level items. An item matches if it or any child has a word starting with the text, **or it is selected**.
  - A clear button appears while text is present.
  - Non-expandable groups without `preserveOrder` (sheet groups) are sorted **selected first**.
  - Collections are sorted so that items titled in the interface language come first (`:158-161`).
  - Optional paging: 8 initially, "See More" adds 20 (`PagedList`, `:413-425`).
- `SearchFilter` row (`:226-318`):
  - Checkbox (`id=aggKey`), visually a styled label. Tri-state: `indeterminate` and `aria-checked="mixed"` on partial, unless `checkOnPartial`.
  - Title plus count "(n)".
  - Clicking the title **expands** if the row is expandable, otherwise toggles. Enter key handling on label and title. Chevron `fa-angle-down` toggles expansion.
  - The expanded list shows **leaf nodes (books) only**, flattened. Intermediate subcategories are not shown as rows (`getLeafNodes`).
  - **Auto-expands** while filter text matches any leaf.
  - `hideEmpty` hides zero-count leaves.
  - aria-labels "Press enter to toggle search filter for X." / "…the list of specific books within X…".
- **Sheet filters** (`SheetSearchFilters`, `:383-406`, inside a `role="dialog"` div):
  - "Topics" group (agg types `topics_en`/`topics_he`), paged, searchable.
  - "Collections" group, paged, not searchable.
  - Items without any title are hidden.
- Sheet filter nodes (`buildAndApplySheetFilters`, `search.js:565-585`):
  - A Hebrew bucket key goes to `heTitle`, otherwise `title`.
  - Topic Hebrew title comes from `Sefaria.terms`.
  - `selected` is computed from applied filters plus matching agg type.

---

## 8. Voices module search (sheets): `SearchInVoicesPage.jsx`

### 8.1 Page
- Heading: "Results for “<query>”" (`search_page.results_for`, Hebrew quotes ״). Optional `AiInfoTooltip` badge if `aiBadgeText` is passed (`:77-88`). **Nothing currently passes `aiBadgeText`.**
- Result count "N Results" when > 0 (`:41-46`).
- Controls:
  - Desktop non-compare: `SearchSortBox` (Relevance / Date Created / Views).
  - Otherwise: `SearchFilterButton`, a "Filter" button with `(n)` applied count, grey when 0, aria "Open filter (n active)" (`SearchResultList.jsx:255-273`).
- Sidebar: `SearchFilters` (Topics + Collections) shown only when total > 0. Desktop sidebar, or the mobile overlay when open (`:101-116`).
- No tabs and no exact toggle. The whole page is keyed by query.
- searchInBook returns only the list (`:59-61`).

### 8.2 Analytics
Out of scope: `_searchAnalyticsInScope` excludes Voices (`ElasticSearchQuerier.jsx:200-203`).

### 8.3 Sheet result (`SearchSheetResult.jsx`)
- Title: HTML stripped via jQuery, `dir` by Hebrew detection.
- Snippet: the content highlight, leading punctuation stripped, language-directional.
- Owner row: `ProfilePic` (30 px), owner name (Hebrew/English class), bullet, **date created formatted `en-US` "Month D, YYYY" regardless of interface language** (`:28-32`).
- Links carry `data-target-module="voices"`. Sheet href `/sheets/<id>`. Owner href is `profile_url`.
- Click → `onResultClick("Sheet <id>")` (in-app). Tracks `Search Result Sheet Click`. Owner click tracks `Search Result Sheet Owner Click`.

### 8.4 Search within a collection
- `CollectionPage` shows "Search the full text of this collection for “<filter>” »" when a collection is **listed** and a sheet-list filter is typed. href `/search?q=<filter>&tab=sheet&scollectionsFilters=<name>`.
- Click → `searchInCollection`, a sheet SearchState with `appliedFilters:[name]`, `appliedFilterAggTypes:['collections']` (`CollectionPage.jsx:180-190`; `ReaderApp.jsx:2043-2048`).

### 8.5 Sheet index document
`title, content, owner_name, owner_image, profile_url, version ("Source Sheet by …"), topics_en, topics_he, sheetId, collections, dateCreated, views …` (`sefaria/search.py:201-264`).

### 8.6 Related reuse
`SheetsWithRefPage` reuses `SearchFilters` and `SearchSortBox` for client-side filtering of "Sheets with <ref>", using filter nodes from `Sefaria.sheets.sheetsWithRefFilterNodes` (`sheets/SheetsWithRefPage.jsx:37,82`; `sefaria.js:3316-3350`). URL `sheets-with-ref/<ref>` + `makeURL({prefix:'s'})` (`ReaderApp.jsx:530-536`).

---

## 9. Search within a book (sidebar): `SidebarSearch.jsx`

### 9.1 Opening and URL state
- ConnectionsPanel tool "Search in this Text" sets `connectionsMode="SidebarSearch"` (`ConnectionsPanel.jsx:295`).
- The query is persisted in panel state `sidebarSearchQuery` and in the URL as `&sbsq=` (first connections panel) or `&sbsq<N>=` (buggy, see §0.9). It is restored server-side (`reader/views.py:850,890`; `ReaderApp.jsx:706-711,828-830`).

### 9.2 Behavior
- If the book's index details have a `lexiconName` (a dictionary), it shows `DictionarySearch` instead (`:13,85-90`).
- Otherwise:
  - `SearchButton` + input (`#searchQueryInput`, placeholder/title "Search in this text", maxLength 75, virtual keyboard attached).
  - Enter (keyUp 13) or the button submits only if the value changed.
- Scope:
  - `Sefaria.bookSearchPathFilterAPI(title)` → `/api/search-path-filter/<title>` returns the ES `path` for the book, applying `searchRoot` rewriting (`sefaria.js:3060-3067`; `reader/views.py:5039-5046`).
  - SearchState is `{type:'text', appliedFilters:[path], appliedFilterAggTypes:['path'], field:'naive_lemmatizer', sortType:'chronological', filtersValid:true}`.
  - **No exact toggle, no sort UI, no filters UI**: always lemmatized and chronological (`:17-53`).
- Renders `ElasticSearchQuerier searchInBook` → `SearchPage` returns just the `SearchResultList` (`SearchPage.jsx:624-626`). No entity fetches and no topic query. Hebrew queries still go through the Dicta merge.

### 9.3 Results
- Legacy `SearchTextResult.jsx`:
  - Ref title link (en ref / he heRef).
  - Snippet in `ColorBarBox`, colored by ref.
  - Version name (Hebrew title in Hebrew interface).
  - Hardcoded bilingual "N more version(s)" / "N גרסאות נוספות" caret toggle that expands nested `SearchTextResult`s.
- Click:
  - Normalizes the ref via `getRef` if the index is unknown.
  - Tracks `Sidebar Search Result Click` (or `Search Result Text Click` outside the sidebar).
  - `onResultClick(ref, {he|en: {languageFamilyName, versionTitle}}, {textHighlights})`.
  - `ReaderApp.handleSidebarSearchClick` **replaces the text panel to the left (n-1)** with `scrollToHighlighted`, `highlightedRefs`, `showHighlight`, `currentlyVisibleRef` (`ReaderApp.jsx:1106-1116`).
- Infinite scroll uses the `.content` ancestor. The "Searching..." / "0 results." messages come from `SearchResultList`.

---

## 10. Dictionary search (`DictionarySearch.jsx`)

- jQuery UI autocomplete on `input.search`, `minLength 1`, menu class `dictionary-toc-autocomplete` (`:67-122`).
- **Hebrew only.** Input containing English shows a single non-selectable row "Invalid entry.  Please type a Hebrew word." (`:105-108`).
- Source: `Sefaria.lexiconCompletion(term, lexiconName)`. Label = form with vowels (`e[1]`), value = `e[0]`.
- **Polling**: checks every 330 ms for value changes (to catch virtual-keyboard typing) and re-triggers the search (`:33-60`).
- Menu position and width adapt when the virtual keyboard (`#keyboardInputMaster`) is open (`:43-49,74-85`).
- Select → `submitSearch(label)`. Enter or the magnifier icon → `submitSearch(query, needsResolution=true)`, which resolves to the first completion's form or keeps the raw word (`:123-163`).
- `displayWord`:
  - In LexiconBox (`showWordList`): shows entries for the word.
  - In the book TOC or sidebar: navigates to `"<title>, <word>"`, but only if `Sefaria.getText` returns no error. Uses `navigatePanel(ref, currVersions)` or `showBaseText(ref, false, currVersions)` (`:136-151`).
- Virtual keyboard attached (English interface). The keyboard icon's opacity toggles on focus/blur (`:61-66,164-172`).
- Placeholder "Search Dictionary". Magnifier alt text "image of magnifying glass".
- LexiconBox passes no `lexiconName`, so completion runs **across all dictionaries** (`/api/words/completion/<word>`).

---

## 11. Topics landing search (`TopicLandingPage/TopicLandingSearch.jsx`)

- `GeneralAutocomplete` with **minimum 2 characters**.
- `getName(word, 20, ["Topic"], "library", exact_continuations, order_by_matched_length)`.
- Title cleanup:
  - Capitalizes the first letter.
  - Strips a trailing "(Disambiguation)" when it equals one of the topic's TOC category names.
  - Appends the category path "(Cat > Sub)" in the query's language (`:7-61`).
- Rows: hashtag icon, title, grey category path. `data-anl-*` attributes `navto_topic:click`. Click → `openTopic(slug)`.
- Enter opens the highlighted item, else the **first** suggestion (`:99-107`).
- Placeholder: `Search {N} Topics A-Z` (en, N localized) / "חיפוש לפי נושא" (he).
- "Explore all Topics ›" link smooth-scrolls to `#browseTopics`, offset by the header height (`:126-160`).

---

## 12. Topic search and ref autocomplete inside editors

- **`TopicSearch.jsx`** (moderators only, text mode; `ConnectionsPanel.jsx:850`):
  - `Autocompleter` (`Misc.jsx:3082+`). `getName(word, undefined, ['Topic'])`, top 4 results plus a last row "<createNewTopicStr><word>".
  - Selecting requires an exact case-insensitive name match, else `alert("Please select an option through the dropdown menu.")`.
  - Valid selection → `Sefaria.postRefTopicLink(normRef(srefs), {topic, interface_lang})`. It pushes the link into `Sefaria._refTopicLinks` for each sref and the section ref, then calls `update()` and `alert("Topic added.")` (`:53-88`).
    - Bug: `await Sefaria.getRef(...).sectionRef` awaits a property of a promise, so the section-ref cache key is `undefined`.
  - Choosing "create new" opens `TopicEditor` with `origEnTitle`. `onCreateSuccess` posts the link.
  - Placeholder `Sefaria.translation(contentLang, "Search for a Topic")`. Button "Add Topic".
- **`Autocompleter`** (`Misc.jsx:3082-...`):
  - Input plus `<select>`-style option list plus button. Enter submits when the add button is shown. ArrowDown focuses the list.
  - Optional ref text preview (`previewText` → `getText` + `makeSegments`) and helper prompt.
  - Auto-widens the input past 350 px. Flips the list above the input when there is no room below.
  - Used by sheet `Editor.jsx` (add source: `getName(input, 5, ['ref'])`, `:947,1001`) and `SourceEditor.jsx` (`:76,113`).
- Other `getName` consumers (likely covered by editor inventories):
  - `sheets/PublishMenu.jsx:117` (topic tags, 5, `["Topic"]`)
  - `AdminEditor.jsx:106`
  - `LinkerEditorPage.jsx:202,1102-1131` (ref autocomplete with `GeneralAutocomplete`, limit 10)
  - `sefaria/util.js:1373,1469` (jQuery ref autocomplete / validator)
  - `categorize_sheets.jsx:54`
  - `modtools/components/DownloadLinks.jsx:208,221`
  - legacy `sheets.js`, `s1/editor.js`

---

## 13. Entity search backend (`/api/entity-search`, `sefaria/helper/search.py`)

### 13.1 API (`reader/views.py:4953-5036`)
- `GET ?q&type=topic|author|book&sort&filter=<path>(repeatable)&start&size`.
- `size` defaults to 20 and is clamped to 1..100. `start` is clamped to `[0, 9999]`. The final page is **shortened** to stay inside the 10,000 window, never shifted backward.
- Validation errors, returned as JSON `error`:
  - missing `q`
  - bad type
  - sort not valid for the type
  - `filter` on a non-book type
- Exceptions are logged and return a generic error.

### 13.2 Sorts (`ENTITY_SORTS`, `:258-265`)
- Topic: relevance, alpha. Author and book: relevance, alpha, year_asc, year_desc.
- `alpha` sorts `title_en.sort`. Years sort on `sortYear` (authors: death year, else birth year) or `compDate` (books).
- Missing values go last; `_score` breaks ties (`:470-493`).

### 13.3 Relevance tiers (`get_entity_query_obj`, `:496-604`)
1. Exact case-insensitive keyword match: primary title (constant 1000) or variant / authored title (constant 100).
2. Phrase on titles (×4).
3. All words, cross_fields AND, with per-field boosts (×2).
4. All words as prefixes within one title field (×1.5, multi-word only).
5. phrase_prefix on titles (×1).
6. Any word (×0.1).
- Field boosts can be overridden through RemoteConfig keys `SEARCH_ENTITY_FIELD_BOOSTS_{TOPIC,AUTHOR,BOOK}`, validated against an allow-list (`:330-370`).
- Descriptions are never searched.
- Tokenization mirrors the `exact_english` analyzer: quote folding, combining-mark stripping, Hebrew ר׳ handling (`:400-434`).
- Topic and author both live in the `topic` index, filtered by `subtype`.

### 13.4 Books resolution chain (`entity_search`, `:957-1006`)
Only applies when no category filter is set.
1. **Author resolution.** If the query exactly equals an author's title or variant, return **that author's works aggregated by category** (`_author_works_response`, `:855-933`). Relevance order: the eponymous work first, then category rows, then the rest. Explicit sorts order in code. Individual works carry `authors` and `author_names`.
2. **Category resolution.** If the query exactly names TOC categories (including Term variants such as "Bible" → Tanakh, shallowest first), return:
   - eponymous books inside those categories (max 5),
   - then one category row per match (`isCategory`, `url:/texts/<path>`, `categories` parent path as breadcrumb),
   - then flat book results **excluding** books under the matched categories.
   - Paging walks the lead rows first (`_resolve_categories` / `_category_response`, `:695-852`).
3. Otherwise: flat book search.
- Every book response includes **`categoryCounts`**: a per-category count over the whole match set, from a `terms` aggregation on `path` (size 10,000). The category filter is applied as a `post_filter`, so counts ignore it. The author and category paths compute counts via a separate flat aggregation-only query (`_book_category_counts`, `:935-955`; `_category_counts_from_response`, `:612-642`).

### 13.5 Topic index
Only topics in the Postgres `library` TopicPool, with a title (`library_topic_slugs` / `make_topic_index_document`, `sefaria/search.py:1666-1879`). Authors add `era`, `birthYear`, `deathYear`, `sortYear`, `authored_titles_en/he`. The index is updated on topic, index and category save hooks (`sefaria/helper/search.py:1079+`).

### 13.6 Other search-adjacent endpoints
- `/search-autocomplete-redirecter?q=` (`reader/views.py:2058-2075`; also `urls_name.py:24`). `#` means topic override. Redirect order:
  - ref → `/<ref.url()>`
  - Topic, PersonTopic or AuthorTopic object → `/topics/<key>`
  - TocCategory → `/<key>` (redirects to `/<path>`, not `/texts/<path>`)
  - else → `/search?q=<query>` (query not re-encoded)
- `/api/opensearch-suggestions?q=` → `[query, completions(limit 5)]` (`reader/views.py:2077-2086`).
- `/garden/search/<q>`: visual "garden" of search results (`sefaria/urls_library.py:80`; `reader/views.py:5340-5360`). Not linked from the search UI.
- `/api/knn-search`: semantic search API, not used by the web client (`api/views.py:191`).

---

## 14. Analytics

### 14.1 GA4 search funnel (`static/js/sefaria/searchAnalytics.js`, spec sc-46034)
- **Scope**: the main search page only. Not the compare panel, sidebar search-in-book, or Voices (`ElasticSearchQuerier.jsx:200-203`; card `analyticsPosition` gating).
- Events, sent with `transport_type: 'beacon'` and dropping undefined fields (`:329-336`):
  - `search_flow_started {flow_id, source}`. Source is one of:
    - `nav_bar`: set by `showSearch` (`ReaderApp.jsx:2035-2037`)
    - `back_click`: in-app popstate, `performance` navigation type `back_forward`, or bfcache `pageshow`
    - `deep_link`
    - `unknown`
  - `search_query_executed {flow_id, search_id, search_text, status success|failure, result_counts JSON {sources,books,authors,topics}, error, tab}`. Fires once all four APIs report for the current search_id. Only the first report per API counts. The tab is a snapshot from when the query started (`:181-230`).
  - `search_element_clicked {flow_id, search_id, element_type tab|filter|sort|toggle|result, element_value, tab (live), count, result_position}` (`:245-256`).
  - `search_flow_ended {flow_id, search_id, reason clicked_result|abandoned}`. A flow ends only once (`:310-319`).
- Lifecycle:
  - Mount starts the flow and query. Unmount ends it as `abandoned`.
  - `pagehide` → `abandoned`. `pageshow` with `persisted` → new flow with `back_click` (`ElasticSearchQuerier.jsx:129-199`).
  - A new query in the same visit gets a new `search_id` with the same `flow_id`. Sort and filter changes do not.
  - In-app navigation away (ReaderApp link handler) ends the flow `abandoned` only when the page actually navigated (`ReaderApp.jsx:1218-1242`).
- Result clicks:
  - Card, title, version row, breadcrumb or author link all report `result`. Plain clicks end the flow `clicked_result`.
  - Modified clicks (killed by ReaderApp's capture-phase handler) report via `data-search-result-value` / `data-search-result-position` attributes and `reportModifiedResultLinkClick`, **without** ending the flow (`searchAnalytics.js:93-108,294-303`; `ReaderApp.jsx:1153-1166`).
  - Middle-click via `auxclick` also reports without ending the flow (`SearchResultCard.jsx:241-244`).
- Tab click reports `count` = the raw tab count. Filter clicks report `docCount`. Sort reports the English option label. Toggle reports "All Results" / "Exact Phrase".

### 14.2 Header gtag events (`HeaderAutocomplete.jsx`)
- `search_focus`, `search_defocus {text}`
- `search_submit {feature_name: "Search Results" | "Autolink", text, link_type}`
- `search_navto {feature_name: "Nav To by Keyboard" | "Nav To by Mouse", link_type, text, to}`
- All carry `project: "Global Search"`.

### 14.3 Legacy `Sefaria.track.event("Search", …)`
- `Search Box Search`
- `Search Box Navigation - Book | Citation | Topic | <type>`
- `[SidebarSearch ]Query: <type>`
- `Search Result Card Click`
- `Search Result Text Click`
- `Sidebar Search Result Click`
- `Search Result Sheet Click`
- `Search Result Sheet Owner Click`

### 14.4 Topics landing
`data-anl-event="navto_topic:click"` attributes, `feature_name="Search"`.

---

## 15. Caching and performance notes
- `Sefaria.search._cache`: query results keyed by sorted args, cloned on write. Per-request ajax caches (`sefariaQuery|`, `dictaQuery|`, `dictaBooksQuery|`). Entity pages. All are in-memory for the session (`search.js:22-31,454-465,586-621`).
- `_lookups` (`getName`), `_lexiconCompletions`, `_bookSearchPathFilter` caches (`sefaria.js:1516,1545,3060`). Reset in `Sefaria` init (`sefaria.js:4132-4172`).
- `Sefaria.search = new Search(searchIndexText, searchIndexSheet)` (`sefaria.js:4113`).

## 16. Accessibility summary
- Search containers use `role="search"` with aria-labels.
- Clickable icons have `role=button` and handle Enter/Space.
- Cards are `role=link` and focusable.
- Filter checkboxes expose `aria-checked` (including `mixed`).
- Mobile tabs use `role=tablist` / `tab` with `aria-selected`.
- The toggle uses `aria-pressed`. Dropdowns use `aria-haspopup` / `aria-expanded`. Disabled controls use `aria-disabled` and `tabIndex=-1`.
- The skeleton is `aria-hidden`.
- Some filter aria-labels are hardcoded English ("Press enter to toggle…", "Type to Filter X Shown", "Sort by X", "Open filter (n active)").

## 17. Edge cases and bugs checklist (for parity or intentional fixing)
- Header suggestions need at least 3 characters; the topics landing needs at least 2. There is no "Search for" row when there are zero completions.
- No debounce and no request cancellation in `GeneralAutocomplete`; out-of-order responses can show stale suggestions.
- `#topic` prefix navigation is hidden behavior (§0.5).
- Case and gershayim auto-repair recursion before deciding navigate vs search.
- In Voices, refs typed in the header **search** rather than navigate (refs are not allowed).
- After submit or navigate, the header input is cleared.
- Query max length is 75 in all inputs. The backend completer ignores inputs of 200+ characters and skips autocorrect at 20+.
- Wrong-keyboard swap only when the first language returns nothing.
- Same query resubmitted from the in-page bar is a no-op.
- Invalid `search_tab` falls back to Sources and the history entry is replaced.
- The deep-link filter two-phase query.
- A new query resets text filters (but not sort or field) and book category filters.
- Orphan filters are tracked but not displayed.
- Hebrew text in the filter search box matches everything (§0.12).
- Sheet `normalizeHitsMetaData` assumes `highlight.content` exists.
- `bookHitCardProps` flat-row href assumes `title_en` exists.
- Dicta merge only for non-exact Hebrew. A Dicta outage falls back silently after a 3 s timeout on `/books`.
- Error UI is indistinguishable from "no results" (§0.13). Next-page failure can stall scrolling.
- Sources infinite scroll is uncapped past ES's 10k window (§0.14).
- Sheet date is always formatted `en-US`.
- `/search` without `q` shows no results body.
- `openURL` does not handle `/search`, so links to it do a full reload.
