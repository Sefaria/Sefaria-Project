---
area: text-display
title: Text display & reading settings
domain: Reader
document: architecture
owner: unassigned
status: exploring  # baseline → exploring → proposed → agreed
updated: 2026-10-15

updated: 2026-10-18

updated: 2026-10-28
---
# Text display & reading settings — architecture

> Part of the future-reader specification (`docs/reader-future/`), maintained in Slack **#reader-future** by Claude Tag with the
> `capture-future-spec` skill. The sections above the BASELINE block belong to the channel; the block is generated from the
> Feature Atlas and refreshed by `tools/seed.py`. Claims about either codebase cite files on `master` (legacy) or `reader-next`.

## Summary

No target architecture yet for interaction in the reading column. The ideas recorded in the [product spec](product.md) would
change what the column's click and selection handlers do: segment clicks stop opening the sidebar, a word click or double-click
starts a lookup, and a selection is left alone. [Slack](https://sefaria.slack.com/archives/C0C9EGTL468/p1792316219999969?thread_ts=1792091846.417749&cid=C0C9EGTL468)
A proposal for how reading settings reach the display, with inline commentary as the test case, is in
[Settings → display model](#settings--display-model-proposal). [Slack](https://sefaria.slack.com/archives/C0C9EGTL468/p1792321200408119)

## Legacy approach vs new approach

Scroll and click repaints, rows 10–13 of the load/repaint table in [platform-seo architecture](../platform-seo/architecture.md#legacy-loadrepaint-issues-vs-new-arc)
("current architecture" means the legacy sefaria.org reader: [Slack](https://sefaria.slack.com/archives/C0C9EGTL468/p1792052319198069?thread_ts=1792048275.276949&cid=C0C9EGTL468)). Lab numbers are from the same run as that table (Pixel 7
emulation, 4× CPU slow-down, 1.6 Mbps); indicative only.

| # | Interaction | Legacy (`master`) | New (`reader-next`) | Status · gap |
|---|---|---|---|---|
| 10 | Segment numbers after each load | jQuery measures every number and sets its `top` after each load and on resize: [`static/js/TextRange.jsx:188-225`](https://github.com/Sefaria/Sefaria-Project/blob/master/static/js/TextRange.jsx#L188-L225), [`static/js/TextRange.jsx:25-28`](https://github.com/Sefaria/Sefaria-Project/blob/master/static/js/TextRange.jsx#L25-L28). | Numbers are laid out by CSS; only the continuous layout spreads numbers on one line, in a ResizeObserver: [`src/features/reader/TextColumn.tsx:236-246`](https://github.com/Sefaria/Sefaria-Project/blob/reader-next/reader-next/src/features/reader/TextColumn.tsx#L236-L246). | **Solved** for the segmented layout. The continuous layout still measures every number on each change. |
| 11 | Infinite scroll adding text above the reader | Up to 10 sections are added above at once, then the scroll position is set back after they load: [`static/js/TextColumn.jsx:321-361`](https://github.com/Sefaria/Sefaria-Project/blob/master/static/js/TextColumn.jsx#L321-L361), [`static/js/TextColumn.jsx:241-268`](https://github.com/Sefaria/Sefaria-Project/blob/master/static/js/TextColumn.jsx#L241-L268). In the lab `/Genesis.1.5` had a scroll-time shift of 0.027. | One section at a time; the reading-scroll engine puts the reader back before paint (ResizeObserver and layout effects), with browser scroll anchoring off: [`src/features/reader/use-reading-scroll.ts:156-186`](https://github.com/Sefaria/Sefaria-Project/blob/reader-next/reader-next/src/features/reader/use-reading-scroll.ts#L156-L186), [`src/features/reader/use-reading-scroll.ts:290-299`](https://github.com/Sefaria/Sefaria-Project/blob/reader-next/reader-next/src/features/reader/use-reading-scroll.ts#L290-L299), [`src/features/reader/TextColumn.tsx:201-218`](https://github.com/Sefaria/Sefaria-Project/blob/reader-next/reader-next/src/features/reader/TextColumn.tsx#L201-L218). Lab gates: [`e2e/smoothness.spec.ts:40-57`](https://github.com/Sefaria/Sefaria-Project/blob/reader-next/reader-next/e2e/smoothness.spec.ts#L40-L57). Lab scroll CLS 0. | **Solved in the lab.** Gates run on a desktop viewport and the dev server only; nothing is measured for real users. |
| 12 | Work done on each scroll event | Every scroll event runs `adjustInfiniteScroll` (layout reads); a 100 ms debounce then measures every segment and sets state up through the panel and app, which rewrites history: [`static/js/TextColumn.jsx:114-121`](https://github.com/Sefaria/Sefaria-Project/blob/master/static/js/TextColumn.jsx#L114-L121), [`static/js/TextColumn.jsx:404-444`](https://github.com/Sefaria/Sefaria-Project/blob/master/static/js/TextColumn.jsx#L404-L444), [`static/js/ReaderPanel.jsx:584-590`](https://github.com/Sefaria/Sefaria-Project/blob/master/static/js/ReaderPanel.jsx#L584-L590). Lab: 8–11 long tasks while scrolling. | One passive listener, one step per animation frame, binary search for the current verse; the highlight is a DOM attribute, not React state: [`src/features/reader/use-reading-scroll.ts:130-154`](https://github.com/Sefaria/Sefaria-Project/blob/reader-next/reader-next/src/features/reader/use-reading-scroll.ts#L130-L154), [`src/features/reader/use-reading-scroll.ts:249-251`](https://github.com/Sefaria/Sefaria-Project/blob/reader-next/reader-next/src/features/reader/use-reading-scroll.ts#L249-L251), [`src/features/reader/TextColumn.tsx:100-109`](https://github.com/Sefaria/Sefaria-Project/blob/reader-next/reader-next/src/features/reader/TextColumn.tsx#L100-L109). Still, each change of verse sets panel state, and each pause in scrolling navigates the router (URL replace): [`src/features/reader/TextPanel.tsx:162-175`](https://github.com/Sefaria/Sefaria-Project/blob/reader-next/reader-next/src/features/reader/TextPanel.tsx#L162-L175). Lab: 2–5 long tasks while scrolling. | **Partly.** No INP or long-task measurement; no budget for work per scroll step. |
| 13 | Tapping a segment to open connections (phone) | The text column changes size and then scrolls to the highlight: [`static/js/TextColumn.jsx:80-83`](https://github.com/Sefaria/Sefaria-Project/blob/master/static/js/TextColumn.jsx#L80-L83). Lab: a shift of 0.14 on the tap (not counted as CLS because it follows input, but visible). | The tapped verse becomes the anchor before the column reflows: [`src/features/reader/TextColumn.tsx:175-183`](https://github.com/Sefaria/Sefaria-Project/blob/reader-next/reader-next/src/features/reader/TextColumn.tsx#L175-L183); lab gate on desktop: [`e2e/smoothness.spec.ts:66-73`](https://github.com/Sefaria/Sefaria-Project/blob/reader-next/reader-next/e2e/smoothness.spec.ts#L66-L73). Lab: shift 0.0001 on tap, but 6–7 long tasks after it. | **Partly.** Layout solved; time to the next paint after the tap (INP) is not measured. |

**Clicks and selection in the reading column.**

- Legacy (`master`): the column listens for mouse-up (selection), click and mouse-down ([`static/js/TextColumn.jsx:510`](https://github.com/Sefaria/Sefaria-Project/blob/master/static/js/TextColumn.jsx#L510)). On
  mouse-up it highlights the segments the selection touches and sends the selected words on for lookup
  ([`static/js/TextColumn.jsx:142-170`](https://github.com/Sefaria/Sefaria-Project/blob/master/static/js/TextColumn.jsx#L142-L170)); a mouse-down that is part of a multi-click at a different spot is prevented
  ([`static/js/TextColumn.jsx:132-140`](https://github.com/Sefaria/Sefaria-Project/blob/master/static/js/TextColumn.jsx#L132-L140)). A click on a segment handles citations, footnotes and names, and otherwise opens the
  sidebar, with no check for a selection in progress ([`static/js/TextRange.jsx:485-527`](https://github.com/Sefaria/Sefaria-Project/blob/master/static/js/TextRange.jsx#L485-L527)). TXD-057, TXD-059, CON-008.
- New (`reader-next`): mouse-up reads the selection and reports the words and the segments it touches
  ([`src/features/reader/TextColumn.tsx:274-282`](https://github.com/Sefaria/Sefaria-Project/blob/reader-next/reader-next/src/features/reader/TextColumn.tsx#L274-L282), [`src/lib/reader/selection.ts:13`](https://github.com/Sefaria/Sefaria-Project/blob/reader-next/reader-next/src/lib/reader/selection.ts#L13)); the click that ends a drag-selection does not
  choose the verse ([`src/ui/Segment/Segment.tsx:77-82`](https://github.com/Sefaria/Sefaria-Project/blob/reader-next/reader-next/src/ui/Segment/Segment.tsx#L77-L82)). Selected segments are not highlighted and the double-click guard is not
  ported (TXD-057 partial in `rebuild-status.json`). A segment click opens the sidebar
  ([`src/features/reader/TextPanel.tsx:228-247`](https://github.com/Sefaria/Sefaria-Project/blob/reader-next/reader-next/src/features/reader/TextPanel.tsx#L228-L247)).

**Colour theme.**

- **Legacy (`master`)**: a `color` setting (default `light`) is read from a cookie on the server and applied as a class on each reader panel, with `.readerPanel.sepia` / `.dark` rules in `s2.css`; no control sets it (TXD-039, SHL-006; atlas refs `static/js/ReaderPanel.jsx:1159`, `reader/views.py:362`, `static/css/s2.css:1346-1354`).
- **New (`reader-next`)**: colour tokens are defined with `light-dark()` and `color-scheme: light dark`, so with no explicit choice the page follows the OS setting; `:root[data-theme="light" | "dark" | "sepia"]` overrides it (`reader-next/src/ui/tokens/tokens.css:6-10`, `:151-160`). `ReaderSettings.color` (`light | sepia | dark`) is parsed from the old `color` cookie (`reader-next/src/lib/reader/settings.ts:17`, `:74`), but nothing in `src/` sets `data-theme` and the display settings menu has no theme control. About 100 lines in 41 component `*.module.css` files still use literal hex colours instead of tokens (e.g. `reader-next/src/ui/SegmentedControl/SegmentedControl.module.css:14-17`), so those parts do not change in dark mode.

## Target architecture

- Repaints are monitored in production on interactions in the reading column (scroll, including infinite scroll; clicks on
  segments and controls), not only on load. — *proposed* · [Slack](https://sefaria.slack.com/archives/C0C9EGTL468/p1792048342291029?thread_ts=1792048275.276949&cid=C0C9EGTL468) · TXD-052
- The lab checks already in `reader-next` (jump analysis and CLS per scroll step) stay as regression gates. — *proposed* · [Slack](https://sefaria.slack.com/archives/C0C9EGTL468/p1792048342291029?thread_ts=1792048275.276949&cid=C0C9EGTL468) · TXD-068 · [`e2e/smoothness.spec.ts:120`](https://github.com/Sefaria/Sefaria-Project/blob/reader-next/reader-next/e2e/smoothness.spec.ts#L120)

Implications of ideas, not decisions.

- A segment click no longer opens the sidebar; what it does instead (choose the current verse, or nothing) is open. — *idea* · [Slack](https://sefaria.slack.com/archives/C0C9EGTL468/p1792091846417749?thread_ts=1792091846.417749&cid=C0C9EGTL468) · [Slack](https://sefaria.slack.com/archives/C0C9EGTL468/p1792316219999969?thread_ts=1792091846.417749&cid=C0C9EGTL468)
- Mouse-up on a selection stops starting a lookup; selection is left to the browser (copy keeps its own handler,
  [`src/features/reader/TextColumn.tsx:269`](https://github.com/Sefaria/Sefaria-Project/blob/reader-next/reader-next/src/features/reader/TextColumn.tsx#L269)). — *proposed* · [Slack](https://sefaria.slack.com/archives/C0C9EGTL468/p1792092258845779?thread_ts=1792091846.417749&cid=C0C9EGTL468) · [Slack](https://sefaria.slack.com/archives/C0C9EGTL468/p1792165490196399?thread_ts=1792091846.417749&cid=C0C9EGTL468)
- A word-level click or double-click handler (tap or tap-and-hold on phones) finds the word under the pointer and opens the
  lightweight lookup described in [Connections](../connections/architecture.md). — *idea* · [Slack](https://sefaria.slack.com/archives/C0C9EGTL468/p1792092258845779?thread_ts=1792091846.417749&cid=C0C9EGTL468) · [Slack](https://sefaria.slack.com/archives/C0C9EGTL468/p1792165467488169?thread_ts=1792091846.417749&cid=C0C9EGTL468) · [Slack](https://sefaria.slack.com/archives/C0C9EGTL468/p1792316219999969?thread_ts=1792091846.417749&cid=C0C9EGTL468)

_Items carry a status: idea · proposed · agreed · decided._

- Dark mode is supported: every colour in the client comes from a design token with a light and a dark value; no hard-coded colours in components. — *decided* · [Slack](https://sefaria.slack.com/archives/C0C9EGTL468/p1793181488777949) · see `../CROSS_CUTTING.md` → Design system
- Display settings, theme included (`ReaderSettings`, `reader-next/src/lib/reader/settings.ts:19-44`), are the `display` group
  of the effective-preferences object. Each value carries its source (`cookie` or `site` today). They are stored only in
  host-only cookies, never in the profile, in both clients (`reader/views.py:351-362`). Whether to add profile keys is open. —
  *proposed* (Claude Tag draft) · [Slack](https://sefaria.slack.com/archives/C0C9EGTL468/p1793194426019629) · [Language & accessibility → Effective preferences](../i18n-a11y/architecture.md#target-architecture)

## Dependencies on other areas

- [SSR, SEO & platform](../platform-seo/architecture.md): load-time targets, SSR payload and production monitoring.
- [Cross-cutting → Performance](../CROSS_CUTTING.md#performance).
- [Connections](../connections/architecture.md): the sidebar's open state and the lookup surface.
- [Reader shell & panels](../reader-shell/architecture.md) and [URLs & routing](../routing/architecture.md): per-panel settings
  and their URL parameters, starting with inline commentary.
- Settings and defaults: [Language & accessibility](../i18n-a11y/architecture.md) (inventory, effective-preferences object, gaps).
- Dark mode: [Language & accessibility](../i18n-a11y/architecture.md) (contrast in both themes), [SSR, SEO & platform](../platform-seo/architecture.md) (theme on first paint, `theme-color` meta PLT-010, mobile web PLT-019), [Sheets: viewing](../sheets-view/architecture.md) and [Linker & embeds](../linker-embeds/architecture.md) (content with its own colours).
- Analytics parity ([Slack](https://sefaria.slack.com/archives/C0C9EGTL468/p1793193685517999)): `select_content`, the copy events, `print`, segment, citation, named-entity and language clicks are sent with legacy names; `onclick_ToolTipped` (save and display-settings buttons) is not. See [Analytics → Event inventory](../analytics/architecture.md#event-inventory).

## Risks and open questions

- Gaps for scroll and click, from checking `reader-next` against the legacy reader (rows 11–13 above). Not agreed; each needs
  someone to propose a requirement or drop it. — [Slack](https://sefaria.slack.com/archives/C0C9EGTL468/p1792052319198069?thread_ts=1792048275.276949&cid=C0C9EGTL468)
  - Should the smoothness gates (`e2e/smoothness.spec.ts`) also run on a phone profile and a production build? Today they run
    on the desktop project against the dev server.
  - Is a budget needed for main-thread work on scroll and tap (INP, long tasks)? The new reader still sets panel state on each
    verse change and replaces the URL on each scroll pause.
  - The column keeps every section it loads; neither client removes sections during a long reading session. Does this need
    a limit?
- Click or double-click for a lookup, and on phones tap or tap-and-hold. — [Slack](https://sefaria.slack.com/archives/C0C9EGTL468/p1792092258845779?thread_ts=1792091846.417749&cid=C0C9EGTL468) · [Slack](https://sefaria.slack.com/archives/C0C9EGTL468/p1792165467488169?thread_ts=1792091846.417749&cid=C0C9EGTL468) · [Slack](https://sefaria.slack.com/archives/C0C9EGTL468/p1792316219999969?thread_ts=1792091846.417749&cid=C0C9EGTL468)
- A double-click starts with a single click: today the first click of a double-click on a segment runs the segment click in both
  clients
  ([`static/js/TextRange.jsx:523-525`](https://github.com/Sefaria/Sefaria-Project/blob/master/static/js/TextRange.jsx#L523-L525); [`src/ui/Segment/Segment.tsx:77-82`](https://github.com/Sefaria/Sefaria-Project/blob/reader-next/reader-next/src/ui/Segment/Segment.tsx#L77-L82)).
- **First paint.** An explicit theme must reach server rendering (cookie today) so the page does not flash the wrong theme; "follow the device" needs no script because `light-dark()` resolves in CSS. Which does the product want (see product Open questions)?

## Settings → display model (proposal)

Akiva Berger asked for one generic way for reading settings to reach the text, so that new ones (inline commentary first) fit in
cleanly — stated 2026-10-18 · [Slack](https://sefaria.slack.com/archives/C0C9EGTL468/p1792321200408119). Everything here is *proposed*. Product side: [Reading settings](product.md#reading-settings).

**Today.**

- Legacy (`master`): defaults are read from cookies on the server ([`reader/views.py:353-364`](https://github.com/Sefaria/Sefaria-Project/blob/121350b2659ef01e08ef618cf7bbefd54f8799ed/reader/views.py#L353-L364)) and repeated in the client
  ([`static/js/ReaderApp.jsx:976-995`](https://github.com/Sefaria/Sefaria-Project/blob/121350b2659ef01e08ef618cf7bbefd54f8799ed/static/js/ReaderApp.jsx#L976-L995)). The menu hard-codes each control's visibility rule and string value
  ([`static/js/ReaderDisplayOptionsMenu.jsx:27-98`](https://github.com/Sefaria/Sefaria-Project/blob/121350b2659ef01e08ef618cf7bbefd54f8799ed/static/js/ReaderDisplayOptionsMenu.jsx#L27-L98)); `setOption` special-cases font size, layout and language, mutates panel
  state and writes one cookie per key ([`static/js/ReaderPanel.jsx:530-549`](https://github.com/Sefaria/Sefaria-Project/blob/121350b2659ef01e08ef618cf7bbefd54f8799ed/static/js/ReaderPanel.jsx#L530-L549)). Settings reach the text twice, as a renamed context and a cloned
  prop ([`static/js/ReaderPanel.jsx:736-776`](https://github.com/Sefaria/Sefaria-Project/blob/121350b2659ef01e08ef618cf7bbefd54f8799ed/static/js/ReaderPanel.jsx#L736-L776)). The panel reacts with CSS classes ([`:1156-1166`](https://github.com/Sefaria/Sefaria-Project/blob/121350b2659ef01e08ef618cf7bbefd54f8799ed/static/js/ReaderPanel.jsx#L1156-L1166)); `TextRange` strips vowels and
  punctuation and inserts parashah headers in its render ([`static/js/TextRange.jsx:267-309`](https://github.com/Sefaria/Sefaria-Project/blob/121350b2659ef01e08ef618cf7bbefd54f8799ed/static/js/TextRange.jsx#L267-L309)) and re-renders on a
  hand-kept list of keys ([`:44-55`](https://github.com/Sefaria/Sefaria-Project/blob/121350b2659ef01e08ef618cf7bbefd54f8799ed/static/js/TextRange.jsx#L44-L55)).
- New (`reader-next`): a typed `ReaderSettings` with defaults and the old cookie format ([`src/lib/reader/settings.ts:19-88`](https://github.com/Sefaria/Sefaria-Project/blob/837d5851180be4d26c08f3276752d8bdad8fa607/reader-next/src/lib/reader/settings.ts#L19-L88)) in
  one app-wide store ([`src/features/reader/settings-context.tsx:27-39`](https://github.com/Sefaria/Sefaria-Project/blob/837d5851180be4d26c08f3276752d8bdad8fa607/reader-next/src/features/reader/settings-context.tsx#L27-L39)); each panel overlays the URL's `lang` and `aliyot`
  and its own fallbacks by hand ([`src/features/reader/TextPanel.tsx:71-101`](https://github.com/Sefaria/Sefaria-Project/blob/837d5851180be4d26c08f3276752d8bdad8fa607/reader-next/src/features/reader/TextPanel.tsx#L71-L101)). Pure rules and an availability table exist
  ([`src/lib/reader/settings.ts:128-225`](https://github.com/Sefaria/Sefaria-Project/blob/837d5851180be4d26c08f3276752d8bdad8fa607/reader-next/src/lib/reader/settings.ts#L128-L225)), but the menu writes each control by hand
  ([`src/ui/DisplaySettingsMenu/DisplaySettingsMenu.tsx:39-136`](https://github.com/Sefaria/Sefaria-Project/blob/837d5851180be4d26c08f3276752d8bdad8fa607/reader-next/src/ui/DisplaySettingsMenu/DisplaySettingsMenu.tsx#L39-L136)), `TextSection` reads raw settings and inserts parashah headers itself
  ([`src/ui/TextSection/TextSection.tsx:49-104`](https://github.com/Sefaria/Sefaria-Project/blob/837d5851180be4d26c08f3276752d8bdad8fa607/reader-next/src/ui/TextSection/TextSection.tsx#L49-L104)), and `Segment` takes one prop per concern ([`src/ui/Segment/Segment.tsx:18-41`](https://github.com/Sefaria/Sefaria-Project/blob/837d5851180be4d26c08f3276752d8bdad8fa607/reader-next/src/ui/Segment/Segment.tsx#L18-L41)).
- In both, a new setting means edits to the type, defaults, persistence, URL, menu, availability rules and every component
  that reads it.

**Proposal.**

1. **Registry.** Each setting is one `defineSetting({ key, scope, codec, default, appliesTo, resolve, layer, requires, control })`:
   - `scope`: per user, per panel, URL, or per book category (today's `layoutTanakh` / `layoutTalmud`); `codec`: value ↔ cookie
     and URL parameter.
   - `appliesTo(text)`: whether it is offered for this text (aliyot only for the Torah); `resolve(value, context)`: the effective
     value (bilingual forces segmented, narrow panels stack).
   - `layer`: what it changes — the surface (CSS attributes and variables), text transforms (vowels, punctuation), decorators
     (inserted blocks) or data; `requires`: the data it needs; `control`: its menu entry.

   The `ReaderSettings` type is derived from the registry.

2. **`resolveSettings(stored, url, text)`** gives a panel's effective settings, replacing the hand-written overlays and fallbacks.
3. **`resolveDisplayModel(passages, settings, data)`** returns blocks (section title, structure header, segment, commentary…).
   A segment block carries its sides with transforms applied and `before` / `after` / `inline` slots, filled by the decorators of
   the active settings. A kind → component registry renders the blocks; components never read settings.
4. **Data.** The column loads what the active settings' `requires()` ask for, per loaded section, as it loads link counts today
   ([`src/features/reader/TextColumn.tsx:222-234`](https://github.com/Sefaria/Sefaria-Project/blob/837d5851180be4d26c08f3276752d8bdad8fa607/reader-next/src/features/reader/TextColumn.tsx#L222-L234)).
5. **Enforcement.** Types come from the registry; the menu is generated from `control` and `appliesTo`; nothing under
   `src/ui/**` may import the settings module or `useReaderSettings` (an ESLint import rule, or a vitest architecture test —
   `reader-next` has no ESLint today); one contract test runs over every registry entry (valid default, cookie and URL round
   trip, no change when `appliesTo` is false, a change only in its declared layer, snapshots on `fixtures/`); one Storybook
   story per setting.

**Worked example: inline commentary.** One declaration. Value: a list of commentators, default none; scope: panel, with a URL
parameter. `appliesTo`: the text has commentary links. `requires`: the section's links and the commentaries' text. Layer:
decorator — after each base segment it adds `commentary` blocks aligned through links, and shows that commentator's itags in
the base text. `control`: a multi-select. `Segment` and `SegmentText` stay unchanged; a `CommentaryBlock` is registered for the
new block kind, and parashah and aliyah headers move to the same `before` slot. The panel state gains the chosen commentaries
(`src/lib/workspace/types.ts:39-46`); the panel side is the "Inline commentary in a panel" row in
[Reader shell](../reader-shell/architecture.md) (PR #3818).

**Known gaps in `reader-next`, found on the way.**

- Itags are built ([`src/lib/text/prepare.ts:130-137`](https://github.com/Sefaria/Sefaria-Project/blob/837d5851180be4d26c08f3276752d8bdad8fa607/reader-next/src/lib/text/prepare.ts#L130-L137)) and passed through `TextSection` and `Segment`, but `TextColumn` never
  passes `itagCommentator` ([`src/features/reader/TextColumn.tsx:294-304`](https://github.com/Sefaria/Sefaria-Project/blob/837d5851180be4d26c08f3276752d8bdad8fa607/reader-next/src/features/reader/TextColumn.tsx#L294-L304)), so they render only in Storybook, although
  TXD-027 is marked done in `rebuild-status.json`.
- `color` is parsed and stored ([`src/lib/reader/settings.ts:30`](https://github.com/Sefaria/Sefaria-Project/blob/837d5851180be4d26c08f3276752d8bdad8fa607/reader-next/src/lib/reader/settings.ts#L30)) but nothing reads it (TXD-039).

**Open questions.**

- Is the inline-commentary selection the sidebar's filter (which drives itags in both clients today), or separate from it?
- For each existing setting: per user, per panel or per book category? Today all are per user, and the URL can override `lang`
  and `aliyot` for one panel.
- Keep the legacy cookie names and values (`aliyotOn`, `punctuationOff`) so both clients share preferences, or migrate them?
- Does `reader-next` add ESLint, or enforce the import ban with a vitest test?
- How does the block model handle several structures per work? See the open question in
  [Cross-cutting → Assessment: a new backend text model](../CROSS_CUTTING.md#assessment-a-new-backend-text-model) (PR #3821).

## Decisions

- 2026-10-28 — Dark mode is a supported feature of the future reader, on desktop and mobile. Akiva Berger (owner). [Slack](https://sefaria.slack.com/archives/C0C9EGTL468/p1793181488777949) · [Slack](https://sefaria.slack.com/archives/C0C9EGTL468/p1793181661157789?thread_ts=1793181488.777949&cid=C0C9EGTL468)

_Every decision is also logged in `../DECISIONS.md`._

<!-- BASELINE:START (generated by docs/reader-future/tools/seed.py — do not edit by hand) -->

## Baseline: the two clients today

### Legacy client (`master`)

Where the atlas found this area's behaviour (files cited by its features, most-cited first):

- [`static/js/TextRange.jsx`](https://github.com/Sefaria/Sefaria-Project/blob/master/static/js/TextRange.jsx) (26)
- [`static/css/s2.css`](https://github.com/Sefaria/Sefaria-Project/blob/master/static/css/s2.css) (24)
- [`static/js/ReaderPanel.jsx`](https://github.com/Sefaria/Sefaria-Project/blob/master/static/js/ReaderPanel.jsx) (21)
- [`static/js/sefaria/sefaria.js`](https://github.com/Sefaria/Sefaria-Project/blob/master/static/js/sefaria/sefaria.js) (21)
- [`static/js/TextColumn.jsx`](https://github.com/Sefaria/Sefaria-Project/blob/master/static/js/TextColumn.jsx) (13)
- [`static/js/ReaderApp.jsx`](https://github.com/Sefaria/Sefaria-Project/blob/master/static/js/ReaderApp.jsx) (12)
- [`reader/views.py`](https://github.com/Sefaria/Sefaria-Project/blob/master/reader/views.py) (7)
- [`sefaria/model/marked_up_text_chunk.py`](https://github.com/Sefaria/Sefaria-Project/blob/master/sefaria/model/marked_up_text_chunk.py) (5)
- [`static/js/ReaderDisplayOptionsMenu.jsx`](https://github.com/Sefaria/Sefaria-Project/blob/master/static/js/ReaderDisplayOptionsMenu.jsx) (5)
- [`sefaria/model/text_request_adapter.py`](https://github.com/Sefaria/Sefaria-Project/blob/master/sefaria/model/text_request_adapter.py) (4)
- [`static/js/sefaria/util.js`](https://github.com/Sefaria/Sefaria-Project/blob/master/static/js/sefaria/util.js) (4)
- [`static/js/ContentText.jsx`](https://github.com/Sefaria/Sefaria-Project/blob/master/static/js/ContentText.jsx) (3)
- [`static/js/Misc.jsx`](https://github.com/Sefaria/Sefaria-Project/blob/master/static/js/Misc.jsx) (3)
- [`sefaria/model/text.py`](https://github.com/Sefaria/Sefaria-Project/blob/master/sefaria/model/text.py) (2)
- [`static/js/LexiconBox.jsx`](https://github.com/Sefaria/Sefaria-Project/blob/master/static/js/LexiconBox.jsx) (2)

Long-form audit write-up: `reader-next/docs/features/inv_03_text_rendering.md`, `reader-next/docs/features/inv_02_reader_shell.md`, `reader-next/docs/features/inv_08_other.md`.

### New client (`reader-next`, folder `reader-next/`)

Rebuild status of this area's features: done 45, partial 2, deferred 1, replaced 4, not started 17.

Implemented in (most features first):

- [`src/features/reader/`](https://github.com/Sefaria/Sefaria-Project/blob/reader-next/reader-next/src/features/reader/) (33)
- [`src/lib/text/model.ts`](https://github.com/Sefaria/Sefaria-Project/blob/reader-next/reader-next/src/lib/text/model.ts) (3)
- [`src/lib/reader/copy.ts`](https://github.com/Sefaria/Sefaria-Project/blob/reader-next/reader-next/src/lib/reader/copy.ts) (2)
- [`src/features/reader/reader-route.ts`](https://github.com/Sefaria/Sefaria-Project/blob/reader-next/reader-next/src/features/reader/reader-route.ts) (1)
- [`src/lib/reader/header.ts`](https://github.com/Sefaria/Sefaria-Project/blob/reader-next/reader-next/src/lib/reader/header.ts) (1)
- [`src/ui/NamedEntityView`](https://github.com/Sefaria/Sefaria-Project/blob/reader-next/reader-next/src/ui/NamedEntityView) (1)
- [`src/lib/text/prepare.ts`](https://github.com/Sefaria/Sefaria-Project/blob/reader-next/reader-next/src/lib/text/prepare.ts) (1)
- [`src/ui/Segment/Segment.module.css`](https://github.com/Sefaria/Sefaria-Project/blob/reader-next/reader-next/src/ui/Segment/Segment.module.css) (1)
- [`src/lib/reader/spread-numbers.ts`](https://github.com/Sefaria/Sefaria-Project/blob/reader-next/reader-next/src/lib/reader/spread-numbers.ts) (1)
- [`src/lib/reader/selection.ts`](https://github.com/Sefaria/Sefaria-Project/blob/reader-next/reader-next/src/lib/reader/selection.ts) (1)
- [`src/lib/lexicon/lookup.ts`](https://github.com/Sefaria/Sefaria-Project/blob/reader-next/reader-next/src/lib/lexicon/lookup.ts) (1)
- [`src/ui/TextColumnBanner`](https://github.com/Sefaria/Sefaria-Project/blob/reader-next/reader-next/src/ui/TextColumnBanner) (1)

### Gaps: core and standard features not done (14)

| ID | Tier | Feature | Rebuild status |
|---|---|---|---|
| TXD-044 | core | RTL translations rendered with Hebrew styling | partial |
| TXD-015 | standard | Section label by address type for TOC | not started |
| TXD-016 | standard | v3 texts API parameters and warnings | not started |
| TXD-018 | standard | Return formats and text cleaning | not started |
| TXD-019 | standard | Merge versions segment by segment | not started |
| TXD-020 | standard | Allowed inline HTML in stored text | not started |
| TXD-024 | standard | Entity span safety rules | not started |
| TXD-026 | standard | Inline images in text | not started |
| TXD-029 | standard | Search-term highlighting in text | not started |
| TXD-032 | standard | Language toggle visibility rule in display menu | not started |
| TXD-057 | standard | Text selection and double-click guard | partial |
| TXD-060 | standard | Fonts for Hebrew, English and special scripts | not started |
| TXD-063 | standard | Translation-language preference suggestion banner | deferred |
| TXD-066 | standard | Source/translation language popover | not started |

_Generated 2026-10-14 from the atlas and `rebuild-status.json`. Architecture of each client as a whole: `reader-next/docs/ARCHITECTURE.md`._

<!-- BASELINE:END -->
