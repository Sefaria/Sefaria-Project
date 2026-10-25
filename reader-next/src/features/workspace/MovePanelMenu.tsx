import { useState } from "react";
import { changes, dropFor, type Drop, type Zone } from "~/lib/layout/drop";
import { panelOrder } from "~/lib/workspace/ops";
import type { PanelId, Workspace } from "~/lib/workspace/types";
import { InterfaceText } from "~/ui/InterfaceText/InterfaceText";
import styles from "./MovePanelMenu.module.css";

/** Left and right are physical: the arrangement runs left to right in every interface language. */
const ZONES: { zone: Zone; arrow: string; label: string }[] = [
  { zone: "before", arrow: "←", label: "Left of" },
  { zone: "above", arrow: "↑", label: "Above" },
  { zone: "below", arrow: "↓", label: "Below" },
  { zone: "after", arrow: "→", label: "Right of" },
  { zone: "centre", arrow: "⇄", label: "Swap with" },
];

/**
 * The keyboard way to do what dragging a panel's header does: a disclosure in the panel's display options that moves this panel
 * next to another, swaps it with one, or sends it to either end of the workspace. Others are listed in reading order with their
 * position (two panels may show the same text); a move that would change nothing is disabled.
 */
export function MovePanelMenu({ self, workspace, onDrop }: { self: PanelId; workspace: Workspace; onDrop: (d: Drop<PanelId>) => void }) {
  const [open, setOpen] = useState(false);
  const layout = workspace.layout;
  if (!layout) return null;
  const order = panelOrder(workspace);
  const others = order.filter((id) => id !== self);
  const button = (d: Drop<PanelId>, text: string, label: string, wide?: boolean) => (
    <button key={label} type="button" className={wide ? styles.far : styles.place} aria-label={label} title={label} disabled={!changes(layout, self, d)} onClick={() => onDrop(d)}>
      {text}
    </button>
  );
  return (
    <div className={styles.section}>
      <button type="button" className={styles.toggle} aria-expanded={open} onClick={() => setOpen((o) => !o)}>
        <InterfaceText en="Move this panel" he="הזזת החלונית" /> <span aria-hidden="true">{open ? "▴" : "▾"}</span>
      </button>
      {open ? (
        <div className={styles.menu} dir="ltr">
          <div className={styles.row}>
            {button({ kind: "dock", placement: "before" }, "⇤ Far left", "To the far left", true)}
            {button({ kind: "dock", placement: "after" }, "Far right ⇥", "To the far right", true)}
          </div>
          {others.map((id) => {
            const p = workspace.panels[id];
            const name = `${order.indexOf(id) + 1}. ${p && "ref" in p ? p.ref : id}`;
            return (
              <div key={id} className={styles.row}>
                <span className={styles.name} title={name}>{name}</span>
                {ZONES.map(({ zone, arrow, label }) => button(dropFor(id, zone), arrow, `${label} ${name}`))}
              </div>
            );
          })}
        </div>
      ) : null}
    </div>
  );
}
