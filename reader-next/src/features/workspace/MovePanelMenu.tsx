import { useState, type ReactNode } from "react";
import { changes, dropFor, type Drop, type Zone } from "~/lib/layout/drop";
import { panelOrder } from "~/lib/workspace/ops";
import type { PanelId, Workspace } from "~/lib/workspace/types";
import { Icon, type IconName } from "~/ui/Icon/Icon";
import { InterfaceText } from "~/ui/InterfaceText/InterfaceText";
import styles from "./MovePanelMenu.module.css";

/** Left and right are physical: the arrangement runs left to right in every interface language. */
const ZONES: { zone: Zone; icon: IconName; label: string }[] = [
  { zone: "before", icon: "arrow-left", label: "Left of" },
  { zone: "above", icon: "arrow-up", label: "Above" },
  { zone: "below", icon: "arrow-down", label: "Below" },
  { zone: "after", icon: "arrow-right", label: "Right of" },
  { zone: "centre", icon: "swap", label: "Swap with" },
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
  const button = (d: Drop<PanelId>, icon: IconName, label: string, text?: ReactNode) => (
    <button key={label} type="button" className={text ? styles.far : styles.place} aria-label={label} title={label} disabled={!changes(layout, self, d)} onClick={() => onDrop(d)}>
      {text && icon === "to-end" ? <span>{text}</span> : null}
      <Icon name={icon} size="16px" />
      {text && icon !== "to-end" ? <span>{text}</span> : null}
    </button>
  );
  return (
    <div className={styles.section}>
      <button type="button" className={styles.toggle} aria-expanded={open} onClick={() => setOpen((o) => !o)}>
        <InterfaceText en="Move this panel" he="הזזת החלונית" />
        <Icon name="chevron-down" size="16px" className={styles.chevron} />
      </button>
      {open ? (
        <div className={styles.menu} dir="ltr">
          <div className={styles.row}>
            {button({ kind: "dock", placement: "before" }, "to-start", "To the far left", <InterfaceText en="Far left" he="לקצה השמאלי" />)}
            {button({ kind: "dock", placement: "after" }, "to-end", "To the far right", <InterfaceText en="Far right" he="לקצה הימני" />)}
          </div>
          {others.map((id) => {
            const p = workspace.panels[id];
            const name = `${order.indexOf(id) + 1}. ${p && "ref" in p ? p.ref : id}`;
            return (
              <div key={id} className={styles.row}>
                <span className={styles.name} title={name}>{name}</span>
                <span className={styles.places}>{ZONES.map(({ zone, icon, label }) => button(dropFor(id, zone), icon, `${label} ${name}`))}</span>
              </div>
            );
          })}
        </div>
      ) : null}
    </div>
  );
}
