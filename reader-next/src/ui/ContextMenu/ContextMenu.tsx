import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { Icon, type IconName } from "../Icon/Icon";
import styles from "./ContextMenu.module.css";

export interface ContextMenuItem {
  key: string;
  label: ReactNode;
  icon?: IconName;
  onSelect?: () => void;
  disabled?: boolean;
  /** A small control at the end of the row (e.g. a favourite star); it acts on its own. */
  trailing?: ReactNode;
}
export interface ContextMenuGroup {
  key: string;
  heading?: ReactNode;
  items: ContextMenuItem[];
}

export interface ContextMenuProps {
  /** Where the pointer was (viewport coordinates). */
  x: number;
  y: number;
  label: string;
  groups: ContextMenuGroup[];
  onClose: () => void;
}

/**
 * A menu at the pointer, for right-click / long-press. Arrow keys move between items, Escape, a click outside, scrolling or
 * resizing close it. Kept inside the viewport.
 */
export function ContextMenu({ x, y, label, groups, onClose }: ContextMenuProps) {
  const ref = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState({ left: x, top: y });

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const { width, height } = el.getBoundingClientRect();
    setPos({ left: Math.max(4, Math.min(x, window.innerWidth - width - 4)), top: Math.max(4, Math.min(y, window.innerHeight - height - 4)) });
    el.querySelector<HTMLElement>('[role="menuitem"]:not([aria-disabled="true"])')?.focus();
  }, [x, y]);

  useEffect(() => {
    const away = (e: Event) => {
      if (!ref.current?.contains(e.target as Node)) onClose();
    };
    const close = () => onClose();
    // A scroll still settling when the menu opened (momentum, place keeping) must not close it.
    const opened = performance.now();
    const scrolled = (e: Event) => {
      if (performance.now() - opened > 400 && !ref.current?.contains(e.target as Node)) onClose();
    };
    document.addEventListener("pointerdown", away, true);
    document.addEventListener("scroll", scrolled, true);
    window.addEventListener("resize", close);
    window.addEventListener("blur", close);
    return () => {
      document.removeEventListener("pointerdown", away, true);
      document.removeEventListener("scroll", scrolled, true);
      window.removeEventListener("resize", close);
      window.removeEventListener("blur", close);
    };
  }, [onClose]);

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Escape") {
      e.preventDefault();
      e.stopPropagation();
      onClose();
      return;
    }
    if (e.key !== "ArrowDown" && e.key !== "ArrowUp") return;
    e.preventDefault();
    const items = [...(ref.current?.querySelectorAll<HTMLElement>('[role="menuitem"]:not([aria-disabled="true"])') ?? [])];
    const i = items.indexOf(document.activeElement as HTMLElement);
    items[(i + (e.key === "ArrowDown" ? 1 : items.length - 1)) % items.length]?.focus();
  };

  if (typeof document === "undefined") return null;
  return createPortal(
    <div ref={ref} className={styles.menu} role="menu" aria-label={label} style={pos} onKeyDown={onKeyDown} onContextMenu={(e) => e.preventDefault()}>
      {groups
        .filter((g) => g.items.length)
        .map((g) => (
          <div key={g.key} className={styles.group} role="group" aria-label={typeof g.heading === "string" ? g.heading : undefined}>
            {g.heading ? <div className={styles.heading}>{g.heading}</div> : null}
            {g.items.map((item) => (
              <div key={item.key} className={styles.row}>
                <button
                  type="button"
                  role="menuitem"
                  className={styles.item}
                  aria-disabled={item.disabled ? "true" : undefined}
                  tabIndex={-1}
                  onClick={() => {
                    if (item.disabled) return;
                    onClose();
                    item.onSelect?.();
                  }}
                >
                  {item.icon ? <Icon name={item.icon} size="16px" className={styles.icon} /> : null}
                  <span className={styles.label}>{item.label}</span>
                </button>
                {item.trailing}
              </div>
            ))}
          </div>
        ))}
    </div>,
    document.body,
  );
}
