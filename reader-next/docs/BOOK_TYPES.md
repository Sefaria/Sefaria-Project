# Book types: what the reader must do differently

Grounded in the recorded fixtures in `fixtures/api/<slug>/` (recorded 2026-10-04 against https://www.sefaria.org). Every number below was computed from those JSON files. Old-client behaviour is quoted from `docs/features/inv_03_text_rendering.md` section 6 and `inv_05_library_topics.md`; where this document and the inventory differ, this document describes what the API actually returned.

Fixture legend: `v3` = `v3-texts.json` (requested with `version=primary&version=translation&fill_in_missing_segments=1&return_format=wrap_all_entities`). `v3-default` = same request without `fill_in_missing_segments`/`return_format`.

---

## 0. Cross-cutting findings (read first)

1. **`language` is only `he` or `en`; the real language is `actualLanguage`.** The French Genesis version comes back as `language:"en", actualLanguage:"fr", languageFamilyName:"french", direction:"ltr"` (`genesis-1/v3-texts-french.json`). A reader keyed on `language` will mislabel every non-English translation. Use `actualLanguage` (display), `languageFamilyName` (grouping), `direction` (layout).
2. **`isSource` / `isPrimary` are independent of `language`.** Observed combinations:
   - he: `isSource:true, isPrimary:true` (the norm).
   - `guide-perplexed-1-1`: Hebrew version is `isSource:false, isPrimary:true` (Makbili edition is a translation from Arabic; English is `isSource:false, isPrimary:false`). There is no Arabic source.
   - `philo-creation-1`: only an English version, `isSource:false, isPrimary:true`, no Hebrew at all.
   - `zohar-bereshit-1`: both returned versions have `language:"he"`; the second ("Hebrew Translation") is `isSource:false, isPrimary:false`. The "translation" slot is Hebrew, so a layout of "Hebrew on the right, English on the left" must key on isPrimary/isSource, not language.
   - `jastrow-abba-1`, `klein-av-1`: the only version is English with `isSource:true, isPrimary:true` (dictionary entries are English-language source text; direction `ltr`) but contains inline `dir="rtl"` Hebrew/Aramaic.
   - `teshuvot-harashba-1-98`: only English community translation, `isPrimary:false`; the primary slot yields warning 102.
3. **`return_format=wrap_all_entities` is what produces `<a class="refLink">` and `<a class="namedEntityLink">` in most books.** Compared against `v3-default`: for Genesis, Berakhot 2a, Rashi, Ramban, Mishneh Torah, Kitzur, Mishnah, Pirkei Avot etc. the default response has 0 `refLink` anchors and 0 `namedEntityLink`; the wrapped response has them (e.g. Ramban 333 refLinks, Berakhot 2a 8 namedEntityLinks + 6 refLinks). Exceptions where links are stored in the text (present in default too): Jerusalem Talmud (142 refLinks in default, 279 + 80 namedEntityLinks wrapped), Jastrow, Klein. The reader must pick one mode deliberately and style/handle both anchor kinds.
4. **Unquoted attributes and relative hrefs.** Wrapped anchors look like `<a class="refLink " href="Deuteronomy.6.7" data-ref="Deuteronomy 6:7" data-range=752-774>` (note: `data-range` is **unquoted**, `class` has a **trailing space**, href is **relative with no leading slash**). Stored (manual) anchors look like `<a class="refLink" href="/Deuteronomy.6.4-9" data-ref="Deuteronomy 6:4-9">`. Use `data-ref`, not `href`, for navigation. Parse with a real HTML parser; do not regex.
5. **Nested/invalid HTML exists.** `jt-berakhot-1-1` en has `<a class="refLink" ...><i><a class="refLink " ...>` (anchor inside anchor). `bereshit-rabbah-1` en contains the literal text `<In <i>anokhi </i>of Rabbi Meir…>` which parses as a bogus `<In>` element (1 occurrence). Sanitize with an allow-list (see inv_03 3.5: `i b br u strong em big small img sup sub span a`) and escape unknown tags rather than dropping text.
6. **No `<img>` appeared in any recorded text.** `grep "<img"` over all v3 and versions fixtures returned nothing. `img` is whitelisted server side, but none of the 35 sampled sections exercise it. Images in this data set are only manuscripts (`manuscripts.json`, Berakhot) and `purchaseInformationImage` URLs in version metadata.
7. **Segment numbers are never in the payload.** Text is a bare array; the displayed number is derived: `start = sections[last]` (for a range request, the first value of `sections`) plus array index (plus `index_offsets_by_depth` for Zohar). See each type.
8. **Ragged arrays and empty strings are normal.** Rashi chapter text is `[[str,...],[str,...],...]` with lengths like `[3,5,0,1,1,2,2,1,1,1,5,1,0,7,...]` (0 = no comment on that verse). Ben Sira has empty segments 9 and 10 in both languages. Arukh HaShulchan en has 12 slots (one empty at #11) vs he 29. Rashi on Berakhot 2a he has 12 lines, en has 14. Never assume he.length == en.length; align by index and pad.
9. **`next`/`prev` are refs the server chose, not arithmetic.** See per-type notes (commentary, spanning, complex nodes).
10. **Dictionary `shape` endpoints 500.** See Fixture problems.

---

## 1. Field reference (what every v3 text response contains)

Top level keys (all slugs): `versions`, `available_versions`, `ref`, `heRef`, `sections`, `toSections`, `sectionRef`, `heSectionRef`, `firstAvailableSectionRef`, `isSpanning`, `next`, `prev`, `title`, `book`, `heTitle`, `primary_category`, `type`, `indexTitle`, `categories`, `heIndexTitle`, `isComplex`, `isDependant`, `order`, `collectiveTitle`, `heCollectiveTitle`, `alts`, `lengths`, `length`, `textDepth`, `sectionNames`, `addressTypes`, `titleVariants`, `heTitleVariants`, `index_offsets_by_depth`, `warnings`. Plus `spanningRefs` only when `isSpanning:true`. `lengths`/`length` are **absent (null)** for complex/commentary-with-intro books (Ramban, Mishnah Berurah, Arukh HaShulchan, Zohar, Siddur, Haggadah, Sefer HaChinukh, Philo, Peri Megadim, dictionaries): do not rely on them for "how many chapters".

Version object keys: `status, priority, license, versionNotes, formatAsPoetry, digitizedBySefaria, method, heversionSource, versionUrl, versionTitleInHebrew, versionNotesInHebrew, shortVersionTitle, shortVersionTitleInHebrew, extendedNotes, extendedNotesHebrew, purchaseInformationImage, purchaseInformationURL, hasManuallyWrappedRefs, language, versionSource, versionTitle, actualLanguage, languageFamilyName, isSource, isPrimary, direction, text`. Merged versions add `sources` (see Tosefta). `available_versions[]` entries have the same metadata plus `title` but **no `text`**; counts range from 1 (dictionaries, Philo, Teshuvot) to 50 (Genesis 1).

Verified Genesis 1 version header (trimmed):

```json
{"language":"he","versionTitle":"Miqra according to the Masorah","actualLanguage":"he","languageFamilyName":"hebrew","isSource":true,"isPrimary":true,"direction":"rtl","license":"CC-BY-SA","priority":2,"text":["...31 strings..."]}
{"language":"en","versionTitle":"THE JPS TANAKH: Gender-Sensitive Edition","actualLanguage":"en","languageFamilyName":"english","isSource":false,"isPrimary":false,"direction":"ltr","license":"CC-BY-NC","priority":8}
```

`warnings` codes seen across all 35 sections: **102** (primary language not available; Teshuvot haRashba) and **104** (no translation; Jastrow, Klein, Peri Megadim). Shape:

```json
"warnings":[{"translation":{"warning_code":104,"message":"We do not have a translation for Peri Megadim on Orach Chayim, Mishbezot Zahav 1"}}]
"warnings":[{"primary":{"warning_code":102,"message":"We do not have the language you asked for Teshuvot haRashba part I 98. Available languages are ['english']"}}]
```
The key (`translation` / `primary`) names the slot that could not be filled. Everything else returned `warnings: []`. With `version=primary&version=translation`, a slot with no version is simply absent from `versions` (Peri Megadim returns 1 version; Teshuvot returns 1 version, the English one).

Inline-markup totals per book are in section 12.

---

## 2. Tanakh

### 2.1 Torah: `genesis-1` (also `genesis-1-1-5`, `onkelos-genesis-1`)

- `textDepth 2`, `sectionNames ["Chapter","Verse"]`, `addressTypes ["Perek","Pasuk"]`, `isComplex false`, `lengths [50,1533]`, `order [1,1]`.
- `heRef` `בראשית א׳`; verse ranges `בראשית א׳:א׳-ה׳` (geresh `׳` after single-letter numerals; gershayim `״` for 15+, e.g. Psalms 23 = `תהילים כ״ג`). Generate section numbers client side with a Hebrew-numeral function; use `heRef` for titles only.
- `text` for a chapter is a flat array of verses (31 for Genesis 1). Verse N is `array[N-1]`.
- **Alt structure (Parasha/aliyot)** is delivered twice:
  - In `index.json` / `index-contracted.json`: `alt_structs.Parasha.nodes[]` of `ArrayMapNode` with `addressTypes ["Aliyah"]`, `sectionNames ["Aliyah"]`, `wholeRef`, `refs[]` (7 refs for Bereshit), `sharedTitle`, `match_templates`. Verified: `"wholeRef":"Genesis 1:1-6:8","refs":["Genesis 1:1-2:3","Genesis 2:4-2:19",...,"Genesis 5:25-6:8"]`.
  - In v3 `alts`: a **jagged array aligned to the segments of the response** with `null` (or absence) where no boundary starts. For Genesis 1 it has length 1 (only verse 1 starts something):
    ```json
    "alts":[{"en":["Bereshit"],"he":["בראשית"],"whole":true,"aliyah_en":"First","aliyah_he":"ראשון","parasha_en":"Bereshit","parasha_he":"בראשית"}]
    ```
    `whole:true` marks the start of a whole node (parasha start); an aliyah start inside a parasha has no `whole` and no `en/he` titles beyond the aliyah label. `Rishon` is not added to the titles list (inv_03 3.3). The array covers all alt structs, but the old client renders headers only for Torah and Onkelos (`categories[2]=="Onkelos"`).
  - For a range (`genesis-1-1-5`), `alts` is the same single entry (computed for the trimmed range), `sections ["1","1"]`, `toSections ["1","5"]`.
- Because `alts` is aligned to segment index, the reader must offset by the first requested segment when the request is a range.
- `next "Genesis 2"`, `prev null` (book start). `firstAvailableSectionRef` equals `ref` for a chapter and equals the range (`Genesis 1:1-5`) for a range request (it is not a section ref in that case; use `sectionRef` = `Genesis 1`).
- Text content: Hebrew is Masorah-annotated MAM with nikkud and te'amim; strip toggles apply (inv_03 5.7). English JPS includes footnotes and poetry markup (section 12).
- Versions: 50 available (many languages); French/German/Spanish are `language:"en"` with `actualLanguage fr|de|es`. `v3-texts-multilang.json` returned 5 versions: he + en + fr + de + es.
- **Onkelos** (`onkelos-genesis-1`): `primary_category "Targum"`, `isDependant true`, `collectiveTitle "Onkelos"`, `order` empty, same Parasha `alts` as Genesis (aliyah fields included). Versions are Metsudah Hebrew (`Sifsei Chachomim Chumash...`, he, isSource) and English `...[with Onkelos translation]`. `lengths [50,1533]`. Treat as Torah for aliyah headers.

### 2.2 Psalms: `psalms-23` (poetry)

- Same shape as Genesis (`Chapter/Verse`, depth 2, `lengths [150,2527]`) but **`alts` is a different alt struct**: `[{"en":["Day 4"],"he":["יום ד"],"whole":true}]` (Psalms daily/monthly division; **no `aliyah_*`/`parasha_*` keys**). A reader that assumes `alts[i].aliyah_en` exists will crash or render "undefined".
- Poetry: `formatAsPoetry` is `""` on all versions. The line-break structure is carried inline: en has `<span class="poetry indentAll">…</span><br>` (5) and `<span class="poetry indentAllDouble">` (12); he has `<br>` and `mam-spi-pe`. Render `.poetry` spans as block lines with hanging indent (`indentAll`, `indentAllDouble` = two levels). Do not collapse `<br>`.
- `prev "Psalms 22"`, `next "Psalms 24"`.

### 2.3 Prophets: `isaiah-40`

- Identical structure; **`alts: []`** (length 0): Isaiah has no alt struct in v3 even though chapters are used as haftarot, so any haftarah marking cannot come from `alts` (it would have to come from the calendars API or links).
- English JPS has 2 `refLink` anchors with `data-ref` (cross-reference inside a footnote), 117 `poetry indentAll` spans, 86 `<br>`; he has `mam-spi-samekh` (7) and `mam-spi-pe` (2) paragraph markers (`{ס}` / `{פ}` rendered as spans).

### 2.4 Megillah: `song-of-songs-1`

- Same as Isaiah (`alts []`, `lengths [8,117]`). Special Hebrew markup: **ketiv/qere** `<span class="mam-kq"><span class="mam-kq-k">(רחיטנו)</span> <span class="mam-kq-q">[רַהִיטֵ֖נוּ]</span></span>` (1 each). The reader must style `-k` (written, in parentheses) and `-q` (read, in brackets); stripping vowels must not drop the bracket text.
- English heavy poetry spans (48 `poetry indentAll`).

---

## 3. Talmud

### 3.1 Bavli: `berakhot-2a`, `berakhot-2a-1-5`, `berakhot-2a-3b`

- `textDepth 2`, `sectionNames ["Daf","Line"]`, **`addressTypes ["Talmud","Integer"]`**, `lengths [127,2749]`. The Talmud address type means section index N maps to daf/amud: `2a = 3rd section (index 2)`; the section string in API is `"2a"` (daf + `a|b`), not an integer. `length 127` is the number of amudim-halves... precisely: 127 = sections counting from daf 2a through 64a (64*2-1 = 127). Convert with `dafToInt`/`intToDaf` (inv_03 6.2): int 3 -> `2a`, 4 -> `2b`.
- `heRef`: `ברכות ב׳ א` (daf letter `ב׳` then amud `א`, no dot). The old client's short title `ב.` / `ב:` is generated client-side; the API's `heSectionRef` uses the long form. Decide on one and be consistent: short form is `2a`/`2b` in English, `ב.`/`ב:` in Hebrew.
- A single amud request returns `sections ["2a"]`, `next "Berakhot 2b"`, `prev null` (2a is the first amud, no previous), text = flat array of 14 lines (Hebrew and English both 14).
- **Segment (Line) numbers** are `array index + 1`; refs are `Berakhot 2a:N`. Segment range: `Berakhot 2a:1-5` returned `ref "Berakhot 2a:1-5"`, `sections ["2a","1"]`, `toSections ["2a","5"]`, `sectionRef "Berakhot 2a"`, `firstAvailableSectionRef "Berakhot 2a:1-5"`, `next "Berakhot 2b"`, 5 strings.
- **Spanning range across amudim** (`Berakhot 2a-3b`). Verified:
  ```json
  {"ref":"Berakhot 2-3","heRef":"ברכות ב׳-ג׳","sectionRef":"Berakhot 2-3","firstAvailableSectionRef":"Berakhot 2-3",
   "isSpanning":true,"sections":["2a"],"toSections":["3b"],
   "spanningRefs":["Berakhot 2a","Berakhot 2b","Berakhot 3a","Berakhot 3b"],
   "next":"Berakhot 4a","prev":null,
   "alts":[[{"en":["Chapter 1; MeEimatai"],"he":["מאימתי"],"whole":true}]]}
  ```
  `text` is nested: `[[14 strings],[19],[15],[32]]` (80 segments) for each version, one inner array per entry of `spanningRefs`. **The request `Berakhot 2a-3b` is normalized to `Berakhot 2-3` (whole-daf range) in `ref`; do not use `ref` to rebuild the URL or match the requested string.** Segment numbers restart at 1 per inner array, so the reader needs `spanningRefs[i]` to label each block. `alts` is also nested one level deeper (`[[...]]`) in the spanning response, versus flat (`[...]`) in the single-amud response. `next` is the amud after the range (`4a`), `prev` is null.
- **Alt structure (Chapters)**: `alt_structs.Chapters.nodes[]` are `ArrayMapNode depth:1 wholeRef "Berakhot 2a:1-13a:15" includeSections:true`, with `match_templates` for "Perek"/"Chapter 1" names. `index.json` also has `default_struct` and `exclude_structs` keys. v3 `alts` for 2a: `[{"en":["Chapter 1; MeEimatai"],"he":["מאימתי"],"whole":true}]` (no `aliyah_*`). The chapter boundary only appears on the segment where it starts (here the first line).
- Special content: William Davidson Edition (Hebrew `William Davidson Edition - Vocalized Aramaic`, English `William Davidson Edition - English`, both `CC-BY-NC`). The English is rich: `<b>` (88) bolds the literal translation, `<i>` (69) italicizes elucidation, plus `<br>` (2) and entity/ref anchors. Hebrew has `<big><strong>…</strong></big>` for the opening word (mishnah/gemara lead-in). Reader must show the Davidson attribution for `categories` starting `["Talmud","Bavli"]` (inv_03 6.2).
- Manuscripts: `manuscripts.json` has 4 entries (Bomberg Venice 1523 etc.) with `image_url`, `thumbnail_url`, `page_id "Berakhot 2a"`, `anchorRef`, `manuscript{slug,title,he_title,source}`; `related.json` has `manuscripts: 4`.

### 3.2 Yerushalmi: `jt-berakhot-1-1`

- `textDepth 3`, `sectionNames ["Chapter","Halakhah","Segment"]`, `addressTypes ["Perek","Halakhah","Integer"]`, `lengths [9,58,655]`. The section ref is `Jerusalem Talmud Berakhot 1:1` (chapter:halakhah), text is a flat array of 38 segments.
- **Two alt structs**: `Venice` (`addressTypes ["Folio"]`, `sectionNames ["Column"]`, `startingAddress "2a"`, refs like `"Jerusalem Talmud Berakhot 1:1:2-4"`) and `Vilna` (`addressTypes ["Talmud"]`, `sectionNames ["Daf"]`). Verified from index.json. Note Folio = four sides (a-d).
- v3 `alts` has length 36 for 38 segments, **jagged with nulls**; 15 non-null positions (indices 0,1,3,6,10,11,14,...). Entries from both structs are **merged into the same array**, and reuse the Torah-style key names for page markers:
  ```json
  {"en":["Chapter 1","1b"],"he":["מאימתי","א׳ ב"],"whole":true,"aliyah_en":"1b","aliyah_he":"א׳ ב","parasha_en":"Chapter 1","parasha_he":"מאימתי"}
  {"en":["1c","3b"],"he":["א׳ ב","ג׳ ב"],"aliyah_en":"3b","aliyah_he":"ג׳ ב","parasha_en":"Chapter 1","parasha_he":"מאימתי"}
  ```
  i.e. `aliyah_*` carries a daf/column label (`1a`, `1b`, `6b`) and `en[]` lists every alt boundary that begins on that segment (`"1c"` Venice column and `"3b"` Vilna page can share a segment). The old client hides these for non-Torah; a new reader that shows page markers must group by struct (Venice labels use `1a..1d`, Vilna uses `1a..7a`) and cannot tell which struct a label belongs to from `alts` alone; use `index.json` `alt_structs` for that.
- In-text page overlays: `<i data-overlay="Vilna Pages" data-value="1a"></i>` (22 in he). These empty `<i>` elements are the in-line Vilna page boundaries (CSS in inv_03 6.2).
- Mixed hierarchy refs: `next "Jerusalem Talmud Berakhot 1:2"`, `prev null`. Section title is `heRef` `תלמוד ירושלמי ברכות א׳:א׳`.
- Hebrew: `<strong><big>משנה:</big></strong>` marks Mishnah vs Gemara sub-sections; English footnotes (139 `sup.footnote-marker` + 139 `i.footnote`), 142 stored refLinks (+ wrapped).
- Licenses `CC-BY`; Guggenheimer edition.

---

## 4. Mishnah and Tosefta

### 4.1 `mishnah-berakhot-1`, `pirkei-avot-1`

- `Chapter/Mishnah`, `["Perek","Mishnah"]`, depth 2, `lengths [9,57]` (Berakhot) / `[6,108]` (Avot).
- Pirkei Avot's title does not start with "Mishnah" but `primary_category` and `type` are `Mishnah`, `categories ["Mishnah","Seder Nezikin"]`, `heRef "משנה אבות א׳"`. Decide Mishnah behaviour from `primary_category`/`type`, not the title prefix (the old client string-matched the title).
- Version pairing differs: Berakhot en = William Davidson (rich `<b>`/`<i>` with `i` 42, `b` 91), Avot en = "Mishnah Yomit by Dr. Joshua Kulp" (plain, anchors only). Hebrew = Torat Emet 357 (`Public Domain`), only `<a>` anchors.
- Pirkei Avot has literal `\n` newlines inside 18 segments (the only book in the set); collapse or convert per CSS (`white-space`) deliberately.
- Wrapped named entities: 57 `namedEntityLink` for Avot (rabbis), 39 for Mishnah Berakhot; `href="/topics/<slug>"` and `data-slug` (route to topic pages).
- `next "Mishnah Berakhot 2"`.

### 4.2 `tosefta-berakhot-1`

- Depth 2 `Chapter/Tosefta`, `["Perek","Integer"]` (note: **Tosefta uses `Integer` for the segment**, Mishnah uses `Mishnah`), `lengths [7,151]`, 16 segments in ch. 1, `order [1]`.
- **Merged translation**: the English version is `Sefaria Community Translation` with a `sources` array of length 16, one entry per segment (`"Tosefta Online"` ×15 and `"Sefaria Community Translation"` for segment 5). This is the merged-version signal (inv_03 0.6 / 3.6): hide or relabel the single version title when `sources` is present and show per-segment source attribution.
- Hebrew `Tosefta B'rachot` (`prio` empty).

---

## 5. Commentary (dependent texts)

`isDependant: true`, `primary_category: "Commentary"`, `collectiveTitle` populated. In `index.json`: `dependence "Commentary"`, `base_text_titles [{en,he}]`, `base_text_mapping` (`many_to_one` for Rashi, `many_to_one_default_only` for Ramban), `collective_title`.

### 5.1 Depth-3 commentary on Tanakh: `rashi-on-genesis-1`, `ramban-on-genesis-1`

- `textDepth 3`, `["Chapter","Verse","Comment"]`, `["Perek","Pasuk","Integer"]`, `lengths [50,1072,2017]` (Rashi) or **absent** (Ramban, complex).
- `ref "Rashi on Genesis 1"` is a **super-section**: `sectionRef "Rashi on Genesis 1"` but **`firstAvailableSectionRef "Rashi on Genesis 1:1"`**. The old client redirects to this (TextRange.jsx:127-131). `text` is `[[comments for verse1],[verse2],...]` with 31 inner arrays (55 comments in he and en). Many inner arrays are empty (`[3,5,0,1,1,2,2,1,1,1,5,1,0,7,1,2,0,0,0,...]`).
- **Next/prev skip empty verses**: `next "Rashi on Genesis 2:2"` (not `Genesis 2` or `2:1`) because Rashi has no comment on 2:1. `prev null`. Fetching `Rashi on Genesis 1:1` (recorded as `section-first.json`) returned `ref "Rashi on Genesis 1:1"`, `sectionRef "Rashi on Genesis 1:1"`, `next "Rashi on Genesis 1:2"`, `prev null`, still `textDepth 3`; fetching `Rashi on Genesis 2:2` (`section-next.json`) returned `prev "Rashi on Genesis 1:31"`, `next "Rashi on Genesis 2:3"`. So the verse-level ref is the effective "section" for depth-3 commentary; the chapter-level ref is only a container.
- Comment segment ref = `Rashi on Genesis 1:1:1`; the commentary comment number comes from array index within the verse array. Displaying "1:1:1"-style numbers requires the verse number from the outer index (starting at `sections[last]`) and the inner index.
- **Commentary-on-base-text linking**: `links.json` for `genesis-1` has 681 links of which `category "Commentary"` = 464; each link carries `ref "Rashbam on Genesis 1:1:1"`, `anchorRef "Genesis 1:1"`, `sourceRef`, `commentaryNum 1.0001`, `collectiveTitle{en,he}`, `anchorVerse`, `sourceHasEn`. In the reverse direction `links.json` for `rashi-on-genesis-1` returns Siftei Chakhamim (`anchorRef "Rashi on Genesis 1:10:1"`) etc. To open Rashi "as the main text" vs "in the sidebar", the old client uses `isCommentaryRefWithBaseText` (needs exactly one `base_text_titles`, a `base_text_mapping`, depth >= 3); `many_to_one` drops the last section when converting to the base ref (`Rashi on Genesis 1:1:1` -> `Genesis 1:1`). Ramban's `many_to_one_default_only` and Mishnah Berurah (no mapping) behave differently.
- Inline: Hebrew `<b>` (55) for the dibbur hamatchil ("<b>בראשית.</b> ..."), stored 19 Hebrew anchors, wrapped 76 refLinks total; English has 57 anchors and 1 `<i>`. No footnotes in Rashi.
- **Ramban** (`isComplex true`): schema is a `SchemaNode` with `intro` (shared title "Introduction"), `Foreword` (`depth 1`, `["Paragraph"]`), and a `default` JaggedArray depth 3 `isSegmentLevelDiburHamatchil true`, `diburHamatchilRegexes ["^<b>(.+?)</b>","^(.+?)[\\-–]"]`. The default node is requested without a node prefix (`Ramban on Genesis 1`) via `default_child_ref()`. `prev "Ramban on Genesis, Foreword"` (a non-numeric sibling node), `next "Ramban on Genesis 2:1"`, `firstAvailableSectionRef "Ramban on Genesis 1:1"`. Parasha `alt_structs` exist (`depth 0 ArrayMapNode includeSections:false`, refs like `Ramban on Genesis 1:1:1-6:8:1`); `alts` in v3 is `[[{...,"whole":true}]]` (nested one level deeper than for Genesis because the text is depth 3). English has heavy footnotes (261 markers), 733 `<i>` (footnote bodies), 72 `<br>`.

### 5.2 Talmud commentary: `rashi-on-berakhot-2a`, `tosafot-on-berakhot-2a`

- `textDepth 3`, `["Daf","Line","Comment"]`, `["Talmud","Integer","Integer"]`. The first axis is a Talmud address, so section is `2a`. `sections ["2a"]`.
- `ref "Rashi on Berakhot 2a"`, `firstAvailableSectionRef "Rashi on Berakhot 2a:1"`, `next "Rashi on Berakhot 2b:1"` (a **verse/line-level ref with the amud**, not "2b"), `prev null`.
- `text` is `[[comments on line1],[line2],...]`: Rashi he is `[2,0,1,0,9,1,0,1,1,0,1,1]` (12 lines) vs en `[2,0,1,0,9,1,0,1,1,0,1,1,0,0]` (14 lines). Tosafot he `[[str]x1]x13` (5 comments total), en 14 slots with the same 5 strings. **Hebrew and English arrays have different outer lengths.**
- Tosafot English (Jan Buckler) is rich: `<b>` ×132, `<br>` ×31, `<small>` ×5, 7 footnotes, 3 refLinks. Rashi on Berakhot en is the Sefaria Community Translation (`CC0`), Hebrew is Vilna Edition (`Public Domain`).
- `collectiveTitle "Rashi"` / `"Tosafot"`; alts follows the Bavli Chapters struct, nested one extra level: `[[{"en":["Chapter 1"],"he":["מאימתי"],"whole":true}]]`.

### 5.3 Halakhic commentary: `mishnah-berurah-1`, `peri-megadim-oc-mz-1`

- `mishnah-berurah-1`: `isComplex true`, `isDependant true`, depth 2 `["Siman","Seif Katan"]`, `["Siman","SeifKatan"]` (the address type `SeifKatan` has no space; the section name does). Schema nodes: `Introduction`, `Introduction to the Laws of Shabbat`, `default`. `prev "Mishnah Berurah, Introduction to the Laws of Shabbat"`, `next "Mishnah Berurah 2"`. `base_text_titles` = Shulchan Arukh, Orach Chayim with **no `base_text_mapping`**, so it can't be converted to a base ref: it opens as its own text. `categories ["Halakhah","Shulchan Arukh","Commentary","Mishnah Berurah"]` (note the category path puts it under Shulchan Arukh, not under "Commentary" at root). `lengths` absent.
- `peri-megadim-oc-mz-1`: depth 3 `["Siman","Seif","Paragraph"]`, `["Integer","Integer","Integer"]`, 3 `base_text_titles` (SA, Turei Zahav, Magen Avraham). `collectiveTitle "Pri Megadim"` (the index title says "Peri"). `firstAvailableSectionRef "Peri Megadim on Orach Chayim, Mishbezot Zahav 1:1"`, `next "...Mishbezot Zahav 2:1"`, `prev "Peri Megadim on Orach Chayim, Principles in Shulchan Arukh"`. Hebrew only: text `[[str]x1]x8`; `warnings` code 104; `versions` contains one version.

---

## 6. Codes of law and halakhah

| slug | depth | sectionNames | addressTypes | isComplex | notes |
|---|---|---|---|---|---|
| `mishneh-torah-foundations-1` | 2 | Chapter, Halakhah | Perek, Halakhah | no | each Mishneh Torah book is its own index (title `Mishneh Torah, Foundations of the Torah`) so there is no single book root; `lengths [10,88]`; no alts |
| `shulchan-arukh-oc-1` | 2 | Siman, Seif | Siman, Seif | no | `lengths [697,4171]`; alt struct (1st entry `Laws Upon Awakening in the Morning`) |
| `kitzur-shulchan-arukh-1` | 2 | Siman, Seif | Siman, Seif | no | `lengths [221,2765]`; alt title text contains a trailing `\n` and bracketed text: `"[סימן א] דיני השכמת הבקר\n"` |
| `arukh-hashulchan-oc-1` | 2 | Siman, Paragraph | Siman, Integer | **yes** | `prev "Arukh HaShulchan, Introduction"`; no `lengths`; he 29 segments / en 12 (empty at #11) |
| `sefer-hachinukh-1` | 2 | Mitzvah, Paragraph | Siman, Integer | **yes** | sections named "Mitzvah" but address type is `Siman`; `default` node plus `Author's Introduction`/`Opening Letter by the Author`; `Parasha` alt struct is **one AltStructNode per mitzvah** (wholeRef `Sefer HaChinukh 1`, titles `"1; The commandment of procreation"`); `prev "Sefer HaChinukh, Opening Letter by the Author"` |
| `teshuvot-harashba-1-98` | 2 | Teshuva, Paragraph | **Siman, Seif** | no | section name `Teshuva` but addressTypes `Siman, Seif`; `lengths [413,11]` yet only a few teshuvot have text; `next "Teshuvot haRashba part I 150"` (jumps); warning 102 |

Details:
- `shulchan-arukh-oc-1` Hebrew carries **itags** `<i data-commentator="Be'er HaGolah" data-label="א" data-order="1"></i>` (85 `data-commentator`, 40 `data-label`, 65 `data-order`). They are empty elements marking where a named commentator attaches (a superscript when a commentator filter is active, hidden otherwise; inv_03 6.4). English translation has no markup. The base-text-with-commentator view relies on these.
- `kitzur-shulchan-arukh-1` English has 16 footnotes and `<span>` ×2.
- `mishneh-torah-foundations-1` Hebrew has `<small>` ×20 (source attributions in parentheses) and refLinks ×45 total.
- `ref` for numbered section is "`Shulchan Arukh, Orach Chayim 1`" i.e. comma-separated sub-title then number; the title portion contains a comma, so don't split on the last space when parsing without the schema.
- `heRef` for Siman works as `שולחן ערוך, אורח חיים א׳`.

---

## 7. Midrash, Kabbalah, Jewish thought, Second Temple

### 7.1 Midrash: `bereshit-rabbah-1`
Depth 2 `Chapter/Paragraph`, `["Perek","Integer"]`, `lengths [100,1036]`, `order [1]`, no alts. English "The Sefaria Midrash Rabbah, 2022" has footnotes (63) and 213 `<i>`; Hebrew has `<small>` ×97 (parenthetical source tags) and anchors; contains the broken `<In …>` element (see 0.5).

### 7.2 Zohar: `zohar-bereshit-1`
- `isComplex true`, `["Chapter","Paragraph"]`, `["Integer","Integer"]`, **no `lengths`**. Schema is `SchemaNode` of named `JaggedArrayNode`s each with `index_offsets_by_depth`: the Introduction has `{"2":[0,3,6,10,15,...]}` and the response has `"index_offsets_by_depth":{"2":[0]}` for `Zohar, Bereshit 1` (this chapter starts at paragraph offset 0). Zohar paragraphs are numbered **continuously across chapters of a parasha**; the displayed number is `offset + index + 1`.
- Two alt structs: `Daf` (`addressTypes ["Talmud"]`, `sectionNames ["Daf"]`, refs such as `Zohar, Introduction 1:1-2:4`) and `Essay` (`["Integer"]`, `["Paragraph"]`). The v3 `alts` is 2 entries and the titles are in the Zohar's own language (first entry `en ["", "1"]`, `he ["", " גליף גלופי בטהירו עילאה"]`, `aliyah_en "1"`, `aliyah_he "א׳"`; empty-string titles exist). Sanitize empty strings; the Hebrew `parasha_he` has a leading space.
- `prev "Zohar, Introduction 34"` (end of the previous node), `next "Zohar, Bereshit 2"`.
- Text overlays: `<i data-overlay="Vilna Pages" data-value="15a"></i>` is the daf marker (Zohar uses daf numbers inline, with `Talmud` address type in the alt struct).
- Versions: he "Vocalized Zohar, Israel 2013" (isSource) and he "Hebrew Translation" (not source). 4 versions available.

### 7.3 Sefer Yetzirah: `sefer-yetzirah-1`
Depth 2 `Chapter/Mishnah`, `["Perek","Mishnah"]` (uses the Mishnah address type even though it's Kabbalah), `lengths [6,48]`. English has 22 footnotes; 139 `<i>`.

### 7.4 Jewish thought
- `guide-perplexed-1-1`: `isComplex true`, `["Chapter","Paragraph"]`, `["Perek","Integer"]`, `lengths [76]` (Part 1 only), `book "Guide for the Perplexed"` vs `indexTitle "Guide for the Perplexed, Part 1"` vs `ref "Guide for the Perplexed, Part 1 1"` (the node title contains a number: "Part 1" then chapter 1). `prev "Guide for the Perplexed, Part 1, Introduction"`. Old client hard-codes the title to hide segment numbers. Hebrew is Makbili (isSource false, isPrimary true). Inline: `<span class="mediumGrey">` (4, a heading-ish grey line), `<sup>1</sup>` plain superscripts without class (8; **not** footnote-marker), `<b>` (37), `<br>` (6).
- `kuzari-1-1`: requested a **segment** ref `Kuzari 1:1`. Response: `ref "Kuzari 1:1"`, `sections ["1","1"]`, `toSections ["1","1"]`, `sectionRef "Kuzari 1"`, `firstAvailableSectionRef "Kuzari 1:1"`, `next "Kuzari 2"`. **`text` is a bare string** (`"text":"..."`), not an array, for each version (one segment, depth collapsed). Handle `string | string[] | string[][]`. `["Essay","Statement"]`, `["Perek","Integer"]`, `lengths [5,350]`; both versions are `isSource:false` (the Ben-Yehuda Hebrew is a translation from Arabic).

### 7.5 Second Temple: `ben-sira-1`, `philo-creation-1`
- `ben-sira-1`: `Chapter/Verse` `lengths [51,1018]`; Hebrew segments wrapped in brackets (`[כָּל חָכְמָה ...]`) where reconstructed; **empty segments #9 and #10 in both versions** (filled by `fill_in_missing_segments`, returned as `""`). Render as gaps, not crashes.
- `philo-creation-1`: `isComplex true`, `["Chapter","Paragraph"]`, `["Integer","Integer"]`, no lengths; **English only**: 1 version in `versions`, `isPrimary true, isSource false`, `available_versions` 1; warnings `[]` (no warning, because only one language exists and a `primary` was found). Reader must not render a blank Hebrew column; the "primary" slot may be a translation.

---

## 8. Liturgy

### `siddur-ashkenaz-modeh-ani`, `pesach-haggadah-kadesh`
- `textDepth 1`, `sectionNames ["Paragraph"]`, `addressTypes ["Integer"]`, `isComplex true`, **`sections []` and `toSections []`**: the requested ref is a *named node* (a leaf of a deep SchemaNode tree), so there are no numeric sections. `sectionRef == ref`, `lengths` absent.
- Long, comma-joined refs and heRefs are the node path: `Siddur Ashkenaz, Weekday, Shacharit, Preparatory Prayers, Modeh Ani`; `heRef "סידור אשכנז, ימי חול, תפילת שחרית, הכנה לתפילה, מודה אני"`. `book`/`indexTitle` is `Siddur Ashkenaz` for `Siddur`, and `Pesach Haggadah` for the Haggadah.
- `next` is the next *named node*, not a number: `Siddur Ashkenaz, Weekday, Shacharit, Preparatory Prayers, Netilat Yadayim`, `Pesach Haggadah, Urchatz`. `prev null` at the start of the node list.
- No segment numbers shown in the old client (inv_03 6.6). Text is array of paragraphs (2 and 13).
- Inline: Haggadah he `<small>` ×11 (rubrics/instructions), en `<small>` ×8, `<i>` ×8, and **`<br>` ×52** (line breaks within paragraphs). Siddur he `<b>` ×2. No refLinks.
- Haggadah has a TOC page with nested named nodes (see `docs/reference/haggadah-toc.png`).

---

## 9. Dictionaries (virtual books): `jastrow-abba-1`, `klein-av-1`

- `primary_category "Reference"`, `categories ["Reference", ...]`, `isComplex true`, `textDepth 1`, `["Line"]`, `["Integer"]`, `lexiconName` on the index; schema contains a `DictionaryNode` (with `lexiconName`, `firstWord`, `lastWord`, `headwordMap` of Hebrew letter -> `Jastrow, א` ...) plus `Preface` etc. `index_offsets_by_depth` and `lengths` are null (virtual).
- **Headword is the ref.** `ref "Jastrow, אַבָּא I 1"` (headword with vowels + homograph numeral + line number), `sectionRef "Jastrow, אַבָּא I"` (**sectionRef drops the line number**), `sections ["1"]`; `firstAvailableSectionRef "Jastrow, אַבָּא I 1"`. For Klein: `ref "Klein Dictionary, אָב ᴵ"` with superscript-letter homograph marker `ᴵ`, `sections []`, `next "Klein Dictionary, אָב ᴵᴵ"`, `prev "Klein Dictionary, ◌ָא ᴵᴵ"`. Refs contain niqqud, spaces, commas, Unicode small caps; URL-encode (`/Jastrow,_%D7%90%D6%B7...`) and never normalize or strip diacritics.
- `next`/`prev` are alphabetical neighbour entries, not numbers.
- Single version, `isSource:true, isPrimary:true, language:"en", direction:"ltr"` (Jastrow: `London, Luzac, 1903`, `Public Domain`; Klein: `Carta Jerusalem; 1st edition, 1987`, `CC-BY-NC`). Warning 104 is always present (no translation) and should be suppressed in UI.
- Markup: `<strong>` (Jastrow 2, Klein 1), `<a class="refLink" ...>` **stored, class without trailing space and with `href="/Jastrow,_אָב II.1"`** (21 / 5), `<span dir="rtl">` and `<strong dir="rtl">` (Hebrew/Aramaic words inside an LTR paragraph; 11 spans), `<i>` (4/3), Klein `<b>` ×10. Do not strip `dir`.
- Word lookup source: `jastrow-abba-1/words.json` (the lookup endpoint) returns `[{"headword":"אַבָּא I","parent_lexicon":"Jastrow Dictionary","rid":"A00017","language_code":" ch. = h.","refs":["Jastrow, אָב II 1","Onkelos Genesis 41:43",...],"language_reference":"<a class=\"refLink\" ...>", ...}]` (HTML inside JSON fields; sanitize). Dictionary lookup in the reader is by selecting a word and calling this endpoint (inv_03 7.4), not by navigating.
- Old client: no section title, no segment numbers for `categories[0]=="Reference"` (inv_03 6.5).

---

## 10. Response shape cheat sheet (distinct `text` shapes seen)

| shape | where | example |
|---|---|---|
| `string[]` (depth 2 section) | Genesis 1 (31), Mishnah, Midrash, codes, Ben Sira (35 incl. 2 empty) | `["...","..."]` |
| `string[]` partial range | Genesis 1:1-5, Berakhot 2a:1-5 | 5 items; offset = `sections[last]` |
| `string` (segment ref) | Kuzari 1:1 | `"text":"..."` |
| `string[][]` (depth 3 at verse/line axis) | Rashi, Tosafot, Ramban, Peri Megadim | `[[a,b,c],[],[d]]`; inner empty arrays |
| `string[][]` spanning | Berakhot 2a-3b | `[[14],[19],[15],[32]]` with `spanningRefs` |
| `string[]` depth-1 node | Siddur, Haggadah | `["...","..."]`, `sections []` |
| `string[]` with `sources[]` | Tosefta en | `sources` same length |

---

## 11. next / prev / ref normalization gotchas (verified)

| request | `ref` | `sectionRef` | `firstAvailableSectionRef` | `next` | `prev` |
|---|---|---|---|---|---|
| Genesis 1 | Genesis 1 | Genesis 1 | Genesis 1 | Genesis 2 | null |
| Genesis 1:1-5 | Genesis 1:1-5 | Genesis 1 | **Genesis 1:1-5** | Genesis 2 | null |
| Berakhot 2a | Berakhot 2a | Berakhot 2a | Berakhot 2a | Berakhot 2b | null |
| Berakhot 2a-3b | **Berakhot 2-3** | Berakhot 2-3 | Berakhot 2-3 | Berakhot 4a | null |
| Rashi on Genesis 1 | Rashi on Genesis 1 | Rashi on Genesis 1 | **Rashi on Genesis 1:1** | **Rashi on Genesis 2:2** | null |
| Rashi on Berakhot 2a | same | same | **Rashi on Berakhot 2a:1** | **Rashi on Berakhot 2b:1** | null |
| Ramban on Genesis 1 | same | same | Ramban on Genesis 1:1 | Ramban on Genesis 2:1 | **Ramban on Genesis, Foreword** |
| Mishnah Berurah 1 | same | same | same | Mishnah Berurah 2 | **Mishnah Berurah, Introduction to the Laws of Shabbat** |
| Zohar, Bereshit 1 | same | same | same | Zohar, Bereshit 2 | **Zohar, Introduction 34** |
| Kuzari 1:1 | Kuzari 1:1 | **Kuzari 1** | Kuzari 1:1 | **Kuzari 2** | null |
| Jastrow, אַבָּא I 1 | same | **Jastrow, אַבָּא I** | same | Jastrow, אַבָּא II | Jastrow, אֵב |
| Teshuvot haRashba part I 98 | same | same | same | **...part I 150** | null |
| Siddur ... Modeh Ani | same | same | same | ...Netilat Yadayim | null |

Rules for the new client:
- Navigation arrows use `next`/`prev` verbatim; never compute `n+1`.
- A `next`/`prev` of `null` means start/end of that node (for complex books the next node may be reachable only through the TOC).
- `firstAvailableSectionRef` is where to *land*; `sectionRef` is the container used to fetch text and keys for caching; a range request keeps `ref` as the range.
- Normalized `ref` may differ from the request (spanning daf ranges, Hebrew refs, trailing `.`). Cache under both the requested and the returned refs.
- Section-level `next` for depth-3 commentary points to **verse/line level** (`2:2`, `2b:1`), so the destination's `textDepth` stays 3 but its `ref` is one level deeper; the next fetch returns a verse-level section with its own `prev`/`next` (verified in `section-first.json` / `section-next.json` for Rashi).

---

## 12. Inline HTML observed (exact tags / classes, counts)

Counts are total occurrences across both versions in `v3-texts.json` (wrap_all_entities). `a.refLink` and `a.namedEntityLink` are mostly generated by the wrap option (section 0.3).

| slug | tags | classes / data attrs |
|---|---|---|
| genesis-1 | big 1, small 4, span 9, br 8, b 5, sup 3, i 3 | `span.mam-spi-pe` 6, `sup.footnote-marker` 3, `i.footnote` 3, `span.poetry indentAll` 3 |
| genesis-1-1-5 | big, small, span, br; sup/i/b 3 each | `mam-spi-pe` 1, `sup.footnote-marker` 3, `i.footnote` 3 |
| psalms-23 | b 4, span 18, br 13, small 2, sup 2, i 2 | `span.poetry indentAll` 5, `span.poetry indentAllDouble` 12, `mam-spi-pe` 1, footnotes 2 |
| isaiah-40 | span 126, br 88, small 13, sup 8, i 11, b 8, a 2 | `mam-spi-samekh` 7, `mam-spi-pe` 2, `poetry indentAll` 116, `poetry indentAllDouble` 1, `a.refLink` 2 (`data-ref`,`data-range`), footnotes 8 |
| song-of-songs-1 | big 1, span 54, br 34, small 2, sup 7, i 10, b 7 | `mam-spi-pe` 2, `mam-spi-samekh` 1, `mam-kq` 1, `mam-kq-k` 1, `mam-kq-q` 1, `poetry indentAll` 48, footnotes 7 |
| onkelos-genesis-1 | b 13 | none |
| berakhot-2a | big 2, strong 4, a 14, i 69, br 2, b 88 | `a.namedEntityLink` 8 (`data-slug`), `a.refLink` 6 |
| berakhot-2a-1-5 | big 1, strong 2, a 11, i 17, br 2, b 25 | `namedEntityLink` 8, `refLink` 3 |
| berakhot-2a-3b | big 2, strong 4, a 219, i 168, br 15, b 454 | `namedEntityLink` 200, `refLink` 19 |
| jt-berakhot-1-1 | strong 4, big 2, i 516, a 359, sup 140, br 30, b 2 | `namedEntityLink` 80, `sup.footnote-marker` 139, `i.footnote` 139, `a.refLink` (no trailing space, stored) 142 + `a.refLink ` 137, `i[data-overlay="Vilna Pages"][data-value]` 22 |
| mishnah-berakhot-1 | a 46, i 42, br 5, b 91 | `namedEntityLink` 39, `refLink` 7 |
| tosefta-berakhot-1 | a 20 | `refLink` 20 |
| pirkei-avot-1 | a 59 | `namedEntityLink` 57, `refLink` 2 |
| rashi-on-genesis-1 | b 55, a 76, i 1 | `refLink` 76 |
| rashi-on-berakhot-2a | a 6 | `refLink` 6 |
| tosafot-on-berakhot-2a | a 11, b 132, small 5, br 31, sup 7, i 7 | `refLink` 11, footnotes 7 |
| ramban-on-genesis-1 | b 48, a 333, br 73, i 733, sup 261 | `refLink` 333, footnotes 261 |
| mishneh-torah-foundations-1 | small 20, a 45, br 15, i 1 | `refLink` 45 |
| shulchan-arukh-oc-1 | b 1, br 1, i 85, small 3, a 1 | `i[data-commentator]` 85 (+`data-label` 40, `data-order` 65), `refLink` 1 |
| mishnah-berurah-1 | a 20 | `refLink` 20 |
| kitzur-shulchan-arukh-1 | a 15, sup 16, i 45, span 2 | `refLink` 15, footnotes 16 |
| arukh-hashulchan-oc-1 | a 53, b 4, br 3 | `refLink` 53 |
| siddur-ashkenaz-modeh-ani | b 2 | none |
| pesach-haggadah-kadesh | small 19, b 1, i 8, br 52 | none |
| zohar-bereshit-1 | i 1, a 1 | `i[data-overlay="Vilna Pages"][data-value="15a"]` 1 |
| sefer-yetzirah-1 | small 2, sup 22, i 139, a 37 | `refLink` 37, footnotes 22 |
| bereshit-rabbah-1 | small 97, a 211, sup 63, i 213, br 27, b 1, `In` 1 | `refLink` 211, footnotes 63 |
| sefer-hachinukh-1 | b 2, a 20, i 3 | `refLink` 20 |
| guide-perplexed-1-1 | b 37, a 33, br 6, span 4, sup 8 | `refLink` 33, `span.mediumGrey` 4, bare `<sup>` 8 |
| kuzari-1-1 | none | none |
| jastrow-abba-1 | strong 2, a 21, span 11, i 4 | `a.refLink` (stored, no trailing space) 21, `span[dir=rtl]` |
| klein-av-1 | strong 1, a 5, b 10, i 3 | `a.refLink` 5 |
| teshuvot-harashba-1-98 | none | none |
| ben-sira-1 | br 2 | none |
| philo-creation-1 | none | none |
| peri-megadim-oc-mz-1 | a 11, b 1 | `refLink` 11 |

Totals of distinct constructs observed anywhere:
- Tags: `a, b, big, br, i, small, span, strong, sup` (+ the bogus `In`). Not observed in text: `img, u, em, sub`.
- `sup.footnote-marker` (content: letter `a` or number) is always immediately followed by `i.footnote` containing the footnote body (an `<i class="footnote">` whose own content can contain `<b>`, `<i>`, `<a class="refLink">`). The reader must pair marker and body and render the body in a popover or footnote area, not inline.
- `i[data-commentator][data-order][data-label]`: empty itag, only Shulchan Arukh in this sample.
- `i[data-overlay="Vilna Pages"][data-value]`: empty overlay marker (JT, Zohar).
- `span` classes: `mam-spi-pe`, `mam-spi-samekh` (paragraph breaks `{פ}`/`{ס}`), `mam-kq`, `mam-kq-k`, `mam-kq-q`, `poetry indentAll`, `poetry indentAllDouble`, `mediumGrey`; plus `span[dir=rtl]`.
- `a` classes: `refLink`, `refLink ` (trailing space), `namedEntityLink `. Never `categoryLink` in this set.
- HTML entities in strings: `&nbsp;` 84, `&thinsp;` 20, `&#x27;` 5, `&lt;` 2, `&gt;` 2 (decode).
- Whitespace: `\n` only in Pirkei Avot (18 segments).

---

## 13. Per-book-type summary and special handling

| type (slug) | depth / sectionNames | addressTypes | complex | alts | segment number display | what to do differently |
|---|---|---|---|---|---|---|
| Torah (genesis-1) | 2 Chapter, Verse | Perek, Pasuk | no | Parasha: aliyah+parasha keys | Hebrew numerals (א, ב, ... ט״ו, ט״ז) | aliyah/parasha headers, nikkud/te'amim toggles, footnotes, many translation languages, poetry spans in English |
| Targum (onkelos) | 2 | Perek, Pasuk | no | same Parasha | verse numbers | treat as Torah for aliyot; dependent but not shown in sidebar |
| Writings poetry (psalms) | 2 | Perek, Pasuk | no | Day-of-month (no aliyah keys) | verse numbers | poetry line indents; alt without aliyah fields |
| Prophets (isaiah) | 2 | Perek, Pasuk | no | `[]` | verse numbers | haftarah must come from calendar, not alts; samekh/pe markers |
| Megillah (song-of-songs) | 2 | Perek, Pasuk | no | `[]` | verse numbers | ketiv/qere spans |
| Bavli (berakhot) | 2 Daf, Line | **Talmud**, Integer | no | Chapters | section = `2a`, lines 1..N | daf/amud conversion, William Davidson attribution, spanning ranges as nested arrays, manuscripts, entity links |
| Yerushalmi (jt) | 3 Chapter, Halakhah, Segment | Perek, Halakhah, Integer | no | Venice (**Folio**) + Vilna (Talmud) merged | halakhah:segment | Folio a-d, Vilna overlay `<i>`, merged alt labels |
| Mishnah | 2 Chapter, Mishnah | Perek, Mishnah | no | none | mishnah numbers | decide by primary_category (Avot) |
| Tosefta | 2 Chapter, Tosefta | Perek, Integer | no | none | numbers | merged translation (`sources[]`) |
| Commentary on Tanakh (rashi, ramban) | 3 Chapter, Verse, Comment | Perek, Pasuk, Integer | Ramban yes | Parasha (nested) | verse:comment | super-section redirect, ragged/empty arrays, next = verse-level ref, dibbur hamatchil `<b>` |
| Commentary on Talmud (rashi/tosafot berakhot) | 3 Daf, Line, Comment | Talmud, Integer, Integer | no | Chapters (nested) | 2a:line:comment | he/en outer length mismatch; next = `2b:1` |
| Halakhic commentary (mishnah-berurah, peri-megadim) | 2 / 3 | Siman, SeifKatan / Integer×3 | yes | none | seif katan / paragraph | named intro nodes as `prev`; no base mapping for MB; he-only for PM |
| Mishneh Torah | 2 Chapter, Halakhah | Perek, Halakhah | no | none | halakhah numbers | one index per book; nested TOC |
| Shulchan Arukh / Kitzur | 2 Siman, Seif | Siman, Seif | no | Siman titles | seif numbers (Hebrew letters) | itags (SA), commentator markers |
| Arukh HaShulchan | 2 Siman, Paragraph | Siman, Integer | yes | has alt | paragraph numbers | complex nodes, partial English |
| Sefer HaChinukh | 2 Mitzvah, Paragraph | Siman, Integer | yes | per-mitzvah AltStruct | paragraph numbers | section name Mitzvah but address Siman; opening nodes |
| Responsa | 2 Teshuva, Paragraph | Siman, Seif | no | none | paragraph | sparse content; he missing (warning 102) |
| Midrash | 2 Chapter, Paragraph | Perek, Integer | no | none | paragraph numbers | footnotes, stray `<In>` |
| Zohar | 2 Chapter, Paragraph | Integer, Integer | yes | Daf + Essay | continuous paragraph numbers via offsets | `index_offsets_by_depth`, he translation as 2nd version |
| Sefer Yetzirah | 2 Chapter, Mishnah | Perek, Mishnah | no | none | numbers | -- |
| Jewish thought (guide) | 2 Chapter, Paragraph | Perek, Integer | yes | none | **hidden in old client** | hide numbers; he is not source; grey heading span |
| Jewish thought (kuzari) | 2 Essay, Statement | Perek, Integer | no | none | numbers | segment ref returns scalar string; neither language isSource |
| Liturgy (siddur, haggadah) | 1 Paragraph | Integer | yes | none | **hidden** | named-node refs, `sections []`, next is next node, `<br>`/`<small>` rubrics |
| Dictionary (jastrow, klein) | 1 Line | Integer | yes (virtual) | none | hidden | headword refs, no shape, he lookup via words endpoint, `dir=rtl` spans, warning 104 |
| Second Temple (ben-sira) | 2 Chapter, Verse | Perek, Pasuk | no | none | verse numbers | empty segments |
| Translation-only (philo) | 2 Chapter, Paragraph | Integer, Integer | yes | none | numbers | no Hebrew; primary is English translation |
| Hebrew-only (peri-megadim) | 3 | Integer×3 | yes | none | numbers | no translation; warning 104 |

### Segment-number rendering rules (derived)
- English UI: ASCII integers; Talmud sections `2a`/`2b`; Yerushalmi `1:1`; Zohar continuous.
- Hebrew UI: Hebrew numerals via gematria (1-9 = `א׳..ט׳`, 10 = `י׳`, 15 = `ט״ו`, 16 = `ט״ז`, 23 = `כ״ג`); a lone letter gets geresh, 2+ letters get gershayim before the last letter. Talmud: daf as numeral plus `.` (a) / `:` (b) for short form or `א`/`ב` for long form as in `heRef "ברכות ב׳ א"`.
- Hide numbers for: Liturgy, Reference (dictionaries), Guide for the Perplexed (old client), commentaries when shown in the sidebar (they are indexed by link, not by number).
- Compute from `sections` (start) + array index; for spanning use `spanningRefs`; for Zohar add `index_offsets_by_depth`.

---

## 14. Reader capability matrix

Legend: `Y` required/used, `n` not needed, `~` partially / conditionally. "Folio" = 4-sided daf a-d.

| book type | daf numbering | aliyot / parasha | poetry lines | complex TOC / nodes | commentary-base linking | dictionary lookup | alt structs | footnotes | folio | images / manuscripts | translation-only / he-only | itags / overlays | merged versions | many languages |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| Torah (Genesis) | n | Y | Y (en) | n | Y (target of Rashi etc.) | n | Y | Y | n | ~ (related manuscripts: 2) | n | n | n | Y (50 versions) |
| Onkelos | n | Y | n | n | ~ (dependent, targum) | n | Y | n | n | n | n | n | n | n |
| Psalms | n | n (day alt) | Y | n | Y | n | Y (day) | Y | n | n | n | n | n | ~ |
| Prophets / Megillah | n | n | Y | n | Y | n | n (`[]`) | Y | n | ~ | n | n (ketiv/qere span) | n | ~ |
| Bavli | Y | n | n | n | Y (Rashi/Tosafot) | n | Y (chapters) | n | n | Y (manuscripts) | n | n | n | n |
| Yerushalmi | ~ (Vilna daf) | n | n | n | ~ | n | Y (Venice+Vilna) | Y | Y | n | n | Y (Vilna overlay) | n | n |
| Mishnah | n | n | n | n | Y | n | n | n | n | n | n | n | n | n |
| Tosefta | n | n | n | n | ~ | n | n | n | n | n | n | n | Y | n |
| Commentary on Tanakh | n | ~ (alts nested; hidden) | n | ~ (Ramban intro/foreword) | Y (it is the commentary) | n | ~ | Y (Ramban en) | n | n | n | n | n | n |
| Commentary on Talmud | Y | n | n | n | Y | n | ~ | ~ | n | n | n | n | n | n |
| Mishnah Berurah / Peri Megadim | n | n | n | Y | ~ (MB: no mapping) | n | n | n | n | n | ~ (PM he-only) | n | n | n |
| Mishneh Torah | n | n | n | ~ (nested TOC) | n | n | n | n | n | n | n | n | n | n |
| Shulchan Arukh / Kitzur | n | n | n | n | Y (commentators attach) | n | Y (Siman titles) | ~ (Kitzur) | n | n | n | Y (SA itags) | n | n |
| Arukh HaShulchan / Sefer HaChinukh | n | ~ (Chinukh Parasha) | n | Y | n | n | Y | n | n | n | ~ | n | n | n |
| Responsa | n | n | n | n | n | n | n | n | n | n | ~ (sparse, he missing) | n | n | n |
| Midrash | n | n | n | n | ~ | n | n | Y | n | n | n | n | n | n |
| Zohar | ~ (daf alt) | n | n | Y | n | n | Y (Daf, Essay) | n | n | n | n | Y (Vilna overlay) | n | n |
| Jewish thought (Guide/Kuzari) | n | n | n | ~ (Guide parts) | n | n | n | ~ | n | n | ~ (non-source primary) | n | n | n |
| Liturgy | n | n | ~ (`<br>` lines) | Y (deep nodes) | n | n | n | n | n | n | n | n | n | n |
| Dictionary | n | n | n | Y (virtual headword nodes) | n | Y | n | n | n | n | Y (en source only) | n | n | n |
| Second Temple | n | n | n | n | n | n | n | n | n | n | ~ (Philo en-only) | n | n | n |

Minimum feature list implied by the matrix:
1. Segment-array renderer that handles `string`, `string[]`, `string[][]`, and ranges, with per-version length alignment and empty-segment tolerance.
2. Ref-address helper set: Hebrew numeral formatter, daf int<->`2a` converter, Folio a-d, offsets, spanning label from `spanningRefs`.
3. `alts` consumer (aliyah/parasha, chapter, day, Venice/Vilna) keyed by segment index, tolerant of `null`, nesting, and missing aliyah fields.
4. Inline HTML sanitizer + renderers for footnote pairs, refLink/namedEntityLink, itag/overlay markers, poetry spans, ketiv/qere, `dir=rtl`.
5. Version selection logic based on `isPrimary`/`isSource`/`actualLanguage` (not `language`), with merged-version (`sources`) display and warning 102/104 handling.
6. Navigation from `next`/`prev`/`firstAvailableSectionRef` only.

---

## 15. Fixture problems

- **`jastrow-abba-1/shape.json` and `klein-av-1/shape.json`: HTTP 500.** The recorded file is `{"_nonJsonBody": "<!DOCTYPE html>...Internal Server Error..."}`. `/api/shape/Jastrow` and `/api/shape/Klein_Dictionary` do not work for dictionaries (virtual indexes). Do not use `shape` for them; the manifest still lists status 500.
- **Truncated payloads** (manifest `truncated: true`; JSON still parses but arrays are cut): `related.json` for genesis-1 (484 KB of 16.1 MB), psalms-23, isaiah-40, song-of-songs-1, berakhot-2a, berakhot-2a-3b, jt-berakhot-1-1, mishnah-berakhot-1, pirkei-avot-1, rashi-on-genesis-1, ramban-on-genesis-1, mishneh-torah-foundations-1, shulchan-arukh-oc-1, sefer-yetzirah-1, bereshit-rabbah-1, kuzari-1-1; `links.json` for genesis-1 (480 KB of 7.4 MB), isaiah-40, song-of-songs-1, berakhot-2a-3b, jt-berakhot-1-1, mishnah-berakhot-1, pirkei-avot-1, rashi-on-genesis-1, bereshit-rabbah-1; and `berakhot-2a/book-ref.json` (2.05 of 4.0 MB; the file was present when first listed and later missing from the directory, so re-check). Counts of links/sheets/topics derived from these (e.g. Genesis links 681, related links 86) are therefore lower bounds. In `genesis-1/related.json` the keys are `links 86, sheets 141, notes 0, topics 86, manuscripts 2, media 31, guides 0`, while `links.json` has 681 entries; the two endpoints are not directly comparable.
- **`genesis-1/v3-texts.json` is byte-identical to `v3-texts-default.json`** (and likewise for jastrow-abba-1 and most one-language sections without entities). Where they differ (Berakhot, Mishnah, Rashi, etc.), the difference is only entity/ref wrapping (section 0.3). The "default" fixtures do not exercise `fill_in_missing_segments`.
- **Dictionary entries (Jastrow, Klein) have only `v3-texts*`, `index*`, `related`, `links`, `versions`, `name` valid; no `shape`.** `klein-av-1` has `sections []` and an entry-level `ref` (no line number), whereas `jastrow-abba-1` has `sections ["1"]`; the two dictionaries are not shaped alike.
- **`kuzari-1-1`** records a *segment ref*, so `text` is a scalar string; the manifest's `textDepth 2` is the book depth, not the text nesting. Same for `genesis-1-1-5`/`berakhot-2a-1-5` (arrays are flat, not depth 2).
- **`teshuvot-harashba-1-98`**: the requested language is not available; `versions` has only the English community translation (`isPrimary false`), so the "primary Hebrew" fixture is actually missing; `lengths [413,11]` suggests 413 teshuvot but the manifest note says very few have text.
- **`zohar-bereshit-1`**: both returned versions are Hebrew; no English at all, so it does not cover a "translation slot returns English" case. Its `index_offsets_by_depth` is `{"2":[0]}` (offset 0), so non-zero offsets (the offset case) are only visible in `index.json`, not exercised in `v3`.
- **`song-of-songs-1`, `tosefta-berakhot-1`, `pirkei-avot-1`, `sefer-yetzirah-1`, `kuzari-1-1`, `mishnah-berakhot-1` `shape.json`**: valid but small (< 400 bytes; list of one book object with `chapters` as int array); not a problem, but note it differs from Genesis/Berakhot where `chapters` is an array of per-chapter arrays/objects (`[..50]`).
- **`psalms-23` manifest `why` says poetry "formatAsPoetry"**: every `formatAsPoetry` field in all fixtures is `""`; poetry is carried only by `span.poetry` markup. The manifest note is misleading.
- **`isaiah-40` / `song-of-songs-1`**: `alts` is `[]`, so these do not exercise haftarah or megillah alt structs (despite the manifest's "haftarah source").
- **`ben-sira-1`** includes empty segments (good), but `berakhot-2a-3b` fixture `related.json`/`links.json` are for the spanning ref `Berakhot_2-3` and truncated, so spanning link anchoring is only partly verifiable.
- **No `<img>` in any text fixture** (see 0.6): image rendering paths in text cannot be verified from this data.
- Files `book-ref.json`, `section-first.json`, `section-next.json` exist in some slug directories but are **not listed in the manifest for those slugs** at the time of this analysis (appear to have been added by another recording pass); `berakhot-2a/book-ref.json` was listed by `ls` then absent on re-read. Treat them as unstable until the manifest is regenerated.
