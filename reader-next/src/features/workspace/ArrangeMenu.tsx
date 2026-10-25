import { useState } from "react";
import { move as moveLeaf, sameShape, type Placement } from "~/lib/layout/tree";
import { useInterfaceLang } from "~/lib/i18n/interface-lang";
import { panelOrder } from "~/lib/workspace/ops";
import type { PanelId, Workspace } from "~/lib/workspace/types";
import { IconButton } from "~/ui/IconButton/IconButton";
import { Popover } from "~/ui/Popover/Popover";
import styles from "./ArrangeMenu.module.css";

/** "before" is to the left in a left-to-right interface and to the right in a right-to-left one (rows follow the interface). */
const places = (rtl: boolean): { placement: Placement; arrow: string; label: string }[] => [
  { placement: rtl ? "after" : "before", arrow: "←", label: "Left of" },
  { placement: "above", arrow: "↑", label: "Above" },
  { placement: "below", arrow: "↓", label: "Below" },
  { placement: rtl ? "before" : "after", arrow: "→", label: "Right of" },
];

/**
 * Moves this panel next to another one: beside it, or stacked above or below it. Others are listed in reading order with their
 * position (two panels may show the same text), and a move that would change nothing is disabled.
 */
export function ArrangeMenu({ self, workspace, onMove }: { self: PanelId; workspace: Workspace; onMove: (target: PanelId, placement: Placement) => void }) {
  const [open, setOpen] = useState(false);
  const rtl = useInterfaceLang() === "hebrew";
  const order = panelOrder(workspace);
  const others = order.filter((id) => id !== self);
  const layout = workspace.layout;
  return (
    <Popover open={open} onOpenChange={setOpen} label="Arrange panels" trigger={(p) => <IconButton {...p} icon="columns" label="Arrange panels" />}>
      <div className={styles.menu}>
        <p className={styles.title}>Move this text next to</p>
        {others.map((id) => {
          const p = workspace.panels[id];
          const name = `${order.indexOf(id) + 1}. ${p && "ref" in p ? p.ref : id}`;
          return (
            <div key={id} className={styles.row}>
              <span className={styles.name} title={name}>{name}</span>
              {places(rtl).map(({ placement, arrow, label }) => (
                <button
                  key={placement}
                  type="button"
                  className={styles.place}
                  aria-label={`${label} ${name}`}
                  title={`${label} ${name}`}
                  disabled={!layout || sameShape(moveLeaf(layout, self, id, placement), layout)}
                  onClick={() => {
                    setOpen(false);
                    onMove(id, placement);
                  }}
                >
                  {arrow}
                </button>
              ))}
            </div>
          );
        })}
      </div>
    </Popover>
  );
}
