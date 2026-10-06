import type { ReactNode } from "react";
import styles from "./Divider.module.css";

/**
 * A horizontal rule. With a `label`, a rule with centred text (the auth page's "or" between the provider buttons and email,
 * ported from static/js/auth/Divider.jsx), announced as a separator.
 *
 * @feature ACC-008 Auth page with choose / email views
 */
export function Divider({ strong, label }: { strong?: boolean; label?: ReactNode }) {
  if (label !== undefined) {
    return (
      <div className={styles.labelled} role="separator" data-auth-divider="">
        {label}
      </div>
    );
  }
  return (
    <hr
      style={{
        border: 0,
        borderTop: `1px solid var(--sefaria-color-${strong ? "border-strong" : "border"})`,
        margin: "var(--sefaria-space-4) 0",
        width: "100%",
      }}
    />
  );
}
