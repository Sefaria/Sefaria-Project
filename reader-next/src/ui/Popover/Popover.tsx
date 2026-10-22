import { useEffect, useId, useRef, type ReactNode, type Ref } from "react";
import styles from "./Popover.module.css";

export interface PopoverTriggerProps {
  ref: Ref<HTMLElement & HTMLButtonElement>;
  "aria-expanded": boolean;
  "aria-haspopup": "dialog";
  "aria-controls": string;
  onClick: () => void;
}

export interface PopoverProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Renders the control that opens the popover. Spread the given props onto a button. */
  trigger: (props: PopoverTriggerProps) => ReactNode;
  /** Accessible name of the dialog. */
  label: string;
  align?: "start" | "end";
  /** No padding: the content brings its own (the display menu). */
  flush?: boolean;
  children: ReactNode;
}

const FOCUSABLE = 'a[href], button:not([aria-disabled="true"]), input, select, textarea, [tabindex]:not([tabindex="-1"])';

/**
 * A non-modal floating panel anchored to its trigger. Focus moves in when it opens (to the checked
 * option, else the first control) and returns to the trigger when it closes; Escape and clicking
 * outside close it. Use for interactive content; a Tooltip is for short, non-interactive hints.
 *
 * @feature SHL-017 Display options dropdown container
 */
export function Popover({ open, onOpenChange, trigger, label, align = "end", flush, children }: PopoverProps) {
  const id = useId();
  const rootRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<(HTMLElement & HTMLButtonElement) | null>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const wasOpen = useRef(false);

  useEffect(() => {
    if (open) {
      const panel = panelRef.current;
      const target = panel?.querySelector<HTMLElement>('[role="radio"][aria-checked="true"], [data-autofocus]') ?? panel?.querySelector<HTMLElement>(FOCUSABLE);
      target?.focus();
    } else if (wasOpen.current) {
      triggerRef.current?.focus();
    }
    wasOpen.current = open;
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onPointer = (e: PointerEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) onOpenChange(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.stopPropagation();
        onOpenChange(false);
      }
    };
    document.addEventListener("pointerdown", onPointer);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onPointer);
      document.removeEventListener("keydown", onKey);
    };
  }, [open, onOpenChange]);

  return (
    <div ref={rootRef} className={styles.root}>
      {trigger({
        ref: triggerRef,
        "aria-expanded": open,
        "aria-haspopup": "dialog",
        "aria-controls": id,
        onClick: () => onOpenChange(!open),
      })}
      {open ? (
        <div ref={panelRef} id={id} role="dialog" aria-label={label} className={`${styles.panel} ${align === "end" ? styles.end : styles.start} ${flush ? styles.flush : ""}`}>
          {children}
        </div>
      ) : null}
    </div>
  );
}
