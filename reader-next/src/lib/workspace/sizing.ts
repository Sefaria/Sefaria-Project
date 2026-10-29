/**
 * Panel sizes, reproducing the old reader (SHL-039): a text or sheet with its sidebar is 68/32; three columns
 * are 37/26/37 (text · sidebar · text) or 37/37/26 (text · text · sidebar); anything else splits evenly.
 * Panels never get narrower than MIN_PANEL_WIDTH — past that the row scrolls sideways (old `panelCap`).
 *
 * The old reader sized a flat list of columns, sidebars included. Here a sidebar is inside its panel, so the
 * same widths are computed on the flat list of columns and then grouped: a panel's share is its main column
 * plus its sidebar, and inside the panel the split is main : sidebar.
 *
 * @feature SHL-039 Panel cap and widths
 */
import type { PanelState } from "./types";

export const MIN_PANEL_WIDTH = 360;

type Column = "main" | "aside";

/** The old reader's width rule for a flat list of columns, as fractions. */
export function legacyColumnWidths(columns: Column[]): number[] {
  const k = columns.join(",");
  if (k === "main,aside") return [0.68, 0.32];
  if (k === "main,aside,main") return [0.37, 0.26, 0.37];
  if (k === "main,main,aside") return [0.37, 0.37, 0.26];
  return columns.map(() => 1 / columns.length);
}

export interface PanelSizes {
  /** Each panel's share of the row. */
  panels: number[];
  /** Inside each panel: [main, ...asides] shares (sum 1). */
  inner: number[][];
}

/** Sizes for a single row of panels, as the old reader would lay them out. */
export function legacyRowSizes(panels: Pick<PanelState, "asides">[]): PanelSizes {
  const columns: Column[] = [];
  const owner: number[] = [];
  panels.forEach((p, i) => {
    columns.push("main");
    owner.push(i);
    // The old reader had at most one sidebar per panel; several stacked asides still take one column.
    if (p.asides.length) {
      columns.push("aside");
      owner.push(i);
    }
  });
  const widths = legacyColumnWidths(columns);
  const panelShares = panels.map((_, i) => widths.filter((_, j) => owner[j] === i).reduce((a, b) => a + b, 0));
  const inner = panels.map((_, i) => {
    const mine = widths.filter((_, j) => owner[j] === i);
    const total = mine.reduce((a, b) => a + b, 0);
    return mine.map((w) => w / total);
  });
  return { panels: panelShares, inner };
}
