---
area: connections
title: Connections & resources sidebar
domain: Reader
document: product
owner: unassigned
status: exploring  # baseline → exploring → proposed → agreed
updated: 2026-10-18
---
# Connections & resources sidebar — product specification

> Part of the future-reader specification (`docs/reader-future/`), maintained in Slack **#reader-future** by Claude Tag with the
> `capture-future-spec` skill. The sections above the BASELINE block belong to the channel; the block is generated from the
> Feature Atlas and refreshed by `tools/seed.py`. Every change cites the Slack message it came from.

## Summary

Nothing is decided yet. Two ideas from the channel: the sidebar gets a more independent relationship with the text, with its
own open/close control, docked at the side when closed instead of opened by clicking a segment, and possibly open from the start.
Quick word lookups that take over the sidebar today (the dictionaries) would instead show a small element at the word, a pop-up
or tooltip, with a call-to-action that opens the full sidebar. [Slack](https://sefaria.slack.com/archives/C0C9EGTL468/p1792316219999969?thread_ts=1792091846.417749&cid=C0C9EGTL468)

## Who it is for and what they need

_Not discussed yet._

## Target behaviour in the future reader

- The sidebar opens and closes with its own control, and stays docked at the side of the panel when closed. — *idea* · [Slack](https://sefaria.slack.com/archives/C0C9EGTL468/p1792091846417749?thread_ts=1792091846.417749&cid=C0C9EGTL468) · [Slack](https://sefaria.slack.com/archives/C0C9EGTL468/p1792316219999969?thread_ts=1792091846.417749&cid=C0C9EGTL468) · CON-008
- The sidebar starts open. — *idea* · [Slack](https://sefaria.slack.com/archives/C0C9EGTL468/p1792091846417749?thread_ts=1792091846.417749&cid=C0C9EGTL468) · CON-008
- Clicking a segment no longer opens the sidebar. — *idea* · [Slack](https://sefaria.slack.com/archives/C0C9EGTL468/p1792091846417749?thread_ts=1792091846.417749&cid=C0C9EGTL468) · [Slack](https://sefaria.slack.com/archives/C0C9EGTL468/p1792092258845779?thread_ts=1792091846.417749&cid=C0C9EGTL468) · [Slack](https://sefaria.slack.com/archives/C0C9EGTL468/p1792316219999969?thread_ts=1792091846.417749&cid=C0C9EGTL468) · CON-008
- Targeted lookups such as dictionary entries (as opposed to a whole commentary) open in a small pop-up or tooltip at the word
  instead of taking over the sidebar, with a call-to-action to open the full sidebar. — *idea* · [Slack](https://sefaria.slack.com/archives/C0C9EGTL468/p1792111854572059?thread_ts=1792091846.417749&cid=C0C9EGTL468) · [Slack](https://sefaria.slack.com/archives/C0C9EGTL468/p1792315304773969?thread_ts=1792091846.417749&cid=C0C9EGTL468) · [Slack](https://sefaria.slack.com/archives/C0C9EGTL468/p1792316219999969?thread_ts=1792091846.417749&cid=C0C9EGTL468) · CON-042 · CON-043 · CON-044
- Selecting (highlighting) text triggers nothing: readers select to copy, or to keep their place while reading. — *proposed* · [Slack](https://sefaria.slack.com/archives/C0C9EGTL468/p1792092258845779?thread_ts=1792091846.417749&cid=C0C9EGTL468) · [Slack](https://sefaria.slack.com/archives/C0C9EGTL468/p1792165490196399?thread_ts=1792091846.417749&cid=C0C9EGTL468) · CON-042 · SHL-053

## Changes from today (keep · change · drop · new)

- **Keep:** _None recorded yet._
- **Change:** the sidebar opens from its own control instead of a segment click (CON-008). — *idea* · [Slack](https://sefaria.slack.com/archives/C0C9EGTL468/p1792091846417749?thread_ts=1792091846.417749&cid=C0C9EGTL468) · [Slack](https://sefaria.slack.com/archives/C0C9EGTL468/p1792316219999969?thread_ts=1792091846.417749&cid=C0C9EGTL468)
- **Change:** a dictionary lookup shows at the word, with a way into the full sidebar, instead of switching the sidebar to the
  dictionaries (CON-042, CON-043, CON-044). — *idea* · [Slack](https://sefaria.slack.com/archives/C0C9EGTL468/p1792111854572059?thread_ts=1792091846.417749&cid=C0C9EGTL468) · [Slack](https://sefaria.slack.com/archives/C0C9EGTL468/p1792316219999969?thread_ts=1792091846.417749&cid=C0C9EGTL468)
- **Drop:** dictionary lookup on text selection (CON-042, SHL-053). — *proposed* · [Slack](https://sefaria.slack.com/archives/C0C9EGTL468/p1792092258845779?thread_ts=1792091846.417749&cid=C0C9EGTL468) · [Slack](https://sefaria.slack.com/archives/C0C9EGTL468/p1792165490196399?thread_ts=1792091846.417749&cid=C0C9EGTL468)
- **New:** a docked state for the closed sidebar; a lightweight lookup element (pop-up or tooltip) with a call-to-action to open
  the sidebar. — *idea* · [Slack](https://sefaria.slack.com/archives/C0C9EGTL468/p1792091846417749?thread_ts=1792091846.417749&cid=C0C9EGTL468) · [Slack](https://sefaria.slack.com/archives/C0C9EGTL468/p1792111854572059?thread_ts=1792091846.417749&cid=C0C9EGTL468) · [Slack](https://sefaria.slack.com/archives/C0C9EGTL468/p1792315304773969?thread_ts=1792091846.417749&cid=C0C9EGTL468) · [Slack](https://sefaria.slack.com/archives/C0C9EGTL468/p1792316219999969?thread_ts=1792091846.417749&cid=C0C9EGTL468)

## Open questions

- **What does selecting a word do when the sidebar is closed?** Penina Levy and Yitzhak Clark: nothing ([Slack](https://sefaria.slack.com/archives/C0C9EGTL468/p1792092258845779?thread_ts=1792091846.417749&cid=C0C9EGTL468) · [Slack](https://sefaria.slack.com/archives/C0C9EGTL468/p1792165490196399?thread_ts=1792091846.417749&cid=C0C9EGTL468)). Asked in
  [Slack](https://sefaria.slack.com/archives/C0C9EGTL468/p1792091846417749?thread_ts=1792091846.417749&cid=C0C9EGTL468). Today a selection already does nothing while the sidebar is closed: the lookup runs only when the sidebar is open
  (CON-042, SHL-053).
- **Click or double-click?** One message frees up a click on a word for the dictionary once the sidebar has its own control
  ([Slack](https://sefaria.slack.com/archives/C0C9EGTL468/p1792092258845779?thread_ts=1792091846.417749&cid=C0C9EGTL468)); the summary of the thread speaks of double-clicking words ([Slack](https://sefaria.slack.com/archives/C0C9EGTL468/p1792316219999969?thread_ts=1792091846.417749&cid=C0C9EGTL468)).
- **If the dictionary stays in the sidebar,** does clicking a word open the sidebar, bringing back the problem of the sidebar
  opening on a click? — Lev Israel · [Slack](https://sefaria.slack.com/archives/C0C9EGTL468/p1792092762959359?thread_ts=1792091846.417749&cid=C0C9EGTL468)
- **Pop-up or sidebar?** Rules are needed for which lookups open in a pop-up and which in the sidebar. — Michael Kellman · [Slack](https://sefaria.slack.com/archives/C0C9EGTL468/p1792111854572059?thread_ts=1792091846.417749&cid=C0C9EGTL468)
- **A tooltip with a slider** for the dictionaries? — Akiva Berger · [Slack](https://sefaria.slack.com/archives/C0C9EGTL468/p1792315304773969?thread_ts=1792091846.417749&cid=C0C9EGTL468)
- **Phones:** the pop-up idea was raised for desktop ([Slack](https://sefaria.slack.com/archives/C0C9EGTL468/p1792115591468479?thread_ts=1792091846.417749&cid=C0C9EGTL468)). On phones, tap and tap-and-hold could be told apart ([Slack](https://sefaria.slack.com/archives/C0C9EGTL468/p1792165467488169?thread_ts=1792091846.417749&cid=C0C9EGTL468)). Today
  the sidebar opens inside the same panel on phones (CON-009).
- **Do we keep the connection dots?** They are the only reason either client loads connection data while the sidebar is closed.
  If per-segment counts come with the text, they cost almost nothing, so this becomes a product question rather than a
  performance one (CON-029). — Akiva Berger · [Slack](https://sefaria.slack.com/archives/C0C9EGTL468/p1792322132117529) · [Slack](https://sefaria.slack.com/archives/C0C9EGTL468/p1792322798155629?thread_ts=1792322132.117529&cid=C0C9EGTL468)
- **Is a list of sheets ever shown in the reader,** or only a count and a link to Voices, as both clients do today (CON-014)?
  A count alone would let the server stop sending sheet rows, 34–48% of `/api/related` today. — [Slack](https://sefaria.slack.com/archives/C0C9EGTL468/p1792322798155629?thread_ts=1792322132.117529&cid=C0C9EGTL468)

## Decisions

_None yet. Every decision is also logged in `../DECISIONS.md`._

## Parked ideas

_None yet._

<!-- BASELINE:START (generated by docs/reader-future/tools/seed.py — do not edit by hand) -->

## Baseline: what sefaria.org does today

From the Feature Atlas (`reader-next/docs/features`, area `connections`): **71 features** — core 26, standard 26, optional 15, retire 4. Tiers are the audit's proposal (core: can't launch without it; standard: parity, can follow; optional: niche or rethink; retire: unused, broken or superseded).

Feature groups: Text list (9); Sidebar architecture (8); Resources view (7); Related texts summary (6); Filters (5); Lexicon (4); Notes (4); Add to sheet (4); About this text (3); Web pages (3); Advanced tools (3); Connections panel header (2); Topics (2); Media (2); Guided Learning (2); Linker admin (1); Share (1); Add connection (1); Compare (1); Feedback (1); Sidebar header (1); Data layer (1).

### Core (26)

| ID | Feature | What it does |
|---|---|---|
| CON-003 | Connections panel header (back/title/close) | The sidebar header shows context-aware back navigation, language toggle and close. |
| CON-004 | Resources sidebar panel placement (desktop/mobile) | The resources sidebar opens beside the text on desktop and inside the same panel on mobile, inheriting the text panel's current filters and versions. |
| CON-005 | Sidebar panel state fields | Sidebar state (mode, filters, recent filters, version filters, search query, selected words) lives on the panel so it can be restored, shared and mirrored. |
| CON-006 | Sidebar mode switching and gating rules | Switching sidebar tools is centralized: it tracks the click, enforces sign-in for some modes, and resets filters when returning to Resources. |
| CON-007 | Complete sidebar mode inventory | The sidebar has about 25 modes, each rendering one tool or view. |
| CON-008 | Opening and closing the sidebar | Users open the sidebar by clicking a segment, the text title, or the translations shortcut, and close it with the X or by tapping back on mobile. |
| CON-009 | Mobile sidebar behavior summary | On mobile the sidebar is in-panel with simplified header and behaviors. |
| CON-011 | Sign-in gating across sidebar tools | Several sidebar tools require sign-in or moderator rights. |
| CON-012 | Resources home view | The top-level sidebar view lists top tools, a Related Texts summary, Resources (sheets, web pages, topics, etc.) and Tools. |
| CON-013 | Top tool buttons | The top of the Resources view offers About this Text, Table of Contents, Search in this Text, Translations and (when available) Guided Learning. |
| CON-014 | Resources list (sheets, web pages, topics, manuscripts, readings) | A list of resource types for the selected text with counts, each opening its own view. |
| CON-015 | Tools list | A list of tools on the selected text: Add to Sheet, Dictionaries, Compare Text, Notes, Share, Feedback, Advanced. |
| CON-017 | Sheets resource opens Voices in new tab | The Sheets resource no longer shows sheets in the sidebar; it opens the sheets-with-ref page on the Voices module in a new tab. |
| CON-019 | Connection categories summary | The Related Texts summary lists categories of linked texts (Commentary, Talmud, Midrash...) with counts, ordered sensibly for the text being read. |
| CON-025 | Category view with per-book filters | Clicking a category shows its books with counts, descriptions and an 'All <Category>' row. |
| CON-026 | Text (book) filter chip | Each book/commentator in the list is a filter that narrows connections to just that source. |
| CON-027 | Link filter matching semantics | Defines exactly which links a filter keeps. |
| CON-030 | Connected texts list (TextList) | Shows the actual connected passages (commentary, quotations, sheets) for the selected segment(s), filtered by the chosen source. |
| CON-032 | Connection item rendering | Each connection shows the linked text with highlights, a number label for commentary, and quick actions. |
| CON-033 | Open connected text in main panel | Each connection has an Open button that jumps the main panel to that source. |
| CON-039 | About this text box | The About view shows title, category, authors, description and composition info for the current text. |
| CON-042 | Lexicon auto-activation on word selection | Selecting one or two Hebrew words in the text automatically shows dictionary definitions in the sidebar. |
| CON-043 | Lexicon lookup and filtering | Looks up selected words in applicable dictionaries based on the text being read. |
| CON-055 | Add selected source to a sheet | Users can add the selected passage (or a connected passage) to one of their sheets or a new sheet from the sidebar. |
| CON-070 | Sidebar header title, back and close | The sidebar header shows the current section, a context-aware back link, a language toggle and a close button. |
| CON-071 | Related data API and caching | One call bundles links, sheets, topics, manuscripts, media and guides for a ref and is split per segment into caches. |

### Standard (26)

| ID | Feature | What it does |
|---|---|---|
| CON-002 | Connections header mobile variant | On mobile the connections header uses a category-colored border and recent-commentator chips. |
| CON-016 | Tools button component behavior | Every sidebar tool button is a consistent control with count, icon, keyboard support and analytics. |
| CON-020 | Zero-count commentators shown greyed out | When a narrower ref is selected, every commentator available elsewhere in the section is still listed (greyed, count 0). |
| CON-021 | Commentator ordering rules | Within a category, well-known commentators are pinned first, then alphabetical. |
| CON-022 | Link category assignment (server) | The server decides which category each link belongs to, which drives the summary and filters. |
| CON-023 | Top-level summary: Quoting Commentary merged, collapse to 4 | At top level, Quoting Commentary is folded into the Commentary row and only the first four categories show with a More button. |
| CON-024 | Essay links in summary | Essays that discuss the displayed text appear as green entries at the top of the connections summary. |
| CON-028 | Recent filters chips | A strip of recently used filters lets users hop between sources quickly. |
| CON-029 | Sidebar filter mirrored to base text link dots | The base text shows link markers matching the sidebar's chosen category or filter. |
| CON-031 | Commentary text preload before display | When filtered to a single commentator, the list waits until the commentary texts load so it renders without jumping. |
| CON-034 | Add connection to sheet button | Signed-in users can add a connected passage straight to a source sheet. |
| CON-035 | Remove connection (moderator) | Moderators can delete a bad link from the list. |
| CON-038 | Citation clicks inside sidebar text | Clicking a citation inside a sidebar passage opens the cited text as a new panel. |
| CON-044 | Dictionary entry rendering | Dictionary entries render headwords, morphology, nested senses, notes and attribution, with special BDB formatting. |
| CON-045 | Named entity popup in sidebar | Clicking a highlighted person/place name in the text shows who or what it refers to. |
| CON-046 | Topics for this ref | Lists topics related to the selected passage with a short description and why it is connected. |
| CON-048 | Add private note on a ref | Signed-in users can write a private note attached to the selected passage. |
| CON-049 | My notes for these refs | Shows the user's existing notes on the selected passage with a link to all notes. |
| CON-050 | Edit and delete note | Users can edit or delete a note from the sidebar. |
| CON-052 | Web pages citing this text | Lists external websites that cite the selected passage, grouped by site. |
| CON-053 | Web page list items | Each web page shows its title, source, authors and the passage it cites. |
| CON-056 | Add to sheet: version and partial-selection handling | When adding to a sheet, the right version text is used and a highlighted portion is trimmed precisely. |
| CON-061 | Share link and social options | Users can copy a link to the current view or share it by Facebook, X or email. |
| CON-065 | Create connection between two texts | Signed-in users can link two open texts together with a relationship type. |
| CON-066 | Compare text from sidebar | The Compare Text tool replaces the sidebar with a text chooser to open a second text side-by-side. |
| CON-067 | Feedback / report an issue | Users can report text issues, request translations, report bugs or send thanks from the sidebar. |

### Optional (15)

| ID | Feature | What it does |
|---|---|---|
| CON-001 | Linker admin citation click | Staff can inspect a linker-detected citation span in the sidebar. |
| CON-036 | Sidebar reading history (secondary views) | Passages a user dwells on in the sidebar are recorded in reading history as secondary views. |
| CON-037 | Sidebar scroll position restore | Returning to a list view restores where the user was scrolled. |
| CON-040 | About box for a sheet | When the selected source is a sheet, About shows the sheet's title, owner and summary. |
| CON-041 | Related topics module in About | About appends the book's related topics with a More expander. |
| CON-047 | Add topic to ref (moderator) | Moderators can tag a text reference with a topic, or create a new topic, from the sidebar. |
| CON-054 | Linker promo in web pages view | A footer invites sites to use the Sefaria Linker. |
| CON-057 | Google Docs extension promo in Add to Sheet | A promo box in Add to Sheet advertises the Sefaria Google Docs extension. |
| CON-059 | Torah Readings (audio clips) | Plays recorded audio readings of the selected passage with a custom player. |
| CON-060 | Manuscripts for this ref | Shows thumbnails of manuscript pages that contain the selected passage. |
| CON-062 | Add translation | Starts the flow to contribute a translation for the selected text. |
| CON-063 | Edit text | Allows editing the version of the text currently shown. |
| CON-064 | Linker Admin tools entry (moderator) | Moderators get an Advanced entry that turns on linker debug mode. |
| CON-068 | Guided Learning (Key Questions) | An experimental AI-generated study guide for a passage with key questions, answer summaries and the related commentary. |
| CON-069 | Quick-start guide overlay for sheet editor | A one-time onboarding overlay with video cards teaches new users the sheet editor. |

### Retire (4)

| ID | Feature | What it does |
|---|---|---|
| CON-010 | Sheets and AboutSheet sidebar modes (no render) | URL modes that no longer render anything. |
| CON-018 | Chavruta video chat (removed) | Chavruta has been removed entirely from the client and server. |
| CON-051 | Public notes (disabled) | Sharing notes publicly is switched off; all notes are private. |
| CON-058 | Legacy Gardens add-to-sheet path | Old Gardens hook that no longer works. |

### Flags from the audit (not to port as-is)

- **CON-010** Sheets and AboutSheet sidebar modes (no render) — broken
- **CON-018** Chavruta video chat (removed) — unused
- **CON-040** About box for a sheet — broken
- **CON-051** Public notes (disabled) — unused
- **CON-058** Legacy Gardens add-to-sheet path — unused
- **CON-059** Torah Readings (audio clips) — broken

_Generated 2026-10-14. Full behaviour for every ID: `reader-next/docs/features/FEATURES.md` and the atlas page._

<!-- BASELINE:END -->
