import type { ReactNode } from "react";
import { InterfaceText } from "../InterfaceText/InterfaceText";
import styles from "./AdminButtons.module.css";

/** A library page's moderator tools: buttons beside the title, and the editor that replaces the page while open. */
export interface PageAdmin {
  buttons: { en: string; he: string; onClick: () => void }[];
  editor?: ReactNode;
}

/**
 * The old CategoryHeader's admin buttons ("Add sub-category", "Edit", "Reorder", …), shown only to moderators.
 *
 * @feature LIB-002 Library home header and edit buttons
 */
export function AdminButtons({ buttons }: { buttons: PageAdmin["buttons"] }) {
  return (
    <div className={styles.buttons} role="group" aria-label="Admin">
      {buttons.map((b) => (
        <button key={b.en} type="button" className={styles.button} onClick={b.onClick}>
          <InterfaceText en={b.en} he={b.he} />
        </button>
      ))}
    </div>
  );
}
