import { useId, type ReactNode } from "react";
import styles from "./Switch.module.css";

export interface SwitchProps {
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
  label: ReactNode;
  description?: ReactNode;
  disabled?: boolean;
  /** Shown as the description while disabled, so the user learns what to change (e.g. "Turn on vowels first"). */
  disabledReason?: ReactNode;
}

/** A labelled on/off setting. The whole row is the control. Replaces ToggleSwitch and ToggleSwitchLine. */
export function Switch({ checked, onCheckedChange, label, description, disabled, disabledReason }: SwitchProps) {
  const descId = useId();
  const desc = disabled && disabledReason ? disabledReason : description;
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-disabled={disabled || undefined}
      aria-describedby={desc ? descId : undefined}
      className={styles.row}
      onClick={() => !disabled && onCheckedChange(!checked)}
    >
      <span className={styles.text}>
        <span>{label}</span>
        {desc ? <span id={descId} className={styles.description}>{desc}</span> : null}
      </span>
      <span className={styles.track} aria-hidden="true"><span className={styles.thumb} /></span>
    </button>
  );
}
