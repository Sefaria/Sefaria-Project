import { useState } from "react";
import type { Placement } from "~/lib/layout/tree";
import { panelOrder } from "~/lib/workspace/ops";
import type { PanelId, Workspace } from "~/lib/workspace/types";
import { IconButton } from "~/ui/IconButton/IconButton";
import { Popover } from "~/ui/Popover/Popover";
import styles from "./ArrangeMenu.module.css";

const PLACES: { placement: Placement; arrow: string; label: string }[] = [
  { placement: "before", arrow: "←", label: "Left of" },
  { placement: "above", arrow: "↑", label: "Above" },
  { placement: "below", arrow: "↓", label: "Below" },
  { placement: "after", arrow: "→", label: "Right of" },
];

/** Moves this panel next to another one: beside it, or stacked above or below it. */
export function ArrangeMenu({ self, workspace, onMove }: { self: PanelId; workspace: Workspace; onMove: (target: PanelId, placement: Placement) => void }) {
  const [open, setOpen] = useState(false);
  const others = panelOrder(workspace).filter((id) => id !== self);
  return (
    <Popover open={open} onOpenChange={setOpen} label="Arrange panels" trigger={(p) => <IconButton {...p} icon="columns" label="Arrange panels" />}>
      <div className={styles.menu}>
        <p className={styles.title}>Move this text next to</p>
        {others.map((id) => {
          const p = workspace.panels[id];
          const name = p && "ref" in p ? p.ref : id;
          return (
            <div key={id} className={styles.row}>
              <span className={styles.name}>{name}</span>
              {PLACES.map(({ placement, arrow, label }) => (
                <button
                  key={placement}
                  type="button"
                  className={styles.place}
                  aria-label={`${label} ${name}`}
                  title={`${label} ${name}`}
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
