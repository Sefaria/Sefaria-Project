# Inventory 03 — Reader Text Rendering & Text-Type Special Cases

Scope: how text is fetched, shaped and rendered in the reader (`TextColumn` → `TextRange` → `TextSegment` → `VersionContent`/`ContentSpan`), every display setting, and every special case keyed by category / title / address type. Repo: `/Users/akiva/Sefaria/dev/Sefaria-Project` (master @ bb47dd77a). All paths relative to repo root.

---

## 0. Surprising findings / dead code / bugs worth knowing before a rewrite

1. **Poetry formatting is effectively dead in the reader.** `TextRange` reads `data.formatEnAsPoetry` / `data.formatHeAsPoetry` (static/js/TextRange.jsx:254-255, 586-587), but the v3 texts API (`TextRequestAdapter`, sefaria/model/text_request_adapter.py) never sets those top-level keys. They were produced only by the legacy `TextFamily` (sefaria/model/legacy_text.py:678-681, from Version attr `formatAsPoetry`, text.py:1357). In v3 the flag survives only as `versions[i].formatAsPoetry`, which the client ignores. The CSS (`.poetry.indentWhenWrap`, `.indentAll`, `.indentAllDouble`, s2.css:6993-7018) and copy-handler cleanup (ReaderApp.jsx:2271-2275) still exist. Comment says it was set up for the Fox translation.
2. **`prefetchMultiple`** (TextColumn.jsx:466, 20 for dictionaries) is passed but never read by `TextRange`.
3. **`showActionLinks`** renders an undefined `actionLinks` variable (TextRange.jsx:393). It would throw if anyone set it. CSS `.textRange .actionLinks` (s2.css:7650-7677) is legacy.
4. **Color themes (light/sepia/dark)** are fully styled (`.readerPanel.sepia/.dark`, s2.css:1346-1354, 7153, 7175-7180, etc.) and stored as a setting/cookie (`color`, ReaderApp.jsx:990; reader/views.py:362), but `ReaderDisplayOptionsMenu` has no control for them. Only a pre-existing cookie can turn them on.
5. **`_makeV3VersionsUrlCacheKey`** calls `versions.map(...)` and throws away the result (sefaria.js:660-663). The SSR-seeded cache key may not match the client's own request URL, so the first client fetch can miss the cache.
6. **`_adaptApiResponse` heSources condition looks inverted.** `sources` is set when translation sources *differ*, but `heSources` is set when primary sources are all the *same* (sefaria.js:773-778).
7. **Vowel/cantillation stripping is gated on the first segment.** If segment 0's Hebrew has no vowels (for example it is empty), stripping is turned off for the whole section (TextRange.jsx:278-280). The regexes also carry the `/g` flag and are used with `.test()`, so `lastIndex` is stateful.
8. **Client `parseRef` accepts only `\d+[ab]?` addresses** (sefaria.js:92). Folio addresses with `c`/`d` (`intToFolio`) fail parsing with "Bad section string". `refContains` converts only a/b dafs (sefaria.js:252).
9. **Lexicon in multipanel only works if a connections panel is already open.** `ReaderApp.setSelectedWords` writes only to panel n+1, and only if that panel exists and is not a menu (ReaderApp.jsx:1935-1942).
10. **The language toggle in the display menu is shown only when the text lacks Hebrew or English, unless `TORAH_SPECIFIC`** (ReaderDisplayOptionsMenu.jsx:27-33). This looks inverted but is the current behavior (TORAH_SPECIFIC is true on sefaria.org, so it is always shown there).
11. **Turning vowels back on sets `partial`, not `all`** (ReaderDisplayOptionsMenu.jsx:76-79). Cantillation must then be re-enabled separately.
12. `InfiniteScroll.jsx` is **not** the reader's infinite scroll. It is the search-results loader (`.content` scroll, 300px margin). The reader's up/down section loading lives in `TextColumn`.
13. There is **no "missing translation" notice** in the reader. When English is chosen and a segment has no translation, the primary text is shown (`heOnly` class). The v3 API's `warnings` (api/views.py:46-61) are ignored by the client.
14. Copy does **not** append a citation. The custom copy handler only cleans up HTML/text (ReaderApp.jsx:2239-2333).

---

## 1. Component pipeline

| Layer | File | Role |
|---|---|---|
| `ReaderPanel` | static/js/ReaderPanel.jsx:754-795 | Builds `TextColumn` for modes `Text` / `TextAndConnections`. Passes settings, highlight, filter, callbacks. Provides `ReaderPanelContext` (language, layout, panelMode, textsData, aliyot/vowels/punctuation state, width, panelPosition) at 735-749. |
| `TextColumn` | static/js/TextColumn.jsx | The scroll container. One `TextRange` per section ref in `srefs`. Handles infinite scroll, scroll-to-highlight, tracking the currently visible ref, text selection, the book-title header and loading placeholders. |
| `TextRange` | static/js/TextRange.jsx:14-398 | Fetches data for one ref (`Sefaria.getTextFromCurrVersions`), normalizes/redirects the ref, prefetches, builds segments, strips vowels/punctuation, adds parashah headers, positions segment numbers and link dots, renders the section title. |
| `TextSegment` | static/js/TextRange.jsx:438-667 | One segment `<div class="segment">`: segment number, link-count dot, `<p class="segmentText">` with `VersionContent`. Handles itag formatting, search highlights, poetry spans, all click routing. |
| `VersionContent` / `VersionImageSpan` / `ContentSpan` | static/js/ContentText.jsx:22-100 | Renders the primary and translation spans (`contentSpan he|en primary|translation`, raw HTML via `dangerouslySetInnerHTML`), or full-segment images. |
| `ContentText` | static/js/ContentText.jsx:7-20, 71-91 | Generic bilingual content renderer, filtered by content language (`useContentLang`, static/js/Hooks.jsx:7-27). Used for titles, numbers and headers. |
| `TextColumnBannerChooser` | static/js/TextColumnBanner.jsx | Banners shown above the text column (rendered from `ReaderControls`, ReaderPanel.jsx:1480-1487). |

Other `TextRange` consumers (non-basetext): `TextList` (connections; `numberLabel`, `inlineReference`, `textHighlights`, `filterRef`, TextList.jsx:162-173), `VersionsTextList` (`useVersionLanguage`, VersionsTextList.jsx:74-83), `MyNotesPanel` (128), `GuideBox` (192).

---

## 2. Data fetching & shaping (client)

### 2.1 Main fetch: `Sefaria.getTextFromCurrVersions(ref, currVersions, translationLanguagePreference, withContext)` (sefaria.js:830-847)
- Calls `_getPrimaryAndTranslationText` → `_getVersionObjects` → `getTextsFromAPIV3` with `fill_in_missing_segments=1` and `return_format=wrap_all_entities`, then `_adaptApiResponse`.
- **withContext and a segment ref**: refetches the section ref and replaces `text`, `he` and `alts` with section-level arrays. All other metadata (ref, sections, highlight) stays segment-level (835-845).
- Saves the result into the legacy text cache via `_saveText(data)` (846).

### 2.2 Version selection: `_getVersionObjects` (sefaria.js:790-822)
- Loads every version for the ref (`getVersions` → `/api/texts/versions/<ref>`, 931-945).
- **Primary**: the highest-`priority` version with `isPrimary: true` matching `currVersions.he` (languageFamilyName / versionTitle). Falls back to `{languageFamilyName:'primary'}`.
- **Translation**: if `currVersions.en.versionTitle` is set, it must match a version with `isSource:false`. Otherwise the fallbacks run in this order:
  1. The user's per-corpus version preference (`Sefaria.versionPreferences.getVersionPref(ref).en`, VersionPreferences.js:9-18).
  2. `translationLanguagePreference` (an ISO code bucket): the highest-priority non-source version in that bucket.
  3. `{languageFamilyName:'translation'}`, which makes the server pick the highest-priority non-source version.
- `_findInVersions` picks the highest `priority` among matches (778-789).
- The setting `setVersionPreference` (1114-1122) records only `en` (translation) preferences per corpus and saves them to the profile.

### 2.3 v3 URL: `makeUrlForAPIV3Text` (sefaria.js:632-647)
`/api/v3/texts/<normRef>?version=<lang|vtitle>&version=...&fill_in_missing_segments=1&return_format=wrap_all_entities[&debug_mode=linker]`. Version params are sorted. The response is cached in `_textsStore` keyed by URL (`_cachedApiPromise`). `_buildLinkerOutputMap` runs when the response carries `linker_output` (debug mode).

### 2.4 `_adaptApiResponse` (sefaria.js:762-777) maps v3 to legacy fields
- `getPrimaryAndTranslationFromVersions` (750-761): with a single version, translation = `{text: []}`. If `versions[0].isPrimary && !versions[1].isSource`, the order is [primary, translation]; otherwise it is swapped.
- Translation → `text`, `versionTitle`, `translationDirection`, `translationLang`, `versionStatus`.
- Primary → `he`, `heVersionTitle`, `primaryDirection`, `primaryLang`, `heVersionStatus`.
- `sources` / `heSources` mark merged versions (see §0.6). `ReaderControls.loadTranslations` hides the version title when `data.sources` is set ("merged version from API", ReaderPanel.jsx:1335-1349). `BookPage` sets `currentVersion.merged = !!sources` (BookPage.jsx:123-134).

### 2.5 Legacy text cache (`_texts`, `_refmap`)
- `_saveText` (sefaria.js:1207-1257) stores by key `_textKey` (ref + ven/vhe + transLangPref + FALLBACK + `|CONTEXT`).
  - Section-level data is split into per-segment cache entries (`_splitTextSection`, 1263-1333). Each entry carries `nextSegment`/`prevSegment` and a `buildable` "Add Context" placeholder.
  - Context saves a section-level copy.
  - Spanning refs prime every spanning section via `getText`.
- **Super-sections** (textDepth = sections+2, e.g. a commentary chapter): `_splitTextSection` computes `next`/`prev` per child section so empty sub-sections are skipped (1293-1307).
- `index_offsets_by_depth` (`_get_offsets`, 1258-1262) lets numbering start at an offset rather than 1. It is used in segment numbering and splitting.
- `getRefFromCache` / `Sefaria.ref(ref)` (1488-1506) is a **cache-only** synchronous lookup. Infinite scroll depends on it, so only prefetched neighbors chain.
- `getRef` (1494-1500) is the promise form, through `getTextFromCurrVersions`.
- SSR seeding: `Sefaria.unpackDataFromProps` (sefaria.js:3953-3970) puts each SSR panel's `text` into `_textsStore` and `_saveText` (context=1), saves `available_versions`, and stores `indexDetails` and sheet data.

### 2.6 `Sefaria.makeSegments(data, withContext)` (sefaria.js:2481-2547)
- Pads `text` and `he` to equal length. Segment numbers start at `sections[-1]` for a segment ref without context, otherwise at `1 + offset`.
- Ref per segment: `sectionRef + (textDepth==1 ? " " : ":") + number`.
- `highlight`: true when the ref is segment-level and the number falls in `[sections[-1], toSections[-1]]`.
- `alt`: per-segment alt-struct marker (`data.alts[i]`), used for parashah/aliyah headers.
- **Spanning data**: iterates sections. Talmud sections are computed as `intToDaf(n + dafToInt(startSection))` when the start section is a string (daf). Highlight covers the first section from its start, middle sections fully, and the last section to its end.
- `stripImagesFromSegments` (2548-2555) is used by the sheet editors only.

### 2.7 Section titles: `Sefaria.sectionString(ref)` (sefaria.js:2556-2602)
Returns `{en:{named, numbered}, he:{named, numbered}}`.
- English `named` prepends `sectionNames[0]` when depth > 1 (e.g. "Chapter 4").
- Complex texts prepend the named node path ("Introduction, Chapter 2").
- Hebrew uses `heSectionRef` minus `heIndexTitle`. There are no Hebrew section names (commented out).

### 2.8 Ref helpers relevant to rendering
- `parseRef` (35-114): client parsing using `booksDict`.
  - Handles `Sheet`.
  - Handles `virtualBooks` (dictionary/lexicon titles; trailing number parsing; 61-70).
  - Requires a space after the book title ("Jobs" ≠ "Job").
  - Ranges with `-`.
  - Talmud `\d+[ab]`.
- `humanRef`, `normRef`, `makeRef`, `normRefList`, `joinRefList` (Hebrew via the cache), `refContains` (daf-aware), `splitRangingRef` (uses cached text when available), `zoomOutRef`, `sectionRef`.
- `getSectionStringByAddressType` (355-373), used by BookPage TOC:
  - `Talmud` → `intToDaf` / `encodeHebrewDaf`.
  - `Year` → `i + 1241`, Hebrew numeral with gershayim inserted.
  - `Folio` → `intToFolio` / `encodeHebrewFolio`.
  - Everything else → integer + 1 / Hebrew numeral.
- `isFullSegmentImage(text)` (1479-1487): `/^\s*<img\b[^>]*>\s*$/i`.
- `wrapRefLinks` / `makeRefRe` (381-429): legacy client-side citation wrapping into `<span class="refLink">`. Not used by the current reader (refs come pre-wrapped from the server).

---

## 3. Backend shaping

### 3.1 `/api/v3/texts/<tref>` (api/views.py:28-87)
- Params:
  - `version=` (repeatable, `lang|vtitle`; lang may be `primary` / `source` / `translation` / a language family / empty; vtitle may be `all`).
  - `fill_in_missing_segments`.
  - `return_format` ∈ `default | wrap_all_entities | text_only | strip_only_footnotes`.
  - `debug_mode`.
- Returns 404 for empty non-virtual refs.
- `warnings` entries: `APINoVersion` 101, `APINoLanguageVersion` 102, `APINoSourceText` 103, `APINoTranslationText` 104 (api/api_warnings.py).

### 3.2 `TextRequestAdapter` (sefaria/model/text_request_adapter.py)
- `get_versions_for_query` (339-348) applies `default_child_ref()` first. This handles **default nodes** of complex texts.
- Version resolution (`_append_required_versions`, 100-129):
  - An exact vtitle match is strict. Otherwise the max-priority version wins (`resolve_default_version`).
  - Duplicate versions are suppressed.
  - Unmatched requests go to `missings`.
- `_append_version` (68-98): builds a `TextChunk` with `merge_versions` limited to the same `languageFamilyName`. It attaches `sources` only when merging really drew from more than one version, and adds `firstSectionRef` for book-level refs. Each version carries every Version field (`direction`, `isPrimary`, `isSource`, `formatAsPoetry`, `shortVersionTitle`, `versionTitleInHebrew`, `status`, `license`, `priority`, `digitizedBySefaria`, `hasManuallyWrappedRefs`, `purchaseInformation*`, `extendedNotes*`, `versionNotes*`, …).
- Ref data (131-155): `ref`, `heRef`, `sections` and `toSections` (normalized **strings**), `sectionRef`, `heSectionRef`, `firstAvailableSectionRef`, `isSpanning`/`spanningRefs`, `next`/`prev` (section level), `title`, `book`, `heTitle`, `primary_category`, `type` (= primary_category).
- Index data (157-169): `indexTitle`, `categories`, `heIndexTitle`, `isComplex`, `isDependant`, `order`, `collectiveTitle`, `heCollectiveTitle`, `alts` (trimmed alt structs, see 3.3).
- Node data (171-187): `lengths`/`length`, `textDepth`, `sectionNames`, `addressTypes`, `heTitle`, `titleVariants`, `heTitleVariants`, `index_offsets_by_depth`.
- Top-level: `available_langs`, `available_versions` (used by `ReaderControls` for `shortVersionTitle`).
- `_format_text` (240-337):
  - `wrap_all_entities` applies **MarkedUpTextChunk** spans per segment (inline citations, named entities, categories).
  - `text_only` strips itags and HTML and collapses whitespace.
  - `strip_only_footnotes` strips itags and collapses whitespace.
- `_add_linker_output` (189-207): with `debug_mode=linker`, returns raw `LinkerOutput` records.

### 3.3 Alt structures → parashah/aliyah markers: `Index.get_trimmed_alt_structs_for_ref` (sefaria/model/text.py:431-492)
- Builds a jagged array mirroring the text. At each node start it sets `{en:[titles], he:[titles], whole:true}`.
- At each aliyah (`refs` of the node) it adds `aliyah_en/he` (from the `sectionString`, e.g. "Second"/"שני") and `parasha_en/he`. The Rishon (i==0) is not added to the title lists.
- The array covers **all** alt structs of the index, but the client renders headers only for Torah/Onkelos (§6.1).

### 3.4 Inline entity wrapping: `MarkedUpTextChunk` (sefaria/model/marked_up_text_chunk.py)
- `apply_spans_to_text` (160-191):
  - Inserts spans from the end of the string backwards.
  - Skips deleted spans (unless debug).
  - Clamps out-of-range spans.
  - **Skips a span if its text no longer matches the segment** (stale after an edit).
- `CitationMUTCSpan` (319-339) → `<a class="refLink" href=... data-ref=... data-range=a-b>`.
  - Uses the LLM-disambiguated ref when present.
  - **Book-level refs are left unlinked** in non-debug mode.
- `NamedEntityMUTCSpan` → `<a class="namedEntityLink" href="/topics/slug" data-slug=...>` (342-351).
- `CategoryMUTCSpan` → `<a class="categoryLink" href="/texts/path" data-category-path=...>` (354-363).
- Debug classes: `mutc spanDeleted|spanFailed|spanDisambiguated|spanAmbiguous|spanSucceeded` (301-312), styled at s2.css:7377-7407. They are added only when using the `LinkerOutput` class (`debug_mode=linker`).

### 3.5 Allowed inline HTML in stored text (sefaria/constants/model.py:1-12)
- Tags: `i b br u strong em big small img sup sub span a`.
- Attributes:
  - `sup[class]`
  - `span[class,dir]`
  - `i[data-overlay,data-value,data-commentator,data-order,class,data-label,dir]` — three uses: footnotes, commentary placement (itags) and structure overlays such as page transitions.
  - `img[src,alt]`
  - `a[dir,class,href,data-ref,data-ven,data-vhe,data-scroll-link]`.
- `AbstractTextRecord.strip_itags` removes footnotes, other itags and fn-markers (text.py:1281-1285). `remove_html` turns `<br>` into a space (1223-1241).

### 3.6 Merging: `merge_texts` (text.py:1674-1716)
Fills gaps segment by segment from the highest-priority non-empty version. It returns parallel `sources` arrays (one versionTitle per segment).

### 3.7 SSR panel: `reader/views.py`
- `catchall` (489-523):
  - Normalizes `ven`/`vhe` params (legacy title-only, partial matches) and redirects (`_get_normalized_versions`, 438-465).
  - Redirects to the canonical `oref.url()`.
  - Redirects non-library modules to library.
- `text_panels` (803-961): reads URL params per panel:
  - `vhe`, `ven`, `with` (connections filter; `all` → []), `lang`/`lang2`/`langN`, `aliyot`/`aliyotN` (1 → `aliyotOn`), `lookup` (selected words), `sbsq`, `namedEntity`, `namedEntityText`, `vside`, `notes`, and `pN/venN/vheN/wN` for extra panels.
  - Per-corpus version preference override applies only to panels 2+ (`override_version_with_preference`, 1098-1111).
- `make_panel_dict` (545-638):
  - Book-level refs → book TOC menu.
  - Otherwise the ref is replaced by `first_available_section_ref()`, spanning refs are split, and the server prefetches the section text with `TextRequestAdapter(..., return_format='wrap_all_entities')`. **No merging on SSR** (`fill_in_missing_segments` uses the constructor default True? — it is passed positionally as `return_format`… see call at 615: `TextRequestAdapter(oref.section_ref(), [primary, translation], return_format=...)`, so fill_in defaults to True).
  - The result is mapped to `he`/`text` (618-629).
  - `updateFromAPI: True` is set so the client refetches.
  - **Torah special case**: `categories == ["Tanakh","Torah"]` → `panel.indexDetails` included "for Torah Parashah titles rendered in text" (632-633).
  - Segment-level or range refs → `highlightedRefs` = each segment.
- Meta description uses the first section's segment text, truncated to 160 chars (931-946, `_reduce_ranged_ref_text_to_first_section` 964).
- Initial settings from cookies (`base_props`, reader/views.py:353-364):
  - `language` comes from middleware `contentLang`: `?lang` → cookie `contentLang` → default (hebrew interface → hebrew, else bilingual). Non-TORAH_SPECIFIC sites are forced to english (sefaria/system/middleware.py:151-162).
  - `layoutDefault` segmented, `layoutTalmud` continuous, `layoutTanakh` segmented, `aliyotTorah` aliyotOff, `vowels` all, `punctuationTalmud` punctuationOn, `biLayout` stacked, `color` light, `fontSize` 62.5.

---

## 4. Display settings (per panel)

Defaults: ReaderApp.jsx:976-993 (client fallback) and reader/views.py:353-364 (SSR). Settings are persisted as cookies on every change (`setOption`, ReaderPanel.jsx:530-549). `language` also writes the `contentLang` cookie and `setDefaultOption` (the app-wide default for new panels).

| Setting | Values | Where applied |
|---|---|---|
| `language` | `hebrew` (= "Source"/primary), `english` (= "Translation"), `bilingual` | Panel class (ReaderPanel.jsx:1157), `TextSegment` primary/translation visibility (TextRange.jsx:629-638), CSS |
| `layoutDefault` / `layoutTanakh` / `layoutTalmud` | `segmented` / `continuous` | Chosen by `getLayoutCategory()`: primary_category Tanakh → layoutTanakh, Talmud → layoutTalmud, else layoutDefault (ReaderPanel.jsx:526-529) |
| `biLayout` | `stacked` / `heLeft` / `heRight` | Used when language is bilingual **and panel width > 500**, else forced `stacked` (ReaderPanel.jsx:637-645) |
| `aliyotTorah` | `aliyotOn` / `aliyotOff` | Parashah/aliyah headers (TextRange.jsx:288-301) |
| `vowels` | `all` / `partial` (no cantillation) / `none` | Stripping (TextRange.jsx:268-280, 302-306) |
| `punctuationTalmud` | `punctuationOn` / `punctuationOff` | Talmud punctuation stripping (TextRange.jsx:262-267, 307-309) |
| `fontSize` | number (%), default 62.5. "smaller"/"larger" divide or multiply by 1.15 | Inline `style.fontSize` on `.readerContent` (ReaderPanel.jsx:735, 1238) |
| `color` | `light` / `sepia` / `dark` | Panel class only. No UI (§0.4) |

- **Connections panel** is always rendered `segmented` (ReaderPanel.jsx:641-642).
- Content-language override (ReaderPanel.jsx:145-161): menus and connections panels are mono-lingual (bilingual becomes english in the English interface; always hebrew in the Hebrew interface). Topics/calendars/collections are bilingual (English UI) or hebrew.
- Panel CSS classes:
  - `readerPanel serif narrowColumn(width<730) <language> <layout> <color>`.
  - Plus the shown text's direction (`rtl`/`ltr`) when not bilingual, or when there is no translation (ReaderPanel.jsx:1156-1166).
- **Auto biLayout switch**: in side-by-side mode, when primary and translation share a direction (e.g. a Hebrew translation of an Aramaic text, or Arabic), `biLayout` is set to `heRight` (rtl) or `heLeft` (ltr) (ReaderPanel.jsx:113-128).
- URL encoding (ReaderApp.jsx:766, 793-817):
  - `lang=he|en|bi`.
  - `aliyot=0|1` added only when `Sefaria.titleIsTorah` matches `^(Genesis|Exodus|Leviticus|Numbers|Deuteronomy)` (sefaria.js:1450-1453; ReaderApp.jsx:686-688, 748-750).
  - `openURL` with `lang` param overrides the default content language (ReaderApp.jsx:1368-1372).
- Panel language inferred from versions in the URL: if only `vhe` → hebrew, only `ven` → english, both → bilingual (ReaderApp.jsx:98-105).

### 4.1 Display options menu (static/js/ReaderDisplayOptionsMenu.jsx)
- **Source / Translation / Source with Translation** radio buttons (SourceTranslationsButtons.jsx). The bilingual option is hidden in side panels.
  - Visible only if `TORAH_SPECIFIC`, or if the text lacks either `he` or `text` (27-33).
- **Layout** radio group (LayoutButtons.jsx):
  - State `mono` → [continuous, segmented].
  - `bi-rtl` → [stacked, heRight].
  - `bi-ltr` → [stacked, heLeft].
  - `mixed` (directions differ, or a sheet) → [stacked, heLeft, heRight] (constants.js:1-13).
  - Icons come from `/static/icons/{state}-{option}.svg`. Mixed icons encode the direction order (`mixed-beside-rtlltr.svg` etc.).
  - Labels: "show text as a paragraph", "segmented", "stacked", "RTL right of LTR", "RTL left of LTR".
  - Hidden when width ≤ 600 and bilingual, or on a sheet that is not bilingual (44-47).
- **Aliyot** toggle: only for `textsData.book` ∈ {Genesis, Exodus, Leviticus, Numbers, Deuteronomy, Onkelos Genesis…Onkelos Deuteronomy} and not on sheets (49-55).
- **Font size** − / + buttons (FontSizeButton.jsx).
- **Vowels** toggle: shown if the first sample of `he` (when showing primary) or `text` (when showing translation) matches `[\u05b0-\u05c3\u05c7]`. On → `partial`, off → `none` (71-79).
- **Cantillation** toggle: shown if the sample matches `[\u0591-\u05af]`. Disabled while vowels are off. Toggles `partial` ↔ `all` (81-90).
- **Punctuation** toggle: only when `primary_category === "Talmud"` and primary is shown (91-98).
- Side panels (non-Text, non-Sheet) show only the language buttons.
- a11y: focus trap, arrow keys reserved for the radios, Escape closes.

---

## 5. Rendering mechanics

### 5.1 TextColumn (static/js/TextColumn.jsx)
- **Scroll container**:
  - Desktop (multiPanel): `.textColumn` itself scrolls.
  - Mobile (singlePanel): the **window/document** scrolls, so mobile browser chrome collapses (49-74; CSS s2.css:16951-16960).
- **Placeholders** (render 485-508), rendered only after mount to avoid SSR layout shift (33-35):
  - Top: if the first section has no `prev` → a `bookMetaDataBox` with the book title (en/he, `role=heading` level 1). Otherwise `LoadingMessage.base.prev`.
  - Bottom: `LoadingMessage.base.next` if there is a next section. Otherwise an empty `LoadingMessage.base.next.final`.
  - CSS sizing at s2.css:1238-1255. Consecutive loading `textRange`s are hidden (1253-1255).
- **Initial scroll** (`setInitialScrollPosition`, 208-224): scroll to the first `.segment.invisibleHighlight`, else to 90px (the placeholder height) so the user can scroll up.
- **scrollToHighlighted** (225-240): `top = highlighted.top + 90 + 30 − threshold` (threshold 140 multiPanel / 70 single). Focuses the highlighted segment only in the last panel.
- **componentDidUpdate triggers** (75-112):
  - Mobile connections opened → scroll to highlight.
  - New single ref outside the current refs → fresh open.
  - Changed highlight (same ref count) → scroll.
  - Changed language or versions → scroll to highlight without stealing focus.
  - Width changed → restore scroll by percentage.
- **Infinite scroll** (`adjustInfiniteScroll`, 293-319):
  - Up when `scrollTop < 75`. Down when the last section's bottom < viewport height + 80.
  - `handleTextLoad` triggers down-only checks (a short section shows white space below).
  - Up: prepends `prev` plus up to 10 earlier cached sections (`buildPreviousRefs`, 341-361). Down: appends up to 10 cached next sections (383-403).
  - After a top load, the scroll position is restored so content does not jump (`restoreScrollPositionAfterTopLoad`, 241-269).
  - No adjustment runs while any `.basetext.loading` exists (176-178).
  - Refs are written via `ReaderPanel.updateTextColumn` (replaceHistory) (ReaderPanel.jsx:311-315).
- **Currently visible ref / highlight tracking** (`adjustHighlightedAndVisible`, debounced 100ms, 404-445):
  - Picks the first `.basetext .segment` whose bottom > `windowMiddle` (window height/2, or /4 in TextAndConnections) or whose top ≥ threshold. In keyboard tabbing mode (`body.user-is-tabbing`) the focused segment is used instead.
  - Sets `currentlyVisibleRef` to that segment's section (drives the URL and header).
  - Sets the TextList highlight to the segment. The highlight is visible only if the panel has a sidebar or is in TextAndConnections.
  - Records `prevScrollPercentage`.
  - A programmatic scroll sets `justScrolled` so `handleScroll` ignores it.
- **Text selection** (`handleTextSelection` on mouseup, 142-170):
  - Finds the `.segment`s spanned by the selection and highlights those refs.
  - Computes `getNormalizedSelectionString` (util.js:1202-1236). This removes `.segmentNumber`, `.titleBox` and the hidden-language spans depending on the panel's hebrew/english class.
  - Calls `setSelectedWords`, which opens the Lexicon (§7.4).
- **Double-click guard** (`handleClick`/`handleDoubleClick`, 128-140): on mousedown with `detail > 1` at a different position than the last click, default is prevented (avoids accidental multi-click selection).
- **Dictionary mode**: `isDictionary = categories[0] === "Reference"` → `hideTitle` (no section title) (448-466).
- Analytics: `gtag select_content` with `content_type = primary_category` on mount (37-41).
- **isCurrentlyVisible** is passed per TextRange.

### 5.2 TextRange (static/js/TextRange.jsx)
- **shouldComponentUpdate** (34-60) re-renders on changes to: sref, filter, highlightedRefs, versions, translation preference, showHighlight, language, layouts, aliyot, vowels, biLayout, fontSize, punctuation, layoutWidth, data.
- **Load handling** (`onTextLoad`, 106-145), for basetext:
  - (a) `sref !== data.ref` → replace with the normalized ref (no new history entry).
  - (b) Spanning → replace with `spanningRefs`.
  - (c) **Super-section** (`textDepth − sections.length > 1`) → redirect to `firstAvailableSectionRef`.
  - Then prefetch, place segment numbers and call `onTextLoad`.
  - If `filterRef` is set (a commentary ref opened), the matching `[data-ref]` element in the connections panel is scrolled into view.
- **Prefetch** (146-187):
  - Links for each section (`Sefaria.related`, plus `relatedPrivate` when logged in). Ranged refs are trimmed to the section.
  - `next` and `prev` section text with the same versions.
  - `getIndexDetails(indexTitle)` for the TOC.
- **Section title**:
  - `useShortString` for primary_category ∈ {Tanakh, Mishnah, Talmud, Tanaitic, Commentary} → numbered ("4", "2a", "ד", "ב.").
  - Other categories → named ("Chapter 4", "Introduction, Chapter 2").
  - Rendered as `.title > .titleBox[role=heading aria-level=2]`, bilingual titles default to the interface language (239-253).
  - Optional `titleButtons`.
  - Non-basetext title = full `ref` / `heRef`.
- **Segment numbers shown** (`showNumberLabel`, 256-260): hidden when `ref` starts with "Guide for the Perplexed", or `categories[0]` is "Liturgy" or "Reference". Shown only for basetext.
- **Segment-number placement** (`placeSegmentNumbers`, 188-226), jQuery:
  - Each `.segmentNumber` and `.linkCount` gets `top` = its parent segment's top. This matters for **continuous** layout, where segments are inline.
  - Collision fix: two numbers at the same top (both start on one line in continuous mode) are shifted apart by their widths, toward the reading side (right for hebrew, left otherwise).
  - Re-run on window resize, on layout/setting changes, after images load (`imageLoadCallback`), and after a footnote toggle.
- **Inline-reference number** (commentary in TextList, 351-379): if `inlineReference['data-commentator']` equals the index's `collectiveTitle` → `.numberLabel.itag` showing `data-label` or `data-order` (Hebrew numeral in he). Otherwise `numberLabel` (`anchorVerse`) is shown in Hebrew numerals.
- Classes: `textRange basetext loading lowlight`. `data-ref` = section ref (basetext with context) or ref. Click on a non-basetext range calls `onRangeClick`, unless a text selection is in progress (90-100).

### 5.3 TextSegment (static/js/TextRange.jsx:438-667)
- **Primary/translation visibility** (629-638):
  - Primary is shown if language ≠ english **or there is no translation**.
  - Translation is shown if language ≠ hebrew **or there is no primary** (e.g. VersionsTextList / "Translation Open").
  - Each side carries its own `direction` (from the version).
- **Direction classes** (589-602, 640-647):
  - `heOnly` when there is no translation and primary is rtl. `enOnly` when there is no translation and primary is ltr.
  - In `panelMode === 'Connections'`, the class follows the direction of the shown side.
  - **Segments with neither side are not rendered** (648-650).
- `VersionContent` maps direction → language class: rtl → `he`, ltr → `en`. So an **RTL translation** (Arabic, Persian, Yiddish, Hebrew translation, Judeo-Arabic) is rendered as `contentSpan he translation`, and an LTR primary as `contentSpan en primary` (ContentText.jsx:22-45). CSS keys side-by-side floats and stacked styling on `.primary` / `.translation`, not on language.
  - `.he.translation` uses the Hebrew sans-serif font at 100% size (s2.css:7134-7137). In stacked mode it is black, unlike the dark-grey English translation (7058-7066).
  - Hebrew ISO map with each language's `defaultDirection` (sefaria.js:891-910).
- **Search text highlights** (`addHighlights`, 554-566): wraps each word of each `textHighlights` term in a regex tolerant of interleaved HTML tags, then wraps matches in `<span class="queryTextHighlight">` (s2.css:14238-14242, 8191).
  - Applied in basetext only to highlighted segments (TextRange.jsx:286).
  - Cleared (`unsetTextHighlight`) when the highlight moves (454-458).
- **itags** (`formatItag`, 528-553): only when a connections `filter` is active. Replaces `<i data-commentator="<filter[0]>">` with `<sup class="itag">` showing `data-label`, or `data-order` (Hebrew numeral for he). Quotes in the commentator name are escaped. Without a filter the `<i>` markers stay empty and invisible. CSS: `.segment sup.itag` (s2.css:7708-7714).
- **Poetry** (`addPoetrySpans`, 568-571): splits on `<br>` and wraps each line in `<span class='poetry indentWhenWrap'>` (hanging indent).
  - Continuous layout neutralizes the indent and hides `<br>` (s2.css:6993-7018).
  - Currently dead (§0.1).
- **Link-count dot** (604-616):
  - `.linkCount > .linkCountDot` with opacity `min(count+20, 70)/100`, 0 when there are no links. Tooltip "N Connections Available".
  - Count respects the active connections `filter` (`Sefaria.linkCount`, sefaria.js:1669-1675; `_filterLinks` handles `|Quoting` and `|Essay` suffixes and commentary-only categories, 1676-1698).
  - Hidden in heLeft/heRight (visibility hidden), inverted in dark mode, hidden in print.
- **Segment number** (617-626): `.segmentNumber > .segmentNumberInner` with en = integer and he = `encodeHebrewNumeral`. In bilingual mode it uses the interface language.
- Accessibility: `tabIndex=0`, `aria-label="Click to see links to <ref>"`, `aria-describedby=panel-N`, Enter/Space activation (`Util.handleKeyboardClick`, util.js:431-440).
- **Click routing** (`handleClick`, 485-527), in priority order:
  1. `a.mutc` (linker debug spans): moderators with a citation span open the **LinkerAdmin** sidebar (`handleLinkerAdminCitationClick`, ReaderPanel.jsx:203-217, sets `with=LinkerAdmin&debug_mode=linker`). Everyone else gets an `alert` with debug info (`_makeLinkerDebugAlert`, sefaria.js:678-689).
  2. **refLink** (an `<a data-ref>` or its parent): `handleRefLinkClick` (459-480).
     - `data-scroll-link="true"` pointing into the same book → `navigatePanel` (scroll the same panel, ReaderApp.jsx:1663-1686).
     - Otherwise `onCitationClick`, honoring `data-ven` / `data-vhe` version attributes. Multipanel opens a new panel after the current one, closing a connections panel (ReaderApp.jsx:1077-1088). Mobile replaces the base text.
  3. **Footnote** (`sup` or inside it): toggles the next `i.footnote` and re-places numbers (227-231).
  4. **namedEntityLink**: selects the link text, opens the Lexicon/topic sidebar (`connectionsMode:"Lexicon"`, `selectedNamedEntity` slug) (ReaderPanel.jsx:231-243). Hover underline appears only with `.showNamedEntityLinks` (s2.css:7362-7376).
  5. Otherwise `onSegmentClick` (`ReaderPanel.handleBaseSegmentClick`, 166-179):
     - TextAndConnections → close connections.
     - Text + multiPanel → open/replace the connections panel at n+1 (`ReaderApp.handleSegmentClick`, 1052-1065, focuses the new panel for a11y).
     - Text + mobile → TextAndConnections in-panel.

### 5.4 Images
- **Full-segment image** (segment text is exactly one `<img>`): `VersionImageSpan` renders `.image-in-text > img + p.image-in-text-title` (the alt text is the caption). `onLoad` re-places segment numbers.
  - In bilingual mode, if both sides are images, the **primary image is suppressed** (the translation side is preferred) (ContentText.jsx:32-69).
  - CSS: centered flex, responsive widths, aspect-ratio rules (s2.css:15892-15923, 16341-16352, 16432-16445).
- **Inline images** stay in the HTML: `.segment img {max-width:100%}` (s2.css:7723-7725).

### 5.5 Inline HTML styling (s2.css)
- **Footnotes** (7680-7722):
  - `sup` 0.6em in the Hebrew sans font.
  - `sup.footnote-marker` and `sup.endFootnote` in link blue with hover underline. `sup::before` enlarges the click target.
  - `i.footnote` hidden by default, 0.8em, dark grey, not italic.
- **Structure overlays**: `i[data-overlay="Vilna Pages"]` and `i[data-overlay="Venice Columns"]` render `content: attr(data-value)` as a small grey sans marker (7726-7744). These are Talmud page/column transitions inside text.
- **refLink**: 0.8em bold, letter-spaced, #333, underline on hover (7352-7361).
- `big` → 1.2em (6276-6280). Other allowed tags (`b`, `small`, `u`, `strong`, `em`, `sub`) use browser defaults. There are no `mam-*` (Miqra al pi ha-Masorah) or ktiv/kri classes in the CSS.
- `.enInHe` 83% (149).
- Selection color `#D2DCFF` (6-8).
- Fonts (static/css/fonts.css):
  - Serif Hebrew stack starts with "Taamey Frank" (supports cantillation), Cardo (Greek), Noto Color Emoji.
  - English serif stack includes adobe-garamond-pro, Meltho (Syriac), Crimson Text, Georgia (Cyrillic), Noto Sans Samaritan.
  - A "Rashi Script" font face exists (sheets only).
  - `.he` gets `unicode-bidi: plaintext`. Font switching uses the `--is-hebrew` CSS variable trick.

### 5.6 Layout CSS (s2.css:6839-7351)
- **Basetext box**: max-width 760px, font-size 2.2em (× panel fontSize%), line-height 1.6, justified, 30px padding. singlePanel has no padding, narrowColumn adjusts padding.
- **Title**: centered, 1.1em, light weight, letter-spaced, with a 4px underline `titleBox`.
- **Segmented**: `.segment` is a block with 26px bottom margin.
- **Continuous**: `.continuous .segment {display:inline}` with small vertical padding (less in english to keep named-entity underlines visible). `.clearFix` and `<br>` are hidden.
- **Bilingual**:
  - Both spans are blocks, en left-aligned and he right-aligned.
  - **Stacked**: 14px gap between segments. The translation gets a 10/20px margin and dark grey color.
  - **heLeft/heRight**: each side 50% width. Floats are keyed by primary/translation (heLeft: translation floats right, primary left; heRight: the opposite).
- `.segment.heOnly`/`.enOnly` force direction and alignment, and hide the other language.
- **Dictionary fix**: `.readerPanel.hebrew.continuous .segment.enOnly .en {unicode-bidi: embed}` stops headwords flipping (7213-7220).
- Language hiding rules (1294-1331): `.readerPanel.english .contentSpan.primary`, `.readerPanel.hebrew .contentSpan.translation`, `.he`/`.en` visibility by panel language.
- **Segment-number / link-dot positions**: absolute, 30px wide, grey 12px.
  - ltr panel: number left −48, dot right −46.
  - rtl/bilingual panel: number right −46, dot left −48.
  - heLeft/heRight: number centered between columns (left 50%), dot hidden.
  - singlePanel: ±30px.
  - In english/bilingual panels a heOnly segment shows the English numeral; in a hebrew panel an enOnly segment shows the Hebrew numeral (7344-7351).
- **Highlight**:
  - `.basetext .segment.highlight` background #F0F7FF (sepia #E3E3E1, dark #444).
  - Focus/active #f5faff.
  - `.invisibleHighlight` has no style; it is a scroll anchor only.
- Interface direction overrides (6920-6931; 1271-1281): Hebrew interface + ltr panel → textRange ltr; English interface + rtl panel → textRange rtl.
- **Parashah header**: `.parashahHeader` centered 24px with 32px margin. `.parashahHeader.aliyah span` uppercase 18px. Margin is tightened when it is the first item after the section title (6946-6962).
- **Print** (static/css/s2-print.css): hides link dots, loading messages, bookMetaDataBox, all `sup` (footnote markers/itags) and connections. Adds 20px padding for side-by-side layouts. Segment numbers are pinned to top 0. `#printFooter` is shown only for sheets (SheetContent.jsx:173).

### 5.7 Vowel / cantillation / punctuation stripping (TextRange.jsx:262-309)
- `nre` (cantillation only) = `[\u0591-\u05af\u05bd\u05bf\u05c0\u05c4\u05c5\u200d]`. `cnre` (cantillation + nikkud) = `[\u0591-\u05bd\u05bf-\u05c5\u05c7\u200d]`.
- Active when language ≠ english and `vowels` ≠ all: `partial` → nre, `none` → cnre. Applied to **both** the he and en strings (so RTL translations with vowels are stripped too). See §0.7 for the first-segment gate.
- **Talmud punctuation stripping**: when language is hebrew or bilingual, `punctuationTalmud=punctuationOff` and `data.type === "Talmud"`. Removes `. ! ? : , ״` runs unless the run is immediately followed by a single Hebrew letter and a boundary (this protects abbreviations/gershayim). Also removes em/en dash + space. Applied to the Hebrew side only.

### 5.8 Parashah / aliyah headers (static/js/sefaria/util.js:23-42)
- Shown only if `data.alts` is non-empty **and** ((`categories[1] == "Torah"` and not `isDependant`) or `categories[2] == "Onkelos"`).
- Aliyot **on** with aliyah metadata → `"{parasha}: {aliyah}"` header, styled `.aliyah` (e.g. "Bereshit: First", "Noach: Second"). This also shows in chapters that start mid-parasha.
- Aliyot **off** and the segment starts a parasha (`whole`) → parasha name only (`parashaTitle: true`).
- Rendered inside `.rangeSpan` before the segment (TextRange.jsx:288-301, 311-339). Tests: static/js/sefaria/tests/parashahHeader.test.js.
- Haftarot are not rendered inline. They appear only via calendars/NavSidebar/topic pages.

### 5.9 Copy behavior (ReaderApp.jsx:2239-2333; listener 218)
- Ignored for INPUT, TEXTAREA and LC-CHATBOT.
- Clones the selection:
  - In non-continuous layouts each `.contentSpan` becomes a `<div dir=rtl|ltr>` (direction via `Sefaria.hebrew.isHebrew`). A Hebrew panel's container gets `dir=rtl`.
  - Poetry spans are unwrapped.
  - In **continuous** layouts all `<br>` are removed and `segment`/`rangeSpan`/`segmentText`/`contentSpan` wrappers collapsed.
  - Removes `segmentNumber`, `linkCount`, `clearFix`, `footnote-marker`, and footnotes that are not open. Open footnotes get a `" *"` prefix.
  - Strips `a.namedEntityLink` and `a.refLink` to plain text. Collapses every non-`rangeSpan` span.
- Sets `text/plain` (via `htmlToText`, util.js:241-264) and `text/html`.
- Analytics: `copy_text`, plus `bilingual_copy_text` / `spanning_copy_text`.

---

## 6. Special cases by category / title / structure

### 6.1 Tanakh / Torah
- Layout setting `layoutTanakh` (default segmented) (ReaderPanel.jsx:526-529).
- Short numeric section titles (TextRange.jsx:244).
- Parashah/aliyah headers and the Aliyot toggle: Torah books, plus Onkelos (`categories[2]=="Onkelos"`; menu list of the 5 Onkelos titles). Dependent texts (commentaries) are excluded (util.js:25).
- `aliyot` URL param only for Genesis–Deuteronomy titles.
- SSR includes `indexDetails` for `["Tanakh","Torah"]` (reader/views.py:632-633).
- Vowel and cantillation toggles appear because the text has nikkud/te'amim.
- OpenTransBanner applies to corpus Tanakh (§8).

### 6.2 Talmud (Bavli / Yerushalmi)
- Layout setting `layoutTalmud`, **default `continuous`**.
- Short daf section titles ("2a" / Hebrew "ב." from the server `heRef`). **Each amud is its own TextRange with its own header**, flowing inline in continuous mode.
- Address type `Talmud`: `intToDaf`, `dafToInt`, `encodeHebrewDaf` short form (`.`/`:`) or long form (hebrew.js:155-168, 246-264). `makeSegments` advances dafs across spanning sections. `refContains` is daf-aware.
- **Punctuation toggle and stripping** (primary_category/type Talmud only).
- **Vilna Pages / Venice Columns** overlay markers inside text (CSS 7726-7744).
- **Category attribution** "The William Davidson Talmud" / "תלמוד מהדורת ויליאם דוידסון" shown in the reader header for categories starting ["Talmud","Bavli"]. The version title is then shown in parentheses (sefaria.js:2743-2763; ReaderPanel.jsx:1395-1402, 1443; Misc.jsx:2610-2622).
- OpenTransBanner applies to corpus Bavli.
- Commentary-opening exception: Talmud commentaries at depth < 3 open in the main panel rather than the sidebar (sefaria.js:2618-2625).
- Named entities on **Jerusalem Talmud** get a hard-coded data-source sentence ("…by Sefaria") instead of the Michael Sperling attribution (LexiconBox.jsx:114-119).
- `Folio` address type (4-sided, a–d) has helpers but client parseRef cannot parse c/d (§0.8).

### 6.3 Mishnah / Tanaitic (Tosefta)
- Short numeric section titles. Mishnah corpus gets the OpenTransBanner. No other rendering special-casing.

### 6.4 Commentary (dependent texts) and "commentary displayed as base text"
- `openPanelAt` with `convertCommentaryRefToBaseRef` (ReaderApp.jsx:1757-1765):
  - If `isCommentaryRefWithBaseText(ref)` holds (dependence Commentary, exactly one `base_text_titles`, a `base_text_mapping`, ref depth ≥ 3 unless forced, and a valid converted ref; sefaria.js:2603-2645), the **base text** opens with `filter=[collectiveTitle]` and `filterRef` = the original ref. The connections panel opens on `TextList`/Commentary (multipanel: separate panel; mobile: TextAndConnections) with highlight.
  - `many_to_one` mappings drop the last section (`convertCommentaryRefToBaseRef`, 2646-2675).
- Otherwise (depth < 3, complex intros, compare panels, or opened from the connections panel with `handleTextListClick` passing false) the commentary renders **as base text**:
  - Short title (primary_category Commentary).
  - Segment numbers shown.
  - Section-level refs of depth-3 commentaries are **super-sections**, redirected to the first available section (TextRange.jsx:127-131). Cache next/prev skip empty sub-sections.
- With a filter active, base-text `itag` markers for that commentator appear as superscript numbers, and link dots reflect only that commentator.
- Quoting Commentary: filter suffix `|Quoting` (sefaria.js:1676-1698).

### 6.5 Reference / Dictionaries / Lexicons (Jastrow, BDB, Klein, etc.)
- `categories[0] === "Reference"`:
  - **No section title** (`hideTitle`, TextColumn.jsx:448-461).
  - **No segment numbers** (TextRange.jsx:256-258).
  - `prefetchMultiple=20` (unused).
- Dictionary titles are **virtual books** (indexes with `lexiconName`, sefaria/model/text.py:5660-5671; `Sefaria.virtualBooks` from templates/js/data.js:13). Client `parseRef` treats `<Lexicon> <n>` specially (sefaria.js:61-70).
- The API allows virtual nodes even when "empty" (api/views.py:64-65). `TextRequestAdapter` skips `index_offsets_by_depth` for virtual nodes.
- CSS dictionary headword bidi fix in hebrew+continuous (s2.css:7213-7220).
- Word lookups into dictionaries happen through the Lexicon sidebar (§7.4).

### 6.6 Liturgy (Siddur etc.)
- **No segment numbers** (TextRange.jsx:257). Long/named section titles (e.g. complex node names).

### 6.7 Guide for the Perplexed
- Hard-coded title check: **no segment numbers** (TextRange.jsx:256).

### 6.8 Other categories (Midrash, Halakhah incl. Mishneh Torah / Shulchan Arukh, Kabbalah incl. Zohar, Responsa, Second Temple, Chasidut, Musar, Jewish Thought, Targum)
- **No rendering special cases in the reader.** They use `layoutDefault` (segmented) and named section titles ("Chapter 3", "Siman 5", etc.) via `sectionNames`.
- Targum Onkelos is the exception (parashah headers, §6.1).
- Category matters elsewhere only for color lines (palette.js) and connections ordering (sefaria.js:1768-1950, outside this inventory).
- Mishneh Torah / Shulchan Arukh / Tur have nesting special cases only in the TOC (TextCategoryPage.jsx:129).

### 6.9 Complex texts / schema nodes / default nodes / alt structures
- Server applies `default_child_ref()` (TextRequestAdapter 340). `make_panel_dict` uses `first_available_section_ref()`.
- **Book-level refs open the book TOC** instead of the reader (reader/views.py:550-569; ReaderApp.jsx:1748-1749).
- Section titles for complex texts include node names (`sectionString` isComplex branch).
- `_splitTextSection` delimiter is `" "` when `data.ref === data.book` (depth-1 at the root).
- Alt structures render inline **only** as parashah/aliyah headers. Other alt structs (e.g. Talmud chapters) appear only in the BookPage TOC (BookPage.jsx:370-396).
- Address types (sefaria/model/schema.py:2031-2790): Integer, Talmud, Amud, Folio, Year (+1240), Aliyah (First…Seventh), Perek, Pasuk, Mishnah, Volume, Siman, Halakhah, Seif, SeifKatan, Section, Dictionary.
  - Server `heRef` / `heSectionRef` strings use their `toStr`.
  - **Client segment numbers are always integers / Hebrew numerals** regardless of address type.
  - The TOC uses `getSectionStringByAddressType` for Talmud/Year/Folio.
- `index_offsets_by_depth` support for texts not numbered from 1.

### 6.10 Hebrew-only / translation-only texts, RTL translations
- No translation → primary shown even in "english" mode, `heOnly`/`enOnly` class by primary direction. LTR primaries (e.g. English-original texts) get `enOnly`.
- Primary missing but translation present (VersionsTextList, "Translation Open") → translation shown.
- RTL/LTR combos: layout state `mixed`, `bi-rtl` or `bi-ltr`, with auto `biLayout` correction (§4).
- Panel direction class follows the shown side.
- Arabic/Persian/Yiddish/Judeo-Arabic default RTL per `ISOMap.defaultDirection` (sefaria.js:891-910).
- `_sortVersionsIntoBuckets` derives the actual language from a `[xx]` suffix on the versionTitle (1086-1111).

### 6.11 Sheets inside panels
- `parseRef` book `Sheet` → `mode: "Sheet"` with `sheetID` / `highlightedNode` (ReaderPanel.jsx:274-310; ReaderApp.jsx:1750-1758). The Sheet renders its own sheet components, not `TextColumn`.
- Sheet-specific bilingual CSS (`.sheetItem`, `.SheetSource`, `.SheetOutsideBiText`, s2.css:7074-7133, 11914-12990).
- Layout menu treats sheets as `mixed`.

---

## 7. Interactions from the text

### 7.1 Highlighting
- `highlightedRefs` explicitly set → highlight those segments, or all segments if the list contains the section ref / first spanning ref. Otherwise basetext highlights segments flagged by `makeSegments` (segment-level URL) (TextRange.jsx:282-285).
- `showHighlight` toggles the visible `.highlight` class. `.invisibleHighlight` is always set for scrolling.
- `ReaderPanel` computes `showHighlight = state.showHighlight || highlightedRefs.length > 1` (ReaderPanel.jsx:754).
- SSR highlights segment/range URLs (reader/views.py:635-636).
- Search result click → `textHighlights` (query terms) highlighted inside highlighted segments.

### 7.2 Citations inside text
- Server-wrapped `a.refLink` (MUTC) and manually wrapped links (`hasManuallyWrappedRefs`). The client never wraps citations itself in the reader.
- `data-scroll-link` → same-panel navigation. `data-ven`/`data-vhe` → open with specific versions.
- Book-level citations are not linked.

### 7.3 Named entities / topics
- `a.namedEntityLink[data-slug]` → Lexicon sidebar named-entity view (topic fetched with `getTopic(slug,{annotated:false})`).
- URL params `namedEntity`, `namedEntityText`.
- Clicking another segment closes the named entity (`closeNamedEntityInConnectionPanel`, ReaderApp.jsx:1071-1076; ReaderPanel.jsx:316-324).

### 7.4 Selected words → Lexicon
- Selecting text sets `selectedWords` (trimmed). The URL gets `lookup=` (ReaderApp.jsx:822-823, 854-855).
- `ConnectionsPanel` auto-switches to `Lexicon` mode when the words match `[\s:\u0590-\u05ff.]+`, are < 3 words, and the selection covers one ref. It returns to `Resources` when the words are cleared (ConnectionsPanel.jsx:79-91).
- `LexiconBox.shouldActivate` allows ≤ 3 words split on space/`:`/sof pasuq/maqaf/paseq/`.` (LexiconBox.jsx:84-95).
- Lookup: `/api/words/<words>?always_consonants=1&never_split=1&lookup_ref=<ref>` with NFC normalization (sefaria.js:1563-1572).
- Entries are filtered by ref categories.
- Mobile: same panel. Multipanel: only into an existing next panel (§0.9).

### 7.5 Linker debug mode
- `?debug_mode=linker` (`Sefaria._debug_mode`) adds `debug_mode=linker` to v3 requests. Spans are colored by status (`mutc` classes) and `linker_output` is stored in `Sefaria._linkerOutputMap` keyed `ref|lang|start-end` (sefaria.js:665-677).
- Clicking a span → moderator LinkerAdmin panel or debug alert with a `linker_test.py` test string (`_getLinkerTestString`, 710-745).

---

## 8. Banners above the text column (static/js/TextColumnBanner.jsx)

- Rendered inside `ReaderControls` unless the header is hidden or this is a connections header (ReaderPanel.jsx:1480-1487). Only one banner shows at a time, in priority order:
  1. **Translation-language-preference suggestion** (`TransLangPrefAskBanner`):
     - Shown when the server set `translation_language_preference_suggestion` (from the Cloudflare country header ∩ `SUPPORTED_TRANSLATION_LANGUAGES`, only if the user has no preference and was not asked; middleware.py:164-180) and the cookie `translation_language_preference_suggested` is absent.
     - "Prefer to see **{lang}** translations when available?" Yes / No / close.
     - Yes → sets the preference and shows "Thanks! We'll show you {lang} translations first when we have them." No/close → sets the cookie and the profile setting `translation_language_preference_suggested`.
  2. **OpenTransBanner** "Want to **change** the translation?":
     - Button "Go to translations" opens the connections `Translations` mode.
     - Shown when `Sefaria.openTransBannerApplies(book, language)` holds (corpus ∈ {Tanakh, Mishnah, Bavli} and language ≠ hebrew; sefaria.js:1507-1516) and the cookie `open_trans_banner_shown` is not set. Closing sets the cookie.
- Banner chrome: `.readerControls.transLangPrefSuggBann` with `yesNoButton`s and `CloseButton` (s2.css:6326-6365). Hebrew interface strings are included.

---

## 9. Reader header bits tied to text data (ReaderControls, ReaderPanel.jsx:1310-1510)
- Title = `indexTitle` + section string from `data.ref` (Hebrew from `heRef`). Bilingual defaults to the interface language. Clicking it opens the connections panel for the current ref (unless a sidebar is already open).
- Version title shown when language is english or bilingual and the version is not merged. Prefers `shortVersionTitle` / `shortVersionTitleInHebrew`.
- William Davidson attribution (§6.2).
- `CategoryColorLine` by current category ("Sheets" for sheets).
- Text data for the header and menu comes from `conditionalSetTextData`, which loads `currentlyVisibleRef` with context. It refreshes on version, visible ref or connections-mode changes (ReaderPanel.jsx:65-73, 108-112).

---

## 10. Hebrew utilities (static/js/sefaria/hebrew.js)
- `encodeHebrewNumeral(n)`:
  - 15/16 → ט״ו/ט״ז forms (`טו`, `טז`).
  - Hundreds up to 1200 via the table.
  - ≥ 1300 → `encodeLargeHebrewNumeral`: thousands separated by geresh, then `sanitize` swaps יה/יו/רע/רעה/רעב and adds gershayim/geresh.
  - Returns `undefined` for unsupported values.
  - Small numbers get **no** gershayim (segment numbers are plain letters).
- `decodeHebrewNumeral`, `encodeHebrewDaf` (short `.`/`:`, long `N א/ב`), `encodeHebrewFolio` (`N,א-ד`), `intToDaf`, `dafToInt`, `intToFolio`.
- `isHebrew` (majority of first 200 non-punctuation chars, ignoring HTML/nikkud), `containsHebrew`, `containsEnglish`, `getNikkudRegex`, `hebrewPlural` (Daf→Dappim, Perek→Perokim, Siman→Simanim, Aliyah→Aliyot, …).
- String prototypes used by rendering: `stripNikkud` (`[\u0591-\u05C7]`), `stripHtml`, `stripHtmlConvertLineBreaks`, `stripPunctuation`, `decodeHtmlEntities` (util.js:941-974).

---

## 11. Loading states
- `TextRange` with no data shows the `LoadingMessage` ("Loading..." / "טוען מידע...", Misc.jsx:2588-2602) as its title, and the `.loading` class.
- Column-level prev/next placeholders (§5.1).
- Errors: `data.error` → `onTextLoad` returns early. Nothing is rendered (no user-facing error in the range).
