# Sefaria Reader: Component Audit

Status: draft for review. Written 2026-10-04 against Sefaria-Project `master` @ `bb47dd77a`.

This document is the input to the new component library: React, TanStack Start, maintained in Storybook. It has five parts:

- **A.** The real design tokens of the old client, with file:line sources.
- **B.** An inventory of the old client's reusable components, with duplicate groups flagged.
- **C.** The proposed layered library. Every component lists its purpose, what it replaces, props, accessibility, the feature-atlas IDs it serves, and the stories it needs.
- **D.** Rules to prevent duplication.
- **E.** Build order, with the Tanakh and Talmud reader first.

**Path conventions**
- Old client paths are relative to `Sefaria-Project/static/`, so `js/Misc.jsx:631` means `Sefaria-Project/static/js/Misc.jsx` line 631.
- Feature IDs (`TXD-045`, `CON-025`, …) come from `Sefaria-Project/client-rebuild-inventory/features.json`, which has 941 features.
- The `inv_0N` write-ups live in the same folder.
- Toolkit paths are relative to the `sefaria-frontend-toolkit` checkout, written as `$T`.

**Decisions this audit assumes**
- The library is React, not Lit.
- From the toolkit we reuse `@…/client` (the API SDK) and `@…/text-transform` (sanitizer, vocalization, preview) as they are.
- We port ideas from the toolkit, not code: `--sefaria-*` token naming, translation-selection rules, and vocalization display. See C.0.

---

## A. Design tokens

### A.0 How to read this

The old client has **three overlapping token sources**:
1. `css/color-palette.css`: the `:root` color vars.
2. `css/fonts.scss` / `fonts.css`: font-stack vars.
3. `css/s2.css` `:root` (type scale, z-index), duplicated in `css/themes/library-theme.css`. That file also overrides the font stacks.

Spacing, radii and shadows have **no variables at all** outside the new auth SCSS (`css/common-component.scss`). The values below for those are frequency counts from `s2.css`. The proposed token is the value that appears most often.

**New naming.** Every token is published as `--sefaria-<group>-<name>`, following the toolkit's convention (`$T/packages/web-components/src/tokens.ts:4-53`).
- Components read private `--_sefaria-*` copies that carry fallbacks. That lets an embedder override a public token without breaking the defaults.
- Dark values use `light-dark()`, and the root **must** set `color-scheme`. The toolkit never does, which is a bug: `tokens.ts` has no `color-scheme`.

### A.1 Color: neutrals

| New token | Old name | Value | Source |
|---|---|---|---|
| `--sefaria-color-black` | --black | #000000 | css/color-palette.css:26 |
| `--sefaria-color-near-black` | --near-black | #121212 | color-palette.css:11 |
| `--sefaria-color-grey-900` | --darkest-grey (= --beit-midrash-grey) | #333333 | color-palette.css:12-13 |
| `--sefaria-color-grey-800` | --darker-grey | #575757 | color-palette.css:14 |
| `--sefaria-color-grey-700` | --dark-grey | #666666 | color-palette.css:15 |
| `--sefaria-color-grey-600` | --medium-grey | #6f6f6f | color-palette.css:16 |
| `--sefaria-color-text-secondary` | --secondary-text-grey | #707070 | color-palette.css:17 |
| (retire) | --medium-grey-legacy | #999999 | color-palette.css:18 |
| `--sefaria-color-grey-300` | --light-grey | #CCCCCC (most frequent hex in s2.css, ×61) | color-palette.css:19 |
| `--sefaria-color-grey-250` | --lighter-grey-hover | #DFDFDF | color-palette.css:20 |
| `--sefaria-color-grey-200` | --lighter-grey | #EDEDEC (×26 in s2.css) | color-palette.css:21 |
| `--sefaria-color-skeleton` / `-shimmer` | --skeleton-grey / --skeleton-grey-shimmer | #e6e6e6 / #EFEFEF | color-palette.css:22-23 |
| `--sefaria-color-surface-muted` | --background-grey | #FAFAFA | color-palette.css:24 |
| `--sefaria-color-surface-subtle` | --lightest-grey | #FBFBFA (×32 in s2.css; reader controls bar and nav sidebar) | color-palette.css:25; s2.css:6258, 1512 |
| `--sefaria-color-white` | --white | #FFFFFF | color-palette.css:27 |
| `--sefaria-color-border-title` | (hardcoded) | #E6E5E6 (section title underline) | s2.css:6905 |

### A.2 Color: brand and interaction

| New token | Old name | Value | Source |
|---|---|---|---|
| `--sefaria-color-brand` | --sefaria-blue | #18345D | color-palette.css:4 |
| `--sefaria-color-brand-hover` | (hardcoded, auth) | #132b4c | css/common-component.scss:159 |
| `--sefaria-color-voices` | --sheets-green | #518159 | color-palette.css:6 |
| `--sefaria-color-purple` | --sefaria-purple (= --devportal-purple, --mussar-purple) | #7C416F | color-palette.css:5,7,40 |
| `--sefaria-color-link` | --inline-link-blue | #4871bf | color-palette.css:3 |
| `--sefaria-color-navy` | (hardcoded ×5) | #212E50 | s2.css:3231, 3858, 11816, 12660, 14315 |
| `--sefaria-color-highlight` | --highlight-blue | #DDEEFF (dropdown hover) | color-palette.css:8; s2.css:16075 |
| `--sefaria-color-highlight-soft` | --highlight-blue-light | #F0F7FF (**selected segment**) | color-palette.css:9; s2.css:7156-7162 |
| `--sefaria-color-highlight-voices` | --highlight-green-light | #F1FCF5 (sheet highlight) | color-palette.css:10; s2.css:12964 |
| `--sefaria-color-segment-focus` | (hardcoded) | #f5faff | s2.css:7140 |
| `--sefaria-color-selection` | (hardcoded) | #D2DCFF (`*::selection`) | s2.css:7, 12920 |
| `--sefaria-color-focus` | --focus-blue | #1976d2 | color-palette.css:50 |
| `--sefaria-color-select` | --select-blue | #0056b3 | color-palette.css:48 |
| `--sefaria-color-select-voices` | --select-green | #00827F | color-palette.css:49 |
| `--sefaria-color-selected-option` | --selected-option | #000000 | color-palette.css:47 |
| `--sefaria-theme-primary` | --theme-primary | brand (Library) / voices (Voices) | css/themes/library-theme.css:3; themes/sheets-theme.css:3 |
| `--sefaria-theme-select` | --theme-select | select-blue / select-green | library-theme.css:5; sheets-theme.css:5 |

### A.3 Color: semantic

There are **no semantic variables in the old `:root`**. These values are harvested from where they are used.

| New token | Value | Source |
|---|---|---|
| `--sefaria-color-danger` | #c03522 (`$sef-error`) | css/common-component.scss:12 |
| `--sefaria-color-danger-strong` / `-danger-bg` | #b71c1c on #fdeeee | s2.css:7601-7602 |
| `--sefaria-color-success` / `-success-bg` | #1b5e20 on #eef8ef | s2.css:7611-7612 |
| `--sefaria-color-text-primary` | #121212 | common-component.scss:13 |
| `--sefaria-color-text-muted` | #707070 | common-component.scss:14 |
| `--sefaria-color-border-default` | #e6e6e6 | common-component.scss:15 |
| `--sefaria-color-surface-disabled` | #f5f5f5 | common-component.scss:17 |
| `--sefaria-color-attention` | --responsa-red #CB6158 (highlighted ToolsButton bg) | s2.css:8758-8760 |
| (retire) | `color: red` (legacy) | s2.css:3258, 9445, 10195 |

**Reading themes.** These are the old light / sepia / dark values. Color theme is an "optional live" feature (TXD-039, SHL-006); the tokens are kept so a dark mode can be added cheaply.

| Token | light | sepia | dark | Source |
|---|---|---|---|---|
| `--sefaria-reader-bg` | #FFFFFF | #f7f7f7 | #333331 | s2.css:1347, 1350, 1353 |
| `--sefaria-page-bg` | (white) | #FBFBFA | #333331 | s2.css:10, 13 |
| `--sefaria-reader-controls-bg` | #FBFBFA | #F3F3F1 | n/a | s2.css:6258, 6261 |
| `--sefaria-segment-highlight` | #F0F7FF | #E3E3E1 | #444 | s2.css:7162, 7176, 7179 |

### A.4 Color: category palette

The palette is canonical: the same color is used everywhere a category, book or ref is shown (LIB-019, GUI-013).
- Category vars: `css/color-palette.css:28-46`.
- Category-to-var map: `js/sefaria/palette.js:23-46`.
- Resolver: `palette.categoryColor()`, `palette.js:47-60`. An unknown category hashes its char codes modulo `palette.colors` (`palette.js:3-20`).

| New token | Old var | Value | color-palette.css | Categories (palette.js line) |
|---|---|---|---|---|
| `--sefaria-cat-tanakh` | --tanakh-teal | #004E5F | 30 | Tanakh (25) |
| `--sefaria-cat-commentary` | --commentary-blue | #4B71B7 | 28 | Commentary (24) |
| `--sefaria-cat-mishnah` | --mishnah-blue | #5A99B7 | 31 | Mishnah (27) |
| `--sefaria-cat-talmud` | --talmud-gold | #CCB479 | 32 | Talmud (28) |
| `--sefaria-cat-midrash` | --midrash-green | #5D956F | 33 | Midrash (26) |
| `--sefaria-cat-halakhah` | --halakhah-red | #802F3E | 34 | Halakhah (29) |
| `--sefaria-cat-kabbalah` | --kabbalah-purple | #594176 | 35 | Kabbalah (30) |
| `--sefaria-cat-liturgy` | --liturgy-rose | #AB4E66 | 36 | Liturgy (32) |
| `--sefaria-cat-jewish-thought` | --philosophy-purple | #7F85A9 | 37 | Jewish Thought (31) |
| `--sefaria-cat-tosefta` | --taanitic-green | #00827F | 38 | Tosefta (33) |
| `--sefaria-cat-chasidut` | --chasidut-green | #97B386 | 39 | Chasidut (34) |
| `--sefaria-cat-musar` | --mussar-purple | #7C416F | 40 | Musar (35) |
| `--sefaria-cat-responsa` | --responsa-red | #CB6158 | 41 | Responsa (36), **Quoting Commentary (38)** |
| `--sefaria-cat-second-temple` | --apocrypha-pink | #C6A7B4 | 42 | Second Temple (37) |
| `--sefaria-cat-modern-commentary` | --modern-works-blue | #B8D4D3 | 43 | Modern Commentary (42) |
| `--sefaria-cat-grammar` | --grammar-green | #B2B272 | 44 | (no mapping; orphan var) |
| `--sefaria-cat-reference` | --reference-orange | #D4896C | 45 | Reference (43) |
| `--sefaria-cat-targum` | --miscelaneous-green *(sic)* | #3B5849 | 46 | Targum (41) |
| `--sefaria-cat-essay` | --essay-links-green | #3B5849 | 29 | Essay links |
| `--sefaria-cat-sheets` | --sefaria-blue | #18345D | 4 | Sheets/Sheet (39-40), System (44) |
| `--sefaria-cat-static` | gradient | `linear-gradient(90deg, #00505E 0 10%, #5698B4 10 20%, #CCB37C 20 30%, #5B9370 30 40%, #823241 40 50%, #5A4474 50 60%, #AD4F66 60 70%, #7285A6 70 80%, #00807E 80 90%, #4872B3 90 100%)` | n/a | Static (45). This is the "rainbow line" (`js/RainbowLine.jsx:3`). |

Fallback palette used for hashing (`palette.js:3-20`): darkteal #004e5f, raspberry #7c406f, green #5d956f, paleblue #9ab8cb, blue #4871bf, orange #cb6158, lightpink #c7a7b4, darkblue #073570, darkpink #ab4e66, lavender #7f85a9, yellow #ccb479, purple #594176, lightblue #5a99b7, lightgreen #97b386, red #802f3e, teal #00827f, lightbg #B8D4D3, tan #D4896C.

**Rule.** Components never reference a `--sefaria-cat-*` var directly. They call `categoryColor(categories)` from `@sefaria-reader/tokens`, a port of `palette.js:47-60` plus `Sefaria.palette.refColor/indexColor` at `js/sefaria/sefaria.js:4078-4087`. That call returns the var reference.

### A.5 Typography: families

**Font stacks** (`css/fonts.scss:39-61`, compiled to `fonts.css:56-78`)

| New token | Old var | Stack | Source |
|---|---|---|---|
| `--sefaria-font-ui-en` | --english-sans-serif-font-family | "Roboto", "Helvetica Neue", "Helvetica", sans-serif | fonts.scss:41 |
| `--sefaria-font-ui-he` | --hebrew-sans-serif-font-family | "Heebo", "Roboto", sans-serif | fonts.scss:42 |
| `--sefaria-font-text-en` | --english-serif-font-family | "Cardo" (Greek ranges), "Meltho" (Syriac), "adobe-garamond-pro", "Taamey Frank", "Crimson Text", "Georgia", "Times New Roman", serif, "Noto Sans Samaritan" | fonts.scss:43-51 |
| `--sefaria-font-text-he` | --hebrew-serif-font-family | "Cardo", "Noto Color Emoji", "Taamey Frank", "adobe-garamond-pro", "Crimson Text", "Times New Roman", serif | fonts.scss:52-58 |
| `--sefaria-font-secondary-en` | --english-secondary-font-family | 'Miriam Libre', var(--english-sans-serif-font-family) | fonts.scss:59 |
| `--sefaria-font-secondary-he` | --hebrew-secondary-font-family | 'Miriam Libre', var(--hebrew-sans-serif-font-family) | fonts.scss:60 |
| (library theme override) | --english-serif-font-family | "Cardo","Meltho","HebrewInEnglish Serif Font","adobe-garamond-pro","Crimson Text",Georgia,"Times New Roman",serif,"Noto Sans Samaritan" | css/themes/library-theme.css:12 |
| (library theme override) | --hebrew-serif-font-family | "Noto Color Emoji","EnglishInHebrew Serif Font","Cardo","Taamey Frank","adobe-garamond-pro","Crimson Text","Times New Roman",serif | library-theme.css:13 |
| legacy hardcoded | n/a | English titles: "adobe-garamond-pro","Crimson Text",Georgia,serif. Hebrew titles: "Heebo",sans-serif | s2.css:137,144,156,193 / 199 |

**@font-face declarations**

| Family | File | unicode-range | Source |
|---|---|---|---|
| Taamey Frank (Medium, Bold, MediumOblique, BoldOblique) | Taamey-Frank/TaameyFrankCLM-*.ttf | U+0000-0040, U+005B-0060, U+007B-FB4F | fonts.scss:22-28; fonts.css:7-34 |
| Cardo | Cardo-Regular.ttf | Greek and combining ranges (U+0300-03FF, U+1F00-1FFF, …) | fonts.scss:37; font-faces.css:72-77 |
| Meltho | SyrCOMBatnan.otf | U+0700-074F (Syriac) | fonts.scss:34; font-faces.css:63-67 |
| Noto Color Emoji | NotoColorEmoji.ttf | U+1F1E6-1F1FF (flags only) | fonts.scss:31; font-faces.css:58-62 |
| Noto Sans Samaritan | (no src) | U+0800-083F | font-faces.css:68-71 |
| HebrewInEnglish Serif Font (4 faces) | TaameyFrankCLM-*, falling back to local Georgia | U+0590-05FF, U+25CC | font-faces.css:1-28 |
| EnglishInHebrew Serif Font (4 faces) | use.typekit.net (Adobe Garamond) | U+0041-007A | font-faces.css:29-57 |
| Rashi Script | Mekorot-Rashi.ttf | none (sheets only) | fonts.scss:19; fonts.css:1-6 |

There is **no "Mekorot Vilna"**; the only Mekorot face is Rashi Script.

Loaded outside CSS, through `base.html`: adobe-garamond-pro (Typekit), Roboto, Heebo, Crimson Text, Miriam Libre.

**How a font is chosen (keep the idea, simplify the mechanism)**
- `.he` and `.int-he` set `--is-hebrew` (fonts.scss:84-87).
- The global rule `* { font-family: var(--hebrew-font-conditional, var(--english-font)) }` (fonts.scss:88-91) then picks the face.
- New rule: choose fonts with `:lang(he)`, `:lang(arc)` and `:lang(yi)` selectors on elements that carry a `lang` attribute taken from payload data. The toolkit already does this: `$T/packages/web-components/src/text-segment-element.ts:112-125`.

**Licensing decision needed.** adobe-garamond-pro comes from Typekit, which needs a kit ID per domain. The new app must either license it or substitute Crimson Text / EB Garamond.

### A.6 Typography: type scale

**Named scale** (s2.css `:root` 45-55, duplicated at library-theme.css:15-25)

| New token | Old var | Value | s2.css |
|---|---|---|---|
| `--sefaria-text-serif-h1` | --serif-h1-font-size | 48px | 45 |
| `--sefaria-text-serif-h2` | --serif-h2-font-size | 30px | 46 |
| `--sefaria-text-serif-h3` | --serif-h3-font-size | 24px | 47 |
| `--sefaria-text-serif-body` | --serif-body-font-size | 18px | 48 |
| `--sefaria-text-serif-small` | --serif-small-font-size | 14px | 49 |
| `--sefaria-text-sans-h1` | --sans-serif-h1-font-size | 40px | 51 |
| `--sefaria-text-sans-h2` | --sans-serif-h2-font-size | 30px | 52 |
| `--sefaria-text-sans-h3` | --sans-serif-h3-font-size | 22px | 53 |
| `--sefaria-text-sans-body` | --sans-serif-body-font-size | 16px | 54 |
| `--sefaria-text-sans-small` | --sans-serif-small-font-size | 14px | 55 |
| `--sefaria-text-caption` | (hardcoded) | 13px (×34) / 12px (×19, segment numbers) | s2.css counts; 7268 |

Frequency of px font sizes in s2.css: 16 (127), 18 (87), 14 (87), 22 (41), 13 (34), 24 (28), 12 (19), 20 (18), 30 (16), 15 (15). The scale above covers more than 90% of uses. Retire 15, 17, 19, 21, 25, 26 and 29.

**Reader text-size chain.** This must be reproduced exactly, because users' saved font sizes depend on it (SHL-009, TXD-036).

| Step | Value | Source |
|---|---|---|
| Panel default `fontSize` | 62.5 (%), applied inline on `.readerContent`. 62.5% × 16px = 10px base. | js/ReaderApp.jsx:991; js/ReaderPanel.jsx:735, 1223 |
| Step | ×1.15 to grow, ÷1.15 to shrink | ReaderPanel.jsx:530-549; js/FontSizeButton.jsx |
| `.textRange` | 1.6em (16px), line-height 1.4 | s2.css:7181-7183 |
| `.textRange.basetext` | **2.2em (22px English body)**, line-height **1.6**, justified, max-width 760px, padding 0 30px | s2.css:6839-6849 |
| `.he` | 122%, so about 26.8px Hebrew | s2.css:85-86 |
| `.enInHe` | 83% | s2.css:149-150 |
| Hebrew translation (`.he.translation`) | Hebrew **sans** at 100% | s2.css:7134-7137 |
| Section title `.title` | 1.1em, lighter weight, letter-spacing 1px, 4px #E6E5E6 underline | s2.css:6887-6905 |
| `.parashahHeader` / `.aliyah` | 24px, letter-spacing 1px / 18px uppercase | s2.css:6950-6955 |
| Segment number | 12px, #000 (#ccc for link count), 30px wide | s2.css:7227-7274 |
| Footnote `sup` / `i.footnote` | 0.6em Hebrew sans / 0.8em dark grey, not italic | s2.css:7680-7722 |
| refLink | 0.8em bold, letter-spaced, #333 | s2.css:7352-7361 |

New tokens:
- `--sefaria-reader-font-scale`, default `1`. It replaces the old 62.5% base: 1 equals the old default, and each step is ×1.15.
- `--sefaria-reader-body-en: 22px`
- `--sefaria-reader-body-he-ratio: 1.22`
- `--sefaria-reader-line-height: 1.6`
- `--sefaria-reader-measure: 760px`

**UI headings** (selected): `.readerNavMenu h1` 22px/500 dark-grey (s2.css:2068-2075); category `.navTitle h1` 30px uppercase serif (2848-2853); sidebar module `h1` 22px/500 with a 1px light-grey bottom border (1627-1635); sidebar body 16px (1527).

**Line-height.** s2.css mostly uses px line-heights: 18px ×43, 19px ×19, 18.75px ×16. New tokens are unitless: `--sefaria-leading-tight: 1.2`, `--sefaria-leading-ui: 1.4`, `--sefaria-leading-text: 1.6`. The toolkit uses 1.68 / 1.78 for he and arc (`text-segment-element.ts:108-121`); compare it visually against the old 1.6.

### A.7 Spacing

The only variables are in `css/common-component.scss:19-23`: 4, 8, 12, 16, 24px. Counts in s2.css:
- padding: 0 ×39, 10px ×18, 5/15px ×9
- margin: `0 auto` ×19
- gap: 8px ×13, 4px ×6, 16px ×6, 20px ×5

| New token | Value | Notes |
|---|---|---|
| `--sefaria-space-0` | 0 | |
| `--sefaria-space-1` | 4px | `$sp-1` |
| `--sefaria-space-2` | 8px | `$sp-2`; most common gap |
| `--sefaria-space-3` | 12px | `$sp-3` |
| `--sefaria-space-4` | 16px | `$sp-4` |
| `--sefaria-space-5` | 20px | common legacy value (padding 20px, gap 20px) |
| `--sefaria-space-6` | 24px | `$sp-6` |
| `--sefaria-space-8` | 30px | base-text side padding, header padding (s2.css:6849; header.scss:35) |
| `--sefaria-space-10` | 44px | nav-sidebar module inline padding (s2.css:1530) |
| `--sefaria-space-12` | 60px | nav content top padding (s2.css:1374); header height |

Layout constants to carry over:
- segment gap 26px; stacked bilingual gap 14px (s2.css:6990, 7045)
- single-panel side padding 15px (s2.css:1539)
- connections list padding 30px 30px 80px (s2.css:7850)

### A.8 Radii

border-radius counts in s2.css: 6px ×61, 4px ×19, 7px ×17, 50% ×17, 5px ×11, 3px ×9, 20px ×8, 250px/9999px ×7.

| New token | Value | Used by (old) |
|---|---|---|
| `--sefaria-radius-xs` | 2px | auth checkbox (common-component.scss:179) |
| `--sefaria-radius-sm` | 4px | auth inputs and buttons (common-component.scss:78, 151) |
| `--sefaria-radius-md` | **6px** | `.button` (s2.css:9552-9563), `.sefaria-common-button` (common-components.css:43-52), popover items (popover.scss:95) |
| `--sefaria-radius-lg` | 8px | popover (`$popover-radius`, popover.scss:8) |
| `--sefaria-radius-pill` | 9999px | header search (header.scss:131 uses 250px), chips |
| `--sefaria-radius-round` | 50% | avatars, link dot |

Retire 7px (`.btn`, s2.css:108), 3px, 5px, 10px, 12px and 15px.

### A.9 Shadows

| New token | Value | Source / count |
|---|---|---|
| `--sefaria-shadow-1` | `0 1px 3px rgb(0 0 0 / 0.25)` | ×19 + popover token (popover.scss:9): `.button`, autocomplete, popovers, topic passages |
| (merge into shadow-1) | `0 1px 3px rgb(0 0 0 / 0.2)` | ×13 + 3: `.readerControls` (6257), dropdowns (11270, 11313), hoverMenu |
| `--sefaria-shadow-card` | `0 0 10px -1px rgb(83 83 83 / 0.04)`; hover 0.4 | `.searchResultCard` s2.css:4790, 4805 |
| `--sefaria-shadow-raised` | `0 4px 4px 0 rgb(0 0 0 / 0.25)` | topic card s2.css:6131 |
| `--sefaria-shadow-modal` | `0 2px 10px rgb(0 0 0 / 0.1)` | `.dialogModal .modal-content` s2.css:817 |
| `--sefaria-shadow-overlay` | `0 1px 8px rgb(0 0 0 / 0.2)` | `.collectionsWidget` s2.css:14509 |

Retire: `0 0 10px #ccc` (11001), `0 1px 6px` (12804), `0 1px 4px / .4` (9284). The toolkit's `--sefaria-shadow: 0 1rem 3rem` is unused there and too heavy for this design.

### A.10 Breakpoints

| New token | Value | Source |
|---|---|---|
| `--sefaria-bp-mobile-max` | 842px | css/breakpoints.scss:1 |
| `--sefaria-bp-tablet-min` | 843px | breakpoints.scss:2 (exposed as CSS var at line 8) |
| `--sefaria-bp-tablet-max` | 1086px | breakpoints.scss:3 |
| `--sefaria-bp-desktop-min` | 1087px | breakpoints.scss:4 (CSS var at line 9) |
| `--sefaria-bp-narrow` | 600px | layout buttons hidden at ≤600 when bilingual (ReaderDisplayOptionsMenu.jsx:43-46); s2.css ×3 |
| `--sefaria-bp-xs` | 450px | s2.css ×9 |
| (container) `--sefaria-cq-two-col` | 500px | ResponsiveNBox switches to 2 columns above 500 and 3 above 1500 (Misc.jsx:2437); toolkit bilingual auto side-by-side at 500px (`$T/.../bilingual-pair.ts:87-136`) |
| `--sefaria-layout-max` | 1485px | `.sidebarLayout` s2.css:1494-1498 |

Other legacy queries to retire: 540px (×9), 700px (×4 + base.css ×7), 900px. Panel-level layout should use **container queries** on the panel, because panels resize independently in multi-panel mode (SHL-039, SHL-042). Viewport media queries are only for the page shell.

### A.11 Z-index layers

Old tokens: `--z-header: 1001`, `--z-overlay: 9999`, `--z-header-menu-open: calc(var(--z-overlay)+1)` (s2.css:64-66). In practice there are about 15 ad-hoc layers, up to 1000000 (`.ui-autocomplete`, s2.css:1126).

| New token | Value | Replaces |
|---|---|---|
| `--sefaria-z-base` | 0 | |
| `--sefaria-z-raised` | 1 | `.readerNavTop` 1 (s2:1823), autocomplete 2, `.readerDropdownMenu` 3 (15490) |
| `--sefaria-z-panel-chrome` | 100 | `.colorLine` 101 (s2:1002), `.mask` 102 (6836), `.readerControlsOuter` 103 (6246), `.readerOptionsPanel` 103 (6665), `.message-modal` 100 (4350) |
| `--sefaria-z-shell` | 1000 | `#s2` 1000 (258), `.mobileNavMenu` 1000 (550), `#globalWarningMessage` (1177) |
| `--sefaria-z-header` | 1001 | `.headerInner` (header.scss:33), single-panel controls (16935) |
| `--sefaria-z-sheet` | 1002 | mobile search filters (4596), single-panel `.textList` (16959), collections modal (14502) |
| `--sefaria-z-overlay` | 9999 | floating-ui popovers (popover.scss:37), skip link (s2:25), cookie notice (12658), reader message (12693) |
| `--sefaria-z-modal` | 10000 | header-menu-open (header.scss:50), `#interruptingMessageBox` 100000 (834), `.editorToolbar` 100000 (14739) |
| `--sefaria-z-toast` | 10001 | (new) |

Rule: portaled layers (Popover, Menu, Dialog, Toast) are the only users of `overlay` and above, and **no component sets a numeric z-index**.

### A.12 Reader layout constants (domain tokens)

| Token | Value | Source |
|---|---|---|
| `--sefaria-header-height` | 60px | css/header.scss:5,8 |
| `--sefaria-reader-controls-height` | 60px | s2.css:6255-6258 |
| `--sefaria-reader-measure` | 760px | s2.css:6846 |
| `--sefaria-connections-measure` | 660px | s2.css:7846 |
| `--sefaria-nav-sidebar-width` | 420px | s2.css:1511 |
| `--sefaria-nav-menu-width` | 725px | s2.css:1397 |
| `--sefaria-segment-gutter` | 30px wide; offsets −48/−46px (multi-panel), ±30px (single-panel) | s2.css:7227-7341 |
| `--sefaria-link-dot-size` | 6px, opacity `min(count+20,70)/100` | s2.css:7283-7293; js/TextRange.jsx:604-616 |

---

## B. Old component inventory

### B.0 Summary

- About **230 named components** across `static/js` (about 42k lines of JSX).
- `Misc.jsx` alone exports about 90 (export list at `js/Misc.jsx:3477-3551`). Its full table, with line numbers, is in `client-rebuild-inventory/inv_08_other.md` §1.
- Only 11 live in `js/common/`, and those are the newest and best-built: `Button`, `DropdownMenu`, `Popover`, `Input`, `ToggleSwitch`, `ToggleSwitchLine`, `RadioButton`, `Card`, `TopicTOCCard`, `Modal`, `Captcha`.
- Styling is global: about 17k lines of `s2.css` keyed on class names. Components therefore cannot be lifted out without their CSS context. Every "port" in C is a **rebuild against the contract**, not a copy.

### B.1 Interface primitives

| Old component | Location | What it does | Used by / notes |
|---|---|---|---|
| `InterfaceText` | js/Misc.jsx:100 | THE bilingual UI-string renderer. Takes `text={{en,he}}`, `html`, `markdown`, a string i18n key (via `Sefaria._`), or `<EnglishText>/<HebrewText>` children. Renders `span.int-en/.int-he` with fallback classes `enInHe`/`heInEn` (119). | Everywhere, hundreds of uses (GUI-012, GUI-019, I18-009) |
| `EnglishText` / `HebrewText` | Misc.jsx:74-79 | Child markers for `InterfaceText` | |
| `DangerousInterfaceBlock` / `SimpleInterfaceBlock` / `SimpleContentBlock` / `SimpleLinkedBlock` | Misc.jsx:758 / 770 / 782 / 792 | A div wrapping InterfaceText (html / text / plain / link) | **Duplicate group D1** |
| `ContentText` / `VersionContent` / `ContentSpan` / `VersionImageSpan` | js/ContentText.jsx:7 / 22 / 93 / 52 | Bilingual **content** renderer, which honors the panel language rather than the interface language. Maps direction to the `he`/`en` class; `defaultToInterfaceOnBilingual`. | TextSegment, TOC, topic passages, titles |
| `LoadingMessage` | Misc.jsx:2588 | "Loading…" with `aria-live=polite` | GUI-020 |
| `LoadingRing` | Misc.jsx:169 | CSS spinner | **D7** |
| `SkeletonCard` / `SearchLoadSkeleton` | js/SearchLoadSkeleton.jsx:3 / 20 | Search skeleton (SRC-050) | **D7** |
| `Button` | js/common/Button.jsx:28 | `<a role=button>` when `href` is set, else `<button>`. Icon-only buttons require an aria-label (validator at :84). | Newer pages; **D4** |
| `SmallBlueButton` | Misc.jsx:1619 | Small button | **D4** |
| `ToolTipped` | Misc.jsx:1458 | `role=button` div with tooltip and gtag tracking | **D4/D10** |
| `ToolsButton` | js/ConnectionsPanel.jsx:1095 | Icon + label + count row button; hidden when count is 0 (CON-016) | **D4** |
| `Arrow` (ArrowButton) | Misc.jsx:1432 | Next/prev arrow, RTL-mirrored in CSS | |
| `CloseButton` | Misc.jsx:1233 | ×, circled-X or chevron close | **D9** |
| `MenuButton` | Misc.jsx:1218 | Hamburger, or chevron in compare mode | **D9** |
| `SearchButton` | Misc.jsx:1207 | Magnifier span | GUI-014 |
| `DisplaySettingsButton` | Misc.jsx:1266 | "Aa" or language icon | GUI-014 |
| `LanguageToggleButton` | Misc.jsx:723 | Aleph/A content-language toggle link | **D3** |
| `GuideButton` | Misc.jsx:1403 | Lightbulb | AI-007 |
| `AppStoreButton` | Misc.jsx:3349 | Store badges | LIB-049 |
| `Link` | Misc.jsx:591 | Anchor: preventDefault + onClick, `data-target-module` | **D11** |
| `Input` | js/common/Input.jsx:38 | Auth design-system input | GUI-017 |
| `RadioButton` | js/common/RadioButton.jsx:6 | Native radio + `handleRadioKeyDown` | |
| `ToggleSwitch` / `ToggleSwitchLine` | js/common/ToggleSwitch.jsx:4 / ToggleSwitchLine.jsx:6 | Checkbox `role=switch`, and a labelled row | Display settings |
| `Popover` (+ `PopoverTrigger/Content/Close`) | js/common/Popover.jsx:62/108/121/169 | floating-ui popover | GUI-016 |
| `Modal` | js/common/modal.jsx:3 | Native `<dialog>` with showModal, Esc and backdrop close | **D8** |
| `Card` | js/common/Card.jsx:6 | Generic card | **D5** |
| `ProfilePic` | js/ProfilePic.jsx | Avatar with initials fallback and upload/crop hook | PRO-006 |
| `AiInfoTooltip` | Misc.jsx:1487 | AI disclosure tooltip | AI-017 |
| `ImageWithCaption` / `ImageWithAltText` | Misc.jsx:3337 / 3347 | Bilingual caption | |
| `BreadcrumbPath` (+ `Breadcrumb`, `CrumbSep`, `CrumbList`) | js/BreadcrumbPath.jsx:69 | Category path crumbs (search cards) | |
| `InfiniteScroll` | js/InfiniteScroll.jsx:26 | Sentinel-based load more | SRC-061 |
| `RainbowLine` | js/RainbowLine.jsx:3 | Static gradient line | **D12** |
| `CategoryColorLine` | Misc.jsx:1633 | Category-colored line plus impression analytics | **D12** |
| `ColorBarBox` | Misc.jsx:753 | Box with a category-colored border | **D12** |

### B.2 Selection and navigation controls

| Old component | Location | What it does |
|---|---|---|
| `DropdownMenu` (+ `DropdownMenuItem`, `…ItemLink`, `…ItemWithCallback`, `…ItemWithIcon`, `DropdownModuleItem`, `DropdownMenuSeparator`, `NextRedirectAnchor`) | js/common/DropdownMenu.jsx:160 (items 7-130) | Accessible menu. Opening focuses the first element, Tab is trapped, Esc returns focus, outside click closes, `data-prevent-close` keeps it open (GUI-008). **Latent bug:** `onClose?.(true)` at :243. |
| `DropdownLanguageToggle` | DropdownMenu.jsx:292 | Interface-language switch inside menus (I18-007) |
| `Dropdown` | Misc.jsx:2469 | Custom listbox select with `handleListboxKeyDown` (I18-011) |
| `DropdownButton` / `DropdownModal` / `DropdownOptionList` | Misc.jsx:545 / 563 / 507 | Sort-dropdown pieces for FilterableList: table-based options with a check image |
| `SearchSortDropdown` | js/SearchSortDropdown.jsx:43 | Entity-tab sort |
| `SearchSortBox` | js/SearchResultList.jsx:195 | Sources sort (SRC-053) |
| `SortRadioList` / `EntitySortPanel` | js/SearchFilters.jsx:16 / 428 | Mobile sort panels (SRC-063) |
| `InterfaceLanguageMenu` | Misc.jsx:1300 | Globe menu: interface language and translation-preference reset |
| `LoggedInDropdown` / `LoggedOutDropdown` / `ModuleSwitcher` | js/Header.jsx:78 / 43 / 150 | Header menus (GUI-009, GUI-010) |
| `LangSelectInterface` + `LangRadioButton` | Misc.jsx:3421 / 3398 | Source / Translation / Both popover radios (TXD-066, GUI-018) |
| `ToggleSet` / `ToggleOption` | Misc.jsx:835 / 878 | Legacy segmented radio group |
| `SourceTranslationsButtons` | js/SourceTranslationsButtons.jsx:7 | Source / Translation / Both radios (SHL-018) |
| `LayoutButtons` / `LayoutButton` | js/LayoutButtons.jsx:57 / 33 | Layout radios with icons (SHL-021) |
| `FontSizeButtons` | js/FontSizeButton.jsx:6 | −/+ (SHL-009) |
| `SearchToggle` | js/SearchToggle.jsx:4 | Exact vs all toggle (SRC-052) |
| `TabbedToggleSet` | js/BookPage.jsx:518 | Alt-structure toggle rendered as links (BOK-017) |
| `SubCategoryToggle` | js/TextCategoryPage.jsx:307 | Bavli/Yerushalmi edition toggle (LIB-011) |
| `TabView` | Misc.jsx:400 | ARIA tablist with roving tabindex (LIB-065, GUI-022) |
| `TopicPageTabView` | js/TopicPage.jsx:638 | Topic tabs (TOP-020) |
| `SearchTabsMobileWeb` | js/SearchTabsMobileWeb.jsx:5 | Mobile search tab strip (SRC-062) |
| `EditorToggleHeader` | js/UserProfile.jsx:370 | Profile tabs and editor toggle |
| `FilterableList` | Misc.jsx:234 | Filter + sort + paginated list with two sort designs (GUI-021, LIB-066) |
| `PagedList` | js/SearchFilters.jsx:413 | "Show more" list (filters) |
| `GeneralAutocomplete` | js/GeneralAutocomplete.jsx:6 | Downshift-style combobox engine |
| `HeaderAutocomplete` (+ `SearchInputBox` 195, `SuggestionsGroup` 363, `SearchSuggestionFactory` 337, `TextualSearchSuggestion` 143, `EntitySearchSuggestion` 189) | js/HeaderAutocomplete.jsx:401 | Header search (SRC-001…019) |
| `Autocompleter` | Misc.jsx:3082 | Older ref autocomplete with `<select>` suggestions (SRC-099) |
| `SearchPageSearchBar` | js/SearchPage.jsx:30 | In-page search bar (SRC-051) |
| `DictionarySearch` | js/DictionarySearch.jsx:10 | Lexicon headword autocomplete (SRC-021/022) |
| `SidebarSearch` | js/SidebarSearch.jsx:12 | Search in this text (SRC-094) |
| `TopicSearch` / `TopicLandingSearch` | js/TopicSearch.jsx; js/TopicLandingPage/TopicLandingSearch.jsx | Topic autocomplete (TOP-004, SRC-098) |
| `NBox` / `TwoOrThreeBox` / `ResponsiveNBox` | Misc.jsx:2395 / 2416 / 2437 | 1-, 2- or 3-column grids (GUI-023) |

### B.3 Shell and chrome

| Old component | Location | What it does |
|---|---|---|
| `ReaderApp` | js/ReaderApp.jsx (2702 lines) | Panel orchestration, history and URL, modals (SHL-028…075) |
| `ReaderPanel` | js/ReaderPanel.jsx:51 | One panel; mode switch to text, sheet, menus or connections (SHL-031…036) |
| `ReaderControls` | ReaderPanel.jsx:1299 | In-panel header: title (`role=heading aria-level=1 aria-live=polite`), version subtitle, close/menu, Save, display settings, CategoryColorLine (SHL-074, TXD-013) |
| `ReaderDisplayOptionsMenu` | js/ReaderDisplayOptionsMenu.jsx:11 | Display settings dialog (TXD-041, SHL-017…021) |
| `ConnectionsPanelHeader` | js/ConnectionsPanelHeader.jsx:14 | Sidebar back / title / close (CON-003, CON-070) |
| `ComparePanelHeader` | js/ComparePanelHeader.jsx:16 | Compare-mode header (SHL-037) |
| `Header` (+ `LoggedOutButtons` 401, `MobileNavMenu` 425, `MobileInterfaceLanguageToggle` 596, `HelpButton` 619, `SignUpButton` 635, `CreateButton` 645, `AuthNavLink` 26) | js/Header.jsx:204 | Site header (GUI-001…003, GUI-011) |
| `NavSidebar` / `SidebarModules` / `SidebarModule` / `SidebarModuleTitle` | js/NavSidebar.jsx:14 / 37 / 87 / 93 | Right-rail module registry (LIB-023) |
| About 45 sidebar modules: `TitledText` 100, `RecentlyViewed` 123, `Promo` 171, `StudyCompanion` 177, `AboutSefaria` 192, `AboutTranslatedText` 236, `Resources` 275, `SidebarFooter` 305, `SupportSefaria` 335, `SponsorADay` 348, `AboutTextCategory` 361, `AboutText` 380, `Translations` 487, `LearningSchedules` 503, `WeeklyTorahPortion` 536, `DafYomi` 563, `Visualizations` 578, `AboutTopics` 630, `TrendingTopics` 645, `RelatedTopics` 719, `JoinTheCommunity` 741, `GetTheApp` 771, `StayConnected` 790, `CreateASheet` 845, `WhoToFollow` 925, `DownloadVersions` 957, `Portal*` 1058-1093, … | js/NavSidebar.jsx | LIB-024…064 |
| `GlobalWarningMessage` | Misc.jsx:615 | Server warning bar (GUI-006) |
| `CookiesNotification` | Misc.jsx:2816 | Cookie bar (GUI-007) |
| `InterruptingMessage` / `Banner` | Misc.jsx:2128 / 2272 | Strapi modal and top banner (PRM-010, PRM-011) |
| `SiteWideBanner` | js/SiteWideBanner.jsx | Banner with maybe-later back-off (PRM-014) |
| `TextColumnBanner` | js/TextColumnBanner.jsx | In-text translation banners (TXD-063, TXD-064, TXT-010) |
| `SignUpModal` / `LoginPrompt` | Misc.jsx:2004 / 1964 | Auth gating (ACC-006, GUI-004) |
| `GuideOverlay` | js/GuideOverlay.jsx | Onboarding overlay (AI-009) |
| `ReaderMessage` | Misc.jsx:2770 | Like/dislike prompt (GUI-028) |
| `OnInView` / `useOnceFullyVisible` | Misc.jsx:2063 / 36 | Impression tracking |

### B.4 Reader and text domain

| Old component | Location | What it does |
|---|---|---|
| `TextColumn` | js/TextColumn.jsx:15 | Scroll container. Bidirectional infinite scroll, visible-ref tracking, selection-to-lexicon, double-click guard (TXD-002, TXD-052…059). |
| `TextRange` | js/TextRange.jsx:14 | Loads one section. Section title (`.titleBox[role=heading aria-level=2]`), redirect/prefetch, jQuery segment-number placement (188-226), parashah headers (288-339) (TXD-003, TXD-011/012, TXT-002) |
| `TextSegment` | TextRange.jsx:438-667 | One segment. Primary/translation spans, direction classes, segment number (617-626), link-count dot (604-616), itags (528-553), search highlight (554-566), footnote toggle, refLink, named-entity and click routing (485-527), keyboard (`tabIndex=0`, Enter/Space) (TXD-043…050) |
| `bookMetaDataBox` placeholder | TextColumn.jsx:485-508 | Book title at the top of the scroll (TXD-056) |
| `ConnectionsPanel` | js/ConnectionsPanel.jsx:46 | About 25 sidebar modes (CON-007): Resources, ConnectionsList, TextList, Lexicon, Notes, Share, Translations, About, Navigation, WebPages, Topics, manuscripts, Add To Sheet, Add Connection, Feedback, Advanced Tools, Guide, LinkerAdmin, Login, … |
| `ConnectionsSummary` | ConnectionsPanel.jsx:707 | Category list and per-book view (CON-019…025) |
| `ResourcesList` / `ToolsList` / `AdvancedToolsList` | ConnectionsPanel.jsx:668 / 687 / 1036 | Lists of ToolsButtons (CON-013…015, CON-062…064) |
| `ConnectionsPanelSection` | ConnectionsPanel.jsx:1643 | Titled section |
| `CategoryFilter` / `TextFilter` / `EnglishAvailableTag` / `RecentFilterSet` | js/ConnectionFilters.jsx:10 / 93 / 159 / 165 | Category row with color and count; book filter row; "EN" tag; recent-filter chips (CON-025…029) |
| `TextList` (+ `ConnectionButtons` 300, `OpenConnectionTabButton` 255, `AddConnectionToSheetButton` 282, `DeleteConnectionButton` 222) | js/TextList.jsx:17 | Filtered connected texts (CON-030…035) |
| `TopicList` / `TopicListItem` | ConnectionsPanel.jsx:841 / 876 | Topics for this ref (CON-046) |
| `WebPagesList` | ConnectionsPanel.jsx:905 (+ js/WebPage.jsx) | CON-052…054 |
| `ShareBox` | ConnectionsPanel.jsx:1165 | CON-061 |
| `AddNoteBox` / `MyNotes` / `PublicNotes` | ConnectionsPanel.jsx:1258 / 1381 / 1426 | CON-048…051. `PublicNotes` is dead. |
| `AddConnectionBox` | ConnectionsPanel.jsx:1451 | CON-065 |
| `ManuscriptImageList` / `ManuscriptImage` | ConnectionsPanel.jsx:1574 / 1584 | CON-060 |
| `AddToSourceSheet` | js/AddToSourceSheet.jsx | CON-055…057 |
| `LexiconBox` / `LexiconEntry` | js/LexiconBox.jsx:14 / 209 | CON-042…045 |
| `AboutBox` | js/AboutBox.jsx:12 | CON-039…041, VER-006…008 |
| `TranslationsBox` / `TranslationsHeader` | js/TranslationsBox.jsx:8 / 127 | VER-009…013 |
| `VersionsTextList` | js/VersionsTextList.jsx | Translation Open preview (VER-013) |
| `VersionBlock` / `VersionsBlocksList` / `VersionBlockUtils` | js/VersionBlock/VersionBlock.jsx:79 / 359 / 15 | Version card in three render modes: about-box, versions-box, book-page (VER-016…020) |
| `VersionBlockHeader` / `VersionBlockHeaderTitle` / `VersionBlockHeaderText` | VersionBlock/VersionBlockHeader.jsx:4/26/42 | |
| `VersionBlockWithPreview` | VersionBlock/VersionBlockWithPreview.jsx:9 | Translations sidebar card (VER-010/011) |
| `VersionInformation` / `VersionMetadata` / `VersionImage` / `VersionTitleAndSelector` / `VersionBlockSelectButton` | VersionBlock/*.jsx:7, :7, :7, :7, :5 | Sub-parts |
| `ExtendedNotes` | js/ExtendedNotes.jsx | VER-021 |
| `FeedbackBox` | Misc.jsx:2662 | CON-067, GUI-027 |
| `GuideBox` | js/GuideBox.jsx | CON-068 |
| `Note` | Misc.jsx:1918 | Note display (USL-007) |
| `SaveButton` / `SaveButtonWithText` | Misc.jsx:1352 / 1347 | Bookmark (USL-001, USL-011) |
| `CategoryAttribution` | Misc.jsx:2610 | Edition credit (LIB-067, TXT-009) |

### B.5 Library, book and topic

| Old component | Location | What it does |
|---|---|---|
| `TextsPage` / `Dedication` | js/TextsPage.jsx:22 / 134 | Library home grid (LIB-001…007) |
| `TextCategoryPage` / `TextCategoryContents` / `MenuItem` / `TextMenuItem` | js/TextCategoryPage.jsx:20 / 117 / 268 / 291 | Category page (LIB-008…018) |
| `BookPage` | js/BookPage.jsx:42 | Book TOC page (BOK-001…007) |
| `TextTableOfContents` | BookPage.jsx:333 | TOC also used in the sidebar Navigation mode (BOK-009) |
| `SchemaNode` / `JaggedArrayNode` / `JaggedArrayNodeSection` / `ArrayMapNode` / `DictionaryNode` | BookPage.jsx:562 / 726 / 776 / 852 / 941 | Schema-shape renderers (BOK-010…016) |
| `VersionsList` | BookPage.jsx:990 | Versions tab (BOK-007) |
| `SectionTypesBox`, `EditTextInfo` | BookPage.jsx:1042, 1073 | Admin index editor (out of library scope) |
| `ReadMoreText` | BookPage.jsx:1514 | Truncating description |
| `TopicsPage` / `TopicTOCCard` | js/TopicsPage.jsx; js/common/TopicTOCCard.jsx:5 | Topic categories grid (TOP-011, TOP-012) |
| `TopicCategory` | js/TopicPage.jsx:225 | TOP-013 |
| `TopicPage` / `TopicHeader` / `TopicPageTab` / `TopicSideColumn` / `TopicSideSection` / `TopicImage` / `ReadingsComponent` / `TopicMetaData` / `TopicLink` / `AuthorIndexItem` / `TopicSponsorship` | TopicPage.jsx:543 / 389 / 832 / 975 / 1016 / 1049 / 1058 / 1114 / 870 / 448 / 275 | TOP-015…028 |
| `TopicPageAll` | js/TopicPageAll.jsx | A-Z (TOP-014) |
| TopicLandingPage/* (`TopicSalad`, `FeaturedTopic`, `TopicLandingNewsletter`, `RandomTopicCardWithDescriptionRow`, `TopicLandingParasha`, `TopicLandingSeasonal`) | js/TopicLandingPage/ | TOP-003…010 |
| `WordSalad` / `RowedWordSalad` | js/WordSalad.jsx; js/RowedWordSalad.jsx | Topic word cloud (TOP-005) |
| Story.jsx: `StoryFrame` 76, `SummarizedStoryFrame` 85, `StoryTypeBlock` 111, `StoryTitleBlock` 116, `StoryBodyBlock` 125, `StoryTextListItem` 132, `StorySheetList` 147, `TopicStoryDescBlock` 159, **`TopicTextPassage` 167**, `ReviewStateIndicator` 224, `TextPassage` 283, `SheetBlock` 320, `SaveLine` 366, `SheetListStory` 45 | js/Story.jsx | Remnants of the old homepage feed, now topic source and sheet cards (TOP-023, TOP-024) |
| `CalendarsPage` / `CalendarListing` | js/CalendarsPage.jsx:13 / 70 | CAL-001, CAL-002 |
| `TranslationsPage` | js/TranslationsPage.jsx | LIB-020 |
| `UpdatesPanel` | js/UpdatesPanel.jsx | New additions |

### B.6 Search

| Old component | Location | What it does |
|---|---|---|
| `SearchPage` / `EntitySearchResults` | js/SearchPage.jsx:257 / 225 | SRC-039…066 |
| `SearchResultCard` (+ `usePressState` 19) | js/SearchResultCard.jsx:103 | Unified card with modes `sources`, `book`, `author`, `topic` (SRC-055, SRC-070…072) |
| `SearchResultList` / `SearchFilterButton` / `MobileFilterIconButton` | js/SearchResultList.jsx:112 / 255 / 276 | SRC-054, SRC-063 |
| `SearchFilters` / `TextSearchFilters` / `SearchFilterGroup` / `SearchFilter` / `BookSearchFilters` / `SheetSearchFilters` | js/SearchFilters.jsx:41 / 111 / 131 / 226 / 328 / 383 | SRC-085…088 |
| `SearchTextResult` / `SearchSheetResult` | js/SearchTextResult.jsx; js/SearchSheetResult.jsx | Older result rows. SearchSheetResult is still used in Voices (SRC-090). |
| `NoSearchResults` | js/NoSearchResults.jsx:28 | SRC-064 |
| `ElasticSearchQuerier` | js/ElasticSearchQuerier.jsx | Data container (not UI) |

### B.7 Sheets, users and social

| Old component | Location | What it does |
|---|---|---|
| `Sheet` / `SheetContent` / `AddToSheetButton` | js/sheets/Sheet.jsx:16; SheetContent.jsx:22 / 182 | Sheet viewer (SHV-005…011) |
| `SheetSource` / `SheetComment` / `SheetHeader` / `SheetOutsideText` / `SheetOutsideBiText` / `SheetMedia` | js/sheets/SheetContentSegments.jsx:6 / 62 / 97 / 116 / 165 / 201 | Sheet node types (SHV-007…009) |
| `SheetOptions` (+ Share/Delete/Unpublish/Collections/Copy/GoogleDocExport buttons 145-166) | js/sheets/SheetOptions.jsx:35 | "…" menu (SHV-018…023) |
| `ShareModal` / `CollectionsModal` / `AddToSourceSheetModal` / `CopyModal` / `GenericSheetModal` / `SaveModal` / `GoogleDocExportModal` / `DeleteModal` | js/sheets/SheetModals.jsx:13 / 22 / 31 / 35 / 109 / 116 / 149 / 227 | **D8** |
| `PublishModal` / `PublishMenu` | js/sheets/PublishMenu.jsx:9 / 66 | SHE-021 |
| `SheetSidebar` / `SheetProfileInfo` / `SheetSidebarList` | js/sheets/SheetSidebar.jsx:8 / 34 / 50 | SHV-012 |
| `SheetsHomePage` / `SheetsHeroBanner` / `SheetsHomePageSidebar` | js/sheets/SheetsHomePage.jsx:48 / 8 / 33 | SHV-001 |
| `SheetsTopicsTOC` / `TOCCardsWrapper` / `SheetsParashah` / `SheetsHoliday` / `SheetsTopicsCalendar` | js/sheets/SheetsHomePageTopicsTOC.jsx:5-50 | |
| `SheetsWithRefPage` / `SheetsWithRefLayout` | js/sheets/SheetsWithRefPage.jsx:99 / 9 | SHV-024 (a "frozen copy" of the search layout, per inv_07 §8) |
| `SheetListing` | Misc.jsx:1698 | Sheet row with actions (SHV-026, PRO-002) |
| `CollectionListing` | Misc.jsx:1875 | COL-009 |
| `ProfileListing` | Misc.jsx:1649 | Author byline with follow |
| `SheetTitle` / `SheetMetaDataBox` / `SheetAuthorStatement` / `CollectionStatement` / `SheetTopicLink` / `SheetAccessIcon` | Misc.jsx:2860-3080, 2910, 2625, 2649 | SHE-029. Latent bug at 2653 (undefined `msg`). |
| `FollowButton` | Misc.jsx:1550 | PRO-008, PRO-011 |
| `UserProfile` / `UserBackground` / `ProfileSummary` / `CollectionsList` | js/UserProfile.jsx:18 / 480 / 527 / 339 | PRO-001…004 |
| `CollectionPage` / `CollectionAbout` / `CollectionContentsTab` / `CollectionInvitationBox` / `CollectionMemberListing` / `CollectionInvitationListing` | js/CollectionPage.jsx:27 / 316 / 359 / 402 / 476 / 524 | COL-001…005 |
| `NotificationsPanel` + 7 notification row types | js/NotificationsPanel.jsx:15, 149-353 | NTF-001…003 |
| `UserHistoryPanel` / `UserHistoryList` | js/UserHistoryPanel.jsx:20 / 137 | USL-008 |
| `TextBlockLink` / `BlockLink` | Misc.jsx:631 / 809 | Text/sheet link cards (GUI-024) |
| `Editor` (Slate) | js/Editor.jsx (3225 lines) | Sheet editor (SHE-*). **Out of scope for the core library**; see C.4. |

### B.8 Duplicate groups (collapse each into one component)

| ID | Group | Members (file:line) | Collapse into |
|---|---|---|---|
| **D1** | Bilingual UI text and blocks | `InterfaceText` Misc.jsx:100; `SimpleInterfaceBlock` 770; `DangerousInterfaceBlock` 758; `SimpleContentBlock` 782; `SimpleLinkedBlock` 792; `EnglishText`/`HebrewText` 74-79 | `InterfaceText` (+ `as` prop), and `Link` for the linked version |
| **D2** | Content-language text | `ContentText` js/ContentText.jsx:7; `VersionContent` :22; `ContentSpan` :93; ad-hoc `.en`/`.he` span pairs in TextSegment (TextRange.jsx:629-647), TopicTextPassage (Story.jsx:167), sheet sources (SheetContentSegments.jsx:6, 165) | `ContentText` (title/label content) and `BilingualSegment` (passage content) |
| **D3** | Content-language selector | `SourceTranslationsButtons` js/SourceTranslationsButtons.jsx:7; `LangSelectInterface`/`LangRadioButton` Misc.jsx:3421/3398; `LanguageToggleButton` Misc.jsx:723; the header `lang2` aleph toggle in ConnectionsPanelHeader.jsx; legacy `ToggleSet` language row Misc.jsx:835 | `ContentLanguageControl` (a SegmentedControl preset) |
| **D4** | Buttons | `common/Button.jsx:28`; `SmallBlueButton` Misc.jsx:1619; `ToolTipped` 1458; `ToolsButton` ConnectionsPanel.jsx:1095; `GetStartedButton`/`CreateSheetsButton`/`VoicesNewsletterSignUpButton` NavSidebar.jsx:826-838; `SignUpButton`/`CreateButton`/`HelpButton` Header.jsx:619-645; `.button`, `.btn` and `.sefaria-common-button` CSS families (s2.css:9552, 108; common-components.css:43) | `Button` (variant, size, icon) + `IconButton` + `ActionRow` |
| **D5** | Cards and listing rows | `TextBlockLink` Misc.jsx:631; `BlockLink` 809; `ColorBarBox` 753; `common/Card.jsx:6`; `TopicTOCCard` common/TopicTOCCard.jsx:5; `StoryFrame`/`SummarizedStoryFrame` Story.jsx:76/85; `TextPassage` 283; `TopicTextPassage` 167; `SheetBlock` 320; `SheetListStory` 45; `.navBlock` in TextsPage.jsx:42-67; `MenuItem`/`TextMenuItem` TextCategoryPage.jsx:268/291; `RecentlyViewedItem` NavSidebar.jsx:109; `CalendarListing` CalendarsPage.jsx:70; `SearchResultCard` SearchResultCard.jsx:103 (already merges 4 modes) | `Card` (surface) + `ListingRow` (layout) + domain presets: `SourceListing`, `SheetListing`, `TopicChip`, `CategoryTile`, `BookListing` |
| **D6** | Sheet, collection and person rows | `SheetListing` Misc.jsx:1698; `SearchSheetResult`; `SheetBlock` Story.jsx:320; `SheetListStory` Story.jsx:45; `SheetSidebarList` sheets/SheetSidebar.jsx:50; `CollectionListing` Misc.jsx:1875; `CollectionMemberListing` CollectionPage.jsx:476; `ProfileListing` Misc.jsx:1649; `SheetProfileInfo` SheetSidebar.jsx:34; `AuthorIndexItem` TopicPage.jsx:448 | `SheetListing`, `CollectionListing` and `PersonListing`, all built on `ListingRow` |
| **D7** | Loading | `LoadingMessage` Misc.jsx:2588; `LoadingRing` 169; `SkeletonCard`/`SearchLoadSkeleton` SearchLoadSkeleton.jsx:3/20; `InfiniteScroll` "loading more" string (InfiniteScroll.jsx:11); TextColumn placeholders (TextColumn.jsx:485-508) | `Spinner`, `Skeleton`, `LoadingState` |
| **D8** | Modals and overlays | `common/modal.jsx:3`; `SignUpModal` Misc.jsx:2004; `InterruptingMessage` 2128; `GenericSheetModal` and 7 sheet modals (sheets/SheetModals.jsx); `PublishModal` PublishMenu.jsx:9; `.dialogModal`; `GuideOverlay`; `.feedbackOverlay`; `.collectionsModalBox`; `.addToSourceSheetModal` (z-index 200) | `Dialog` (modal or non-modal) + `Sheet` (bottom/side drawer on mobile) |
| **D9** | Close, back and menu chrome | `CloseButton` Misc.jsx:1233; `MenuButton` 1218; back chevrons in ConnectionsPanelHeader.jsx:14 and ComparePanelHeader.jsx:16; `PopoverClose` common/Popover.jsx:169 | `IconButton` with `icon="close" \| "back" \| "menu"`, direction-aware |
| **D10** | Dropdowns, menus and selects | `common/DropdownMenu.jsx:160`; `Dropdown` Misc.jsx:2469; `DropdownButton`/`DropdownModal`/`DropdownOptionList` 545/563/507; `SearchSortDropdown` SearchSortDropdown.jsx:43; `SearchSortBox` SearchResultList.jsx:195; `SortRadioList` SearchFilters.jsx:16; `EntitySortPanel` 428; `InterfaceLanguageMenu` Misc.jsx:1300; `LoggedInDropdown`/`LoggedOutDropdown`/`ModuleSwitcher` Header.jsx:78/43/150; `SheetOptions` sheets/SheetOptions.jsx:35; `ReaderDisplayOptionsMenu` (dropdown host) | `Menu` (actions/links), `Select` (single value), `Popover` (arbitrary content), `SortControl` (preset) |
| **D11** | Links | `Link` Misc.jsx:591; `SimpleLinkedBlock` 792; `NextRedirectAnchor` common/DropdownMenu.jsx:39; `AuthNavLink` Header.jsx:26; `IconLink` NavSidebar.jsx:949; `TopicLink` TopicPage.jsx:870; `SheetTopicLink` Misc.jsx:2625; `ParashahLink`/`DafLink` NavSidebar.jsx:444/475 | `Link` (wraps the TanStack Router `<Link>`, plus a `module` prop for Library/Voices hosts) and `RefLink` |
| **D12** | Category color | `CategoryColorLine` Misc.jsx:1633; `ColorBarBox` 753; `RainbowLine` RainbowLine.jsx:3; `.navBlock.withColorLine`; `--category-color` set inline in CategoryFilter (ConnectionFilters.jsx:10); `SearchResultCard` accent bar; `.colorLine` | `CategoryColorLine` + `CategoryAccent` (border-start mixin through a `category` prop) |
| **D13** | Toggles and segmented controls | `ToggleSet`/`ToggleOption` Misc.jsx:835/878; `LayoutButtons` LayoutButtons.jsx:57; `SourceTranslationsButtons`; `FontSizeButtons` FontSizeButton.jsx:6; `SearchToggle` SearchToggle.jsx:4; `TabbedToggleSet` BookPage.jsx:518; `SubCategoryToggle` TextCategoryPage.jsx:307; `ToggleSwitch`/`ToggleSwitchLine` common/ | `SegmentedControl` (radio group, 2-4 options), `Switch` (boolean), `Stepper` (font size) |
| **D14** | Tabs | `TabView` Misc.jsx:400; `TopicPageTabView` TopicPage.jsx:638; `SearchTabsMobileWeb` SearchTabsMobileWeb.jsx:5; `EditorToggleHeader` UserProfile.jsx:370; search desktop tabs (SearchPage.jsx:101-109); BookPage Contents/Versions tabs (BookPage.jsx:189-198) | `Tabs` (with `orientation`, overflow scroll, `variant="underline" \| "pill"`) |
| **D15** | Autocomplete | `GeneralAutocomplete` GeneralAutocomplete.jsx:6; `HeaderAutocomplete` HeaderAutocomplete.jsx:401; `Autocompleter` Misc.jsx:3082; `DictionarySearch` DictionarySearch.jsx:10; `TopicSearch`; `TopicLandingSearch`; `SearchPageSearchBar` SearchPage.jsx:30; ComparePanelHeader search input | `Combobox` primitive + `SearchInput`; domain presets `SiteSearch`, `RefPicker`, `TopicPicker`, `HeadwordPicker` |
| **D16** | Grids | `NBox`/`TwoOrThreeBox`/`ResponsiveNBox` Misc.jsx:2395/2416/2437; `TOCCardsWrapper` sheets/SheetsHomePageTopicsTOC.jsx:17; topic card grids | `ResponsiveGrid` (CSS grid with container queries) |
| **D17** | Version cards | `VersionBlock` (3 render modes) VersionBlock.jsx:79; `VersionBlockWithPreview` VersionBlockWithPreview.jsx:9; `VersionsList` BookPage.jsx:990; `VersionsBlocksList` VersionBlock.jsx:359; `DownloadVersions` NavSidebar.jsx:957 | `VersionCard` (+ `VersionList`) |
| **D18** | TOC grids | `JaggedArrayNodeSection` grid BookPage.jsx:776; Talmud daf grid (same component with daf address types, BOK-014); `DictionaryNode` letter grid 941; `ArrayMapNode` 852; parasha/aliyah list for Torah (BOK-018) | `SectionGrid` (variants `chapter`, `daf`, `letter`) + `TocTree` |
| **D19** | Search filters | `SearchFilters`/`SearchFilter`/`SearchFilterGroup` SearchFilters.jsx; `CategoryFilter`/`TextFilter` ConnectionFilters.jsx (same "category → book with count and color" shape); `RecentFilterSet` ConnectionFilters.jsx:165; `BookSearchFilters` 328 | `FilterTree` (checkbox tree with counts and color) + `FilterChip` |
| **D20** | Sidebar section titles | `SidebarModuleTitle` NavSidebar.jsx:93; `ConnectionsPanelSection` ConnectionsPanel.jsx:1643; `TopicSideSection` TopicPage.jsx:1016; `TranslationsHeader` TranslationsBox.jsx:127; `.navSidebarModule h1` (s2.css:1627) | `SidebarSection` |
| **D21** | Save, follow and feedback actions | `SaveButton`/`SaveButtonWithText` Misc.jsx:1352/1347; `SaveLine` Story.jsx:366; `FollowButton` Misc.jsx:1550; sheet `SaveModal` | `SaveToggle` and `FollowToggle` (both `ToggleButton` presets) |

---

## C. Proposed component library

### C.0 Architecture and what we take from the toolkit

**Package layout** (inside `sefaria-reader`)

```
packages/ (or src/lib/ until extraction)
  tokens/        CSS custom properties (A), categoryColor(), TS constants
  i18n/          InterfaceText, message catalog, useInterfaceLanguage, formatters
  primitives/    layer 1
  layout/        layer 2
  domain/        layer 3 (text, connections, library, search, voices)
```

Use Storybook 8 (react-vite) with these addons:
- `@storybook/addon-a11y`: axe runs on every story, and CI fails on violations.
- A **toolbar** with three global axes:
  - `interfaceLang`: en / he. This sets `<html lang dir>`.
  - `contentLang`: source / translation / bilingual.
  - `theme`: light / sepia / dark.
- Viewport presets at 375, 842, 1086 and 1440.

Every story renders under all four toolbar combinations through a `withSefariaProviders` decorator.

**Taken from the toolkit:**

| Item | From | How it is used |
|---|---|---|
| API client | `$T/packages/client` (`createSefariaClient`, zod validators, GET cache) | Reused as is, behind TanStack Query |
| Sanitizer | `$T/packages/text-transform` `normalizeText` (normalize.ts:194-240) | Reused as is. It turns ref links, named entities, footnotes, commentary markers, overlays and Masorah classes into inert `data-sefaria-*` spans with structured `notes[]`. **This is the contract `TextSegment` renders from.** |
| Vocalization | `applyVocalization` / `applyVocalizationToHtml` (vocalization.ts:4-124) | Modes `taamim_and_nikkud` / `nikkud` / `none` map one-to-one to the old `vowels` = all / partial / none (TXD-037, TXD-038). Paseq handling is configurable. It is a pure derivation, so **no refetch** when the setting changes. |
| Preview | `createTextPreview` (preview.ts:31-111) | Grapheme-safe truncation for VER-010, search snippets and connection previews |
| Tokens (idea) | `tokens.ts:4-53` | Public `--sefaria-*` names with private `--_sefaria-*` fallbacks and `light-dark()`. **Extended** with the full set in A, because the toolkit has no spacing, scale or breakpoint tokens and 5 of its tokens are unused. |
| Translation selection (rules, ported to TS hooks) | `translation-selection.ts:10-161`; `bilingual-segment.ts:451-621`; spec `docs/specs/components.md:55-79` | Select by `isPrimary`/`isSource`/`languageFamilyName`, never by array position. Ambiguity is an error. Fallback is explicit (`none` \| `default`), with at most one extra request on warning 102. Absent-side messages use warning codes 102/104. **We add a preference layer on top**, which the toolkit lacks: explicit URL version, then per-corpus `versionPreferences` cookie (VER-002), then `translationLanguagePreference` (VER-001), then server default (VER-014, `js/sefaria/sefaria.js:790, 931, 1053`). |
| State model (idea) | `sefaria-element.ts:5`; spec :91-95 | `status: empty \| loading \| partial \| ready \| error`. Loading and empty use `role=status aria-live=polite`; errors use `role=alert`. A missing translation is a **status, not an error**. |
| Composition (idea) | spec :107-113 | Parents fetch and children render prepared props: one request per composite and no child fetching. Maps to route loaders plus props. |
| Events (idea) | `connections-panel-element.ts:342-368` | Cancelable semantic events become controlled/uncontrolled React props (`value` + `onValueChange`, `onSelect(e)` with `e.preventDefault()`). |
| Bilingual layout (idea) | `bilingual-pair.ts:87-136` | CSS grid. `order` changes visual order while DOM order stays primary-first; `data-layout` attributes; container query for auto side-by-side. |
| Hebrew numerals | `source-card-element.ts:903-981` (private) | Port to `i18n/hebrewNumeral.ts` with the ט״ו/ט״ז rule and geresh/gershayim; also covers daf encoding (TXD-065). **Fix:** choose numerals by **display language**, not by side. |
| Reader focus management (idea) | `reader-element.ts:803-818` | On navigation, focus the new location heading (`tabIndex=-1`, `aria-current`) and set `aria-busy` on loading panes. |

**Not taken from the toolkit:**
- No i18n or Hebrew UI: every string is hard-coded English.
- Footnote markers are not linked to their notes (no ids, no aria).
- Selection excludes Daf addressing (`source-card-addresses.ts:13-26`).
- No segment numbers in Text Segment or Bilingual Segment.
- No continuous layout, no toggle UI, and no keyboard model beyond native buttons.
- Category order is alphabetical, not Sefaria's order (CON-019).

### C.1 Conventions used in every entry below

- **Stories (std)** is shorthand for the standard matrix every component must cover: `Default`, `HebrewInterface` (RTL shell), `LongContent`/overflow, `Mobile` (375px), `Dark`, plus `KeyboardOnly` (play function that tabs and operates the component).
- **Content stories (content)**: `English`, `Hebrew`, `Bilingual`, `RTLTranslation` (e.g. Arabic/Yiddish), `MixedDirection`.
- **Data stories (data)**: `Loading`, `Empty`, `Error`, `Partial` (one side missing).
- Every interactive component: visible `:focus-visible` ring using `--sefaria-color-focus`, min target 24×24 (44×44 on touch), logical CSS properties only (`margin-inline-start`, never `left`), RTL icon mirroring via `[dir=rtl]` for directional icons.

---

### C.2 Layer 1: Primitives

#### `Icon`
- **Purpose:** single SVG icon set with RTL-mirroring metadata.
- **Replaces:** `/static/icons/*.svg` `<img>` usage across Misc.jsx (e.g. LayoutButtons `getPath` LayoutButtons.jsx:19), `type_icon_map` HeaderAutocomplete.jsx:7, `TYPE_ICONS` SearchResultCard.jsx:88.
- **Props:** `name` (typed union), `size: 16|20|24|32`, `mirrorInRtl` (auto for chevron/arrow/back), `label?` (if present → `role=img aria-label`, else `aria-hidden`).
- **A11y:** decorative by default; never the sole label of an IconButton (label lives on the button).
- **Features:** GUI-014, GUI-026, I18-013, SRC-007, SHL-021.
- **Stories:** `Gallery` (all icons), `RtlMirroring`, `Sizes`, std.

#### `InterfaceText`
- **Purpose:** render a UI string in the current interface language, with fallback to the other language.
- **Replaces:** D1 (`InterfaceText` Misc.jsx:100, Simple*/Dangerous* blocks 758-792, `EnglishText`/`HebrewText` 74-79).
- **Props:** `id` (message key, typed against catalog) **or** `text={{en,he}}`; `markdown?: {en,he}` (links forced `rel=noopener`); `as` (span|p|h1-h6|div); `values` (ICU interpolation).
- **A11y:** sets `lang` on the element when the rendered language differs from `<html lang>` (fallback case) — the old `enInHe`/`heInEn` classes (Misc.jsx:119) become `lang` attributes; never uses `dangerouslySetInnerHTML` for `id` strings.
- **Features:** GUI-012, GUI-019, I18-009, I18-010, I18-008.
- **Stories:** `English`, `Hebrew`, `FallbackToOther` (missing he), `Markdown`, `Interpolation`, std.

#### `ContentText`
- **Purpose:** render short bilingual *content* (titles, refs, category names) following the panel content language, not interface language.
- **Replaces:** D2 (`ContentText` ContentText.jsx:7, `ContentSpan` :93) for non-passage content.
- **Props:** `text={{en,he}}`, `lang?: "source"|"translation"|"bilingual"` (from context by default), `defaultToInterfaceOnBilingual` (LIB-001), `as`.
- **A11y:** `lang`/`dir` per span; bilingual renders both with the non-interface one `aria-hidden` only when visually duplicated? — **No**: both are real content; render both, each with `lang`.
- **Features:** LIB-001, LIB-015, TXD-013, TOP-023, BOK-002.
- **Stories:** content, `DefaultToInterfaceOnBilingual`, std.

#### `Button`
- **Purpose:** the only button.
- **Replaces:** D4 (common/Button.jsx:28, SmallBlueButton Misc.jsx:1619, NavSidebar CTA buttons 826-838, Header 619-645, `.button`/`.btn`/`.sefaria-common-button` CSS).
- **Props:** `variant: primary|secondary|ghost|link|danger`, `size: sm (30px)|md (39px)|lg (53px)` (heights from common-components.css:43-70), `iconStart?`, `iconEnd?`, `loading`, `disabled`, `asChild` (render as `Link`), `fullWidth`, `tone: library|voices` (theme-primary).
- **A11y:** native `<button>`; with `asChild`/href → `<a>` (not `role=button` on anchor — old Button.jsx did `<a role=button>` which mis-announces navigation); `aria-busy` when loading; disabled uses `aria-disabled` + no-op when it must remain focusable.
- **Features:** GUI-014, GUI-017, GUI-026, I18-004, BOK-003, TOP-019, LIB-051, PRM-004.
- **Stories:** `Variants`, `Sizes`, `WithIcons`, `Loading`, `Disabled`, `AsLink`, `VoicesTone`, std.

#### `IconButton`
- **Purpose:** icon-only button with mandatory accessible label and optional tooltip.
- **Replaces:** D9 (`CloseButton` Misc.jsx:1233, `MenuButton` 1218, `SearchButton` 1207, `DisplaySettingsButton` 1266, `GuideButton` 1403, `Arrow` 1432, `ToolTipped` 1458).
- **Props:** `icon`, `label` (required, string or message id), `tooltip?: boolean` (shows label), `pressed?` (toggle mode → `aria-pressed`), `size`, `variant`.
- **A11y:** `aria-label` required (type-enforced, mirroring Button.jsx:84 validator); tooltip uses `aria-describedby` only if text differs from label.
- **Features:** GUI-014, GUI-026, CON-003, CON-070, SHL-074, AI-007.
- **Stories:** `Close`, `Back` (RTL mirror), `Menu`, `Pressed`, `WithTooltip`, std.

#### `Link`
- **Purpose:** internal/external navigation that knows Sefaria's two hosts (Library / Voices).
- **Replaces:** D11 (`Link` Misc.jsx:591, `NextRedirectAnchor`, `AuthNavLink`, `IconLink`, `SimpleLinkedBlock`).
- **Props:** `to` (router path) | `href`; `module?: "library"|"voices"` (cross-host → full URL, RTE-001, SHL-067); `external` (adds `rel="noopener noreferrer"`, new-tab icon + sr text "opens in new tab"); `variant: inline|subtle|nav`.
- **A11y:** real `<a href>` always (old `Link` preventDefault-only patterns broke middle-click, SHL-069); modifier-key clicks never intercepted.
- **Features:** SHL-067, SHL-069, RTE-001, CON-017, LIB-014.
- **Stories:** `Inline`, `CrossModule`, `External`, std.

#### `Tabs`
- **Purpose:** the only tab implementation.
- **Replaces:** D14 (`TabView` Misc.jsx:400, `TopicPageTabView` TopicPage.jsx:638, `SearchTabsMobileWeb`, `EditorToggleHeader` UserProfile.jsx:370, BookPage tabs).
- **Props:** `value`/`defaultValue`/`onValueChange`; `items: {value, label, count?, href?}` (href → router-synced tabs, BOK-017 `?tab=`); `variant: underline|pill`; `overflow: scroll|wrap`; `activation: auto|manual`.
- **A11y:** WAI-ARIA tabs: `tablist`/`tab`/`tabpanel`, roving tabindex, Arrow/Home/End, arrows reversed in RTL; **must not** `replaceState` on mount (bug in TabView, Misc.jsx:400-504 per inv_02 §15).
- **Features:** LIB-065, GUI-022, BOK-005, TOP-020, SRC-048, SRC-062, PRO-002, PRO-003, I18-004.
- **Stories:** `Underline`, `Pill`, `WithCounts`, `Overflowing` (mobile), `RouterLinked`, `HebrewRTLKeyboard`, std.

#### `SegmentedControl`
- **Purpose:** single-choice among 2–4 visible options (radio group styled as segments), optionally icon-only.
- **Replaces:** D13 (`ToggleSet` Misc.jsx:835, `LayoutButtons` LayoutButtons.jsx:57, `SourceTranslationsButtons`, `SearchToggle` SearchToggle.jsx:4, `TabbedToggleSet` BookPage.jsx:518, `SubCategoryToggle` TextCategoryPage.jsx:307, `LangSelectInterface` radios Misc.jsx:3421).
- **Props:** `value`, `onValueChange`, `options: {value, label, icon?, disabled?}`, `iconOnly` (label → aria-label + tooltip), `name`, `size`.
- **A11y:** `role=radiogroup` + `role=radio`/`aria-checked` (or native radios); arrows move+select, RTL-aware; group labelled via `aria-labelledby`.
- **Features:** SHL-018, SHL-021, TXD-031, TXD-033, TXD-034, BOK-017, LIB-011, SRC-052, I18-011.
- **Stories:** `TextOptions`, `IconOptions` (layout icons), `WithDisabled`, `Wrapping` (narrow), std.

#### `Switch`
- **Purpose:** boolean setting with label row.
- **Replaces:** `ToggleSwitch` common/ToggleSwitch.jsx:4, `ToggleSwitchLine` common/ToggleSwitchLine.jsx:6.
- **Props:** `checked`, `onCheckedChange`, `label`, `description?`, `disabled` (+ `disabledReason` shown as description — e.g. cantillation disabled when vowels off).
- **A11y:** `<button role=switch aria-checked>` or `<input type=checkbox role=switch>`; label click toggles.
- **Features:** TXD-037, TXD-038, TXT-003, TXT-006, SHL-020.
- **Stories:** `On`, `Off`, `DisabledWithReason`, std.

#### `Stepper`
- **Purpose:** decrement/increment control (font size).
- **Replaces:** `FontSizeButtons` FontSizeButton.jsx:6.
- **Props:** `onDecrement`, `onIncrement`, `canDecrement`, `canIncrement`, `decrementLabel`, `incrementLabel`, `valueText?` (for `aria-live`).
- **A11y:** two IconButtons in a `role=group` with label; announce new size via polite live region.
- **Features:** SHL-009, TXD-036.
- **Stories:** `Default`, `AtMin`, `AtMax`, std.

#### `Radio` / `RadioGroup`, `Checkbox`
- **Purpose:** form controls.
- **Replaces:** `RadioButton` common/RadioButton.jsx:6, `LangRadioButton` Misc.jsx:3398, `SortRadioList` SearchFilters.jsx:16, auth checkbox (common-component.scss:179).
- **Props:** standard controlled; `Checkbox` supports `indeterminate` (filter trees).
- **A11y:** native inputs; group `fieldset/legend`.
- **Features:** SRC-063, SRC-085, SRC-086, ACC-010, GUI-017.
- **Stories:** std, `Indeterminate`, `Disabled`, `WithDescription`.

#### `TextField`, `TextArea`
- **Purpose:** labelled input with help + error text.
- **Replaces:** `Input` common/Input.jsx:38, FeedbackBox textarea Misc.jsx:2662, AddNoteBox ConnectionsPanel.jsx:1258, sheet publish description.
- **Props:** `label`, `hint`, `error`, `maxLength` + counter (publish summary 140, inv_07 §5), `dir="auto"`.
- **A11y:** `aria-describedby` for hint/error, `aria-invalid`, error `role=alert` only on submit.
- **Features:** GUI-017, ACC-009, ACC-010, CON-048, CON-067, GUI-027, SHE-021.
- **Stories:** std, `WithError`, `WithCounter`, `HebrewInput` (`dir=auto`).

#### `SearchInput`
- **Purpose:** search field with clear, submit and optional virtual Hebrew keyboard trigger.
- **Replaces:** `SearchInputBox` HeaderAutocomplete.jsx:195, `SearchPageSearchBar` SearchPage.jsx:30, ComparePanelHeader input, SidebarSearch input, DictionarySearch input.
- **Props:** `value`, `onChange`, `onSubmit`, `placeholder`, `size: sm|md|pill`, `keyboard?: "hebrew"` (SRC-017), `minChars` hint.
- **A11y:** wrapped in `role=search` landmark when top-level; `type=search`; clear button labelled.
- **Features:** SRC-010, SRC-017, SRC-018, SRC-019, SRC-023, SRC-024, SRC-025, SRC-051, SRC-094.
- **Stories:** `Empty`, `WithValue`, `Pill` (header), `WithHebrewKeyboard`, std.

#### `Combobox`
- **Purpose:** accessible autocomplete engine (grouped options, async).
- **Replaces:** D15 (`GeneralAutocomplete` GeneralAutocomplete.jsx:6, `Autocompleter` Misc.jsx:3082, suggestion lists in HeaderAutocomplete.jsx:308-400, DictionarySearch, TopicSearch).
- **Props:** `query`, `onQueryChange`, `loadOptions(q, signal)`, `groups?` (`{id, label, icon}`), `renderOption`, `onSelect`, `minChars=3` (SRC-004), `footerOption` ("Search for …", SRC-009).
- **A11y:** ARIA 1.2 combobox: `aria-expanded`, `aria-controls`, `aria-activedescendant`, listbox groups with `role=group aria-labelledby`; results count announced politely; Esc clears/closes.
- **Features:** SRC-001, SRC-003, SRC-004, SRC-007, SRC-009, SRC-015, SRC-021, SRC-098, SRC-099, SRC-110.
- **Stories:** `Grouped`, `Loading`, `NoResults`, `Error`, `HebrewQuery`, std.

#### `Menu` (DropdownMenu)
- **Purpose:** button-triggered list of actions/links.
- **Replaces:** D10 action menus (`DropdownMenu` common/DropdownMenu.jsx:160 + items 7-130, `LoggedInDropdown`, `LoggedOutDropdown`, `ModuleSwitcher` Header.jsx, `SheetOptions` sheets/SheetOptions.jsx:35, `InterfaceLanguageMenu` Misc.jsx:1300).
- **Props:** `trigger`, `items` or children `Menu.Item | Menu.LinkItem | Menu.Separator | Menu.Group | Menu.RadioGroup`; `align`; `keepOpenOnSelect` (replaces `data-prevent-close`).
- **A11y:** WAI-ARIA menu button: `aria-haspopup=menu`, `aria-expanded`; arrow navigation, typeahead, Esc returns focus (fixes `onClose(true)` bug at DropdownMenu.jsx:243); portaled at `--sefaria-z-overlay`.
- **Features:** GUI-008, GUI-009, GUI-010, I18-007, SHV-018, SHV-019…023.
- **Stories:** `Actions`, `Links`, `WithRadioGroup` (language), `WithIcons`, std.

#### `Select`
- **Purpose:** pick one value from a list (sort, feedback type).
- **Replaces:** `Dropdown` Misc.jsx:2469, `DropdownButton/Modal/OptionList` 507-563, `SearchSortDropdown`, `SearchSortBox`, `CategoryChooser` `<select>`s Misc.jsx:2948.
- **Props:** `value`, `onValueChange`, `options`, `label` (may be visually hidden), `size`.
- **A11y:** listbox pattern (or native `<select>` on mobile); selected option `aria-selected`.
- **Features:** SRC-053, SRC-068, GUI-021, CON-067, I18-011.
- **Stories:** std, `WithVisuallyHiddenLabel`.

#### `Popover`
- **Purpose:** anchored non-modal floating panel for arbitrary content.
- **Replaces:** common/Popover.jsx:62 (keep floating-ui), `LangSelectInterface` popover, ReaderDisplayOptionsMenu host (`readerDropdownMenu`), `.langSelectPopover`.
- **Props:** `open`/`onOpenChange`, `trigger`, `placement`, `modal?` (focus trap; used by DisplaySettings), `label`.
- **A11y:** `role=dialog` with `aria-label` when content is interactive; focus moves in on open, returns to trigger on close; Esc + outside click close.
- **Features:** GUI-016, GUI-018, TXD-066, SHL-017.
- **Stories:** std, `Placements`, `FocusTrap`.

#### `Tooltip`
- **Purpose:** short description on hover/focus.
- **Replaces:** `ToolTipped` Misc.jsx:1458, `title=` attributes on link dots ("N Connections Available", TextRange.jsx:604-616), `AiInfoTooltip` 1487 (becomes Popover since it has links).
- **Props:** `content`, `side`, `delay`.
- **A11y:** `role=tooltip` + `aria-describedby`; shows on focus; dismissible with Esc; never contains interactive content (→ Popover).
- **Features:** AI-008, AI-017, TXD-047, SRC-007.
- **Stories:** std.

#### `Dialog` and `Drawer`
- **Purpose:** modal dialog; `Drawer` = bottom/side sheet variant for mobile.
- **Replaces:** D8 (common/modal.jsx:3, `SignUpModal` Misc.jsx:2004, `InterruptingMessage` 2128, 8 sheet modals SheetModals.jsx, `PublishModal`, `.collectionsModalBox`, `.addToSourceSheetModal`, mobile filter panels SearchFilters.jsx).
- **Props:** `open`/`onOpenChange`, `title` (required), `description?`, `size: sm|md|lg|fullscreen`, `footer` (actions), `dismissible`, `initialFocus`.
- **A11y:** native `<dialog>` + `showModal` (keeps old modal.jsx approach) or focus-trapped portal; `aria-labelledby` title; restores focus; `inert` background.
- **Features:** GUI-004, ACC-006, PRM-001, PRM-010, SHV-019, SHV-020, SHV-023, SHE-021, COL-006, SRC-063.
- **Stories:** `Confirm` (delete), `Form` (copy sheet), `SignUpPrompt`, `CMSModal` (markdown + CTA), `MobileDrawer`, std.

#### `Toast` / `InlineAlert` / `Banner`
- **Purpose:** transient confirmation (Toast), in-flow message (InlineAlert: info/success/warning/danger), dismissible page-level bar (Banner).
- **Replaces:** ConnectionsPanel flash message (inv_04 §2.6), `GlobalWarningMessage` Misc.jsx:615, `CookiesNotification` 2816, `Banner` 2272, `SiteWideBanner`, `TextColumnBanner`, status lines s2.css:7601-7612, "Feedback sent!" state.
- **Props:** `tone`, `title`, `children`, `action?`, `onDismiss?`, `dismissKey?` (Banner: persist dismissal).
- **A11y:** Toast in a single `aria-live=polite` region; danger InlineAlert `role=alert`; Banner is a `region` with label, dismiss button labelled.
- **Features:** GUI-006, GUI-007, PRM-002, PRM-011, PRM-014, TXD-063, TXD-064, TXT-010, VER-004, LIB-006.
- **Stories:** each tone, `WithAction`, `Dismissible`, `CookieNotice`, std.

#### `Spinner`, `Skeleton`, `LoadingState`
- **Purpose:** loading indicators; `LoadingState` = message + spinner with polite live region.
- **Replaces:** D7 (`LoadingRing` Misc.jsx:169, `LoadingMessage` 2588, `SkeletonCard`/`SearchLoadSkeleton`, InfiniteScroll string).
- **Props:** Spinner `size`, `label`; Skeleton `shape: line|block|circle`, `lines`; LoadingState `message?` (default "Loading…"/"טוען מידע...").
- **A11y:** `role=status`; skeletons `aria-hidden` with a single sr-only "Loading" per region; respects `prefers-reduced-motion` (no shimmer).
- **Features:** GUI-020, SRC-050, TXD-056, SRC-061.
- **Stories:** `Spinner`, `SkeletonText`, `SkeletonCard`, `ReducedMotion`, std.

#### `EmptyState`, `ErrorState`
- **Purpose:** consistent empty/error blocks with optional action.
- **Replaces:** `NoSearchResults` NoSearchResults.jsx:28, `EmptyNotificationsMessage` NotificationsPanel.jsx:133, panel error (SHL-035), zero placeholders ("All X (0)", CON-025), FilterableList `renderEmptyList`.
- **Props:** `title`, `description`, `icon?`, `action?`; ErrorState `error`, `onRetry`.
- **A11y:** ErrorState `role=alert`; EmptyState `role=status`.
- **Features:** SRC-064, SHL-035, NTF-001, GUI-021.
- **Stories:** std, `WithAction`, `Retry`.

#### `Badge` / `Pill` / `Count`
- **Purpose:** small labels (EN available, Experiment, AI, Unlisted), counts, and removable chips.
- **Replaces:** `EnglishAvailableTag` ConnectionFilters.jsx:159, "Experiment" label on Guided Learning (CON-013), FilterableList sort pills (Misc.jsx:234), `SheetAccessIcon`, notification counts.
- **Props:** `tone`, `size`; `Pill` adds `selected`, `onRemove?`, `asChild`.
- **A11y:** counts have sr text ("12 connections"); removable pill has labelled remove button.
- **Features:** CON-025, CON-013, GUI-021, NTF-001, SHV-026.
- **Stories:** std, `Removable`, `Selected`.

#### `Divider`, `VisuallyHidden`, `SkipLink`, `FocusRing`
- **Purpose:** structural helpers.
- **Replaces:** ad-hoc `hr`/borders, `.sr-only` patterns, skip link ReaderApp.jsx:2583.
- **A11y:** SkipLink first focusable, targets `#main` (I18-002).
- **Features:** I18-002, I18-005.
- **Stories:** `SkipLinkFocused`, std.

#### `Avatar`
- **Purpose:** profile picture with initials fallback.
- **Replaces:** `ProfilePic` ProfilePic.jsx (display part; upload/crop is a separate `AvatarEditor` in Voices).
- **Props:** `src`, `name`, `size`.
- **A11y:** `alt` = name, or empty if adjacent name text.
- **Features:** PRO-001, PRO-006, SHV-012.
- **Stories:** `Image`, `Initials`, `HebrewInitials`, std.

#### `ActionRow` (ToolButton)
- **Purpose:** full-width row button: icon + label + trailing count/chevron (sidebar tools).
- **Replaces:** `ToolsButton` ConnectionsPanel.jsx:1095, `ConnectionButtons` TextList.jsx:300 pieces, NavSidebar `IconLink` 949.
- **Props:** `icon`, `label`, `count?` (hide-when-zero option, CON-016), `highlighted` (experiment, `--sefaria-color-attention`), `href|onClick`, `badge?`.
- **A11y:** single focusable; count in label text.
- **Features:** CON-013, CON-014, CON-015, CON-016, CON-062, CON-063.
- **Stories:** std, `WithCount`, `Highlighted`, `ZeroHidden`.

#### `ToggleButton` presets: `SaveToggle`, `FollowToggle`
- **Purpose:** optimistic toggle with auth gating hook.
- **Replaces:** D21 (`SaveButton`/`SaveButtonWithText` Misc.jsx:1352/1347, `SaveLine` Story.jsx:366, `FollowButton` Misc.jsx:1550).
- **Props:** `pressed`, `onPressedChange` (async; component handles pending + rollback), `requiresAuth` → `onRequireAuth(kind)` (opens SignUp dialog kind `save|follow`, Misc.jsx:1988), `variant: icon|text|menuItem`.
- **A11y:** `aria-pressed`; label changes ("Save"/"Remove", "Follow"/"Unfollow" — hover-only "Unfollow" text in old FollowButton is not keyboard accessible; expose on focus too).
- **Features:** USL-001, USL-009, USL-011, PRO-008, PRO-011, ACC-006.
- **Stories:** `Unpressed`, `Pressed`, `Pending`, `AuthRequired`, `Error` (rollback), std.

---

### C.3 Layer 2: Layout

#### `AppShell`
- **Purpose:** page frame: skip link, `Header`, `<main id=main>`, banner slot, toast region, portal root; sets `lang`/`dir` from interface language.
- **Replaces:** ReaderApp root render (SHL-026, inv_02 §1), `#s2` container, header-only mode (SHL-023).
- **Props:** `interfaceLang`, `module: library|voices`, `banner?`, `children`.
- **A11y:** landmarks (banner/main/contentinfo), single `h1` per page owned by page content; `user-is-tabbing` replaced by `:focus-visible`.
- **Features:** SHL-022, SHL-026, SHL-036, I18-002, I18-005, I18-013, RTE-001.
- **Stories:** `Library`, `Voices`, `HebrewInterface`, `WithBanner`, std.

#### `SiteHeader`
- **Purpose:** top bar: logo, primary nav, `SiteSearch`, module switcher, language menu, account menu / sign-in buttons, notifications; collapses to `MobileNav`.
- **Replaces:** `Header` Header.jsx:204, `LoggedOutButtons` 401, `MobileNavMenu` 425, `MobileInterfaceLanguageToggle` 596, `HelpButton`/`SignUpButton`/`CreateButton` 619-645.
- **Props:** `user?`, `module`, `nav items`, `unreadCount`.
- **A11y:** `role=banner`, `nav aria-label="Primary"`, mobile menu is a Dialog/Drawer with labelled close; search `role=search`.
- **Features:** GUI-001, GUI-002, GUI-003, GUI-009, GUI-010, GUI-011, I18-006, I18-008, SRC-023, SRC-024.
- **Stories:** `LoggedOut`, `LoggedIn`, `WithUnread`, `Voices`, `MobileMenuOpen`, std.

#### `PanelGroup` / `Panel`
- **Purpose:** multi-panel horizontal layout (text + connections + compare), max panel cap, widths, auto-scroll to new panel; single-panel on mobile.
- **Replaces:** ReaderApp panel layout (SHL-039…042), `ReaderPanel` root element (SHL-036).
- **Props:** `panels: {id, kind, width?}`, `maxPanels`, `onClose(id)`; `Panel` `label`, `kind: text|connections|menu|sheet`, `toolbar`.
- **A11y:** each panel a `region` with `aria-label` (book/section title or "Resources"); new panel receives focus on its heading (ReaderApp.jsx:1059-1064, adopt toolkit reader-element.ts:803-818 pattern); Esc closes **only** connections/compare panels (old Esc closed any panel, SHL-071).
- **Features:** SHL-031, SHL-033, SHL-036, SHL-039, SHL-040, SHL-042, SHL-048, SHL-061, SHL-071, CON-004, CON-008.
- **Stories:** `OnePanel`, `TextAndConnections`, `ThreePanels`, `Mobile` (single panel + drawer), `HebrewInterface` (RTL panel order), std.

#### `PanelHeader`
- **Purpose:** in-panel 60px toolbar: start slot (close/back/menu), centered title (+ subtitle), end slot (actions), optional `CategoryColorLine`.
- **Replaces:** `ReaderControls` ReaderPanel.jsx:1299, `ConnectionsPanelHeader` ConnectionsPanelHeader.jsx:14, `ComparePanelHeader` ComparePanelHeader.jsx:16, BookPage compare header (BookPage.jsx:220-239), sheet meta header.
- **Props:** `title` (node), `subtitle?`, `headingLevel`, `start`, `end`, `category?`, `sticky`, `variant: text|connections|compare|menu`.
- **A11y:** title is a real heading (old used `role=heading aria-level=1 aria-live=polite` on a link, ReaderPanel.jsx:1424 — split into heading + separate button "Show resources for {title}"); toolbar `role=toolbar` only if ≥3 controls with arrow-key nav.
- **Features:** SHL-074, SHL-062, SHL-037, CON-002, CON-003, CON-070, TXD-013, VER-005, TXT-009.
- **Stories:** `TextHeader` (Genesis 1 + version subtitle), `TalmudHeader` (Davidson attribution), `ConnectionsBack`, `Compare`, `Mobile`, std.

#### `PageLayout` (content + sidebar)
- **Purpose:** two-column page: main content (max 725px) + `NavSidebar` (420px), stacks on mobile.
- **Replaces:** `.sidebarLayout` (s2.css:1494), TextsPage/TextCategoryPage/BookPage/TopicPage/CalendarsPage/SearchPage/UserProfile/CollectionPage page wrappers, `.readerNavMenu`.
- **Props:** `header?`, `children`, `sidebar?`, `sidebarPosition: end|bottom-on-mobile`.
- **A11y:** sidebar is `complementary` with label.
- **Features:** LIB-007, LIB-017, BOK-006, TOP-025, SRC-049, PRO-001.
- **Stories:** std, `NoSidebar`, `Mobile`.

#### `NavSidebar` + `SidebarSection`
- **Purpose:** right-rail container rendering a list of module descriptors; `SidebarSection` = titled block (22px/500 title with bottom rule).
- **Replaces:** `NavSidebar`/`SidebarModules`/`SidebarModule`/`SidebarModuleTitle` NavSidebar.jsx:14-93, D20 (`ConnectionsPanelSection` ConnectionsPanel.jsx:1643, `TopicSideSection` TopicPage.jsx:1016, `TranslationsHeader` TranslationsBox.jsx:127).
- **Props:** `modules: Array<{type, props}>` registry (typed union of the ~45 module types), `SidebarSection {title, headingLevel, action?}`.
- **A11y:** each section `h2`/`h3` per page outline (old used `h1` per module, s2.css:1627).
- **Features:** LIB-023…064, PRM-007, PRM-017.
- **Stories:** `LibraryHome`, `BookPage`, `TopicPage`, `VoicesHome`, std. (Module bodies are mostly composition of primitives — each module gets one story in a `Sidebar Modules` folder, not its own component file unless it has logic: `RecentlyViewed`, `WeeklyTorahPortion`, `DafYomi`, `DownloadVersions`, `TrendingTopics`, `NewsletterSignup`.)

#### `ResponsiveGrid`
- **Purpose:** 1/2/3-column grid by container width with gap token.
- **Replaces:** D16 (`NBox`/`TwoOrThreeBox`/`ResponsiveNBox` Misc.jsx:2395-2437, `TOCCardsWrapper`).
- **Props:** `minItemWidth` or `columns={{base:1, sm:2, lg:3}}` (container thresholds 500/1500 from ResponsiveNBox), `gap`.
- **A11y:** none (layout only); if items are a list, render `ul/li`.
- **Features:** GUI-023, LIB-001, TOP-011, SHV-001.
- **Stories:** `OneTwoThree` (resize), std.

#### `Stack` / `Cluster` / `Box`
- **Purpose:** token-driven spacing primitives (vertical stack, wrapping inline cluster).
- **Replaces:** countless ad-hoc margin rules.
- **Props:** `gap` (space token), `align`, `as`.
- **Stories:** `Default` only.

#### `Card` and `ListingRow`
- **Purpose:** `Card` = surface (border/shadow/radius/hover/press); `ListingRow` = media + title + meta + actions layout used by all listings.
- **Replaces:** D5 (`common/Card.jsx:6`, `.navBlock`, `StoryFrame`, `ColorBarBox`) — domain listings in C.4 compose these.
- **Props:** Card `interactive`, `accentCategory?` (start border color, D12), `elevation`; ListingRow `media?`, `title`, `subtitle?`, `meta?`, `actions?`, `href?` (whole-row link with nested-interactive safety: toolkit source-card-element.ts:842-859 pattern).
- **A11y:** whole-row link uses a single anchor on the title with pseudo-element stretch (no nested anchors); actions remain separately focusable; press state for touch (SRC-060, `usePressState` SearchResultCard.jsx:19).
- **Features:** GUI-024, SRC-055, SRC-060, TOP-023, SHV-026.
- **Stories:** std, `WithAccent`, `WithActions`, `Pressed`.

#### `CategoryColorLine` / category accent
- **Purpose:** 4px category color bar (top of panel/page) and start-border accent.
- **Replaces:** D12 (`CategoryColorLine` Misc.jsx:1633, `ColorBarBox` 753, `RainbowLine` RainbowLine.jsx:3, `.colorLine`, `--category-color` inline).
- **Props:** `category` (string | string[]) → `categoryColor()`; `variant: line|rainbow`.
- **A11y:** decorative (`aria-hidden`); color never the only carrier of category (category name rendered nearby).
- **Features:** GUI-013, LIB-019, SHL-074, CON-025.
- **Stories:** `AllCategories` (palette swatch grid), `Rainbow`, `Unknown` (hash fallback).
- **Note:** impression analytics (header_viewed) moves to a separate `useImpression` hook, not inside the visual.

---

### C.4 Layer 3: Domain components

Grouped by area. The reader text group (C.4.1) is built first; see E.

#### C.4.1 Reader text

##### `ReaderSettingsProvider` (context, not visual) + `useReaderSettings`
- **Purpose:** per-panel display settings: `contentLang (source|translation|bilingual)`, `layout (segmented|continuous)`, `biLayout (stacked|heLeft|heRight)`, `fontScale`, `vocalization (taamim_and_nikkud|nikkud|none)`, `aliyot`, `punctuation`, `theme`; effective-layout resolution; persistence (cookie).
- **Replaces:** ReaderApp/ReaderPanel settings logic (ReaderPanel.jsx:530-549, `ReaderPanelContext`), LayoutButtons `calculateLayoutState` LayoutButtons.jsx:10.
- **Rules ported:** layout state mono/mixed/bi-rtl/bi-ltr with option sets (inv_02 §7); auto side-by-side flip for same-direction texts (SHL-012, TXD-035); sidebar panels never bilingual (SHL-014); Talmud defaults continuous (TXT-005); new panels inherit settings (SHL-010).
- **Features:** SHL-007…016, SHL-019…021, TXD-031…042, TXT-003, TXT-005, TXT-006.
- **Stories:** n/a (tested via unit tests + DisplaySettings stories).

##### `DisplaySettingsMenu` (ReaderControls menu)
- **Purpose:** the "Aa" popover with all reader options, showing only applicable ones.
- **Replaces:** `ReaderDisplayOptionsMenu` ReaderDisplayOptionsMenu.jsx:11, `SourceTranslationsButtons`, `LayoutButtons`, `FontSizeButtons`, legacy `ToggleSet` usage, `DisplaySettingsButton` Misc.jsx:1266.
- **Composition:** `Popover` + `SegmentedControl` (language; layout icons) + `Stepper` (font) + `Switch` ×4 (vowels, cantillation, aliyot, punctuation).
- **Props:** `settings`, `onChange`, `capabilities: {hasSource, hasTranslation, hasNikkud, hasTaamim, isTorah, isTalmud, isSheet, isSidePanel, narrow}` — visibility rules are a pure function `visibleOptions(capabilities)` with unit tests mirroring ReaderDisplayOptionsMenu.jsx:24-98 (nikud regex `[ְ-׃ׇ]`, te'amim `[֑-֯]`, aliyot only Genesis–Deuteronomy + Onkelos, punctuation only Talmud, layout hidden ≤600px bilingual).
- **A11y:** `role=dialog aria-label="Text display options"`; focus the checked option on open (ReaderDisplayOptionsMenu.jsx:100-104); menu stays open on font change; cantillation disabled-with-reason when vowels off.
- **Features:** SHL-017, SHL-018, SHL-019, SHL-020, SHL-021, TXD-031, TXD-032, TXD-033, TXD-034, TXD-036, TXD-037, TXD-038, TXD-041, TXT-003, TXT-006, SHV-013.
- **Stories:** `Tanakh` (all options incl. vowels/cantillation), `Torah` (+aliyot), `Talmud` (+punctuation, no cantillation), `TranslationOnlyText`, `SidePanel` (language only), `Sheet`, `NarrowBilingual` (no layout), `HebrewInterface`, `KeyboardOnly`.

##### `TextSegment` (single-language passage body)
- **Purpose:** render one sanitized, vocalized passage HTML in one version with inline semantics made interactive: ref links, footnotes, named entities, commentary markers (itags), overlays (Vilna/Venice), images, search highlights.
- **Replaces:** `VersionContent`/`ContentSpan`/`VersionImageSpan` ContentText.jsx:22-93; inline parts of `TextSegment` TextRange.jsx:438-667 (`formatItag` 528-553, `addHighlights` 554-566, footnote toggle, refLink/namedEntity routing 485-527).
- **Input:** `NormalizedText` from `@toolkit/text-transform` `normalizeText` (`data-sefaria-ref|-slug|-commentator|-overlay|-note|-mam`) — no raw HTML from the API reaches React.
- **Props:** `html` (normalized), `notes[]`, `lang`, `dir`, `role: primary|translation`, `vocalization`, `highlights?: string[]`, `activeCommentator?` (shows itags only when filter active, TXT-017), `showEntityLinks`, `onRefClick(ref, versions)`, `onEntityClick(slug)`, `footnotes: inline-toggle|popover`.
- **A11y:** `lang`/`dir` from version payload; RTL translations get Hebrew-family styling (TXD-044) via `:lang()` not class; **footnote marker is a `<button aria-expanded aria-controls>`** toggling an inline note with an id (fixes both old click-only `sup` and toolkit's unlinked notes); ref links are real `<a href>`; overlays (`Vilna Pages` 2a) rendered as `<span aria-label="Vilna page 2a">`; search highlights in `<mark>`.
- **Features:** TXD-020, TXD-021, TXD-022, TXD-023, TXD-024, TXD-025, TXD-026, TXD-027, TXD-028, TXD-029, TXD-044, TXD-060, TXT-008, TXT-017, SRC-058, TXT-027.
- **Stories:** `EnglishPlain`, `HebrewWithNikkudAndTaamim`, `HebrewNikkudOnly`, `HebrewNoVowels` (same data, three vocalization modes — no refetch), `WithFootnotes` (closed/open), `WithRefLinks`, `WithNamedEntities` (on/off), `TalmudWithVilnaMarkers`, `WithItagsFilterActive`, `WithSearchHighlight`, `ArabicTranslationRTL`, `InlineImage`, `FullSegmentImage`, `KetivQere` (mam), std.

##### `SegmentNumber`
- **Purpose:** segment label in the reading gutter (Arabic numerals or Hebrew numerals by display language) and its placement.
- **Replaces:** `.segmentNumber` TextRange.jsx:617-626 and jQuery `placeSegmentNumbers` 188-226 (replaced by CSS: absolute in segmented, inline-start float with `shape-outside`/anchor in continuous — **no measuring JS**).
- **Props:** `n` (address), `addressType` (Integer, Talmud, Perek…), `lang: en|he`, `hidden` (Guide for the Perplexed, Liturgy, Reference — TextRange.jsx:256-260, TXT-019/020/021).
- **A11y:** `aria-hidden` (the segment's accessible name already includes the ref); not selectable; not copied (TXD-001/058).
- **Features:** TXD-045, TXD-046, TXD-065, TXT-021, TXT-024, I18-013.
- **Stories:** `Arabic`, `HebrewNumerals` (15→ט״ו, 16→ט״ז), `HundredsAndThousands`, `Hidden`, `ContinuousCollision` (two numbers same line), std.

##### `LinkCountDot`
- **Purpose:** gutter dot whose opacity encodes connection count (respecting active filter).
- **Replaces:** `.linkCount > .linkCountDot` TextRange.jsx:604-616.
- **Props:** `count`, `filterActive?`.
- **A11y:** decorative; count exposed in segment accessible description ("12 connections").
- **Features:** TXD-047, CON-029, TXT-017.
- **Stories:** `Zero`, `Few`, `Many`, `Dark`.

##### `BilingualSegment` (THE reader segment)
- **Purpose:** one addressable segment: number + link dot + primary and/or translation `TextSegment`s in a layout, clickable/selectable/highlightable.
- **Replaces:** `TextSegment` TextRange.jsx:438-667 (container part), stacked/heLeft/heRight CSS (s2.css:7028-7133), sheet `SheetSource`/`SheetOutsideBiText` bilingual rendering (SheetContentSegments.jsx:6, 165), `TopicTextPassage` body (Story.jsx:167), toolkit `<sefaria-bilingual-segment>` ideas.
- **Props:**
  - `segment: {ref, heRef, address, primary?: Side, translation?: Side, linkCount}` with `Side = {html, notes, lang, dir, versionTitle}`
  - `contentLang: source|translation|bilingual`
  - `layout: segmented|continuous`
  - `biLayout: stacked|heLeft|heRight` (**names kept from old client**; implemented as `stacked | side-by-side` + `sourceSide: start|end`, resolved against direction — equivalent to toolkit `layout`+`side-order`)
  - `highlighted`, `selected`, `showNumber`, `showLinkDot`
  - `onActivate(ref)` (opens connections), `onSelectText(words)`
- **Visibility rules (ported):** primary shown if contentLang≠translation or no translation; translation shown if contentLang≠source or no primary; neither → render nothing (TextRange.jsx:629-650). Only-one-side segments get `heOnly`/`enOnly` direction semantics via `dir`.
- **A11y:** segment is a focusable element (`tabIndex=0`) with accessible name "Genesis 1:3" and description "N connections — press Enter to open"; Enter/Space activate (TXD-049); clicking with an active text selection does not activate (toolkit source-card-element.ts:842-859; TextColumn double-click guard TXD-057); `aria-current="true"` when highlighted; side-by-side keeps DOM order primary-first, uses CSS `order` for visual swap; highlight colour token `--sefaria-segment-highlight`.
- **Features:** TXD-043, TXD-044, TXD-045, TXD-046, TXD-047, TXD-048, TXD-049, TXD-050, TXD-061, TXD-034, TXD-035, TXD-033, TXD-057, SHL-046, TXT-001, TXT-005, TXT-022, TXT-025, SHV-007, TOP-023.
- **Stories:** `TanakhHebrew`, `TanakhEnglish`, `TanakhBilingualStacked`, `TanakhHeRight`, `TanakhHeLeft`, `TalmudContinuous` (inline segments), `TalmudBilingualSideBySide`, `HebrewOnlyText` (no translation), `TranslationOnlyText`, `RTLTranslationBilingual` (bi-rtl: Hebrew + Yiddish), `Highlighted`, `WithFootnoteOpen`, `Mobile` (±30px gutters), `Dark`, `Sepia`, `HebrewInterface`, `KeyboardActivate`, `LongVerse`.

##### `SectionHeading`
- **Purpose:** title of a section within the text column ("Genesis 1" / "1" / "בראשית א" / "2a" / "Introduction, Chapter 2").
- **Replaces:** `.title > .titleBox[role=heading aria-level=2]` TextRange.jsx:239-253; `bookMetaDataBox` (TextColumn.jsx:485-508) becomes `BookHeading` variant.
- **Props:** `title: {en,he}`, `short?: boolean` (numbered for Tanakh/Mishnah/Talmud/Tanaitic/Commentary, named otherwise — TXD-011), `level`, `variant: section|book`, `actions?` (titleButtons).
- **A11y:** real `h2` (`h1` for book variant); bilingual defaults to interface language (TXD-012).
- **Features:** TXD-011, TXD-012, TXD-015, TXD-056, TXT-007, TXT-023.
- **Stories:** `TanakhChapter`, `TalmudDaf` (2a / ב.), `NamedSection` (complex text), `BookTitle`, `HebrewInterface`, std.

##### `ParashaHeader`
- **Purpose:** inline parashah / aliyah header before the first segment of a parashah or aliyah.
- **Replaces:** `.parashahHeader` rendering TextRange.jsx:288-339, util.js:23-42.
- **Props:** `parasha: {en,he}`, `aliyah?: {en,he}`, `whole: boolean`, `isFirstInSection` (tighter margin).
- **A11y:** `h3` (within section `h2`); aliyah label uppercase via CSS not text.
- **Features:** TXT-002, TXT-003, TXT-004.
- **Stories:** `ParashaStart` (Bereshit), `AliyahOn` ("Noach: Second"), `MidChapter`, `Onkelos`, `Hebrew`, std.

##### `DafMarker` / `PageMarker`
- **Purpose:** inline marker for printed page/column transitions (Vilna pages, Venice columns) and Talmud amud boundaries in continuous reading.
- **Replaces:** CSS `i[data-overlay]` content rendering s2.css:7726-7744.
- **Props:** `kind: vilna|venice`, `value`.
- **A11y:** sr text "Vilna page 3b"; hidden in print? (keep visible).
- **Features:** TXT-008, TXT-007.
- **Stories:** `Vilna`, `Venice`, `InContinuousText`.

##### `TextColumn` (ReaderColumn)
- **Purpose:** scrolling column of sections with bidirectional infinite load, visible-ref tracking, initial scroll to highlight, selection → lexicon.
- **Replaces:** `TextColumn` TextColumn.jsx:15, `TextRange` TextRange.jsx:14 (as `ReaderSection`).
- **Props:** `sections` (prepared), `hasPrev/hasNext`, `onLoadPrev/onLoadNext`, `highlightedRefs`, `onVisibleRefChange` (debounced, drives URL/header — TXD-055), `onSegmentActivate`, `onSelectWords` (lexicon), `scrollContainer: self|window` (desktop vs mobile, TXD-053), `renderSectionHeader`.
- **Implementation notes:** IntersectionObserver sentinels (replace scrollTop thresholds 75/80px), CSS `overflow-anchor` for top-load jump prevention (replaces `restoreScrollPositionAfterTopLoad` 241-269), placeholders only after hydration (TextColumn.jsx:33-35).
- **A11y:** `role=feed` with `aria-busy` while loading, each section an `article` with heading; keyboard focus on a segment counts as "visible" (TextColumn.jsx:404-445); loading placeholders are `LoadingState`.
- **Features:** TXD-002, TXD-003, TXD-052, TXD-053, TXD-054, TXD-055, TXD-056, TXD-057, TXD-059, SHL-065, CON-042.
- **Stories:** `GenesisScroll` (mocked loader, scroll up/down), `TalmudContinuous`, `InitialHighlightScroll`, `LoadingTop`, `LoadingBottom`, `EndOfBook`, `Error`, `Mobile` (window scroll), `HebrewInterface`.

##### `ReaderPanelView` (composite, story-level)
- **Purpose:** PanelHeader (title, version subtitle, Save, Display settings) + TextColumn + banners — the full text panel.
- **Replaces:** `ReaderPanel` text mode ReaderPanel.jsx:714-1243.
- **Features:** SHL-031, SHL-074, TXD-013, VER-005, USL-001, TXD-063, TXD-064.
- **Stories:** `Genesis1Bilingual`, `Berakhot2a`, `RashiOnGenesisAsBaseText` (TXT-015/016), `Loading`, `Error`, `Mobile`.

##### `CategoryAttribution`
- **Purpose:** edition/credit line under header (e.g. William Davidson Talmud).
- **Replaces:** `CategoryAttribution` Misc.jsx:2610.
- **Props:** `categories`, `linked`, `asEdition`.
- **Features:** LIB-067, TXT-009, TXT-012.
- **Stories:** `Talmud`, `Linked`, `Hebrew`.

##### `TextBanner`
- **Purpose:** in-column nudge (translation preference suggestion, open translation available).
- **Replaces:** `TextColumnBanner` TextColumnBanner.jsx, VER-004 banners. Built on `Banner`.
- **Features:** TXD-063, TXD-064, TXT-010, VER-004.
- **Stories:** `SuggestTranslationLanguage`, `OpenTranslation`, `Dismissed`.

#### C.4.2 Connections (Resources sidebar)

##### `ConnectionsPanel` (shell)
- **Purpose:** sidebar host: mode router + header + scroll restoration. Each mode is a separate component below; the panel only switches.
- **Replaces:** `ConnectionsPanel` ConnectionsPanel.jsx:46 (render 268-587), `ConnectionsPanelHeader`.
- **Props:** `mode` (typed union from CON-007), `ref(s)`, `onModeChange`, `onBack`, `onClose`, `authGate` (CON-011).
- **A11y:** panel heading = mode title, focus heading on mode change; back is a link with label "Back to Resources".
- **Features:** CON-003…011, CON-070, CON-071, SHL-033, SHL-047, SHL-058.
- **Stories:** one story per mode at panel level (`Resources`, `CategoryList`, `TextList`, `Lexicon`, `Translations`, `About`, `Navigation`, `Notes`, `Share`, `Topics`, `WebPages`, `Manuscripts`, `AddToSheet`, `Feedback`, `LoginRequired`), `Mobile` (drawer), `HebrewInterface`.

##### `ResourcesHome`
- **Purpose:** Resources top view: top tool buttons, related-texts summary, resources list, tools list.
- **Replaces:** Resources branch of ConnectionsPanel.jsx:272-340, `ResourcesList` 668, `ToolsList` 687, `AdvancedToolsList` 1036.
- **Composition:** `ActionRow` lists + `ConnectionsSummary`.
- **Features:** CON-012, CON-013, CON-014, CON-015, CON-016, CON-017, CON-062, CON-063, CON-066.
- **Stories:** `Default`, `NoTranslations` (button hidden), `WithGuidedLearning`, `LoggedOut`, `Loading`, std.

##### `ConnectionsSummary` + `CategoryFilter` (ConnectionsList)
- **Purpose:** category rows (color, count, "EN" badge) → per-book rows; zero-count books greyed; Commentary first; Sefaria ordering overrides.
- **Replaces:** `ConnectionsSummary` ConnectionsPanel.jsx:707, `CategoryFilter`/`TextFilter`/`EnglishAvailableTag` ConnectionFilters.jsx:10/93/159.
- **Props:** `summary` (from `linkSummary` port — ordering is data logic, not component), `view: categories|books(category)`, `activeFilter`, `onSelectCategory`, `onSelectBook(name, suffix?)`.
- **A11y:** list of links (filters are navigational, URL `with=`); count in accessible name; color decorative.
- **Features:** CON-019, CON-020, CON-021, CON-023, CON-024, CON-025, CON-026, CON-027.
- **Stories:** `TanakhSummary`, `TalmudSummary`, `CommentaryBooks` (incl. Quoting Commentary), `ZeroCountGreyed`, `CollapsedTo4`, `Loading`, `Empty`, `HebrewInterface`.

##### `RecentFilterChips`
- **Purpose:** recent filter chips at top of text list.
- **Replaces:** `RecentFilterSet` ConnectionFilters.jsx:165.
- **Features:** CON-028.
- **Stories:** `Default`, `ActiveIsLink` (fix: active chip remains a link, CON-026 note).

##### `ConnectionsList` (TextList)
- **Purpose:** filtered list of connected passages, each a `SourceListing` in "connection" mode with actions (open, add to sheet, compare, delete-for-moderators).
- **Replaces:** `TextList` TextList.jsx:17 + `ConnectionButtons` 300, `OpenConnectionTabButton` 255, `AddConnectionToSheetButton` 282, `DeleteConnectionButton` 222.
- **Props:** `items`, `filter`, `contentLang` (never bilingual in sidebar, SHL-014), `onOpen`, `onAddToSheet`, `canDelete`.
- **A11y:** `ul` of `article`s with heading per book group; preload state announced.
- **Features:** CON-030, CON-031, CON-032, CON-033, CON-034, CON-035, CON-038, TXT-018.
- **Stories:** `RashiOnGenesis1_1`, `MultipleCommentators`, `WithItagNumbers`, `Loading`, `Empty`, `Moderator`, `HebrewOnly`.

##### `SourceListing`
- **Purpose:** a citation + passage card: ref title (linked), category accent, optional version label, bilingual excerpt (truncated), optional description/prompt, actions.
- **Replaces:** D5 text-passage family — `TopicTextPassage` Story.jsx:167, `TextPassage` 283, `StoryTextListItem` 132, `TextBlockLink` Misc.jsx:631 (ref variant), TextList item rendering, `SearchResultCard` mode `sources` (SearchResultCard.jsx:103), `RecentlyViewedItem` NavSidebar.jsx:109, `UserHistoryList` rows, `VersionsTextList` preview, Add-to-sheet preview.
- **Props:** `ref`, `title {en,he}`, `category`, `excerpt?: BilingualSide pair | snippet html`, `versionLabel?`, `description?` / `prompt?` (curated topics, collapsible `<details>`), `timestamp?`, `actions?`, `variant: card|row|compact`, `highlights?`.
- **A11y:** title link is the primary link; excerpt text has `lang`; truncated preview has "Read more" button with `aria-expanded`.
- **Features:** CON-032, TOP-023, SRC-055, SRC-056, SRC-057, USL-008, LIB-025, GUI-024, VER-010.
- **Stories:** `TopicSourceCurated` (title + prompt), `TopicSource`, `SearchHitWithHighlights`, `ConnectionItem`, `HistoryRowWithTime`, `SavedRowWithSave`, `Truncated`, `HebrewOnly`, `Bilingual`, std.

##### `LexiconPanel` + `LexiconEntry`
- **Purpose:** dictionary results for selected words; entry with headword, morphology, senses, source attribution; named-entity variant (topic preview).
- **Replaces:** `LexiconBox` LexiconBox.jsx:14, `LexiconEntry` 209-373, named entity pane (inv_04 §9.4), `DictionarySearch` (as `HeadwordPicker` preset of Combobox).
- **Props:** `query`, `entries`, `state`, `onSearch`; Entry `entry`, `dictionary` (Jastrow/BDB/Klein… rendering variants are data-driven, not components).
- **A11y:** `h3` headword with `lang`; senses as nested `ol`.
- **Features:** CON-042, CON-043, CON-044, CON-045, SHL-053, TXD-059, SRC-021, SRC-022, TXT-019.
- **Stories:** `BDBEntry`, `JastrowEntry`, `KleinEntry`, `NamedEntity`, `NoResults`, `Loading`, `SearchBox`, std.

##### `VersionCard` + `VersionList`
- **Purpose:** one version/translation: title, language, license, source link, notes (with read more), preview, select/"Current" action, moderator edit.
- **Replaces:** D17 (`VersionBlock` VersionBlock.jsx:79 three render modes, `VersionBlockWithPreview` VersionBlockWithPreview.jsx:9, `VersionsList` BookPage.jsx:990, `VersionsBlocksList` VersionBlock.jsx:359, `VersionInformation`, `VersionMetadata`, `VersionImage`, `VersionTitleAndSelector`, `VersionBlockSelectButton`, `TranslationsBox` list).
- **Props:** `version`, `variant: sidebar|bookPage|about`, `current: boolean`, `preview?` (TextSegment, truncated via `createTextPreview`), `onSelect`, `onOpen`, `showNotes`, `canEdit`; List groups by `languageFamilyName` with headings.
- **A11y:** selection button `aria-pressed`/"Current translation" label; details via `<details>`; external source link labelled.
- **Features:** VER-005, VER-006, VER-007, VER-008, VER-009, VER-010, VER-011, VER-012, VER-013, VER-016, VER-017, VER-019, VER-021, BOK-007, LIB-060.
- **Stories:** `TranslationCurrent`, `TranslationSelectable`, `WithPreviewTruncated`, `SourceVersion`, `MergedVersion`, `BookPageVariant`, `ListGroupedByLanguage`, `Moderator`, `HebrewInterface`, std.

##### `AboutText`
- **Purpose:** About this text: description, authors, composition, current versions, other versions, related topics.
- **Replaces:** `AboutBox` AboutBox.jsx:12; NavSidebar `AboutText` NavSidebar.jsx:380 (same content, different container).
- **Features:** CON-039, CON-041, LIB-036, VER-006, VER-008.
- **Stories:** `Genesis`, `Talmud`, `Commentary`, `Loading`.

##### Other sidebar tools (thin compositions; one file each, one story set each)
| Component | Replaces | Features | Stories |
|---|---|---|---|
| `TopicsForRef` | `TopicList`/`TopicListItem` ConnectionsPanel.jsx:841/876 | CON-046, CON-047 | Default, Empty, Moderator |
| `NotesPanel` (`NoteEditor` + `NoteList`) | `AddNoteBox` 1258, `MyNotes` 1381, `Note` Misc.jsx:1918, MyNotesPanel | CON-048…050, USL-003…007 | Empty, WithNotes, Editing, LoggedOut |
| `SharePanel` | `ShareBox` 1165, sheets `ShareModal` | CON-061, SHV-019 | Default, Copied |
| `WebPagesList` | `WebPagesList` 905, WebPage.jsx | CON-052…054 | ByDomain, Empty |
| `ManuscriptGallery` | `ManuscriptImageList`/`ManuscriptImage` 1574/1584 | CON-060 | Default, ImageError |
| `AddToSheetForm` | AddToSourceSheet.jsx | CON-055…057, SHV-011 | ChooseSheet, NewSheet, Added, LoggedOut |
| `FeedbackForm` | `FeedbackBox` Misc.jsx:2662 | CON-067, GUI-027 | Anonymous, LoggedIn, Sent, Error |
| `AddConnectionForm` | `AddConnectionBox` 1451 | CON-065 | Default |
| `SearchInText` | `SidebarSearch` SidebarSearch.jsx:12 | SRC-094, SRC-096, SRC-020 | Results, NoResults, Dictionary |
| `LoginRequired` | `LoginPrompt` Misc.jsx:1964 | CON-011, ACC-006 | Default |

#### C.4.3 Library navigation and table of contents

##### `CategoryTile` (+ `CategoryGrid`)
- **Purpose:** library category card: color line, title, short description.
- **Replaces:** `.navBlock.withColorLine` TextsPage.jsx:42-67, `BlockLink` Misc.jsx:809, `TopicTOCCard` common/TopicTOCCard.jsx:5, sheets home TOC cards.
- **Props:** `category`, `title {en,he}`, `description`, `href`, `count?`.
- **Features:** LIB-001, LIB-019, TOP-011, TOP-012, SHV-001.
- **Stories:** `AllTopLevelCategories` (in ResponsiveGrid), `Hebrew`, `Bilingual` (interface title only), `Mobile`.

##### `CategoryContents` (`BookListing` rows)
- **Purpose:** nested category sections with book rows (short titles, Hebrew ordering), collections inline, single-text collapse.
- **Replaces:** `TextCategoryContents` TextCategoryPage.jsx:117, `MenuItem`/`TextMenuItem` 268/291.
- **Features:** LIB-008, LIB-010, LIB-012, LIB-013, LIB-014, LIB-015, LIB-016.
- **Stories:** `Tanakh`, `TalmudBavli`, `CommentaryCategory`, `Hebrew`.

##### `TocTree`
- **Purpose:** schema-driven table of contents: collapsible complex nodes, default nodes, alt structures, leaf dispatch to `SectionGrid`.
- **Replaces:** `TextTableOfContents` BookPage.jsx:333, `SchemaNode` 562, `JaggedArrayNode` 726, `ArrayMapNode` 852, `DictionaryNode` 941.
- **Props:** `schema`, `alts`, `activeStructure`, `currentRef` (auto-expands containing node), `zoom` (toc_zoom), `onNavigate`, `variant: page|sidebar`.
- **A11y:** collapsible nodes are disclosure buttons (`aria-expanded`) with heading text (old used Enter on `role=heading`); tree is nested lists, not ARIA `tree` (links inside — simpler and robust).
- **Features:** BOK-008, BOK-009, BOK-010, BOK-012, BOK-013, BOK-015, BOK-016, BOK-023, TXT-023, TXT-024.
- **Stories:** `SimpleBookGenesis`, `ComplexBookShulchanArukh`, `MishnehTorahDeepNested`, `WithAltStructure`, `DictionaryLetters`, `ZoomedOut`, `CurrentRefExpanded`, `SidebarVariant`, `Hebrew`, std.

##### `SectionGrid` (ChapterGrid / DafGrid)
- **Purpose:** grid of section links skipping empty ones; labels by address type; current highlighted.
- **Replaces:** D18 (`JaggedArrayNodeSection` BookPage.jsx:776-849 grid), letter grid in `DictionaryNode`.
- **Props:** `sections: {label {en,he}, href, empty}`, `addressType: Integer|Perek|Talmud|Folio|Letter…`, `offset` (index_offsets_by_depth), `current?`.
- **Variants:** `chapter` (square cells), `daf` (wider cells "2a 2b" pairs, Hebrew "ב. ב:"), `letter`.
- **A11y:** `nav` with label "Chapters of Genesis"; `aria-current="page"` on current; numbers have full accessible name ("Chapter 3").
- **Features:** BOK-011, BOK-014, TXT-007, TXT-013, TXT-024, TXD-065.
- **Stories:** `GenesisChapters`, `BerakhotDafim`, `HebrewDafim`, `NonOneStart` (offset), `SparseAvailability`, `Current`, `Mobile`.

##### `ParashaList`
- **Purpose:** Torah portions with aliyot under a Torah book TOC.
- **Replaces:** `.torahNavParshiot` (BookPage.jsx:442-468), `displayFixedTitleSubSections`.
- **Features:** BOK-018, TXT-002.
- **Stories:** `Genesis`, `Hebrew`.

##### `BookHeader` / `BookPage` composition
- **Purpose:** book page header (title, category link, description with ReadMore, Start/Continue Reading button) + Tabs (Contents / Versions) + sidebar.
- **Replaces:** BookPage.jsx:42 header `.tocTop` 244-267, read button 171-187, tabs 189-198, `ReadMoreText` 1514.
- **Features:** BOK-001, BOK-002, BOK-003, BOK-004, BOK-005, BOK-006, BOK-007, BOK-017, BOK-022.
- **Stories:** `Genesis`, `Berakhot`, `ContinueReading`, `Compare` (in compare panel), `Mobile`, `Hebrew`.

##### `ScheduleCard` (calendar listing)
- **Purpose:** learning schedule item (Parashat Hashavua, Daf Yomi…).
- **Replaces:** `CalendarListing` CalendarsPage.jsx:70, NavSidebar `WeeklyTorahPortion`/`DafYomi`/`LearningSchedules` (536/563/503), `ParashahLink`/`DafLink` 444/475.
- **Features:** CAL-001, CAL-002, LIB-038, LIB-039, LIB-040.
- **Stories:** `Parasha`, `DafYomi`, `WithHaftarot`, `Hebrew`.

#### C.4.4 Topics

| Component | Purpose | Replaces | Features | Stories |
|---|---|---|---|---|
| `TopicChip` | small topic link/tag (optionally removable) | `SheetTopicLink` Misc.jsx:2625, `TopicLink` TopicPage.jsx:870, related topics links, WordSalad items | CON-046, LIB-046, SHV-025, TOP-005 | Default, Removable, Hebrew |
| `TopicCard` | topic tile with description | `TopicTOCCard`, `RandomTopicCardWithDescriptionRow`, `FeaturedTopic` | TOP-006, TOP-008, TOP-012 | Default, Featured, Hebrew |
| `TopicHeader` | title, category, description, AI disclosure, actions (read portion / study companion) | `TopicHeader` TopicPage.jsx:389, `TopicSponsorship` 275 | TOP-017, TOP-018, TOP-019, TOP-028 | Parasha, Person, AIDescription |
| `TopicSourcesList` | Tabs + filter/sort + paginated `SourceListing`/`SheetListing` | `TopicPageTab` 832 → `FilterableList` | TOP-016, TOP-020, TOP-021, TOP-022, TOP-023, TOP-024 | Sources, Sheets, Loading, Empty |
| `TopicMeta` | side column: metadata, links, image, readings | `TopicSideColumn` 975, `TopicMetaData` 1114, `TopicImage` 1049, `ReadingsComponent` 1058 | TOP-025, TOP-026 | Person, Parasha |
| `TopicCloud` | weighted topic word salad | `WordSalad`, `RowedWordSalad`, `TopicSalad` | TOP-005 | Default, Mobile |

#### C.4.5 Search

| Component | Purpose | Replaces | Features | Stories |
|---|---|---|---|---|
| `SiteSearch` | header combobox preset (grouped suggestions with type icons; Enter = smart submit ref/topic/search) | `HeaderAutocomplete` HeaderAutocomplete.jsx:401 + subcomponents | SRC-001…019, SRC-023, SRC-024 | Ref, Topic, Person, NoMatch, Hebrew, Mobile |
| `SearchResult` | presets over `SourceListing`/`ListingRow` for `source`, `sheet`, `book`, `author`, `topic` | `SearchResultCard` (4 modes), `SearchTextResult`, `SearchSheetResult` | SRC-055, SRC-056, SRC-060, SRC-070, SRC-071, SRC-072, SRC-090 | each type, WithMoreVersions, Pressed, Hebrew |
| `SearchResultsLayout` | tabs + sort + filters sidebar (desktop) / filter & sort drawers (mobile) + infinite list | SearchPage.jsx:257, `SheetsWithRefLayout` (frozen copy), `SearchResultList` 112 | SRC-043, SRC-048, SRC-049, SRC-061, SRC-062, SRC-063, SHV-024, SRC-089 | Desktop, Mobile, Loading (skeleton), NoResults |
| `FilterTree` | checkbox tree with counts and category color, text filter, "show more" | D19 `SearchFilters`/`SearchFilterGroup`/`SearchFilter`/`BookSearchFilters`/`SheetSearchFilters`/`PagedList` | SRC-084, SRC-085, SRC-086, SRC-087 (fix Hebrew filtering), SRC-088, SRC-069 | Categories, Books, Sheets, Filtered, Hebrew |
| `SortControl` | Select preset with relevance AI badge | `SearchSortBox`, `SearchSortDropdown`, `SortRadioList`, `EntitySortPanel`, FilterableList sort | SRC-053, SRC-068, GUI-021 | Desktop, Mobile radios |
| `SearchModeToggle` | exact vs all (SegmentedControl preset) | `SearchToggle` | SRC-052 | Default |

#### C.4.6 Voices (sheets, collections, people)

The Voices editor (`Editor.jsx`, Slate, 3225 lines, SHE-*) is **out of scope for the component library v1**. Read-only sheet rendering is in scope because the reader opens sheets in panels (TXT-026, SHL-032).

| Component | Purpose | Replaces | Features | Stories |
|---|---|---|---|---|
| `SheetListing` | sheet row: owner, title, summary, topics or info line, actions (collect, delete, save, pin) | D6 `SheetListing` Misc.jsx:1698, `SheetBlock` Story.jsx:320, `SheetListStory` 45, `SearchSheetResult`, `SheetSidebarList` | SHV-026, PRO-002, COL-003, TOP-024, SRC-090 | Public, Unlisted (owner), WithTopics, WithCollections, Pinned, Hebrew |
| `CollectionListing` | collection row | `CollectionListing` Misc.jsx:1875 | COL-009, PRO-003 | Default, Unlisted |
| `PersonListing` | avatar + name + org + FollowToggle | `ProfileListing` Misc.jsx:1649, `SheetProfileInfo`, `CollectionMemberListing`, `AuthorIndexItem`, WhoToFollow | PRO-004, PRO-008, LIB-057, COL-004 | Default, Following, Self |
| `SheetView` (read-only) | header (title, author, collection statement) + nodes | `Sheet`/`SheetContent`, `SheetMetaDataBox` (view part) | SHV-005, SHV-008, SHV-010, SHE-029 | Simple, Bilingual, WithMedia |
| `SheetSourceBlock` | boxed source in a sheet (reuses `BilingualSegment` + `SourceListing` header) | `SheetSource` SheetContentSegments.jsx:6, `SheetOutsideBiText` 165 | SHV-007 | Default, Highlighted |
| `SheetCommentBlock` / `SheetHeaderBlock` / `SheetOutsideTextBlock` / `SheetMediaBlock` | other node types | SheetContentSegments.jsx:62/97/116/201 | SHV-008, SHV-009 | each |
| `NotificationItem` | one notification (7 types as data-driven variants) | NotificationsPanel.jsx:149-353 | NTF-001, NTF-002, NTF-003 | each type, Unread |

#### C.4.7 Global UI and promotions

| Component | Purpose | Replaces | Features | Stories |
|---|---|---|---|---|
| `SignUpPrompt` | Dialog preset by `kind` (save, follow, notes, add_to_sheet…) | `SignUpModal` Misc.jsx:2004 | GUI-004, ACC-006 | each kind |
| `CmsModal` / `CmsBanner` | Strapi content in Dialog/Banner with eligibility + dismissal hooks | `InterruptingMessage` 2128, `Banner` 2272 | PRM-010, PRM-011, PRM-013 | Default, Hebrew, Dismissed |
| `CookieNotice` | Banner preset | `CookiesNotification` Misc.jsx:2816 | GUI-007 | Default, Hebrew |
| `DonateLink` | link preset with attribution `c_src` | `DonateLink` Misc.jsx:173 | PRM-004, PRM-005 | Variants |
| `NewsletterSignup` | email form | NewsletterSignUpForm.jsx, `TopicLandingNewsletter`, `VoicesNewsletterSignUp` | PRM-016, TOP-007, LIB-053 | Default, Submitted, Error |
| `AiDisclosure` | AI star + Popover with Learn more / Feedback | `AiInfoTooltip` Misc.jsx:1487 | AI-008, AI-017, TOP-028 | Solid, Outline |
| `LanguageMenu` | interface language + preferred translation reset | `InterfaceLanguageMenu` Misc.jsx:1300, `DropdownLanguageToggle` | I18-006, I18-007, I18-008, VER-001 | Default, WithPreference |

---

## D. Rules to prevent duplication

### D.1 Naming
1. **Name for the role, not the page.** Use `SourceListing`, not `TopicTextPassage`. Use `SectionGrid`, not `JaggedArrayNodeSection`. A component name never contains a page name (Topic, Search, Book) unless it only makes sense there (`TopicHeader`).
2. **Presets are named `<Base><Purpose>`** and live next to the base: `SortControl` → `Select`, `SiteSearch` → `Combobox`, `SaveToggle` → `ToggleButton`.
3. **Keep Sefaria domain vocabulary**, because readers and editors use it: `daf`, `amud`, `parasha`, `aliyah`, `segment`, `section`, `ref`, `heRef`, `version`, `translation`, `source`.
   - Use **"source / translation"**, never "hebrew / english". Primary text can be Aramaic or English, and translations can be Hebrew or Yiddish (TXD-044).
   - Language and direction always come from the payload (`lang`, `dir`). A component never infers them from its name.
4. **Props**
   - Controlled state: `value` / `defaultValue` / `onValueChange`.
   - Booleans: `open`, `pressed`, `checked`, each with an `on…Change` handler.
   - Bilingual strings are `{en, he}`.
   - UI strings come in as message ids, never raw English literals.
5. **Files**
   - One component per folder: `ComponentName/{ComponentName.tsx, .stories.tsx, .test.tsx, .module.css, index.ts}`.
   - Stories are titled `Primitives/Button`, `Layout/PanelHeader`, `Domain/Reader/BilingualSegment`.

### D.2 Variant or new component?

Add a **variant** (a prop) when all of these hold:
- the DOM structure and a11y role are the same
- the difference is visual (size, tone, density) or content shape
- keyboard behavior does not change

Make a **new component** when any of these is true:
- the ARIA pattern differs (tabs vs radiogroup vs menu)
- the data contract differs (a `SheetListing` needs owner/collections, a `SourceListing` needs ref/excerpt)
- the variant would need more than about 3 conditionally rendered regions

A **preset** (thin wrapper with fixed props, no new DOM) is preferred over both when a configuration repeats three or more times.

**Hard limits**
- No component has more than one boolean prop that switches layout. Use a `variant` enum instead. The old `VersionBlock` had 3 render modes driven by many booleans; that is the anti-pattern.
- No `className`-driven behavior: `className` may only add spacing at the call site.

### D.3 Composition rules
1. **Layering is one-way:** domain → layout → primitives → tokens.
   - A primitive never imports domain code. In particular, `palette.categoryColor` lives in `tokens`, not domain.
   - Lint this with `eslint-plugin-boundaries`.
2. **Data stays out of the library.**
   - Components receive prepared props. Fetching lives in route loaders and hooks under `src/data` (built on the toolkit client).
   - The toolkit rule "parents fetch, children render" applies (`$T/docs/specs/components.md:107-113`).
   - Only the long-scroll exception (`TextColumn.onLoadNext`) takes a callback.
3. **All HTML from the API goes through `normalizeText` before it reaches a component.** `dangerouslySetInnerHTML` is allowed in exactly one file, `TextSegment`, behind a lint allowlist.
4. **Text styling** (fonts, sizes, line-height, direction) is set only by `TextSegment` and `BilingualSegment` in reader context, and by `InterfaceText`/`ContentText` for UI. No other component sets `font-family`.
5. **Color:** use tokens only. No hex values in component CSS (enforced with stylelint `color-no-hex`). Category color only through the `category` prop.
6. **Overlays:** only Popover, Menu, Select, Combobox, Tooltip, Dialog, Drawer and Toast portal or set z-index.
7. **Analytics:** never inside visual components. Use `data-anl-*` attributes passed through, or the `useImpression` / `useTrack` hooks at the composite level. The old `CategoryColorLine` and `ToggleSet` fired events internally (Misc.jsx:1633, 835).
8. **Auth gating** is a callback (`onRequireAuth(kind)`). No component reads the user singleton.

### D.4 Process
- **Before adding a component:**
  1. Search Storybook and `COMPONENT_AUDIT.md` §C.
  2. If something is about 80% similar, extend it under D.2, or write a short ADR in `docs/decisions/` explaining why not.
- **Every new component PR must have:**
  - stories for the standard matrix (C.1)
  - axe-clean stories
  - a `features:` JSDoc tag listing the atlas IDs it serves, which a script checks against `features.json`
  - at least one consumer in the same PR (no speculative components)
- **Quarterly:** a script lists components with zero imports outside stories and flags them for deletion.

---

## E. Build order

Milestone goal: a **Tanakh and Talmud reader** at parity for Genesis 1 and Berakhot 2a, in single-panel and text+connections layouts. Each step lists what it unblocks.

| # | Batch | Components | Unblocks / acceptance |
|---|---|---|---|
| 0 | Foundation | tokens package (A), fonts (Taamey Frank, Cardo, Heebo, Roboto, Crimson Text; Garamond licensing decision), `categoryColor()`, i18n catalog + `InterfaceText`, `hebrewNumeral()` (port with ט״ו/ט״ז and daf), Storybook with toolbar (interfaceLang, contentLang, theme), a11y addon, viewports | Everything |
| 1 | Core primitives | `Icon`, `Button`, `IconButton`, `Link`, `VisuallyHidden`, `SkipLink`, `Spinner`, `Skeleton`, `LoadingState`, `EmptyState`, `ErrorState`, `Divider`, `Stack/Cluster` | Shells and states |
| 2 | Reader text (critical path) | `ReaderSettingsProvider` (settings model + persistence), `TextSegment` (on `normalizeText` + `applyVocalizationToHtml`), `SegmentNumber`, `LinkCountDot`, `BilingualSegment` (all 3 bilingual layouts + continuous), `SectionHeading`, `ParashaHeader`, `DafMarker` | Genesis 1 and Berakhot 2a render statically in all language/layout/vocalization combinations (TXD-031…050, TXT-001…008) |
| 3 | Reader chrome | `Popover`, `SegmentedControl`, `Switch`, `Stepper`, `Tooltip`, `DisplaySettingsMenu`, `PanelHeader`, `CategoryColorLine`, `CategoryAttribution`, `SaveToggle` (auth callback stub) | Display settings working (SHL-017…021, TXD-041) |
| 4 | Scrolling column + panels | `TextColumn` (infinite scroll, visible-ref, highlight scroll), `AppShell`, `PanelGroup`/`Panel`, `Drawer` | Continuous reading, URL sync, mobile single panel (TXD-052…056, SHL-039…048, SHL-061) |
| 5 | Connections MVP | `ActionRow`, `Badge/Count`, `ConnectionsPanel` shell, `ResourcesHome`, `ConnectionsSummary`/`CategoryFilter`, `RecentFilterChips`, `SourceListing`, `ConnectionsList` | Click a verse: commentary appears; Rashi/Tosafot itags (CON-003…033, TXT-011, TXT-017) |
| 6 | Versions and lexicon | `VersionCard`/`VersionList` (preference-aware selection hook ported from toolkit rules plus VER-014 order), `TextBanner`, `LexiconPanel`/`LexiconEntry`, `AboutText` | Translation switching, dictionary on word select (VER-009…014, CON-039…045) |
| 7 | Navigation | `Tabs`, `SectionGrid` (chapter + daf), `TocTree`, `ParashaList`, `BookHeader`, `CategoryTile`, `ResponsiveGrid`, `CategoryContents`, `PageLayout`, `NavSidebar` + `SidebarSection` + first modules (AboutText, Translations, WeeklyTorahPortion, DafYomi, RecentlyViewed) | Library home, Tanakh/Talmud category pages, Genesis and Berakhot book pages, sidebar Navigation mode (LIB-001…019, BOK-001…018) |
| 8 | Search and header | `TextField`, `SearchInput`, `Combobox`, `Menu`, `Select`, `SiteHeader`, `SiteSearch`, `LanguageMenu`, `SearchResult`, `FilterTree`, `SortControl`, `SearchResultsLayout`, `SearchInText` | Site search and header autocomplete (SRC-*) |
| 9 | Remaining sidebar tools | `Dialog`, `Toast`/`InlineAlert`/`Banner`, `TextArea`, `Checkbox`/`Radio`, `SignUpPrompt`, `NotesPanel`, `SharePanel`, `TopicsForRef`, `WebPagesList`, `ManuscriptGallery`, `AddToSheetForm`, `FeedbackForm`, `AddConnectionForm`, `LoginRequired` | Full Resources parity (CON-046…067) |
| 10 | Topics, calendars, user | `TopicChip`, `TopicCard`, `TopicHeader`, `TopicSourcesList`, `TopicMeta`, `TopicCloud`, `ScheduleCard`, `Avatar`, `FollowToggle`, `PersonListing`, user history and saved lists | TOP-*, CAL-*, USL-* |
| 11 | Voices read-only | `SheetListing`, `CollectionListing`, `SheetView` + block components, `NotificationItem`, `CookieNotice`, `CmsModal`/`CmsBanner`, `NewsletterSignup`, `DonateLink`, `AiDisclosure` | Sheets in panels (TXT-026), Voices home, profile |
| 12 | Later / separate track | Sheet editor (SHE-*), admin editors (`CategoryHeader`, `TopicEditor`, `EditTextInfo`, Linker admin, ADM-*) | Not library v1. Admin tools use the same primitives but live in the app. |

**Fixture plan for batches 2 to 6:** record API responses (v3 texts, related, versions, index) for Genesis 1 (with nikkud and taamim, plus JPS 1985 and a French translation), Berakhot 2a (William Davidson English, Steinsaltz Hebrew), Rashi on Genesis 1:1, Onkelos Genesis 1, a Yiddish (RTL) translation and Guide for the Perplexed. Store them under `src/fixtures/` and use them in every story. This mirrors the toolkit's prepared-data approach and keeps stories offline and deterministic.

---

## Appendix: known old-client bugs not to port (from this audit)

- `DropdownMenu` tab-trap close passes `true` instead of an event (js/common/DropdownMenu.jsx:243).
- `TabView` replaces history on mount when `currTabName === null` (Misc.jsx:400-504).
- `SheetAccessIcon` references an undefined `msg` (Misc.jsx:2653).
- ReaderControls title is a link with `role=heading aria-live=polite` (ReaderPanel.jsx:1424). Split it into a heading and a button.
- Escape closes any panel, including the main text (ReaderPanel.jsx:646-650).
- `Button` renders `<a role=button>` for links (common/Button.jsx), which mis-announces navigation.
- The active recent filter renders as a `<div>`, so it loses "open in new tab" (CON-026).
- `FollowButton` shows "Unfollow" on hover only, so it is not keyboard-discoverable (Misc.jsx:1550).
- Toolkit: footnote markers are not linked to their notes; Daf addresses cannot be selected; Hebrew numerals are chosen by side rather than language; no `color-scheme` is set; there are no i18n strings (`$T/packages/web-components/src/*`).
