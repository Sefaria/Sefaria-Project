---
area: reader-shell
title: Reader shell & panels
domain: Reader
document: architecture
owner: unassigned
status: exploring  # baseline → exploring → proposed → agreed
updated: 2026-10-15

updated: 2026-10-19
---
# Reader shell & panels — architecture

> Part of the future-reader specification (`docs/reader-future/`), maintained in Slack **#reader-future** by Claude Tag with the
> `capture-future-spec` skill. The sections above the BASELINE block belong to the channel; the block is generated from the
> Feature Atlas and refreshed by `tools/seed.py`. Claims about either codebase cite files on `master` (legacy) or `reader-next`.

## Summary

Each main reader panel owns its sidebar (the connections / resources panel) as a subcomponent, instead of the sidebar being a separate top-level panel as in the legacy reader. Opening a text from a sidebar closes that panel's sidebar and inserts a new main panel next to it. The panel state model should be extensible so panel-management features can be added later.

## Legacy approach vs new approach

- **Legacy (`master`):** one flat `panels` array in `ReaderApp`. The sidebar is its own panel (`mode: "Connections"`) spliced in right after its text panel (`static/js/ReaderApp.jsx:1843`, `openTextListAt`; SHL-033, CON-004). Opening from the sidebar: `ReaderPanel.handleTextListClick` → `showBaseText` → `openPanelAt(panelPosition, …, replace=true)` (`static/js/ReaderPanel.jsx:208`, `:290`), which puts a new text panel in the sidebar's slot (`static/js/ReaderApp.jsx:1801`). A citation closes the next Connections panel and inserts the cited text after the source panel (`static/js/ReaderApp.jsx:1078`). Panels are placed with `left: offset` in the English interface and `right: offset` in the Hebrew interface (`static/js/ReaderApp.jsx:2452`), so "after" is to the right in English and to the left in Hebrew.
- **New (`reader-next`):** a sidebar is already part of its panel's state, as `asides` and `asideLayout` (`reader-next/src/lib/workspace/types.ts:31`; design in `reader-next/docs/WORKSPACE.md` §1). `openFromSidebar` closes the panel's aside and opens a new text panel `after` it (`reader-next/src/features/reader/TextPanel.tsx:256`, via `openNextToWithId`, `src/lib/workspace/ops.ts:68`). Panels sit in a layout tree drawn as a flex row (`src/ui/SplitView/SplitView.module.css:4`) under `<html dir>` set from the interface language (`src/routes/__root.tsx:80`), so "after" is again right in English and left in Hebrew. The model already has `move` and before / after / above / below placements (`src/lib/workspace/ops.ts:106`, `src/lib/layout/tree.ts:17`).

## Target architecture

- Each main reader panel has its sidebar (connections / resources) as a subcomponent; the sidebar is not a separate top-level panel. — *proposed* · stated by Akiva Berger, 2026-10-15 · [Slack](https://sefaria.slack.com/archives/C0C9EGTL468/p1792058641961899)
- Opening a text from a sidebar = close the owning panel's sidebar, then insert a new main panel next to that panel (to its left, per the thread; see below). — *proposed* · stated by Akiva Berger, 2026-10-15 · [Slack](https://sefaria.slack.com/archives/C0C9EGTL468/p1792058641961899)
- The panel state model stays extensible for future panel-management features. — *idea* · stated by Akiva Berger, 2026-10-15 · [Slack](https://sefaria.slack.com/archives/C0C9EGTL468/p1792058641961899)
- **One "now reading" signal per panel.** The reading-scroll engine reports the focused and the settled segment
  ([`src/features/reader/use-reading-scroll.ts:30-33`](https://github.com/Sefaria/Sefaria-Project/blob/837d5851180be4d26c08f3276752d8bdad8fa607/reader-next/src/features/reader/use-reading-scroll.ts#L30-L33)); `TextColumn` passes them up with their passage
  ([`src/features/reader/TextColumn.tsx:154-163`](https://github.com/Sefaria/Sefaria-Project/blob/837d5851180be4d26c08f3276752d8bdad8fa607/reader-next/src/features/reader/TextColumn.tsx#L154-L163)); `TextPanel` then wires four consumers separately: the URL
  ([`src/features/reader/TextPanel.tsx:168-175`](https://github.com/Sefaria/Sefaria-Project/blob/837d5851180be4d26c08f3276752d8bdad8fa607/reader-next/src/features/reader/TextPanel.tsx#L168-L175)), last place ([`src/features/reader/TextPanel.tsx:355-358`](https://github.com/Sefaria/Sefaria-Project/blob/837d5851180be4d26c08f3276752d8bdad8fa607/reader-next/src/features/reader/TextPanel.tsx#L355-L358)), reading history
  ([`src/features/reader/TextPanel.tsx:462-473`](https://github.com/Sefaria/Sefaria-Project/blob/837d5851180be4d26c08f3276752d8bdad8fa607/reader-next/src/features/reader/TextPanel.tsx#L462-L473)) and back/forward ([`src/features/reader/TextPanel.tsx:143-146`](https://github.com/Sefaria/Sefaria-Project/blob/837d5851180be4d26c08f3276752d8bdad8fa607/reader-next/src/features/reader/TextPanel.tsx#L143-L146)). Gather them
  behind one hook that emits `{work, ref, versions, structure?}` on settle, so a reading-position tracker is one more
  subscriber, not a fifth wiring. See [Saved, history & notes](../user-library/architecture.md). — *idea* · [Slack](https://sefaria.slack.com/archives/C0C9EGTL468/p1792404977763469?thread_ts=1792041146.749969&cid=C0C9EGTL468)

## Assessment: advanced panel management

Requested in the thread ([Slack](https://sefaria.slack.com/archives/C0C9EGTL468/p1792059081018739)). For each idea: what `reader-next` already has, what is missing, and how big a change it is in complexity (not time). Paths are under `reader-next/` on `reader-next`. This is an assessment, not a decision.

**Overall:** the tiling model (one layout tree with pure `insert` / `move` and four placements) already fits drag-to-reorder and vertical splits; those are mostly interaction and serialisation work. Two pieces are new structure: floating panels (state outside the tree) and inline commentary (a panel holding many sources, not one text with two version slots). Sharing beyond today's row needs a versioned state format, and stored workspaces need a backend API.

| Capability | Already in `reader-next` | Missing | Size |
|---|---|---|---|
| Drag main panels left / right | Pure `move(ws, id, target, "before" \| "after")` that renumbers panels (`src/lib/workspace/ops.ts:106`, `src/lib/layout/tree.ts:115`, marked "future drag and drop"); any single row round-trips through the URL (`src/lib/workspace/url.ts:76`, `:104`). | No caller in the UI; no drag handles, drop targets or pointer handling; no history entry for a move. | Cheap (state), moderate (interaction) |
| Vertical splits | The tree has column splits and above / below placements (`src/lib/layout/tree.ts:17`, `:87`); `SplitView` renders nested rows and columns with minimum sizes (`src/ui/SplitView/SplitView.module.css:4-5`). | The URL cannot hold it: decoding always builds a row and encoding walks leaves in order (`src/lib/workspace/url.ts:76`, `:104-106`), so a stack flattens on reload or share. The planned `layout=` parameter is not built (`docs/WORKSPACE.md:86-88`). Old-reader widths apply to a single row only (`src/features/workspace/Workspace.tsx:33-34`). No resizable dividers (borders only, `SplitView.module.css:9`). | Moderate |
| Fully floating panels | Nothing. The workspace is `{ panels, layout }` and every visible panel is a leaf of a tree that tiles the screen (`src/lib/workspace/types.ts:51-54`, `src/lib/layout/tree.ts:13-15`). | A layer outside the tree: position and size per floating panel, z-order, focus and stacking, docking back into the tree, a URL / state form, a phone fallback. | Bigger change |
| Save and share panel states | The URL is the state, in sefaria.org's grammar, byte for byte (`src/lib/workspace/url.ts:1-13`). Scroll positions live in history state backed by sessionStorage (`src/features/workspace/navigation.tsx:75`, `src/lib/reader/position-store.ts`). Last place per book is in localStorage (`src/lib/reader/last-place.ts:7`). Reading history syncs to `/api/profile/sync` (`src/lib/user/history.ts:5`). | A versioned format for what the old grammar cannot hold (splits, sizes, floating panels, several asides, inline commentary). URL length grows with every panel. Stored workspaces (a short share link, a saved list for signed-in readers) need a new Django model and API, which do not exist. | Cheap: share today's row layouts as the URL. Bigger: stored, named workspaces |
| Inline commentary in a panel | A panel is one text at one ref with two version slots (`src/lib/workspace/types.ts:39-46`, `VersionSelection` in `src/lib/text/queries.ts:24`). A segment carries only `primary` and `translation` (`src/lib/text/model.ts:92-104`). Commentary lives in the connections aside (`src/lib/workspace/types.ts:14-29`). | A panel content model with several sources (base, translation, N commentaries). Alignment of commentary segments to base segments through links. A text column that interleaves them, loads links per section, and has per-source settings and URL params. `PanelState` is a one-member union switched in `PanelHost` (`src/lib/workspace/types.ts:48`, `src/features/workspace/Workspace.tsx:53-57`); the kind registry described in `docs/WORKSPACE.md:106` is not built. | Bigger change (shared with Text display) |
| Performance with many panels | Each text column loads sections as the reader scrolls and keeps them (`src/features/reader/TextColumn.tsx:77`, no unloading or virtualisation). Panels have a 360 px minimum and the row scrolls sideways past it (`docs/WORKSPACE.md:51-54`). | Section unloading or virtualisation once several panels, floating panels or inline commentary multiply the DOM. | Moderate |
| Phones | Below 842 px only the first panel shows, and its asides stack in a column (`src/features/reader/TextPanel.tsx:56`, `docs/WORKSPACE.md:110-114`). | A policy for what stacked, floating and shared layouts become on a phone. | Cheap if "one panel at a time"; otherwise open |
| Keyboard and screen readers | `SplitView` labels the row as a group (`src/ui/SplitView/SplitView.tsx:47`). | A keyboard way to move panels, announcements of the new position, focus order for floating panels, Escape semantics (SHL-071). | Moderate |

## Dependencies on other areas

- [Connections & resources sidebar](../connections/architecture.md): the sidebar lives inside its main panel.
- [URLs & routing](../routing/architecture.md): how panels and their sidebars are numbered in the URL (decision 2026-10-06).
- [Language & accessibility](../i18n-a11y/architecture.md): whether "left" follows the interface direction; keyboard and screen-reader support for moving panels.
- [URLs & routing](../routing/architecture.md) and [Saved, history & notes](../user-library/architecture.md): sharing and saving panel states.
- [Text display](../text-display/architecture.md): inline commentary in the text column.
- [Saved, history & notes](../user-library/architecture.md): reading position and history subscribe to the panel's signal.

## Risks and open questions

- Should "open next to" be a reading-order placement (after / before, as both clients do today) or a fixed visual side (always left)? The two differ in the English interface. · [Slack](https://sefaria.slack.com/archives/C0C9EGTL468/p1792058641961899)
- Which future panel-management features must the state model support (reorder, resize, pin, stack, close all)? That decides whether the current layout tree is enough.
- Is there a cap on open panels, and what happens past it?
- Share by URL only, or stored workspaces with an id? A URL keeps old links working but grows with every panel and cannot hold floating panels without a new parameter; a stored workspace needs a backend model and API. · [Slack](https://sefaria.slack.com/archives/C0C9EGTL468/p1792059081018739)

## Decisions

_None yet. Every decision is also logged in `../DECISIONS.md`._

<!-- BASELINE:START (generated by docs/reader-future/tools/seed.py — do not edit by hand) -->

## Baseline: the two clients today

### Legacy client (`master`)

Where the atlas found this area's behaviour (files cited by its features, most-cited first):

- [`static/js/ReaderApp.jsx`](https://github.com/Sefaria/Sefaria-Project/blob/master/static/js/ReaderApp.jsx) (71)
- [`static/js/ReaderPanel.jsx`](https://github.com/Sefaria/Sefaria-Project/blob/master/static/js/ReaderPanel.jsx) (42)
- [`reader/views.py`](https://github.com/Sefaria/Sefaria-Project/blob/master/reader/views.py) (4)
- [`static/js/ReaderDisplayOptionsMenu.jsx`](https://github.com/Sefaria/Sefaria-Project/blob/master/static/js/ReaderDisplayOptionsMenu.jsx) (4)
- [`static/js/client.jsx`](https://github.com/Sefaria/Sefaria-Project/blob/master/static/js/client.jsx) (4)
- [`static/js/FontSizeButton.jsx`](https://github.com/Sefaria/Sefaria-Project/blob/master/static/js/FontSizeButton.jsx) (1)
- [`static/js/SourceTranslationsButtons.jsx`](https://github.com/Sefaria/Sefaria-Project/blob/master/static/js/SourceTranslationsButtons.jsx) (1)
- [`static/js/LayoutButtons.jsx`](https://github.com/Sefaria/Sefaria-Project/blob/master/static/js/LayoutButtons.jsx) (1)
- [`static/js/constants.js`](https://github.com/Sefaria/Sefaria-Project/blob/master/static/js/constants.js) (1)
- [`static/js/auth/utils.js`](https://github.com/Sefaria/Sefaria-Project/blob/master/static/js/auth/utils.js) (1)
- [`static/js/ComparePanelHeader.jsx`](https://github.com/Sefaria/Sefaria-Project/blob/master/static/js/ComparePanelHeader.jsx) (1)
- [`static/js/ConnectionsPanelHeader.jsx`](https://github.com/Sefaria/Sefaria-Project/blob/master/static/js/ConnectionsPanelHeader.jsx) (1)
- [`static/js/Misc.jsx`](https://github.com/Sefaria/Sefaria-Project/blob/master/static/js/Misc.jsx) (1)
- [`static/js/Header.jsx`](https://github.com/Sefaria/Sefaria-Project/blob/master/static/js/Header.jsx) (1)
- [`static/js/context.js`](https://github.com/Sefaria/Sefaria-Project/blob/master/static/js/context.js) (1)

Long-form audit write-up: `reader-next/docs/features/inv_02_reader_shell.md`.

### New client (`reader-next`, folder `reader-next/`)

Rebuild status of this area's features: done 33, partial 6, todo 3, replaced 5, not applicable 1, not started 27.

Implemented in (most features first):

- [`src/lib/workspace/`](https://github.com/Sefaria/Sefaria-Project/blob/reader-next/reader-next/src/lib/workspace/) (9)
- [`src/features/reader/TextPanel.tsx`](https://github.com/Sefaria/Sefaria-Project/blob/reader-next/reader-next/src/features/reader/TextPanel.tsx) (9)
- [`src/lib/reader/settings.ts`](https://github.com/Sefaria/Sefaria-Project/blob/reader-next/reader-next/src/lib/reader/settings.ts) (6)
- [`src/lib/workspace/url.ts`](https://github.com/Sefaria/Sefaria-Project/blob/reader-next/reader-next/src/lib/workspace/url.ts) (3)
- [`src/routes/__root.tsx`](https://github.com/Sefaria/Sefaria-Project/blob/reader-next/reader-next/src/routes/__root.tsx) (3)
- [`src/features/workspace/Workspace.module.css`](https://github.com/Sefaria/Sefaria-Project/blob/reader-next/reader-next/src/features/workspace/Workspace.module.css) (1)
- [`src/features/shared/RouteError.tsx`](https://github.com/Sefaria/Sefaria-Project/blob/reader-next/reader-next/src/features/shared/RouteError.tsx) (1)
- [`src/features/shell/mobile-menu.ts`](https://github.com/Sefaria/Sefaria-Project/blob/reader-next/reader-next/src/features/shell/mobile-menu.ts) (1)
- [`src/features/workspace/navigation.tsx`](https://github.com/Sefaria/Sefaria-Project/blob/reader-next/reader-next/src/features/workspace/navigation.tsx) (1)
- [`src/features/workspace/navigation.tsx`](https://github.com/Sefaria/Sefaria-Project/blob/reader-next/reader-next/src/features/workspace/navigation.tsx) (1)

### Gaps: core and standard features not done (25)

| ID | Tier | Feature | Rebuild status |
|---|---|---|---|
| SHL-029 | core | Panel state model | partial |
| SHL-032 | core | Sheet panel | todo |
| SHL-034 | core | Menu panels (page-type routing in panel) | todo |
| SHL-036 | core | Panel root element, classes and landmarks | partial |
| SHL-056 | core | Show base text / open sheet from panel | partial |
| SHL-060 | core | Open library, voices, root, search and user pages | todo |
| SHL-067 | core | In-app link routing (openURL) | partial |
| SHL-069 | core | In-app link interception and modifier keys | partial |
| SHL-074 | core | In-panel text header (ReaderControls) | partial |
| SHL-012 | standard | Auto bilingual layout flip for same-direction texts | not started |
| SHL-013 | standard | Content-language override by context | not started |
| SHL-014 | standard | Sidebar panels never bilingual | not started |
| SHL-021 | standard | Layout buttons by language-direction state | not started |
| SHL-024 | standard | Render arbitrary components into containers | not started |
| SHL-037 | standard | Compare panel header | not started |
| SHL-038 | standard | Compare / 'other text' panel | not started |
| SHL-042 | standard | Panel width measurement | not started |
| SHL-050 | standard | Search/sidebar result navigation in panels | not started |
| SHL-051 | standard | Connection filter state management | not started |
| SHL-054 | standard | Navigate panel to ref with cascade | not started |
| SHL-057 | standard | Panel menu helpers | not started |
| SHL-058 | standard | Connections mode switching and login gating | not started |
| SHL-070 | standard | Per-panel search state management | not started |
| SHL-073 | standard | Shared React hooks | not started |
| SHL-075 | standard | Unsaved sheet-editor change protection | not started |

_Generated 2026-10-14 from the atlas and `rebuild-status.json`. Architecture of each client as a whole: `reader-next/docs/ARCHITECTURE.md`._

<!-- BASELINE:END -->
