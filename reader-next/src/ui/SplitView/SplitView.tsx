import { useEffect, useRef, useState, type CSSProperties, type KeyboardEvent, type PointerEvent, type ReactNode, type RefObject } from "react";
import { childMinimums, dragDivider, minExtent, overflows, toShares, trackLength, type MinOf } from "~/lib/layout/extent";
import type { Direction, LayoutNode } from "~/lib/layout/tree";
import styles from "./SplitView.module.css";

export interface SplitViewProps<Id extends string> {
  /** The arrangement to render (lib/layout/tree.ts). */
  node: LayoutNode<Id>;
  /** What goes in each leaf. */
  renderLeaf: (id: Id) => ReactNode;
  /**
   * Smallest size a leaf may be squeezed to, in px: one number for both directions, or per leaf and direction. When the
   * children cannot all fit, the split scrolls and its children's shares become pixel lengths (the old reader's 360px panel
   * minimum and sideways scrolling, SHL-039).
   */
  minLeafSize?: number | MinOf<Id>;
  /** Lines between children. */
  dividers?: boolean;
  className?: string;
  /** Accessible name for the outermost group, if it is a split. */
  label?: string;
  /** Makes the lines between children draggable: called once a drag ends with the split's path (child indexes) and new shares. */
  onResize?: (path: number[], sizes: number[]) => void;
  /**
   * The direction rows run in, whatever the page's. Leaves get `leafDir` back, so only the arrangement is fixed: the workspace
   * keeps panel 1 on the left in every interface language.
   */
  dir?: "ltr" | "rtl";
  leafDir?: "ltr" | "rtl";
  /**
   * The parent element scrolls sideways instead of the outermost split: the split takes the width all of its leaves need,
   * and the parent's width is what has to fit. Nested rows then never scroll on their own.
   */
  parentScrolls?: boolean;
}

interface Live { key: string; sizes: number[]; lengths: number[] }
interface Shared<Id extends string> {
  renderLeaf: (id: Id) => ReactNode;
  minOf: MinOf<Id>;
  dividers: boolean;
  onResize?: SplitViewProps<Id>["onResize"];
  live: Live | null;
  setLive: (l: Live | null) => void;
  leafDir?: "ltr" | "rtl";
  parentScrolls: boolean;
}

/**
 * Lays out a layout tree: rows and columns of leaves with fractional sizes. The one layout primitive for the
 * workspace (panels) and for each panel (its main view and side panels). Rows run in the page's direction unless `dir`
 * fixes it.
 *
 * While the children fit, a divider trades space between its two neighbours. Once they do not, the split scrolls, every
 * child keeps at least its minimum, and a divider resizes only the child before it (the split grows or shrinks).
 */
export function SplitView<Id extends string>({ node, renderLeaf, minLeafSize = 0, dividers = true, className, label, onResize, dir, leafDir, parentScrolls = false }: SplitViewProps<Id>) {
  const [live, setLive] = useState<Live | null>(null);
  const minOf: MinOf<Id> = typeof minLeafSize === "function" ? minLeafSize : () => minLeafSize;
  return <Node node={node} path={[]} shared={{ renderLeaf, minOf, dividers, onResize, live, setLive, leafDir, parentScrolls }} className={className} label={label} dir={dir} root />;
}

/** The element's visible inner length along `dir`, kept up to date (undefined until measured, as in the server render). */
function useInnerLength(ref: RefObject<HTMLElement | null>, dir: Direction | undefined, ofParent = false): number | undefined {
  const [length, setLength] = useState<number | undefined>(undefined);
  useEffect(() => {
    const el = ofParent ? ref.current?.parentElement : ref.current;
    if (!el || !dir || typeof ResizeObserver === "undefined") return;
    const read = () => setLength(dir === "row" ? el.clientWidth : el.clientHeight);
    read();
    const ro = new ResizeObserver(read);
    ro.observe(el);
    return () => ro.disconnect();
  }, [ref, dir, ofParent]);
  return length;
}

const KEY_STEP: Record<string, { dir: Direction; sign: number }> = {
  ArrowLeft: { dir: "row", sign: -1 },
  ArrowRight: { dir: "row", sign: 1 },
  ArrowUp: { dir: "column", sign: -1 },
  ArrowDown: { dir: "column", sign: 1 },
};

function Node<Id extends string>({ node, path, shared, className, label, dir: fixedDir, root }: { node: LayoutNode<Id>; path: number[]; shared: Shared<Id>; className?: string; label?: string; dir?: "ltr" | "rtl"; root?: boolean }) {
  const { renderLeaf, minOf, dividers, onResize, live, leafDir } = shared;
  const splitEl = useRef<HTMLDivElement>(null);
  // With `parentScrolls`, the outermost row has to fit its parent rather than itself.
  const parentScrolls = Boolean(root && shared.parentScrolls);
  const available = useInnerLength(splitEl, node.type === "split" ? node.direction : undefined, parentScrolls && node.type === "split" && node.direction === "row");
  if (node.type === "leaf") {
    return (
      <div className={[styles.leaf, root ? styles.fill : "", className].filter(Boolean).join(" ")} data-leaf={node.id} dir={leafDir}>
        {renderLeaf(node.id)}
      </div>
    );
  }
  const n = node.children.length;
  const key = path.join(".");
  const dir = node.direction;
  const dragging = live?.key === key ? live : null;
  const sizes = dragging ? dragging.sizes : node.children.map((_, i) => node.sizes?.[i] ?? 1 / n);
  // Leaves need their minimum; a nested split needs room for all of its leaves side by side.
  const ownMins = node.children.map((c) => minExtent(c, dir, minOf));
  const overflowing = overflows(ownMins, available);
  const mins = dragging && overflowing ? dragging.lengths : childMinimums(sizes, ownMins, available);
  // The outermost split of a scrolling parent is as wide as its leaves need: the overflowing row's track, else their minimum.
  const rootStyle: CSSProperties | undefined = parentScrolls
    ? {
        minWidth: `${Math.round(minExtent(node, "row", minOf))}px`,
        ...(dir === "row" && overflowing ? { width: `${Math.round(dragging ? dragging.lengths.reduce((a, b) => a + b, 0) : trackLength(sizes, ownMins))}px` } : {}),
      }
    : undefined;

  /** The children's lengths as laid out now. */
  const measure = () => [...(splitEl.current?.children ?? [])].map((c) => (dir === "row" ? (c as HTMLElement).offsetWidth : (c as HTMLElement).offsetHeight));
  /** Pointer and arrow movement → movement toward the split's end (a right-to-left row runs the other way). */
  const sign = () => (dir === "row" && splitEl.current && getComputedStyle(splitEl.current).direction === "rtl" ? -1 : 1);

  const startDrag = (i: number) => (e: PointerEvent<HTMLDivElement>) => {
    if (!splitEl.current || e.button !== 0) return;
    e.preventDefault();
    const s = sign();
    const origin = dir === "row" ? e.clientX : e.clientY;
    const start = measure();
    let latest: Live | null = null;
    const handle = e.currentTarget;
    handle.setPointerCapture(e.pointerId);
    const move = (ev: globalThis.PointerEvent) => {
      const lengths = dragDivider(start, ownMins, i, s * ((dir === "row" ? ev.clientX : ev.clientY) - origin), overflowing);
      latest = { key, sizes: toShares(lengths), lengths };
      shared.setLive(latest);
    };
    const end = () => {
      handle.removeEventListener("pointermove", move);
      handle.removeEventListener("pointerup", end);
      handle.removeEventListener("pointercancel", end);
      shared.setLive(null);
      if (latest) onResize?.(path, latest.sizes);
    };
    handle.addEventListener("pointermove", move);
    handle.addEventListener("pointerup", end);
    handle.addEventListener("pointercancel", end);
  };
  const keyResize = (i: number) => (e: KeyboardEvent<HTMLDivElement>) => {
    const step = KEY_STEP[e.key];
    if (!step || step.dir !== dir) return;
    e.preventDefault();
    const lengths = measure();
    const visible = available ?? lengths.reduce((a, b) => a + b, 0);
    onResize?.(path, toShares(dragDivider(lengths, ownMins, i, sign() * step.sign * Math.max(24, visible * 0.05), overflowing)));
  };
  // Double-clicking a divider gives its split equal shares again.
  const reset = () => onResize?.(path, node.children.map(() => 1 / n));

  return (
    <div
      ref={splitEl}
      className={[styles.split, root ? styles.fill : "", className].filter(Boolean).join(" ")}
      data-direction={dir}
      data-dividers={dividers ? "true" : undefined}
      data-overflowing={overflowing ? "true" : undefined}
      data-parent-scrolls={parentScrolls ? "true" : undefined}
      dir={fixedDir}
      style={rootStyle}
      role={label ? "group" : undefined}
      aria-label={label}
    >
      {node.children.map((child, i) => {
        const style = { "--share": sizes[i], "--min": `${Math.round(mins[i]!)}px` } as CSSProperties;
        return (
          <div key={child.type === "leaf" ? child.id : `split-${i}`} className={styles.cell} style={style}>
            {onResize && i > 0 ? (
              <div
                className={styles.handle}
                role="separator"
                aria-orientation={dir === "row" ? "vertical" : "horizontal"}
                aria-label="Resize"
                aria-valuenow={Math.round(sizes[i - 1]! * 100)}
                aria-valuemin={0}
                aria-valuemax={100}
                tabIndex={0}
                data-dragging={dragging ? "true" : undefined}
                onPointerDown={startDrag(i)}
                onKeyDown={keyResize(i)}
                onDoubleClick={reset}
              />
            ) : null}
            <Node node={child} path={[...path, i]} shared={shared} />
          </div>
        );
      })}
    </div>
  );
}
