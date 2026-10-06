# Workspace, panels and side panels

How the reader arranges what is on screen: one or more **panels** side by side (the old "multi-panel" reader),
each of which can have **side panels** (the connections sidebar and its relatives). The arrangement
reproduces the old reader exactly today and is built so it can change later without a rewrite: dragging panels
into a new order, stacking one panel above another, or opening two side panels one above the other.

Atlas: SHL-028–SHL-049, SHL-061, SHL-063–SHL-066, RTE-044.

## Two decisions

### 1. A side panel belongs to the panel that opened it

The old reader kept the sidebar as just another entry in the flat `panels` array, next to its text. Everything
it showed depended on the text panel beside it — which verse is selected, which versions, which filter — so the
shell copied that state across when it opened (`openTextListAt`), re-pointed it when the highlight moved
(`setTextListHighlight`), cleared the parent's highlight when it closed, and closed it when its parent closed
(`closePanel` cascade). Several old bugs live in that copying (SHL-004, SHL-066).

Here a side panel is part of its panel's state:

```ts
interface PanelState {
  id: PanelId;
  kind: "text" | …;             // what the panel is (registry, below)
  asides: AsideState[];         // its side panels, in order
  asideLayout?: LayoutNode<AsideId>; // how they are arranged (default: one column)
  …kind-specific fields         // text: ref, versions, lang, aliyot
}
interface AsideState { id: AsideId; kind: "connections" | …; view: string /* `with` grammar */; lang?: "en" | "he" }
```

The side panel reads the selection, versions and settings from its panel directly. It cannot outlive it,
point at the wrong verse, or need to be told that its panel changed.

### 2. One layout tree, used at two levels

```ts
type LayoutNode<Id> =
  | { type: "leaf"; id: Id }
  | { type: "split"; direction: "row" | "column"; children: LayoutNode<Id>[]; sizes?: number[] };
```

- The **workspace** arranges panels: `Workspace = { panels: Record<PanelId, PanelState>; layout: LayoutNode<PanelId> }`.
  The old reader is always a single `row`. Dragging a panel to a new position is a leaf move; putting one panel
  above another wraps two leaves in a `column` split.
- **Inside a panel** the same tree arranges its main view and its side panels. Desktop: `row[main, aside]`.
  Phone: `column[main, aside]` (the old "TextAndConnections" mode is just this). Two side panels stacked:
  `row[main, column[aside1, aside2]]`.

`sizes` are fractions. When absent, a **sizing policy** fills them; `legacySizes` reproduces the old rules
(68/32 for text + sidebar, 37/26/37 and 37/37/26 for three, even split otherwise; SHL-039). Each panel has a
minimum width (360px, the old `MIN_PANEL_WIDTH`). Past that the row scrolls sideways, as the old `panelCap`
overflow did — handled entirely in CSS, so it also works in the server-rendered page.

## Pure operations

`src/lib/layout/tree.ts` (generic) and `src/lib/workspace/ops.ts` are pure functions with unit tests. Nothing
in them knows about React, the router or the DOM.

| Operation | Old reader | Here |
|---|---|---|
| open a text, replacing everything | `openPanel` (SHL-043) | `openOnly(ws, panel)` |
| open a panel after another | `openPanelAt(n)` (SHL-044) | `openAfter(ws, id, panel)` |
| replace a panel | `replacePanel` | `replace(ws, id, panel)` |
| close a panel (last one → home) | `closePanel` + cascade (SHL-048) | `close(ws, id)` — asides go with it |
| open / change / close the sidebar | `openTextListAt`, `setConnectionsMode`, `closePanel` | `openAside`, `updateAside`, `closeAside` |
| move a panel (future: drag) | — | `move(ws, id, targetId, "before" \| "after" \| "above" \| "below")` |

Operations are what the UI calls. A panel never knows its position: it gets its own state and callbacks scoped
to itself through `PanelContext`.

## The URL is still the state

`src/lib/workspace/url.ts` encodes a workspace to the old URL grammar and back, so every old link opens the same
view and every new link works on the old site:

```
/Genesis.1.3?lang=en&with=Rashi&p2=Exodus.1&lang2=en&p3=Leviticus.1.3&w3=all&vhe3=hebrew|Miqra_according_to_the_Masorah
└ panel 1 ┘ └ its aside ┘ └─ panel 2 ─┘          └─ panel 3, its aside, its versions ─┘
```

- Panel *n* ≥ 2: `p{n}` (ref), `w{n}` (its aside), `lang{n}`, `aliyot{n}`, `ven{n}`, `vhe{n}`.
- Numbers are written sequentially per panel. The old client numbered the flat array (sidebars included) and
  wrote gaps that its own server could not read (atlas SHL-066 BUG); reading accepts gaps.
- Only a single row of panels with at most one aside each has an old-style URL. Arrangements the old reader
  could not show (stacks, two asides) will add a `layout=` parameter when they are built; the decoder ignores
  parameters it does not know, and old links never contain it.

Scroll tracking replaces history (nothing moves); selecting a verse and opening/closing a panel push. The
history entry's state says which panel caused it (`{ nav: "scroll" | "select", panel, ref }`), so only that
panel reacts; other panels keep their columns and scroll positions.

## Rendering

```
<Workspace>                         lays out ws.layout with <SplitView>, one <PanelHost> per leaf
  <PanelHost id>                    provides PanelContext; picks the kind's component from the registry
    <PanelFrame>                    lays out [main, ...asides] with the panel's aside layout
      <TextPanel/>                  main view (header + text column)
      <AsideHost id> → <ConnectionsAside/>
```

- `src/ui/SplitView` is the only layout primitive: a flex row or column with fractional sizes and a minimum
  size per child. Storybook covers rows, columns, nesting and overflow.
- Registries (`features/workspace/registry.ts`) map `kind` → component (+ URL codec piece and title). Sheets,
  menus, search and the compare panel become panel kinds; the lexicon, versions, sheets-with-ref, etc. are views
  of the connections aside today and can become their own aside kinds without touching the shell.

## Phone

The old reader shows one panel on phones and opens the sidebar inside it (TextAndConnections). Here the
workspace shows the first panel only below the single-panel breakpoint, and that panel's frame switches its
aside layout to a column. Same state, same URL, different policy.
