import { useEffect, useRef, useState } from "react";
import { changes, dropFor, zoneAt, zoneRect, type Drop, type Rect } from "~/lib/layout/drop";
import { leaves, type LayoutNode } from "~/lib/layout/tree";
import { drop } from "~/lib/workspace/ops";
import type { PanelId, PanelState } from "~/lib/workspace/types";
import { useWorkspaceNav } from "./navigation";
import styles from "./PanelDrag.module.css";

/** Pointer travel before a press on a header becomes a drag (a shorter one stays a click). */
const THRESHOLD = 6;
/** Strip at the workspace's left and right edges: scrolls the row while it can, else docks at that end. */
const EDGE = 40;
const AUTOSCROLL = 14;

interface Target { rect: Rect; drop: Drop<PanelId> }
interface Shown { title: string; x: number; y: number; target: Target | null }

/**
 * Drag and drop for arranging panels. Pressing a panel's header (marked `data-panel-drag`) and moving the pointer picks the
 * panel up; the panel under the pointer shows where it would land: its left, right, top or bottom half (beside it, or
 * stacked above or below it) or the whole panel (swap). Near either end of the workspace the row scrolls, and at the very
 * end the panel docks there at full height. Escape cancels. A press that does not move stays a click.
 */
export function PanelDrag({ scroller, layout, panels }: { scroller: React.RefObject<HTMLElement | null>; layout: LayoutNode<PanelId> | null; panels: Record<PanelId, PanelState> }) {
  const nav = useWorkspaceNav();
  const [shown, setShown] = useState<Shown | null>(null);
  const latest = useRef({ layout, panels });
  latest.current = { layout, panels };

  useEffect(() => {
    const el = scroller.current;
    if (!el) return;
    const ids = () => new Set<string>(leaves(latest.current.layout));
    /** The workspace panel holding `node` (a side panel's leaf inside it does not count). */
    const panelOf = (node: Element | null): HTMLElement | null => {
      const set = ids();
      let leafEl = node?.closest<HTMLElement>("[data-leaf]") ?? null;
      while (leafEl && !set.has(leafEl.dataset.leaf!)) leafEl = leafEl.parentElement?.closest<HTMLElement>("[data-leaf]") ?? null;
      return leafEl && el.contains(leafEl) ? leafEl : null;
    };
    const handleOf = (node: EventTarget | null) => {
      const handle = node instanceof Element ? node.closest<HTMLElement>("[data-panel-drag]") : null;
      const panel = handle && panelOf(handle);
      return handle && panel ? { handle, panel } : null;
    };

    let press: { id: PanelId; panel: HTMLElement; title: string; x: number; y: number; pointer: number } | null = null;
    let active = false;
    let target: Target | null = null;
    let last = { x: 0, y: 0 };
    let frame = 0;

    const targetAt = (x: number, y: number): Target | null => {
      if (!press || !latest.current.layout) return null;
      const tree = latest.current.layout;
      const box = el.getBoundingClientRect();
      const hidden = el.scrollWidth - el.clientWidth;
      const strip = (side: "before" | "after"): Target => ({
        rect: { left: side === "before" ? box.left : box.right - EDGE * 2, top: box.top, width: EDGE * 2, height: box.height },
        drop: { kind: "dock", placement: side },
      });
      if (x < box.left + EDGE && el.scrollLeft <= 1) return changes(tree, press.id, strip("before").drop) ? strip("before") : null;
      if (x > box.right - EDGE && el.scrollLeft >= hidden - 1) return changes(tree, press.id, strip("after").drop) ? strip("after") : null;
      const over = panelOf(document.elementFromPoint(x, y));
      if (!over) return null;
      const rect = over.getBoundingClientRect();
      // Only the part of the panel inside the workspace's visible area counts.
      const visible = { left: Math.max(rect.left, box.left), top: rect.top, width: Math.min(rect.right, box.right) - Math.max(rect.left, box.left), height: rect.height };
      const zone = zoneAt(visible, x, y);
      const d = dropFor(over.dataset.leaf as PanelId, zone);
      return changes(tree, press.id, d) ? { rect: zoneRect(visible, zone), drop: d } : null;
    };
    const show = () => {
      if (!press) return;
      target = targetAt(last.x, last.y);
      setShown({ title: press.title, x: last.x, y: last.y, target });
    };
    const autoscroll = () => {
      frame = 0;
      if (!active) return;
      const box = el.getBoundingClientRect();
      const step = last.x < box.left + EDGE ? -AUTOSCROLL : last.x > box.right - EDGE ? AUTOSCROLL : 0;
      const before = el.scrollLeft;
      if (step) el.scrollLeft += step;
      if (el.scrollLeft !== before) {
        show();
        frame = requestAnimationFrame(autoscroll);
      }
    };

    const end = () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      window.removeEventListener("pointercancel", cancel);
      window.removeEventListener("keydown", onKey, true);
      if (frame) cancelAnimationFrame(frame);
      frame = 0;
      press?.panel.removeAttribute("data-dragged");
      document.documentElement.removeAttribute("data-panel-dragging");
      if (active) {
        // The click that ends a drag must not also toggle the panel's resources or follow the title link.
        const swallow = (e: MouseEvent) => (e.preventDefault(), e.stopPropagation());
        window.addEventListener("click", swallow, { capture: true, once: true });
        setTimeout(() => window.removeEventListener("click", swallow, { capture: true }), 0);
      }
      press = null;
      active = false;
      target = null;
      setShown(null);
    };
    const cancel = () => end();
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape" || !active) return;
      e.preventDefault();
      e.stopPropagation();
      end();
    };
    const onMove = (e: PointerEvent) => {
      if (!press || e.pointerId !== press.pointer) return;
      last = { x: e.clientX, y: e.clientY };
      if (!active) {
        if (Math.hypot(e.clientX - press.x, e.clientY - press.y) < THRESHOLD) return;
        active = true;
        window.getSelection()?.removeAllRanges();
        press.panel.setAttribute("data-dragged", "true");
        document.documentElement.setAttribute("data-panel-dragging", "true");
      }
      e.preventDefault();
      show();
      if (!frame) frame = requestAnimationFrame(autoscroll);
    };
    const onUp = (e: PointerEvent) => {
      if (!press || e.pointerId !== press.pointer) return;
      const id = press.id;
      const chosen = active ? target : null;
      end();
      if (chosen) nav.go(drop(nav.current(), id, chosen.drop), { state: { nav: "stay" } });
    };
    const onDown = (e: PointerEvent) => {
      if (press || e.button !== 0 || !e.isPrimary || e.pointerType === "touch") return;
      if (ids().size < 2 || window.matchMedia("(max-width: 842px)").matches) return;
      if ((e.target as Element).closest("button, input, select, textarea, [role=dialog], [role=separator]")) return;
      const found = handleOf(e.target);
      if (!found) return;
      press = { id: found.panel.dataset.leaf as PanelId, panel: found.panel, title: found.handle.querySelector("h1, h2, h3")?.textContent?.trim() || "Panel", x: e.clientX, y: e.clientY, pointer: e.pointerId };
      window.addEventListener("pointermove", onMove);
      window.addEventListener("pointerup", onUp);
      window.addEventListener("pointercancel", cancel);
      window.addEventListener("keydown", onKey, true);
    };
    // The title is a link: the browser's own link dragging would take over the gesture.
    const onNativeDrag = (e: DragEvent) => {
      if (ids().size > 1 && handleOf(e.target)) e.preventDefault();
    };
    el.addEventListener("pointerdown", onDown);
    el.addEventListener("dragstart", onNativeDrag);
    return () => {
      el.removeEventListener("pointerdown", onDown);
      el.removeEventListener("dragstart", onNativeDrag);
      if (press) end();
    };
  }, [scroller, nav]);

  if (!shown) return null;
  const t = shown.target?.rect;
  return (
    <>
      {t ? <div className={styles.zone} data-kind={shown.target!.drop.kind} style={{ left: t.left, top: t.top, width: t.width, height: t.height }} aria-hidden="true" /> : null}
      <div className={styles.chip} style={{ left: shown.x + 14, top: shown.y + 14 }} aria-hidden="true">
        {shown.title}
      </div>
    </>
  );
}
