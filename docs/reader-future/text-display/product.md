---
area: text-display
title: Text display & reading settings
domain: Reader
document: product
owner: unassigned
status: exploring  # baseline → exploring → proposed → agreed
updated: 2026-10-18
---
# Text display & reading settings — product specification

> Part of the future-reader specification (`docs/reader-future/`), maintained in Slack **#reader-future** by Claude Tag with the
> `capture-future-spec` skill. The sections above the BASELINE block belong to the channel; the block is generated from the
> Feature Atlas and refreshed by `tools/seed.py`. Every change cites the Slack message it came from.

## Summary

Discussed so far: what a click, a double-click and a selection in the text should do. Nothing is decided. Ideas: clicking a
segment no longer opens the sidebar, which gets its own control; clicking or double-clicking a word shows a small lookup at the
word with a call-to-action to open the sidebar; selecting text triggers nothing. The sidebar side is in
[Connections](../connections/product.md). [Slack](https://sefaria.slack.com/archives/C0C9EGTL468/p1792316219999969?thread_ts=1792091846.417749&cid=C0C9EGTL468)

## Who it is for and what they need

_Not discussed yet._

## Target behaviour in the future reader

- Clicking a segment does not open the sidebar; the sidebar has its own open/close control. See [Connections](../connections/product.md). — *idea* · [Slack](https://sefaria.slack.com/archives/C0C9EGTL468/p1792091846417749?thread_ts=1792091846.417749&cid=C0C9EGTL468) · [Slack](https://sefaria.slack.com/archives/C0C9EGTL468/p1792092258845779?thread_ts=1792091846.417749&cid=C0C9EGTL468) · [Slack](https://sefaria.slack.com/archives/C0C9EGTL468/p1792316219999969?thread_ts=1792091846.417749&cid=C0C9EGTL468) · CON-008
- Clicking or double-clicking a word shows a lightweight lookup at the word (pop-up or tooltip), with a call-to-action to open
  the full sidebar. — *idea* · [Slack](https://sefaria.slack.com/archives/C0C9EGTL468/p1792092258845779?thread_ts=1792091846.417749&cid=C0C9EGTL468) · [Slack](https://sefaria.slack.com/archives/C0C9EGTL468/p1792111854572059?thread_ts=1792091846.417749&cid=C0C9EGTL468) · [Slack](https://sefaria.slack.com/archives/C0C9EGTL468/p1792315304773969?thread_ts=1792091846.417749&cid=C0C9EGTL468) · [Slack](https://sefaria.slack.com/archives/C0C9EGTL468/p1792316219999969?thread_ts=1792091846.417749&cid=C0C9EGTL468) · TXD-059
- Selecting (highlighting) text triggers nothing; selection is for copying or keeping one's place. — *proposed* · [Slack](https://sefaria.slack.com/archives/C0C9EGTL468/p1792092258845779?thread_ts=1792091846.417749&cid=C0C9EGTL468) · [Slack](https://sefaria.slack.com/archives/C0C9EGTL468/p1792165490196399?thread_ts=1792091846.417749&cid=C0C9EGTL468) · TXD-057 · TXD-059
- On phones, tap and tap-and-hold could do different things. — *idea* · [Slack](https://sefaria.slack.com/archives/C0C9EGTL468/p1792165467488169?thread_ts=1792091846.417749&cid=C0C9EGTL468)

## Changes from today (keep · change · drop · new)

- **Keep:** _None recorded yet._
- **Change:** a click on a segment stops opening the sidebar (CON-008). — *idea* · [Slack](https://sefaria.slack.com/archives/C0C9EGTL468/p1792091846417749?thread_ts=1792091846.417749&cid=C0C9EGTL468) · [Slack](https://sefaria.slack.com/archives/C0C9EGTL468/p1792316219999969?thread_ts=1792091846.417749&cid=C0C9EGTL468)
- **Change:** a word lookup starts from a click or double-click on the word, not from a selection (TXD-059). — *idea* · [Slack](https://sefaria.slack.com/archives/C0C9EGTL468/p1792092258845779?thread_ts=1792091846.417749&cid=C0C9EGTL468) · [Slack](https://sefaria.slack.com/archives/C0C9EGTL468/p1792316219999969?thread_ts=1792091846.417749&cid=C0C9EGTL468)
- **Drop:** dictionary lookup on text selection (TXD-057, TXD-059). — *proposed* · [Slack](https://sefaria.slack.com/archives/C0C9EGTL468/p1792092258845779?thread_ts=1792091846.417749&cid=C0C9EGTL468) · [Slack](https://sefaria.slack.com/archives/C0C9EGTL468/p1792165490196399?thread_ts=1792091846.417749&cid=C0C9EGTL468)
- **New:** _None recorded yet._

## Open questions

- **What does selecting a word do when the sidebar is closed?** Penina Levy and Yitzhak Clark: nothing ([Slack](https://sefaria.slack.com/archives/C0C9EGTL468/p1792092258845779?thread_ts=1792091846.417749&cid=C0C9EGTL468) · [Slack](https://sefaria.slack.com/archives/C0C9EGTL468/p1792165490196399?thread_ts=1792091846.417749&cid=C0C9EGTL468)). Asked in
  [Slack](https://sefaria.slack.com/archives/C0C9EGTL468/p1792091846417749?thread_ts=1792091846.417749&cid=C0C9EGTL468). Today a selection does nothing while the sidebar is closed (CON-042, SHL-053); see
  [Connections](../connections/product.md).
- **Click or double-click** on a word to look it up? ([Slack](https://sefaria.slack.com/archives/C0C9EGTL468/p1792092258845779?thread_ts=1792091846.417749&cid=C0C9EGTL468) · [Slack](https://sefaria.slack.com/archives/C0C9EGTL468/p1792316219999969?thread_ts=1792091846.417749&cid=C0C9EGTL468))
- **Phones:** which of tap and tap-and-hold does what? — [Slack](https://sefaria.slack.com/archives/C0C9EGTL468/p1792115591468479?thread_ts=1792091846.417749&cid=C0C9EGTL468) · [Slack](https://sefaria.slack.com/archives/C0C9EGTL468/p1792165467488169?thread_ts=1792091846.417749&cid=C0C9EGTL468)

## Decisions

_None yet. Every decision is also logged in `../DECISIONS.md`._

## Parked ideas

_None yet._

<!-- BASELINE:START (generated by docs/reader-future/tools/seed.py — do not edit by hand) -->

## Baseline: what sefaria.org does today

From the Feature Atlas (`reader-next/docs/features`, area `text-display`): **69 features** — core 42, standard 21, optional 4, retire 2. Tiers are the audit's proposal (core: can't launch without it; standard: parity, can follow; optional: niche or rethink; retire: unused, broken or superseded).

Feature groups: Reading settings (12); Inline markup (11); Segment rendering (9); Scrolling (8); Data fetching (6); Backend shaping (4); Rendering pipeline (3); Titles (3); Interaction (3); Fonts and CSS (3); Ref handling (2); Banners (2); Copy and paste (1); Hebrew utilities (1); Language selection (1).

### Core (42)

| ID | Feature | What it does |
|---|---|---|
| TXD-001 | Custom copy formatting for selected text | Copied text is cleaned of numbers and UI chrome so it pastes nicely. |
| TXD-002 | Reader text column renders sections of text | The reader shows a scrolling column of text sections, each made of numbered segments, in the main panel and side panels. |
| TXD-003 | TextRange load, redirect and prefetch | When a section loads, the reader normalizes odd refs and prefetches neighbors and links. |
| TXD-005 | Fetch text via v3 texts API with versions | Text for a section is loaded with the user's chosen source and translation versions, with gaps filled in. |
| TXD-006 | Client picks source and translation versions | The reader decides which Hebrew/primary and translation versions to show using the user's selection, per-corpus preference and language preference. |
| TXD-007 | Adapt v3 API response to legacy text shape | The newer text API response is converted into the older field layout the reader components expect. |
| TXD-008 | Legacy text cache with per-segment entries | Fetched text is cached per segment and section so neighbors, context and spanning refs load instantly. |
| TXD-009 | Server-rendered panel text seeded into client | The first text panel arrives already rendered from the server and is then refreshed by the client. |
| TXD-010 | Build numbered segments from text data | Raw text arrays are turned into numbered, addressable segments with highlight and alt-structure markers. |
| TXD-011 | Section title strings (named vs numbered) | Each section gets a title such as 'Chapter 4' or '2a' in English and Hebrew. |
| TXD-012 | Section title in text column | Each section shows a title like 'Chapter 4' or '2a' above its text. |
| TXD-013 | Reader header title and version label | The reader header shows the book and current section with the active translation's name. |
| TXD-014 | Client ref parsing and helpers for text addressing | The client parses, normalizes and compares refs, including dafs, ranges and dictionary entries. |
| TXD-017 | TextRequestAdapter version resolution and payload | The server resolves requested versions, merges gaps and returns text plus ref, index and node metadata. |
| TXD-021 | Inline citation links in text (refLink) | Citations inside a text are clickable links that open the cited source. |
| TXD-025 | Footnotes toggle inline | Footnote markers in the text expand and collapse the footnote text in place. |
| TXD-031 | Language display: Source / Translation / Bilingual | Readers choose to see the source text, a translation, or both together. |
| TXD-033 | Layout: segmented vs continuous | Readers can show text as one verse/segment per line or as a flowing paragraph. |
| TXD-034 | Bilingual layout: stacked / side by side | In bilingual mode the translation can sit under the source or beside it, with either side on the left. |
| TXD-036 | Font size controls | Readers can make text smaller or larger. |
| TXD-037 | Vowels (nikkud) toggle | Readers can hide Hebrew vowel points. |
| TXD-038 | Cantillation (te'amim) toggle | Readers can hide Hebrew cantillation marks while keeping vowels. |
| TXD-040 | Reader panel CSS state classes | The panel carries classes that drive language, layout, direction and narrow-width styling. |
| TXD-041 | Display options menu | One menu groups language, layout, aliyot, font size, vowels, cantillation and punctuation controls. |
| TXD-042 | Initial settings defaults from cookies | New visitors and returning readers get sensible default reading settings. |
| TXD-043 | Primary vs translation visibility per segment | Each segment shows the source, the translation, or both depending on language setting and what exists. |
| TXD-044 | RTL translations rendered with Hebrew styling | Right-to-left translations (Arabic, Persian, Yiddish, Judeo-Arabic) and LTR sources display correctly. |
| TXD-045 | Segment numbers | Each verse/segment shows its number in the margin, in Hebrew numerals for Hebrew. |
| TXD-046 | Segment number and dot positioning in continuous mode | In continuous layout, numbers and link dots are positioned at their segment's start line without overlapping. |
| TXD-047 | Link-count dot per segment | A faint dot next to each segment shows how many connections it has. |
| TXD-048 | Segment click routing | Clicking different parts of a segment does different things: follow a citation, toggle a footnote, open a topic, or open connections. |
| TXD-049 | Segment keyboard accessibility | Segments are keyboard focusable and openable with Enter or Space. |
| TXD-050 | Highlighting of selected segment(s) | The segment being studied is marked with a light-blue background — but only while the connections sidebar is open. A plain verse or range link scrolls to the verse without a visible highlight. |
| TXD-052 | Infinite scroll up and down in the reader | Readers scroll continuously through neighboring sections without page reloads. |
| TXD-053 | Scroll container differs by device | On phones the whole page scrolls; on desktop the text column scrolls. |
| TXD-054 | Initial and highlight scroll positioning | On opening, the reader scrolls to the cited segment, leaving room above to scroll up. |
| TXD-055 | Visible-ref tracking drives URL and header | As you scroll, the URL follows the segment you are reading (segment level, e.g. /Genesis.1.8), the header follows the section, and — with the sidebar open — the blue highlight and the sidebar's connections follow too (TXD-067). |
| TXD-056 | Loading placeholders and book title header | Above and below the loaded text the column shows a book title at the start of a book or loading indicators. |
| TXD-061 | Basetext layout box and bilingual CSS | The text column has a standard width, line height and justified text, with bilingual alignment rules. |
| TXD-065 | Hebrew numeral and daf encoding | Numbers and dafs display as Hebrew letters in Hebrew UI. |
| TXD-067 | Current-segment highlight follows the reader | With the connections sidebar open, the light-blue highlight moves from segment to segment as you scroll, and the sidebar's content follows the highlighted segment. |
| TXD-068 | Jump-free reading: place keeping and pre-paint placement (rebuild) | In the rebuild, nothing you are reading ever moves unless you scroll: sections added above, fonts arriving, the sidebar opening, font-size and layout changes all keep the current segment still, and a linked verse is in place from the first visible frame. |

### Standard (21)

| ID | Feature | What it does |
|---|---|---|
| TXD-015 | Section label by address type for TOC | Table-of-contents section labels follow each text's addressing scheme (daf, year, folio, number). |
| TXD-016 | v3 texts API parameters and warnings | The text API accepts version selectors and return formats and reports missing versions. |
| TXD-018 | Return formats and text cleaning | The API can return text with inline links, plain text, or footnote-stripped text. |
| TXD-019 | Merge versions segment by segment | When the chosen version has gaps, missing segments are filled from the next-best version of the same language. |
| TXD-020 | Allowed inline HTML in stored text | Stored texts may contain a fixed set of formatting tags, footnotes, images, and overlay markers. |
| TXD-022 | Inline named-entity (topic) links in text | People and concepts named in the text are underlined links that open the topic/lexicon sidebar. |
| TXD-024 | Entity span safety rules | Stale or invalid link annotations are skipped so edited text never shows broken links. |
| TXD-026 | Inline images in text | Texts can contain whole-segment images with captions and inline images in running text. |
| TXD-027 | Inline commentary markers (itags) | When a commentary is selected in connections, numbered markers appear in the base text where that commentator comments. |
| TXD-028 | Page-transition overlay markers | Page and column breaks of printed editions appear as small markers inside the text. |
| TXD-029 | Search-term highlighting in text | When arriving from search, the matched words are highlighted inside the opened segment. |
| TXD-032 | Language toggle visibility rule in display menu | The Source/Translation buttons only appear under certain conditions. |
| TXD-035 | Auto side-by-side direction correction | When source and translation read in the same direction, side-by-side layout flips to the sensible order automatically. |
| TXD-057 | Text selection and double-click guard | Selecting text highlights its segments and can trigger dictionary lookup. |
| TXD-058 | Copy text with clean formatting | Copying text from the reader yields clean text without numbers, links or hidden-language spans. |
| TXD-059 | Select words to look up in lexicon | Selecting a Hebrew/Aramaic word (up to a few words) opens a dictionary lookup. |
| TXD-060 | Fonts for Hebrew, English and special scripts | Text renders with fonts supporting cantillation and other scripts. |
| TXD-063 | Translation-language preference suggestion banner | Readers from certain countries are asked if they prefer translations in their local language. |
| TXD-064 | Open translations banner | Readers of English text in major corpora are offered a shortcut to change the translation. |
| TXD-066 | Source/translation language popover | A small popover lets users choose Source, Translation, or Source with Translation. |
| TXD-069 | Neighbouring sections preloaded with the page (rebuild) | The server tells the browser to fetch the previous and next sections while the app is still loading, so scrolling past an edge right after arrival is instant. |

### Optional (4)

| ID | Feature | What it does |
|---|---|---|
| TXD-023 | Inline category links in text | Mentions of a category name in the text can link to that category in the library. |
| TXD-030 | Linker debug mode spans | In debug mode, auto-detected citations are color-coded by status for moderators. |
| TXD-039 | Color theme (light / sepia / dark) | Reader panels are fully styled for light, sepia and dark themes. |
| TXD-062 | Print stylesheet for text | Printing a text hides interface chrome and keeps clean reading layout. |

### Retire (2)

| ID | Feature | What it does |
|---|---|---|
| TXD-004 | Dead actionLinks and prefetchMultiple props | Two reader options exist in code that do nothing or would break. |
| TXD-051 | Poetry line formatting | Poetic texts can show each line with hanging indent. |

### Flags from the audit (not to port as-is)

- **TXD-004** Dead actionLinks and prefetchMultiple props — unused
- **TXD-051** Poetry line formatting — unused

_Generated 2026-10-14. Full behaviour for every ID: `reader-next/docs/features/FEATURES.md` and the atlas page._

<!-- BASELINE:END -->
