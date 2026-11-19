import { useId, useState, type ReactNode } from "react";
import styles from "./Tooltip.module.css";

export interface TooltipTriggerProps {
  /** Spread onto the trigger. The tooltip names it (`labels`) or describes it. */
  "aria-labelledby"?: string;
  "aria-describedby"?: string;
}

export interface TooltipProps {
  /** Short, plain text. Anything with links or controls belongs in a Popover. */
  content: string;
  /** Renders the control the tooltip belongs to. It must be focusable. */
  children: (props: TooltipTriggerProps) => ReactNode;
  /** Which side of the trigger: `start` (the old three-dots placement) or `below` (the old default). */
  side?: "start" | "below";
  /** The tooltip is the trigger's accessible name (icon-only triggers) instead of its description. */
  labels?: boolean;
}

/**
 * A short hint shown on hover and on keyboard focus, drawn as the old white card (13px Roboto, 10px
 * padding, radius 5, light shadow, fading in). Escape hides it until the pointer or focus leaves. The
 * old `ToolTipped` (a `role=button` div whose `::before` printed its `aria-label`).
 *
 * @feature CON-046 Topics for this ref
 * @feature CON-045 Named entity popup in sidebar
 */
export function Tooltip({ content, children, side = "below", labels }: TooltipProps) {
  const id = useId();
  const [dismissed, setDismissed] = useState(false);
  return (
    <span
      className={styles.root}
      data-dismissed={dismissed || undefined}
      onKeyDown={(e) => {
        if (e.key === "Escape" && !dismissed) {
          e.stopPropagation();
          setDismissed(true);
        }
      }}
      onPointerLeave={() => setDismissed(false)}
      onBlur={() => setDismissed(false)}
    >
      {children(labels ? { "aria-labelledby": id } : { "aria-describedby": id })}
      <span id={id} role="tooltip" className={`${styles.tip} ${styles[side]}`}>{content}</span>
    </span>
  );
}
