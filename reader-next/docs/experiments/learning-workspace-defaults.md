# Learning workspace: defaults

> **These are defaults chosen by Claude, not decisions by Daniel or any user.** Each was picked to get the experiment
> working sensibly. All of them are open to change: when one feels wrong in use, change it here and in the code.

Scope: the learning-workspace experiment (`learning-workspace-poc` branch, never merged). Panels are arranged by a
layout tree of rows and stacks (`src/lib/layout/tree.ts`), drawn by `SplitView`, and saved in the URL's `layout`
parameter (`r(c(1,2)~33,3~67)`). See `docs/WORKSPACE.md` for the model.

Status: **implemented** means it is in the code on this branch; **not yet** means it is only the proposed default.

## Numbers used below

| Constant | Value | Where |
|---|---|---|
| Smallest panel width | 360px (the old reader's `MIN_PANEL_WIDTH`) | `src/lib/workspace/sizing.ts` |
| Smallest width of a panel with its sidebar open | 720px (360 text + 360 sidebar) | `panelMinWidth` in `sizing.ts` |
| Smallest height of a stacked panel | 240px (60px header + a few lines) | `MIN_PANEL_HEIGHT` in `sizing.ts` |
| Phone (single-panel) breakpoint | 842px | `Workspace.module.css`, `TextPanel.tsx` |

## More panels than fit

| Situation | Default | Why | Status |
|---|---|---|---|
| The panels' minimum widths add up to more than the window | The whole workspace scrolls sideways as one page, with the browser's normal scrollbar at the bottom of the window. Every panel keeps at least its minimum width; nothing squishes. | The old reader did the same once panels passed its "panel cap". | implemented |
| What scrolls sideways | The workspace itself, never a split inside it. A stack, or a row nested in a stack, is given the width all of its panels need, so a panel spanning the full width under a row of columns scrolls along with them. (Before, a row nested in a stack scrolled on its own inside its cell.) | One scroller is predictable. | implemented (checked in a browser) |
| Is there a limit on the number of panels? | No limit. The old reader's `panelCap` was never a limit: it was the point where widths switched from percentages to 360px and the row began to scroll. Nothing in the new reader caps the number of panels. | Daniel asked for many columns. | implemented (nothing to remove) |
| Widths once the row overflows | Shares turn into pixel widths. The panel that is narrowest for its share sits at its minimum, and the others keep their proportions to it. With equal shares every panel is 360px wide. | It keeps a panel you widened wide, and it needs nothing in the URL beyond the shares. | implemented |
| How the row signals that more panels are off screen | A soft shadow on the edge where panels are hidden (both edges when scrolled to the middle), and the normal horizontal scrollbar. | macOS hides scrollbars until you scroll, so a shadow is the only hint there. | implemented |
| Scrolling sideways with a mouse | The browser's own behavior: trackpad swipe, Shift + wheel, or the scrollbar. The vertical wheel scrolls the text under the pointer. | Taking over the wheel would fight reading. | implemented (browser default) |
| Snap scrolling to panel edges | Off. | Snapping fights drag-resizing and partial views of a panel. | not yet (deliberately off) |
| A panel opens off screen (from a link, the sidebar, or the right-click menu) | The row scrolls smoothly until the new panel is visible (instantly when the reader has asked for reduced motion), and keyboard focus moves into the new panel. | You should see what you just opened. | implemented |
| A panel off screen is sent somewhere (a link inside it) | It scrolls into view. Focus stays where it was. | Only opening a new panel moves focus. | implemented |
| Keyboard focus moves into a panel that is off screen (Tab) | The browser scrolls it into view. | Built into the browser. | implemented (browser default) |
| Panel headers while scrolling sideways | Each header stays at the top of its own panel and moves sideways with the panel. | Each header belongs to its panel. | implemented (checked in a browser) |
| Hebrew interface (RTL) | The arrangement is identical to the English one: panel 1 on the left, the same widths and the same stacks, starting scrolled to the left. Only what is inside each panel (headers, text, its sidebar) runs right to left. Divider dragging and arrow keys move the divider the way the pointer or arrow points in both languages. | One URL should look the same to every reader; the old reader mirrored the row. | implemented (checked in a browser) |
| Performance with many panels | Every panel loads and renders its text. Nothing is virtualised. | Simple, and fine for a handful of panels. | not yet (lazy-render panels that are off screen if it gets slow) |

## Resizing

| Situation | Default | Why | Status |
|---|---|---|---|
| Dragging a divider while the panels fit | The two neighbouring panels trade width, and neither goes below its minimum. The total stays the window width. | The classic split-pane behavior. | implemented |
| Dragging a divider while the row scrolls | Only the panel before the divider (the left one) changes width. The row gets longer or shorter, and the panels after it keep their widths and move along. | Like resizing spreadsheet columns. Trading width would leave panels stuck at their minimum, because in overflow they already are. | implemented |
| Dragging a divider to an extreme | It stops where a panel reaches its minimum (360px wide, 240px tall). Past that, nothing moves while the panels fit. While the row scrolls, widening has no upper limit. | No panel becomes unusable. | implemented |
| Widening every panel while the row scrolls | When you let go, the panels settle back so that the narrowest one for its share is at its minimum. Their proportions are kept. | Shares cannot record "everything wider than the minimum". | implemented (known limitation) |
| Shares in the URL | Percentages with one decimal (`~26.1`), never written as 0. Whole numbers still read. | Whole percentages made widths jump a few pixels on release, and a 0 dropped all of a split's shares. | implemented |
| Double-clicking a divider | That split goes back to equal shares. | A quick way out of an odd arrangement. | implemented |
| Resizing with the keyboard | Focus a divider (Tab), then use the arrow keys along the split: 5% of the visible width per press, at least 24px. The rules are the same as for dragging. | Keyboard access. | implemented |
| Resizing the window while widths are pinned by shares | While the panels fit, they scale with the window. Once the window gets narrower than their minimums, they keep their pixel widths and the row scrolls. | You don't lose the proportions you chose. | implemented |
| Back/forward after resizing | A resize replaces the current history entry rather than adding one. Back goes to the previous navigation, and forward returns to the resized arrangement. | Dozens of resize steps in history would make Back useless. | implemented (existing behavior) |
| Opening a panel into a row with pinned shares | The new panel takes an equal share (1/n), and the others shrink proportionally. | Same rule as before. | implemented (existing behavior) |
| The sidebar's share inside a panel | Remembered on this device for every panel (localStorage), and not saved in the URL. | Existing behavior. | implemented (existing behavior) |

## Stacks (panels above each other)

| Situation | Default | Why | Status |
|---|---|---|---|
| Smallest height of a stacked panel | 240px. A taller stack than fits scrolls vertically inside its column. | The old 360px also applied to heights, so a stack of three overflowed an 800px screen. | implemented |
| Smallest width of a stack | The widest of its panels' minimums (720px if one of them has its sidebar open). | Each stacked panel spans the stack's full width. | implemented |
| Closing a panel inside a stack | Its height goes to the other panels in the stack, in proportion. | | implemented (existing behavior) |
| A stack with one panel left | It stops being a stack: the remaining panel takes the stack's place and keeps the stack's width. | No one-child stacks (a tree invariant). | implemented (existing behavior, now tested) |
| Closing the last companion | One panel remains, full width, and the `layout` parameter disappears from the URL. | One panel needs no layout. | implemented (existing behavior, now tested) |
| Opening a link from a stacked panel | The new panel opens beside the whole stack, at full height, rather than splitting the stacked panel's cell into a little row. | Splitting a stacked cell makes a shape nobody asked for. | implemented |
| A commentary from the right-click menu | It stacks below the last companion (existing behavior). If that companion is off screen, the row scrolls to it. | | implemented |
| Opening a link from a panel whose whole workspace is a stack | The stack becomes the left half of a row, and the new panel the right half. | Same rule: beside the stack. | implemented |

## Sidebar inside a panel

| Situation | Default | Why | Status |
|---|---|---|---|
| Opening the sidebar | The panel's minimum width doubles to 720px, and the text and the sidebar each keep at least 360px. In a row that overflows, the panel becomes 720px wide. | The old reader gave the sidebar a 360px column of its own. Without this, the sidebar was squeezed to about 230px. | implemented |
| The sidebar in a narrow stacked panel | Same rule: the stack becomes at least 720px wide, and the row scrolls if it has to. | | implemented |
| The sidebar's own resize handle | It trades width with the text, and neither goes below 360px. | | implemented |

## Narrow windows and phones

| Situation | Default | Why | Status |
|---|---|---|---|
| A window wider than 842px but too narrow for every panel | The same as "more panels than fit": the row scrolls. | One rule. | implemented |
| A phone or window up to 842px (single-panel mode) | Only panel 1 (the first in reading order) is shown, wherever the layout puts it, even inside a stack. The page scrolls vertically. | The old reader's single-panel mode. | implemented |
| A `layout` parameter on a phone | It is ignored for display but kept in the URL, so the arrangement comes back on a wide screen. Minimum widths are switched off. | A shared link should survive being opened on a phone. | implemented |
| Getting to panels 2+ on a phone | Not possible from the layout. They load but stay hidden. | | not yet (maybe a panel switcher) |

## The `layout` URL parameter

| Situation | Default | Why | Status |
|---|---|---|---|
| A parameter naming more panels than the URL has | The missing panels are dropped from the arrangement, and the rest keeps its shape and shares. | Better than throwing the whole arrangement away. | implemented |
| A parameter naming fewer panels than the URL has (a panel added by an old-style link) | The extra panels are added at the end of the outer row, each with an equal share. | Same reason. | implemented |
| A malformed parameter, or panels numbered out of reading order | It is ignored: panels show in the old reader's plain row with its widths, and the address bar drops the parameter. | Panel numbers follow reading order, so anything else is corrupt. | implemented |
| A plain row with no resized shares | No `layout` parameter is written, so old links and old-style URLs stay identical. | Compatibility with sefaria.org URLs. | implemented (existing behavior) |

## Arranging panels (drag and drop)

| Situation | Default | Why | Status |
|---|---|---|---|
| How to move a panel | Press on its header (anywhere but a button, the title link included) and drag. There is no arrange icon. | Daniel asked for drag and drop instead of an icon. | implemented |
| Telling a click from a drag | The press becomes a drag after 6px of movement. A shorter press stays a click (the header still opens or closes Resources; the title still links). The click that ends a drag is swallowed. | | implemented |
| Where it can land | Over another panel: its left or right half puts the panel beside it, its top or bottom half stacks it above or below. The middle 40% of the panel (both ways) swaps the two panels, each keeping the other's size. The highlighted part shows where it will go, as in VS Code and Obsidian. | Swap is the one centre action that needs no tabs. | implemented |
| Beside a panel inside a stack | Beside that one panel, inside the stack (a small row within the stack), as VS Code does. To put a panel beside a whole stack at full height, drop it at the far left or far right end of the workspace. | Precise drops, plus one way to reach the outer ends. | implemented |
| The ends of the workspace | Within 40px of the workspace's left or right edge: while the row can scroll that way, it scrolls; once at the end, the panel docks there at full height. | Lets you reach panels that are off screen while dragging. | implemented |
| A drop that would change nothing | No highlight, and letting go does nothing (for example, the left half of the panel already to the right). | | implemented |
| Feedback while dragging | The dragged panel fades, a small label with its title follows the pointer, and the cursor is a closed hand. Escape cancels. | | implemented |
| Touch | Not supported: a touch on the header scrolls or taps as before. | Phones show one panel; tablets need a long-press gesture that has not been designed. | not yet |
| Keyboard and screen readers | "Move this panel" in the panel's display options (the Aa menu) lists the other panels with left, above, below, right and swap buttons, plus "Far left" and "Far right". Moves that would change nothing are disabled. Left and right are physical in both languages. | Every drag has a keyboard equivalent without a header icon. | implemented |
| Only one panel | No dragging and no "Move this panel". | Nothing to arrange. | implemented |
| History | A move adds a history entry, so Back undoes it. | Moves are deliberate, unlike resizing. | implemented (existing behavior) |
| Panel numbers after a move | Panels are renumbered in reading order (left to right, top to bottom), as before. | Panel numbers follow reading order in the URL. | implemented (existing behavior) |

## Panel header in a narrow panel

| Situation | Default | Why | Status |
|---|---|---|---|
| Very long titles | One line ending in an ellipsis (at the left for a Hebrew title). Hovering shows the full title. | The header is always 60px tall, so wrapped titles spilled out of it. | implemented |
| Version and attribution lines | One line each, with an ellipsis. | Same reason. | implemented |
| The action icons crowd a panel under ~520px wide (six icons at 360px) | The icons keep their natural width (shrunk to 30px each), and the title gets what is left (about 100px at 360px). Before this, the icons overflowed their third of the bar onto the title. | Nothing is hidden, and nothing overlaps. | implemented |
| An overflow "…" menu for lower-priority icons in very narrow panels | Proposed: keep Close, Resources and Display settings; move Bookmark, Save and the scroll lock into "…" (arranging has no icon any more). | This needs changes to `TextPanel.tsx`, which others are editing right now. | not yet |
| The "Change the translation?" banner in a 360px panel | Its button and close icon overlap slightly. | Outside the layout work. | not yet |

## Study tools: right-click menu, definitions, link previews

These are defaults too (chosen by Claude to implement Daniel's feedback), not decisions.

| Situation | Default | Why | Status |
|---|---|---|---|
| Rows in the right-click menu on a verse | Resources · Open my saved layout (only when one exists for this book, panel 1) · Bookmark here / Move bookmark here · Look up *word* (only over a Hebrew word) · the starred commentaries on this verse · All commentaries… · Copy with citation. Usually 6–8 rows. | Daniel asked for a shorter menu. | implemented |
| Icons in the menu | Every row has one: layers (Resources), saved layout, bookmark, search (Look up), book (each commentary), list (All commentaries…), copy. | Consistency; the bookmark row needed one. | implemented |
| Which commentaries the menu lists | Only starred ones that have something on this verse, in the reader's star order, at most 3. The default stars are Rashi, Tosafot and Ramban. Nothing starred on the verse: only "All commentaries…". | Daniel asked for favourites only. | implemented |
| "All commentaries…" | Opens the sidebar on the verse's Commentary list (`with=Commentary ConnectionsList`). | The full list already exists there. | implemented |
| Starring and unstarring a commentary | A star beside each commentator in the sidebar's Commentary list (not Quoting Commentary). The gold star beside a commentary in the right-click menu unstars it. Kept on this device (localStorage). | The menu no longer lists unstarred commentaries, so starring moved to the full list. | implemented |
| Bookmark label | "Bookmark here" without a bookmark in this book, "Move bookmark here" with one, "Your bookmark is here" (greyed) on the verse that has it. | Shorter than "Bookmark this book here". | implemented |
| "Always gloss this word on hover" | Removed, with its stored word list and the dotted underlines. | Daniel found it strange and doesn't want it. | implemented (removed) |
| Selecting words in the text | Selecting (or double-clicking) up to three words in one verse that include Hebrew or Aramaic shows a definition card beside them, from the same dictionary lookup the sidebar uses, filtered to the dictionaries that apply to the text's category. Up to 3 entries, each cut at 220 characters. | Replaces the gloss-on-hover feature. | implemented |
| Nothing found for a selection | No card at all. The card also stays hidden while the lookup is in flight, so it appears only once there is something to show. | No noise on ordinary selections. | implemented |
| "Look up *word*" from the right-click menu | The same card, at the word. Here it says "Looking up…" while loading and "No definition found." when there is none. | The lookup was explicit, so silence would look broken. | implemented |
| Closing the definition card | A click anywhere outside it, Escape (which then doesn't close the panel), scrolling, resizing the window, or a new selection. | As asked. | implemented |
| The card's "Open in dictionary" | Opens the sidebar's dictionary view on the same words. | The full entries with sources and citations live there. | implemented |
| Selecting words while the sidebar shows the dictionary | The sidebar follows the selection and no card appears. While the sidebar shows anything else (Resources, a commentary), selecting no longer switches it to the dictionary; the card shows instead. | One definition on screen at a time. sefaria.org switches an open sidebar to the dictionary; this experiment doesn't. | implemented |
| English selections | No card. | The lookup supports Hebrew and Aramaic only (same rule as the sidebar). | implemented |
| Link preview card layout | A shaded header with the ref as the title (serif, larger, ellipsis with the full title on hover) and a close button. The text sits in the body, slightly larger than before (58 instead of 54 on the reader's font scale). A footer row holds the actions. 380px wide, at most 340px tall. | Daniel asked for a cleaner card: a clear header, readable body and tidy buttons. | implemented |
| "Open as new column" | Adds a panel for the ref in this workspace, right after the source panel, in the source panel's language. A comment on one base text opens as that text with the commentator in its sidebar (the app's usual rule for opening a link). The source panel and any other open panel stay. On a phone the panel goes there instead. | As asked. The old "Open on page" closed the panel next to the source first. | implemented |
| "Open in new page" | A real link (`target=_blank`) to the ref alone (`/Ref?lang=<source panel's language>`), so it opens in a new browser tab. The card closes. | As asked. Being a link also makes copy-link and middle-click work. | implemented |
| Pinning | Unchanged: a click inside a hover card pins it, and a plain click on a link opens a pinned card. | Daniel is happy with it. | implemented (existing behavior) |

| An overflow "…" menu for lower-priority icons in very narrow panels | Proposed: keep Close, Resources and Display settings; move Arrange, Bookmark and the scroll lock into "…". | This needs changes to `TextPanel.tsx`, which others are editing right now. | not yet |

## Bookmarks and the layout

A bookmark carries the arrangement around its book ("My layout"); there is no separate layout control. `bk=1` in the URL
means My layout is on.

| Situation | Default | Why | Status |
|---|---|---|---|
| Changing the arrangement while My layout is on (opening or closing a companion, resizing, a panel's language) | Saved to the bookmark straight away. There is no Save step. Where a companion has scrolled to does not count as a change. | Daniel: saving the layout is part of bookmarking. | implemented |
| Switching to the standard layout (bookmark card) | The main text alone. The saved layout is kept, and the card offers "Switch back to my layout". Changes made in the standard layout never touch the saved one. | Lets you look at the plain text without losing your setup. | implemented |
| Opening a commentary on a bookmarked book whose bookmark has no layout yet | The arrangement becomes My layout (`bk=1`) and is saved. | The reader is "with" the bookmark. | implemented |
| The same, when the bookmark already has a layout and the standard layout is showing | Nothing is saved; the card offers to switch back. | Never overwrite a saved setup from the standard layout. | implemented |
| Bookmarking (the bookmark button) | Saves the position and the arrangement on screen. With companions open, My layout turns on. | | implemented |
| The Resources sidebar | Not part of the layout: opening or closing it saves nothing, and a bookmark link opens without it. Layouts saved earlier with a sidebar still open it. | The header opens and closes it on any click; saving that would surprise. | implemented |
| Going back to a bookmark (Continue learning cards, the Bookmarks page, a search result in a bookmarked book) | The link itself carries the saved layout (`p2…&layout=…&bk=1`), so it opens the same way from a click, a new tab, a reload or before the page has finished loading. On arrival, companions move to the main text's verse. | The earlier hand-off between the link and the reader could silently fall back to the standard layout. | implemented |
| Other ways into a bookmarked book (table of contents, a citation, a typed or shared URL) | Exactly what the URL says. "Open my saved layout" is in the Aa menu and the right-click menu. | The reader is probably looking something up. | implemented |
| The scroll-together lock | Only on companion panels. Panel 1 leads, so it has no lock (it still follows a companion that is scrolled). | | implemented |
| The old "Save" (saved items) buttons | Gone from the panel header and from the site header (desktop icon and the mobile menu entry). Bookmarks replace them. | | implemented |

## Known issues found while checking

- Panels are keyed by position (`p1`, `p2`…). When a panel opens in the middle of the row, React reuses the component
  that held the panel previously at that position. The workspace now handles scroll-into-view and focus itself, so
  this is invisible, but per-panel component state can carry over to the new panel. A stable panel identity would fix
  it properly.
