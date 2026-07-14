# JavaScript Data & Utility Layer
> Sources: `static/js/sefaria/sefaria.js` (~4011 lines), `static/js/sefaria/util.js` (~1551 lines), `static/js/sefaria/strings.js` (~853 lines), `static/js/sefaria/hebrew.js`, `static/js/sefaria/search.js`, `static/js/sefaria/searchState.js`

## Purpose
The `static/js/sefaria/` directory contains the client-side data layer -- the JavaScript equivalent of the Python model layer. The central `Sefaria` object is a global singleton (attached to `window.Sefaria`) that serves as:
- An API client for all backend endpoints
- A client-side cache for texts, refs, versions, links, topics, sheets, collections, and more
- A ref parser and normalizer (mirroring Python's `Ref` class)
- A utility namespace aggregating Hebrew processing, string translation, tracking, and general utilities

## Key Components

### `sefaria.js` -- The `Sefaria` Namespace Object

**Initialization flow:**
1. Module defines `Sefaria` with defaults (`toc: []`, `books: []`, `booksDict: {}`, etc.)
2. Extended via `Sefaria = extend(Sefaria, { ... })` with all methods
3. `Sefaria.setup()` runs immediately on import:
   - Loads `DJANGO_DATA_VARS` (server-side data)
   - Unpacks base props from `DJANGO_VARS.props`
   - Calls `setupPrototypes()` (adds helper methods to `Array.prototype`, `String.prototype`)
   - Builds `booksDict` from TOC, caches Hebrew terms, caches i18n strings
   - Initializes `Sefaria.search` as a `Search` instance
4. `Sefaria.unpackDataFromProps(props)` runs before React render (called from `client.jsx`):
   - Iterates `props.initialPanels`, caching text content, versions, index details, sheets
   - Caches collection data, topic data, translation data
   - Calls `Sefaria.getBackgroundData()` to fetch additional data from `/api/background-data`

**Ref handling (oldest code in the codebase):**
- `parseRef(q)` -- client-side ref parsing without server round-trip. Depends on `booksDict`. Returns `{book, index, sections, toSections, ref}` or `{error}`. Results are cached in `_parseRef`.
- `makeRef(q)` -- reverse of `parseRef`; builds a URL-formatted ref string from a parsed ref object
- `normRef(ref)` -- normalizes a ref string (underscores for spaces, dots for section separators)
- `humanRef(ref)` -- returns human-readable ref (spaces, colons)
- `splitRangingRef(ref)` -- expands "Genesis 1:1-3" into `["Genesis 1:1", "Genesis 1:2", "Genesis 1:3"]`
- `refContains(ref1, ref2)` -- checks if ref1 contains ref2
- `sectionRef(ref)` -- returns the section-level ref
- `isRef(ref)`, `isSheetRef(ref)` -- ref type checks

**Text data API & caching:**
- `_texts` -- primary cache keyed by ref+version settings
- `_refmap` -- maps simple ref keys to versioned cache keys
- `getText(ref, settings)` -- returns a Promise. Checks `_texts` cache first; on miss, fetches from `/api/v3/texts/{ref}` (via `_textUrl`). Saves result with `_saveText`.
- `getTextFromCache(ref, settings)` -- synchronous cache lookup
- `getTextFromCurrVersions(ref, currVersions, translationLangPref, addTranslationLanguagePreference)` -- fetches text with specific version preferences
- `_complete_text_settings(s)` -- fills in default settings (commentary, context, pad, versions, wrapLinks, etc.)
- `_saveText(data, settings)` -- stores text data in cache with multiple key variants
- `makeSegments(data)` -- converts raw text data into an array of segment objects with `ref`, `en`, `he`, `number`

**Other data caches (all follow the get/cache pattern):**
- `_versions`, `_saveVersions()`, `_makeVersions()` -- text version metadata
- `_links`, `_linkSummaries` -- inter-text links
- `_index`, `_indexDetails` -- book index metadata
- `_topics`, `_topicList` -- topic data
- `_collections`, `_collectionsList` -- user/public collections
- `_related`, `_relatedPrivate` -- related content
- `_manuscripts` -- manuscript images
- `_webpages`, `_processedWebpages` -- external web page references
- `_lexiconLookups`, `_lexiconCompletions` -- dictionary data
- `sheets._loadSheetByID`, `sheets._userSheets`, etc. -- sheet data
- `_profiles` -- user profile data

**API pattern:**
- `_ApiPromise(url)` -- wraps fetch/AJAX calls with caching, returns a Promise
- Most getters follow: check cache -> return cached -> fetch from API -> save to cache -> return

**SSR/cache reset:**
- `resetCache()` -- clears all `_` prefixed caches. Used in server-side rendering contexts to prevent cross-request data leaks.

**Attached sub-modules:**
```
Sefaria.util    = Util;       // from util.js
Sefaria.hebrew  = Hebrew;     // from hebrew.js
Sefaria.track   = Track;      // from track.js (analytics)
Sefaria.palette = palette;    // from palette.js (category colors)
Sefaria.search  = new Search(...);  // from search.js
```
Strings from `strings.js` are merged directly into Sefaria via `Sefaria = extend(Sefaria, Strings)`.

### `util.js` -- The `Util` Class (~1551 lines)

A static utility class. Key methods:

**DOM & UI:**
- `scrollIntoViewIfNeeded(target, options)` -- scrolls element into viewport if not visible
- `selectElementContents(el)` -- selects text in an element for copy

**URL & Version handling:**
- `encodeVtitle(vtitle)` / `decodeVtitle(vtitle)` -- encode/decode version titles for URLs
- `getUrlVersionsParams(currVersions, i)` -- builds URL query params for version selection

**Date & Time:**
- `localeDate(dateString)` -- locale-aware date formatting (en-US or he-Hebr-IL)
- `createTimeZoneAgnosticDate(dateString)` -- parses date string to noon UTC to avoid timezone shifts
- `hebrewCalendarDateStr(dateObjStr)` -- Gregorian to Hebrew calendar date using `@hebcal/core`
- `naturalTime(timeStamp)` -- "3 hours ago" style relative time strings using `humanize-duration`
- `epoch_time()` -- current epoch time in UTC

**Data manipulation:**
- `clone(obj, prepareForSerialization)` -- deep clone that handles `Date`, `Array`, `Object`, and objects with `.clone()` methods (like `SearchState`, `FilterNode`)
- `throttle(func, limit)` -- function throttling
- `zip(...rows)` -- Python-style zip for arrays
- `object_equals(a, b)` -- shallow object equality

**Text processing:**
- `htmlToText(html)` -- strips HTML preserving basic structure
- `cleanHTML(html)` -- sanitizes HTML with allowed tags/attributes list
- `stripImgs(s)` -- removes `<img>` tags from HTML

**Prototype extensions** (via `setupPrototypes()`):
- `String.prototype.toFirstCapital()` -- capitalizes first letter
- `String.prototype.stripHtml()` -- removes HTML tags
- `String.prototype.escapeHtml()` -- escapes HTML entities
- `Array.prototype.compare(other)` -- element-wise array comparison
- `Array.prototype.elementsAreEqual(other)` -- checks if arrays have the same elements
- `Array.prototype.toggle(item)` -- adds or removes an item
- `Array.prototype.move(from, to)` -- moves element within array
- `RegExp.escape(s)` -- escapes special regex characters

**Ref input widget** (`Util.RefValidator`):
A jQuery-based ref input validator that uses `Sefaria.getName()` for autocomplete and validation. Provides real-time feedback on ref validity with completion messages.

### `strings.js` -- UI String Translation (~853 lines)

Exports a `Strings` object with two main dictionaries:

- `_i18nInterfaceStrings` -- flat English-to-Hebrew mapping for UI strings (~500+ entries). Covers navigation, menus, buttons, tooltips, error messages, landing page copy, etc.
- `_i18nInterfaceStringsWithContext` -- context-specific translations where the same English string needs different Hebrew translations depending on where it appears (e.g., "Recent" in topic sorting vs. sheet sorting)

**Translation function** (on `Sefaria`):
- `Sefaria._(inputStr, context)` -- the main i18n function. If `interfaceLang` is not English, looks up translation via `Sefaria.translation()`. Falls back through: context-specific strings -> global strings -> Hebrew terms -> index titles -> pipe-separated compound strings -> original string.
- `Sefaria._v(langOptions)` -- takes `{en: "...", he: "..."}` and returns the correct one for current interface language
- `Sefaria._r(inputRef)` -- returns Hebrew or English ref based on interface language

### `hebrew.js` -- Hebrew Text Processing

A static class for Hebrew numeral encoding/decoding, gematria, and Talmud-specific formatting:

- `decodeHebrewNumeral(h)` -- Hebrew numeral string to integer
- `encodeHebrewNumeral(n)` -- integer to Hebrew numeral string (with proper geresh/gershayim punctuation)
- `breakIntMagnitudes(n, start)` -- decomposes integer into magnitude components for Hebrew numeral construction
- `sanitize(inputString, punctuation)` -- applies Hebrew numeral sanitization rules (e.g., yud-heh -> tet-vav for 15)
- `intToDaf(n)` / `dafToInt(daf)` -- convert between integer and Talmud daf notation (e.g., 3 <-> "2a")
- `encodeHebrewDaf(daf)` -- Hebrew daf notation (e.g., "ב.")
- `intToFolio(n)` / `encodeHebrewFolio(folio)` -- folio notation for manuscripts

### `search.js` -- Search Query Builder

The `Search` class manages dual-source search (Sefaria Elasticsearch + Dicta external search):

- `sefariaQuery(args, isQueryStart, wrapper)` -- sends search queries to `/api/search-wrapper/es8`. Caches results. Accumulates hits in `sefariaQueryQueue` for paginated loading.
- `dictaQuery(args, isQueryStart, wrapper)` -- sends parallel queries to Dicta's search service (`https://sefaria.loadbalancer.dicta.org.il/search`). Adapts Dicta's response format to match Sefaria's hit format (adding `_source`, `highlight`, `score`, `comp_date`, `cameFrom: 'dicta'`).
- `dictaBooksQuery(args, wrapper)` -- fetches book-level counts from Dicta for filter aggregations
- `get_query_object(args)` -- builds the Elasticsearch query object with filters, aggregations, sort, and field selection
- `reformatDictaRef(ref)` -- converts Dicta's ref format (`תנ"ך/נביאים/ספר זכריה/פרק א/פסוק א`) to Sefaria's Hebrew ref format
- `cache(key, result)` -- simple in-memory result cache
- `HackyQueryAborter` -- manages aborting in-flight AJAX requests when new queries supersede old ones

### `searchState.js` -- Search State Management

An immutable-style state class for search parameters:

- Properties: `type` (text/sheet), `appliedFilters`, `appliedFilterAggTypes`, `availableFilters` (array of `FilterNode`), `filterRegistry`, `filtersValid`, `field` (exact/broad), `sortType`
- `clone(prepareForSerialization)` -- deep clone for history state serialization
- `update({...})` -- returns a new `SearchState` with specified fields changed (immutable update pattern)
- `isEqual({other, fields})` -- compares specific fields between two SearchState instances
- `makeURL({prefix, isStart})` -- serializes state to URL query parameters for browser history
- `SearchState.metadataByType` -- static config defining field names, aggregation types, and sort options for "text" vs "sheet" search types
- `SearchState.moduleToSearchType(active_module)` -- maps the active Sefaria module ("library"/"voices") to search type ("text"/"sheet")

## Non-Obvious Patterns

- **`Sefaria` is not a class -- it's a plain object extended repeatedly.** The pattern `Sefaria = extend(Sefaria, { ... })` is used to add methods/properties. The Strings module is also merged in via `extend`. This means all translation methods (from `strings.js`) are directly on the `Sefaria` object.
- **Dual underscore convention**: properties starting with `_` (e.g., `_texts`, `_links`, `_uid`) are caches or internal data. Methods starting with `_` are internal helpers. But `Sefaria._uid`, `Sefaria._email` are user identity data set from Django props.
- **`Sefaria.setup()` runs at import time.** Any module that imports `sefaria.js` triggers setup. This is safe because setup reads from globals that are already set by Django template `<script>` tags that execute before the bundle.
- **Prototype pollution is intentional**: `setupPrototypes()` adds methods to `String.prototype`, `Array.prototype`, and `RegExp`. This is used throughout the codebase (e.g., `"some string".toFirstCapital()`, `[1,2,3].compare([1,2,3])`).
- **Version handling is complex**: versions have both old-style (`enVersion`/`heVersion` as strings) and new-style (`currVersions` as `{en: {...}, he: {...}}` objects) representations. `_makeVersions()` and `_saveVersions()` handle normalization.
- **`resetCache()` exists for SSR**: when Node.js runs the app server-side, the `Sefaria` singleton persists between requests. `resetCache()` clears user-specific and request-specific caches to prevent data leaks.
- **Search merges two sources**: results from Sefaria's Elasticsearch and Dicta's search service are interleaved. Dicta results are transformed to match Sefaria's hit format, with `cameFrom: 'dicta'` or `cameFrom: 'Sefaria'` markers.

## Relationships

- **`sefaria.js` is the hub**: every React component imports it. It aggregates `util.js`, `hebrew.js`, `strings.js`, `search.js`, `track.js`, and `palette.js` as sub-namespaces.
- **`search.js` depends on `searchState.js`**: `SearchState` objects are passed as arguments to search methods and stored in panel state.
- **`searchState.js` depends on `FilterNode`** (`sefaria/FilterNode.js`): the `availableFilters` array contains `FilterNode` instances representing the hierarchical filter tree.
- **`util.js` depends on `sefaria.js`** (circular): `Util` references `Sefaria.interfaceLang` for locale-aware formatting. The circular dependency works because both are loaded before any methods are called.
- **`strings.js` depends on `sefaria.js`** (circular): same pattern -- it references `Sefaria` for interface language. Merged into `Sefaria` via `extend`.
- **Django views are the data source**: all cached data originates from Django template variables (`DJANGO_VARS`, `DJANGO_DATA_VARS`) or API endpoints (`/api/texts/`, `/api/v3/texts/`, `/api/search-wrapper/`, `/api/background-data`, etc.).

## Common Tasks

**Adding a new API data getter:**
1. Add a cache: `Sefaria._myData = {};`
2. Add a getter method on the `Sefaria` object:
   ```javascript
   Sefaria.getMyData = function(key) {
     if (key in Sefaria._myData) { return Promise.resolve(Sefaria._myData[key]); }
     return Sefaria._ApiPromise(`/api/my-data/${key}`)
       .then(data => { Sefaria._myData[key] = data; return data; });
   };
   ```
3. If the data should be SSR-hydrated, also handle it in `unpackDataFromProps()` and include it in `resetCache()`

**Adding a new translatable UI string:**
1. Add the English key and Hebrew value to `_i18nInterfaceStrings` in `strings.js`
2. Use `Sefaria._("Your English String")` in component code
3. For context-dependent translations, add to `_i18nInterfaceStringsWithContext` under the component name key, and call `Sefaria._("String", "ComponentName")`

**Adding a new Hebrew numeral format:**
1. Add encoding/decoding methods to `Hebrew` class in `hebrew.js`
2. If it's an address type used in book tables of contents, also handle it in `Sefaria.getSectionStringByAddressType()` in `sefaria.js`

**Debugging data issues:**
- Open browser console and inspect `window.Sefaria` directly
- Check caches: `Sefaria._texts`, `Sefaria._index`, `Sefaria._topics`, etc.
- Test ref parsing: `Sefaria.parseRef("Genesis 1:1")`
- Check version data: `Sefaria._versions`
