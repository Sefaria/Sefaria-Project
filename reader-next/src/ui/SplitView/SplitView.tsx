import { useRef, useState, type CSSProperties, type KeyboardEvent, type PointerEvent, type ReactNode } from "react";
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
  /** Makes the lines between children draggable: called once a drag ends with the split's path (child indexes) and new shares. */
  onResize?: (path: number[], sizes: number[]) => void;
}

/** Smallest share a child can be dragged down to. */
const MIN_SHARE = 0.12;
interface Live { key: string; sizes: number[] }
interface Shared<Id extends string> {
  renderLeaf: (id: Id) => ReactNode;
  minLeafSize: number;
  dividers: boolean;
  onResize?: SplitViewProps<Id>["onResize"];
  live: Live | null;
  setLive: (l: Live | null) => void;
}

/**
 * Lays out a layout tree: rows and columns of leaves with fractional sizes. The one layout primitive for the
 * workspace (panels) and for each panel (its main view and side panels). In a right-to-left interface rows run
 * right to left, as the old reader's panels did.
 *
 * @feature SHL-039 Panel cap and widths
 */
export function SplitView<Id extends string>({ node, renderLeaf, minLeafSize = 0, dividers = true, className, label, onResize }: SplitViewProps<Id>) {
  const [live, setLive] = useState<Live | null>(null);
  return <Node node={node} path={[]} shared={{ renderLeaf, minLeafSize, dividers, onResize, live, setLive }} className={className} label={label} root />;
}

function Node<Id extends string>({ node, path, shared, className, label, root }: { node: LayoutNode<Id>; path: number[]; shared: Shared<Id>; className?: string; label?: string; root?: boolean }) {
  const { renderLeaf, minLeafSize, dividers, onResize, live } = shared;
  const splitEl = useRef<HTMLDivElement>(null);
  if (node.type === "leaf") {
    return (
      <div className={[styles.leaf, root ? styles.fill : "", className].filter(Boolean).join(" ")} data-leaf={node.id}>
        {renderLeaf(node.id)}
      </div>
    );
  }
  const n = node.children.length;
  const key = path.join(".");
  const sizes = live?.key === key ? live.sizes : node.children.map((_, i) => node.sizes?.[i] ?? 1 / n);

  /** Shares after moving the line before child `i` by `delta` (a fraction of the split). */
  const shifted = (from: number[], i: number, delta: number) => {
    const next = [...from];
    const pair = next[i - 1]! + next[i]!;
    const before = Math.min(pair - MIN_SHARE, Math.max(MIN_SHARE, next[i - 1]! + delta));
    next[i - 1] = before;
    next[i] = pair - before;
    return next;
  };
  const startDrag = (i: number) => (e: PointerEvent<HTMLDivElement>) => {
    const el = splitEl.current;
    if (!el || e.button !== 0) return;
    e.preventDefault();
    const row = node.direction === "row";
    const rect = el.getBoundingClientRect();
    const length = row ? rect.width : rect.height;
    const flip = row && getComputedStyle(el).direction === "rtl" ? -1 : 1;
    const origin = row ? e.clientX : e.clientY;
    const start = sizes;
    let latest = start;
    const handle = e.currentTarget;
    handle.setPointerCapture(e.pointerId);
    const move = (ev: globalThis.PointerEvent) => {
      latest = shifted(start, i, (flip * ((row ? ev.clientX : ev.clientY) - origin)) / length);
      shared.setLive({ key, sizes: latest });
    };
    const end = () => {
      handle.removeEventListener("pointermove", move);
      handle.removeEventListener("pointerup", end);
      handle.removeEventListener("pointercancel", end);
      shared.setLive(null);
      if (latest !== start) onResize?.(path, latest);
    };
    handle.addEventListener("pointermove", move);
    handle.addEventListener("pointerup", end);
    handle.addEventListener("pointercancel", end);
  };
  const keyResize = (i: number) => (e: KeyboardEvent<HTMLDivElement>) => {
    const step = { ArrowLeft: -0.05, ArrowUp: -0.05, ArrowRight: 0.05, ArrowDown: 0.05 }[e.key];
    if (step === undefined) return;
    e.preventDefault();
    onResize?.(path, shifted(sizes, i, step));
  };

  return (
    <div
      ref={splitEl}
      className={[styles.split, root ? styles.fill : "", className].filter(Boolean).join(" ")}
      data-direction={node.direction}
      data-dividers={dividers ? "true" : undefined}
      role={label ? "group" : undefined}
      aria-label={label}
    >
      {node.children.map((child, i) => {
        const share = sizes[i]!;
        // Leaves need the minimum; a nested split needs room for all of its leaves side by side.
        const min = minLeafSize * (node.direction === "row" ? leafCountAcross(child, "row") : leafCountAcross(child, "column"));
        const style = { "--share": share, "--min": `${min}px` } as CSSProperties;
        return (
          <div key={child.type === "leaf" ? child.id : `split-${i}`} className={styles.cell} style={style}>
            {onResize && i > 0 ? (
              <div
                className={styles.handle}
                role="separator"
                aria-orientation={node.direction === "row" ? "vertical" : "horizontal"}
                aria-label="Resize"
                aria-valuenow={Math.round(sizes[i - 1]! * 100)}
                tabIndex={0}
                data-dragging={live?.key === key ? "true" : undefined}
                onPointerDown={startDrag(i)}
                onKeyDown={keyResize(i)}
              />
            ) : null}
            <Node node={child} path={[...path, i]} shared={shared} />
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
