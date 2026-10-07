/**
 * What is open on screen: panels arranged by a layout tree, each owning its side panels (docs/WORKSPACE.md).
 *
 * @feature SHL-028 App-level reader state
 * @feature SHL-029 Panel state model
 */
import type { LayoutNode } from "~/lib/layout/tree";
import type { VersionSelection } from "~/lib/text/queries";

export type PanelId = `p${number}`;
export type AsideId = `${PanelId}a${number}`;

/** A side panel. Its data comes from the panel it belongs to; it only says which view it shows. */
export interface AsideState {
  id: AsideId;
  kind: "connections";
  /** The view, in the `with` grammar (lib/connections/url.ts): "all", "Rashi", "Sheets", "Commentary ConnectionsList"… */
  view: string;
  /** The side panel's own content language (old `lang2`); never bilingual (SHL-014). */
  lang?: "en" | "he" | "bi";
  /** The version a "Translation Open" / "Version Open" view previews, as "<title>|<language>" (old `vside`). */
  vside?: string;
  /** The words a "Lexicon" view looks up (old `lookup`): selected in the text. */
  lookup?: string;
  /** The query of a "SidebarSearch" view (old `sbsq`): search in this text. */
  sbsq?: string;
  /** A name clicked in the text, shown in the sidebar (old `namedEntity` + `namedEntityText`). */
  entity?: { slug: string; text: string };
}

interface PanelBase {
  id: PanelId;
  asides: AsideState[];
  /** How the side panels are arranged among themselves. Absent: one column, in order. */
  asideLayout?: LayoutNode<AsideId>;
}

/** A text open at a ref (section, segment or range). */
export interface TextPanelState extends PanelBase {
  kind: "text";
  ref: string;
  versions: VersionSelection;
  /** Raw URL values, kept as written so links round-trip; settings resolution happens in the panel. */
  lang?: "bi" | "he" | "en";
  aliyot?: 0 | 1;
}

export type PanelState = TextPanelState;
export type PanelKind = PanelState["kind"];

export interface Workspace {
  panels: Record<PanelId, PanelState>;
  layout: LayoutNode<PanelId> | null;
}

export const EMPTY_WORKSPACE: Workspace = { panels: {}, layout: null };
