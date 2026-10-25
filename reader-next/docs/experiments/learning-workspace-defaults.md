# Learning workspace: layout defaults

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
| The panels' minimum widths add up to more than the window | The row scrolls sideways. Every panel keeps at least its minimum width; nothing squishes. | The old reader did the same once panels passed its "panel cap". | implemented |
| Is there a limit on the number of panels? | No limit. The old reader's `panelCap` was never a limit: it was the point where widths switched from percentages to 360px and the row began to scroll. Nothing in the new reader caps the number of panels. | Daniel asked for many columns. | implemented (nothing to remove) |
| Widths once the row overflows | Shares turn into pixel widths. The panel that is narrowest for its share sits at its minimum, and the others keep their proportions to it. With equal shares every panel is 360px wide. | It keeps a panel you widened wide, and it needs nothing in the URL beyond the shares. | implemented |
| How the row signals that more panels are off screen | A soft shadow on the edge where panels are hidden (both edges when scrolled to the middle), and a thin horizontal scrollbar. | macOS hides scrollbars until you scroll, so a shadow is the only hint there. | implemented |
| Scrolling sideways with a mouse | The browser's own behavior: trackpad swipe, Shift + wheel, or the scrollbar. The vertical wheel scrolls the text under the pointer. | Taking over the wheel would fight reading. | implemented (browser default) |
| Snap scrolling to panel edges | Off. | Snapping fights drag-resizing and partial views of a panel. | not yet (deliberately off) |
| A panel opens off screen (from a link, the sidebar, or the right-click menu) | The row scrolls smoothly until the new panel is visible (instantly when the reader has asked for reduced motion), and keyboard focus moves into the new panel. | You should see what you just opened. | implemented |
| A panel off screen is sent somewhere (a link inside it) | It scrolls into view. Focus stays where it was. | Only opening a new panel moves focus. | implemented |
| Keyboard focus moves into a panel that is off screen (Tab) | The browser scrolls it into view. | Built into the browser. | implemented (browser default) |
| Panel headers while scrolling sideways | Each header stays at the top of its own panel and moves sideways with the panel. | Each header belongs to its panel. | implemented (checked in a browser) |
| Hebrew interface (RTL) | The row runs right to left, starts at the right, and scrolls left. The shadows and drag directions are mirrored. | Matches the old reader. | implemented (checked in a browser) |
| Performance with many panels | Every panel loads and renders its text. Nothing is virtualised. | Simple, and fine for a handful of panels. | not yet (lazy-render panels that are off screen if it gets slow) |

## Resizing

| Situation | Default | Why | Status |
|---|---|---|---|
| Dragging a divider while the panels fit | The two neighbouring panels trade width, and neither goes below its minimum. The total stays the window width. | The classic split-pane behavior. | implemented |
| Dragging a divider while the row scrolls | Only the panel before the divider changes width (the left one, or the right one in RTL). The row gets longer or shorter, and the panels after it keep their widths and move along. | Like resizing spreadsheet columns. Trading width would leave panels stuck at their minimum, because in overflow they already are. | implemented |
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

## Arrange menu

| Situation | Default | Why | Status |
|---|---|---|---|
| Only one panel | The menu is not shown. | Nothing to arrange. | implemented (existing behavior) |
| Two panels | Every move is offered. A move that would change nothing (for example, "Left of" the panel already to the right) is greyed out. | | implemented |
| Two panels showing the same text | Each is listed with its position ("2. Genesis 1"). | Otherwise the entries look identical. | implemented |
| Hebrew interface | "Left of" and "Right of" mean what the arrows show on screen, which in a right-to-left row are the opposite of "before" and "after". | Rows run right to left there. | implemented |
| "Right of" a panel that is inside a stack | It goes beside that one panel, inside the stack (a row within the stack). | Arranging is explicit, unlike opening a link. | implemented (existing behavior) |

## Panel header in a narrow panel

| Situation | Default | Why | Status |
|---|---|---|---|
| Very long titles | One line ending in an ellipsis (at the left for a Hebrew title). Hovering shows the full title. | The header is always 60px tall, so wrapped titles spilled out of it. | implemented |
| Version and attribution lines | One line each, with an ellipsis. | Same reason. | implemented |
| The action icons crowd a panel under ~520px wide (six icons at 360px) | The icons keep their natural width (shrunk to 30px each), and the title gets what is left (about 100px at 360px). Before this, the icons overflowed their third of the bar onto the title. | Nothing is hidden, and nothing overlaps. | implemented |
| An overflow "…" menu for lower-priority icons in very narrow panels | Proposed: keep Close, Resources and Display settings; move Arrange, Bookmark, Save and the scroll lock into "…". | This needs changes to `TextPanel.tsx`, which others are editing right now. | not yet |
| The "Change the translation?" banner in a 360px panel | Its button and close icon overlap slightly. | Outside the layout work. | not yet |

## Known issues found while checking

- Panels are keyed by position (`p1`, `p2`…). When a panel opens in the middle of the row, React reuses the component
  that held the panel previously at that position. The workspace now handles scroll-into-view and focus itself, so
  this is invisible, but per-panel component state can carry over to the new panel. A stable panel identity would fix
  it properly.
