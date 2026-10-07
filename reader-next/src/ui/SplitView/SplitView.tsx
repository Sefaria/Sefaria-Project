import type { CSSProperties, ReactNode } from "react";
import type { LayoutNode } from "~/lib/layout/tree";
import styles from "./SplitView.module.css";

export interface SplitViewProps<Id extends string> {
  /** The arrangement to render (lib/layout/tree.ts). */
  node: LayoutNode<Id>;
  /** What goes in each leaf. */
  renderLeaf: (id: Id) => ReactNode;
  /**
   * Smallest size a leaf may be squeezed to, in px, along its split's direction. When the children cannot all
   * fit, the split scrolls instead (the old reader's 360px panel minimum and sideways scrolling, SHL-039).
   */
  minLeafSize?: number;
  /** Lines between children. */
  dividers?: boolean;
  className?: string;
  /** Accessible name for the outermost group, if it is a split. */
  label?: string;
}

/**
 * Lays out a layout tree: rows and columns of leaves with fractional sizes. The one layout primitive for the
 * workspace (panels) and for each panel (its main view and side panels). In a right-to-left interface rows run
 * right to left, as the old reader's panels did.
 *
 * @feature SHL-039 Panel cap and widths
 */
export function SplitView<Id extends string>({ node, renderLeaf, minLeafSize = 0, dividers = true, className, label }: SplitViewProps<Id>) {
  return <Node node={node} renderLeaf={renderLeaf} minLeafSize={minLeafSize} dividers={dividers} className={className} label={label} root />;
}

function Node<Id extends string>({ node, renderLeaf, minLeafSize, dividers, className, label, root }: Required<Pick<SplitViewProps<Id>, "node" | "renderLeaf" | "minLeafSize" | "dividers">> & { className?: string; label?: string; root?: boolean }) {
  if (node.type === "leaf") {
    return (
      <div className={[styles.leaf, root ? styles.fill : "", className].filter(Boolean).join(" ")} data-leaf={node.id}>
        {renderLeaf(node.id)}
      </div>
    );
  }
  const n = node.children.length;
  return (
    <div
      className={[styles.split, root ? styles.fill : "", className].filter(Boolean).join(" ")}
      data-direction={node.direction}
      data-dividers={dividers ? "true" : undefined}
      role={label ? "group" : undefined}
      aria-label={label}
    >
      {node.children.map((child, i) => {
        const share = node.sizes?.[i] ?? 1 / n;
        // Leaves need the minimum; a nested split needs room for all of its leaves side by side.
        const min = minLeafSize * (node.direction === "row" ? leafCountAcross(child, "row") : leafCountAcross(child, "column"));
        const style = { "--share": share, "--min": `${min}px` } as CSSProperties;
        return (
          <div key={child.type === "leaf" ? child.id : `split-${i}`} className={styles.cell} style={style}>
            <Node node={child} renderLeaf={renderLeaf} minLeafSize={minLeafSize} dividers={dividers} />
          </div>
        );
      })}
    </div>
  );
}

/** How many leaves sit side by side along `dir` (a column inside a row counts as its widest row, and so on). */
function leafCountAcross<Id extends string>(node: LayoutNode<Id>, dir: "row" | "column"): number {
  if (node.type === "leaf") return 1;
  const counts = node.children.map((c) => leafCountAcross(c, dir));
  return node.direction === dir ? counts.reduce((a, b) => a + b, 0) : Math.max(...counts);
}
