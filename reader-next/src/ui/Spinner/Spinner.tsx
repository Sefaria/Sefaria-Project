import { InterfaceText } from "../InterfaceText/InterfaceText";
import { VisuallyHidden } from "../VisuallyHidden/VisuallyHidden";
import styles from "./Spinner.module.css";

export interface SpinnerProps {
  /** CSS length. Default 1.5rem. */
  size?: string;
  /**
   * Accessible text. Default is a bilingual "Loading". Pass `""` for a purely decorative spinner
   * (e.g. inside a button that already announces busy).
   */
  label?: string;
}

/** Indeterminate progress. Replaces the old LoadingRing / loadingMessage spinners. */
export function Spinner({ size = "1.5rem", label }: SpinnerProps) {
  const decorative = label === "";
  return (
    <span role={decorative ? undefined : "status"} style={{ display: "inline-flex" }}>
      <span className={styles.spinner} style={{ ["--_size" as string]: size }} aria-hidden="true" />
      {decorative ? null : (
        <VisuallyHidden>{label ?? <InterfaceText en="Loading" he="טוען" />}</VisuallyHidden>
      )}
    </span>
  );
}
