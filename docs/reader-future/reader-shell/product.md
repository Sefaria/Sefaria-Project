---
area: reader-shell
title: Reader shell & panels
domain: Reader
document: product
owner: unassigned
status: exploring  # baseline → exploring → proposed → agreed
updated: 2026-10-15
---
# Reader shell & panels — product specification

> Part of the future-reader specification (`docs/reader-future/`), maintained in Slack **#reader-future** by Claude Tag with the
> `capture-future-spec` skill. The sections above the BASELINE block belong to the channel; the block is generated from the
> Feature Atlas and refreshed by `tools/seed.py`. Every change cites the Slack message it came from.

## Summary

Multi-panel reading stays: readers can keep several texts open side by side, each in its own main reader panel. Opening a text from a panel's sidebar closes that sidebar and opens the text as a new main reader panel beside the panel it came from, as sefaria.org does today. The panel design should leave room for panel-management features later; which ones is not yet defined.

## Who it is for and what they need

_Not discussed yet._

## Target behaviour in the future reader

- Parity with sefaria.org: readers can have many reader windows open; each text opened from a panel opens as a new main reader panel to the left of the panel it was opened from (which side exactly: see Open questions). — *proposed* · stated by Akiva Berger, 2026-10-15 · [Slack](https://sefaria.slack.com/archives/C0C9EGTL468/p1792058641961899) · SHL-044 · SHL-049
- Opening a text from a panel's sidebar (connections / resources) closes that sidebar and opens the text as a new main reader panel next to that panel. This behaviour must be kept. — *proposed* · stated by Akiva Berger, 2026-10-15 · [Slack](https://sefaria.slack.com/archives/C0C9EGTL468/p1792058641961899) · CON-033 · CON-038
- The design leaves room for future panel-management features (not specified yet). — *idea* · stated by Akiva Berger, 2026-10-15 · [Slack](https://sefaria.slack.com/archives/C0C9EGTL468/p1792058641961899)
- Main panels can be dragged left and right to reorder them. — *idea* · stated by Akiva Berger, 2026-10-15 · [Slack](https://sefaria.slack.com/archives/C0C9EGTL468/p1792059081018739)
- A panel can be moved into a vertical split (above or below another panel) or out into a fully floating panel. — *idea* · stated by Akiva Berger, 2026-10-15 · [Slack](https://sefaria.slack.com/archives/C0C9EGTL468/p1792059081018739)
- Panel states (which panels are open, what each shows, how they are arranged) can be saved and shared. Saving: see [Saved, history & notes](../user-library/product.md); share links: see [URLs & routing](../routing/product.md). — *idea* · stated by Akiva Berger, 2026-10-15 · [Slack](https://sefaria.slack.com/archives/C0C9EGTL468/p1792059081018739)
- Today a panel holds one text with its translation. Future panels can also hold inline commentaries, shown with the text. Rendering: see [Text display](../text-display/product.md); overlap with the sidebar: see [Connections](../connections/product.md). — *idea* · stated by Akiva Berger, 2026-10-15 · [Slack](https://sefaria.slack.com/archives/C0C9EGTL468/p1792059081018739)

### Product opportunities (assessment, not yet discussed)

Asked for in the thread ([Slack](https://sefaria.slack.com/archives/C0C9EGTL468/p1792059081018739)); written by Claude as a starting list. All *idea* until someone in the channel takes one up.

- **Shareable study layouts:** one link opens the same texts, splits and sidebars. A teacher prepares a layout for a class; chavruta partners open the same one.
- **Saved study sessions:** signed-in readers keep named workspaces and resume them on another device, next to Saved and History.
- **Compare as a layout:** two versions or two texts stacked or side by side as a preset, building on the compare panel (SHL-038).
- **Inline commentary modes:** text, translation and one or more commentaries interleaved verse by verse in one panel, as an alternative to the sidebar.
- **Workspaces and sheets:** a saved workspace as a lightweight study packet, or a source sheet opened as a workspace. Overlaps [Sheets: viewing](../sheets-view/product.md).

## Changes from today (keep · change · drop · new)

- **Keep:** several reader panels side by side; opening from a sidebar closes the sidebar and opens a new main panel beside the source panel (SHL-044, SHL-047, CON-033). — *proposed* · stated by Akiva Berger, 2026-10-15 · [Slack](https://sefaria.slack.com/archives/C0C9EGTL468/p1792058641961899)
- **Change:** _None recorded yet._
- **Drop:** _None recorded yet._
- **New:** panel-management features beyond today's: drag to reorder, vertical splits, floating panels, saved and shared layouts, inline commentary in a panel. — *idea* · stated by Akiva Berger, 2026-10-15 · [Slack](https://sefaria.slack.com/archives/C0C9EGTL468/p1792058641961899) · [Slack](https://sefaria.slack.com/archives/C0C9EGTL468/p1792059081018739)

## Open questions

- **Which side?** The thread says the new panel opens "to the left". On sefaria.org today it opens *after* the source panel in reading order: to its right in the English interface, to its left in the Hebrew interface (`master` `static/js/ReaderApp.jsx:2452`); `reader-next` does the same. Is "left" a fixed side, or does it follow the interface direction as today? · [Slack](https://sefaria.slack.com/archives/C0C9EGTL468/p1792058641961899)
- **What does "future panel management" cover?** For example reorder, resize, pin, stack, close all. Not stated yet.
- **How many panels, and what on overflow?** Today the number of visible panels depends on window width and extra panels scroll sideways (SHL-039, SHL-040). Does that stay?
- **Phones and narrow screens:** today one panel is shown and opening from the sidebar replaces the current panel (SHL-061). Does that stay? What do stacked, floating and shared layouts become on a phone?
- **Shared layouts:** link only, or a stored workspace with an id? Does a shared layout open as the sender's copy (a snapshot) or stay in sync? · [Slack](https://sefaria.slack.com/archives/C0C9EGTL468/p1792059081018739)
- **Inline commentary:** how many commentaries per panel, and does it replace the commentary view of the sidebar or sit beside it? · [Slack](https://sefaria.slack.com/archives/C0C9EGTL468/p1792059081018739)

## Decisions

_None yet. Every decision is also logged in `../DECISIONS.md`._

## Parked ideas

_None yet._

<!-- BASELINE:START (generated by docs/reader-future/tools/seed.py — do not edit by hand) -->

## Baseline: what sefaria.org does today

From the Feature Atlas (`reader-next/docs/features`, area `reader-shell`): **75 features** — core 39, standard 25, optional 7, retire 4. Tiers are the audit's proposal (core: can't launch without it; standard: parity, can follow; optional: niche or rethink; retire: unused, broken or superseded).

Feature groups: Panel operations (18); Reading settings menu (16); History and navigation (7); App bootstrap (6); Panel modes (6); Dead code and latent bugs (5); Multi-panel layout (4); Panel system (3); Compare panel (2); Single vs multi-panel (2); Contexts and hooks (2); Search state plumbing (1); Keyboard (1); Reader controls (1); Unsaved changes (1).

### Core (39)

| ID | Feature | What it does |
|---|---|---|
| SHL-007 | Reading settings defaults | Reading preferences start from sensible defaults, overridden by the user's saved cookies. |
| SHL-008 | Settings persistence in cookies | Reading choices are remembered across visits. |
| SHL-009 | Font size stepping | Readers can enlarge or shrink text in geometric steps. |
| SHL-011 | Effective layout resolution | The layout actually used depends on language, panel width, panel type and category. |
| SHL-017 | Display options dropdown container | A text-display options button in the panel header opens a dropdown of reading settings. |
| SHL-018 | Source / Translation / Both language toggle | The settings menu lets readers choose source only, translation only, or both. |
| SHL-022 | Client entry and hydration | The client app boots from server-rendered HTML and takes over the page. |
| SHL-023 | Header-only mode over static pages | Static Django pages get the live header and nav; clicking into the app turns the page into the reader. |
| SHL-025 | Server-side single vs multi-panel decision | Mobile user agents get the single-panel reader; desktop gets multi-panel; ?mobile forces mobile. |
| SHL-026 | Reader app render tree and providers | The shell wraps everything in providers and mounts header, panels, modals and notices in a fixed order. |
| SHL-027 | Reader app props and defaults | The shell is configured by server-supplied initial props describing what to open first. |
| SHL-028 | App-level reader state | The shell tracks all open panels plus shared state such as default versions and settings. |
| SHL-029 | Panel state model | Every panel carries a standard set of fields describing what it shows and how. |
| SHL-030 | Initial panel construction from server props | On load, the shell reconstructs the full set of open panels from what the server sends. |
| SHL-031 | Text panel (reading column) | The main reading mode: a scrolling text column for the current ref. |
| SHL-032 | Sheet panel | Source sheets open inside a reader panel. |
| SHL-033 | Connections sidebar panel (shell wiring) | The resources sidebar opens as its own panel next to the text. |
| SHL-034 | Menu panels (page-type routing in panel) | The panel can show a full page (library, topics, collections, profile, etc.) instead of text; a menu replaces content. |
| SHL-036 | Panel root element, classes and landmarks | Each panel is an accessible region carrying classes that drive its look. |
| SHL-039 | Panel cap and widths | The number of visible side-by-side panels depends on window width; special ratios give text more room. |
| SHL-043 | Open text (replace all panels) | Navigating from the header or a top-level link replaces the whole panel set with the new text. |
| SHL-044 | Open panel at position | A ref can open as a new panel after, or replace, an existing panel. |
| SHL-045 | Commentary ref opens as base text plus commentary | Opening 'Rashi on Genesis 1:1:4' shows Genesis 1:1 with Rashi alongside. |
| SHL-046 | Segment click opens connections sidebar | Clicking a text segment opens the resources sidebar for it. |
| SHL-047 | Open connections list at panel | The sidebar panel is created or updated, inheriting filters and versions from its parent text. |
| SHL-048 | Close panel | Closing panels cascades sensibly and the last close returns home. |
| SHL-049 | Citation click opens cited text | Clicking a citation opens the cited text in an adjacent panel (or replaces in mobile). |
| SHL-056 | Show base text / open sheet from panel | Panels can switch to a text or a sheet in place. |
| SHL-059 | Panel text data loading and current book/category | Each panel loads the text for its visible ref and versions. |
| SHL-060 | Open library, voices, root, search and user pages | Header/nav actions open the right home or page panel. |
| SHL-061 | Single-panel (mobile) behavior differences | Mobile shows one panel at a time; many interactions change rather than add panels. |
| SHL-062 | Mobile reader controls as header | On mobile, the in-panel text header replaces the site header while reading. |
| SHL-063 | Browser history sync for panel state | The reader pushes or replaces browser history as panel state changes so back/forward and URL sharing work. |
| SHL-064 | Back/forward (popstate) restoration | Back and forward restore panel state and scroll position. |
| SHL-066 | Panel state to URL serialization (shell-specific rules) | Multiple panels are encoded into a single URL, with short forms for the common text+sidebar case. |
| SHL-067 | In-app link routing (openURL) | Clicking internal links navigates within the app without a page reload when possible. |
| SHL-069 | In-app link interception and modifier keys | Plain clicks stay in the app; modified clicks and right-click open normally, even across module subdomains. |
| SHL-072 | Reader panel context | Per-panel display state is shared with child components through a context. |
| SHL-074 | In-panel text header (ReaderControls) | Each text panel has a header with title, subtitle, save and display settings. |

### Standard (25)

| ID | Feature | What it does |
|---|---|---|
| SHL-010 | New panels inherit display settings | Opening another panel keeps the reader's current display choices. |
| SHL-012 | Auto bilingual layout flip for same-direction texts | When both languages run the same direction, side-by-side layout flips automatically. |
| SHL-013 | Content-language override by context | Menus and sidebars show content in a language suited to the interface, not the text setting. |
| SHL-014 | Sidebar panels never bilingual | Connections panels show a single language even if the text is bilingual. |
| SHL-019 | Side-panel settings reduced to language only | In sidebar panels the settings menu only offers the language toggle. |
| SHL-020 | Settings menu show/hide rules per option | Each option in the menu appears only when it applies to the text being read. |
| SHL-021 | Layout buttons by language-direction state | Layout choices offered depend on whether the text is mono- or bilingual and the text directions. |
| SHL-024 | Render arbitrary components into containers | The same bundle can render exported static-page components into designated containers. |
| SHL-035 | Panel error state | If a panel fails, it shows a bilingual 'Something went wrong' message with the error text. |
| SHL-037 | Compare panel header | Panels used to pick a second text have their own header with search and settings. |
| SHL-038 | Compare / 'other text' panel | Readers can open a second text beside the first by picking it through a library browse flow. |
| SHL-040 | Auto-scroll to newly added panel | When panels overflow, the view scrolls horizontally to reveal a new panel. |
| SHL-042 | Panel width measurement | Each panel measures itself so layout controls respond to its actual width. |
| SHL-050 | Search/sidebar result navigation in panels | Search results clicked inside side panels land in the right panel. |
| SHL-051 | Connection filter state management | Selecting a commentator/category filter updates sidebar mode and remembers recent filters. |
| SHL-052 | Version filter state in sidebar | Choosing a translation/version in the sidebar tracks recent version filters. |
| SHL-053 | Selected words routed to dictionary lookup | Selecting words in text feeds the Lexicon sidebar. |
| SHL-054 | Navigate panel to ref with cascade | Moving a panel to a new ref keeps its linked panel in sync. |
| SHL-057 | Panel menu helpers | Small panel actions for menus: close menus, open a menu, set categories/topic/tab etc. |
| SHL-058 | Connections mode switching and login gating | Sidebar tools that require an account prompt anonymous users to log in. |
| SHL-065 | Scroll position persistence in history | Scroll position is saved so returning to a page restores your place. |
| SHL-070 | Per-panel search state management | Search filters and sort are tracked per panel and survive history navigation. |
| SHL-071 | Escape closes panel | Pressing Escape inside a panel closes it. |
| SHL-073 | Shared React hooks | Utility hooks for language resolution, debouncing and incremental loading. |
| SHL-075 | Unsaved sheet-editor change protection | Leaving the editor with unsaved changes prompts for confirmation (in-app navigation only). |

### Optional (7)

| ID | Feature | What it does |
|---|---|---|
| SHL-004 | History-state bugs (URL building) | Several defects in how panel state is serialized to URLs would be copied by a literal port. |
| SHL-006 | Color theme (light/dark/sepia) hooks | Panels carry a color theme class read from a cookie, but no UI lets readers change it. |
| SHL-015 | Non-Torah site forces English in library menu | On white-label deployments without Torah-specific mode, the Library menu opens in English. |
| SHL-016 | Link language override when following links | Links inside translation pages carry their own language into the opened text. |
| SHL-041 | Scrollbar-compensating padding | Single-panel text stays centered under the header despite a scrollbar. |
| SHL-055 | Extended notes view | Books with extended notes can open them from the book page or the sidebar. |
| SHL-068 | External bootstrap-url event | An external script can ask the app to navigate to a ref or URL. |

### Retire (4)

| ID | Feature | What it does |
|---|---|---|
| SHL-001 | Dead handleAppClick analytics handler | An old root click handler for analytics exists but nothing calls it. |
| SHL-002 | Vestigial Beit Midrash / chat remnants | Leftover code from the retired Beit Midrash presence/chat feature remains in the shell. |
| SHL-003 | Unused rerender and undefined panel props | Several props passed to the reader panel point at functions that do not exist. |
| SHL-005 | Missing/phantom hooks and events | Some documented hooks have no counterpart in the repo. |

### Flags from the audit (not to port as-is)

- **SHL-001** Dead handleAppClick analytics handler — unused
- **SHL-002** Vestigial Beit Midrash / chat remnants — unused
- **SHL-003** Unused rerender and undefined panel props — unused
- **SHL-004** History-state bugs (URL building) — broken
- **SHL-005** Missing/phantom hooks and events — unused
- **SHL-006** Color theme (light/dark/sepia) hooks — unused
- **SHL-068** External bootstrap-url event — unused

_Generated 2026-10-14. Full behaviour for every ID: `reader-next/docs/features/FEATURES.md` and the atlas page._

<!-- BASELINE:END -->
