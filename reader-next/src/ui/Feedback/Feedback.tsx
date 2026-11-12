import type { ReactNode } from "react";
import { InterfaceText } from "../InterfaceText/InterfaceText";
import { Spinner } from "../Spinner/Spinner";
import styles from "./Feedback.module.css";

export function LoadingState({ children }: { children?: ReactNode }) {
  return (
    <div className={styles.state}>
      <Spinner />
      {children ?? <p className={styles.body}><InterfaceText en="Loading…" he="טוען…" /></p>}
    </div>
  );
}

export interface StateProps {
  title: ReactNode;
  children?: ReactNode;
  action?: ReactNode;
}

/** Nothing to show (no connections, no results, no saved items). Replaces ad-hoc "emptyMessage" blocks. */
export function EmptyState({ title, children, action }: StateProps) {
  return (
    <div className={styles.state}>
      <h3 className={styles.title}>{title}</h3>
      {children ? <p className={styles.body}>{children}</p> : null}
      {action}
    </div>
  );
}

/** Something failed and the user can act on it. Announced to assistive tech. */
export function ErrorState({ title, children, action }: StateProps) {
  return (
    <div className={`${styles.state} ${styles.error}`} role="alert">
      <h3 className={styles.title}>{title}</h3>
      {children ? <p className={styles.body}>{children}</p> : null}
      {action}
    </div>
  );
}
