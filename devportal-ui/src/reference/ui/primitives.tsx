// Small building blocks of the reference UI: Markdown, copy button, status dot, method badge, dropdown menu.
import {
  useCallback,
  useEffect,
  useId,
  useLayoutEffect,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
  type ReactNode,
} from 'react';
import type { HttpMethod } from '../../contracts';
import { statusFamily } from '../model/responses';
import { renderMarkdown } from './markdown';
import { Icon } from './icons';
import styles from './primitives.module.css';

export function Markdown({
  source,
  className,
  id,
  visual,
}: {
  source: string;
  className?: string;
  id?: string;
  /** `data-visual` key for the pixel-parity harness. */
  visual?: string;
}) {
  if (source.trim() === '') return null;
  return (
    <div
      id={id}
      data-visual={visual}
      className={[styles.markdown, className].filter(Boolean).join(' ')}
      // markdown-it with html disabled escapes every tag in the source.
      dangerouslySetInnerHTML={{ __html: renderMarkdown(source) }}
    />
  );
}

async function writeClipboard(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}

/** A button that copies `text` and shows "Copied!" for a moment (live's CopyToClipboard). */
export function CopyButton({
  text,
  className,
  label = 'Copy to clipboard',
  children,
  visual,
}: {
  text: string | (() => string);
  className?: string;
  label?: string;
  children?: ReactNode;
  /** `data-visual` key for the pixel-parity harness. */
  visual?: string;
}) {
  const [copied, setCopied] = useState(false);
  useEffect(() => {
    if (!copied) return undefined;
    const timer = window.setTimeout(() => setCopied(false), 1500);
    return () => window.clearTimeout(timer);
  }, [copied]);
  return (
    <button
      type="button"
      data-visual={visual}
      className={[styles.copyButton, className].filter(Boolean).join(' ')}
      aria-label={children === undefined ? label : undefined}
      onClick={() => {
        void writeClipboard(typeof text === 'function' ? text() : text).then(setCopied);
      }}
    >
      {children ?? <Icon name="copy" className={styles.copyIcon} />}
      {copied ? (
        <span className={styles.tooltip} role="status">
          Copied!
        </span>
      ) : null}
    </button>
  );
}

/** The colored status dot (live's `HTTPStatus-chit`), with the status code as its text alternative. */
export function StatusDot({
  status,
  className,
  visual,
}: {
  status: string | number;
  className?: string;
  visual?: string;
}) {
  return (
    <span
      data-visual={visual}
      role="img"
      aria-label={String(status)}
      className={[styles.statusDot, styles[`status${statusFamily(status)}`], className].filter(Boolean).join(' ')}
    />
  );
}

export function MethodBadge({
  method,
  className,
  visual,
}: {
  method: HttpMethod;
  className?: string;
  visual?: string;
}) {
  return (
    <span
      className={[styles.method, styles[method], className].filter(Boolean).join(' ')}
      data-testid="http-method"
      data-visual={visual}
    >
      {method}
    </span>
  );
}

export interface DropdownProps {
  /** Renders the trigger; spread `props` on the button. */
  trigger: (props: {
    id: string;
    'aria-expanded': boolean;
    'aria-haspopup': 'menu' | 'dialog';
    'aria-controls': string;
    onClick: () => void;
    onKeyDown: (event: ReactKeyboardEvent<HTMLButtonElement>) => void;
  }) => ReactNode;
  children: (close: () => void) => ReactNode;
  align?: 'start' | 'end';
  popup?: 'menu' | 'dialog';
  className?: string;
  panelClassName?: string;
  /** Extra class on the panel's transparent frame (its position). */
  frameClassName?: string;
  /** Accessible name of the panel. */
  label?: string;
  /**
   * Snap the panel to whole pixels, as live's tippy/popper menus are (More Languages, the tags popover). A trigger
   * centred in an odd-height row otherwise leaves the panel half a pixel off, blurring every line of it.
   */
  wholePixels?: boolean;
}

/**
 * A trigger with a floating panel below it, as live's Dropdown: closes on Escape (returning focus to the
 * trigger), on a click outside, and after an item is chosen. Arrow keys move between `role="menuitem"` items.
 * Elements are found by id in effects and handlers, so nothing reads a ref during render.
 */
export function Dropdown({
  trigger,
  children,
  align = 'start',
  popup = 'menu',
  className,
  panelClassName,
  frameClassName,
  label,
  wholePixels = false,
}: DropdownProps) {
  const [open, setOpen] = useState(false);
  const baseId = useId();
  const rootId = `${baseId}root`;
  const frameId = `${baseId}frame`;
  const triggerId = `${baseId}trigger`;
  const panelId = `${baseId}panel`;
  const close = useCallback(() => {
    setOpen(false);
    document.getElementById(triggerId)?.focus();
  }, [triggerId]);
  useEffect(() => {
    if (!open) return undefined;
    const onDown = (event: MouseEvent) => {
      const root = document.getElementById(rootId);
      if (root !== null && !root.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onDown);
    const first = document
      .getElementById(panelId)
      ?.querySelector<HTMLElement>('[role="menuitem"], button, input, select, textarea');
    first?.focus();
    return () => document.removeEventListener('mousedown', onDown);
  }, [open, rootId, panelId]);
  // `wholePixels`: More Languages opens at 157.5 against live's 157 without it.
  useLayoutEffect(() => {
    const frame = document.getElementById(frameId);
    if (!open || !wholePixels || frame === null) return;
    // A margin, not a transform: the panel must be laid out on the whole pixel, or its border and text still paint
    // across two rows.
    frame.style.margin = '';
    const box = frame.getBoundingClientRect();
    // Halves round down: live's trigger sits a quarter pixel higher than ours (133.25 against 133.5), so its menu
    // rounds to the whole pixel above.
    const whole = (v: number) => Math.ceil(v - 0.5);
    const dx = whole(box.left) - box.left;
    const dy = whole(box.top) - box.top;
    if (dx !== 0 || dy !== 0) frame.style.margin = `${dy}px ${-dx}px 0 ${dx}px`;
  }, [open, wholePixels, frameId]);
  const onPanelKeyDown = (event: ReactKeyboardEvent<HTMLDivElement>) => {
    if (event.key === 'Escape') {
      event.stopPropagation();
      close();
      return;
    }
    if (event.key !== 'ArrowDown' && event.key !== 'ArrowUp') return;
    const items = Array.from(event.currentTarget.querySelectorAll<HTMLElement>('[role="menuitem"]'));
    if (items.length === 0) return;
    event.preventDefault();
    const index = items.indexOf(document.activeElement as HTMLElement);
    const next = event.key === 'ArrowDown' ? index + 1 : index - 1;
    items[(next + items.length) % items.length]?.focus();
  };
  return (
    <div id={rootId} className={[styles.dropdown, className].filter(Boolean).join(' ')}>
      {trigger({
        id: triggerId,
        'aria-expanded': open,
        'aria-haspopup': popup,
        'aria-controls': panelId,
        onClick: () => setOpen((o) => !o),
        onKeyDown: (event) => {
          if (event.key === 'Escape' && open) {
            event.stopPropagation();
            setOpen(false);
          }
        },
      })}
      {open ? (
        <div
          id={frameId}
          className={[styles.panelFrame, align === 'end' ? styles.alignEnd : styles.alignStart, frameClassName]
            .filter(Boolean)
            .join(' ')}
          data-visual-region="popover"
        >
          <div
            id={panelId}
            role={popup === 'menu' ? 'menu' : 'dialog'}
            aria-label={label}
            tabIndex={-1}
            onKeyDown={onPanelKeyDown}
            className={[styles.panel, panelClassName].filter(Boolean).join(' ')}
          >
            {children(close)}
          </div>
        </div>
      ) : null}
    </div>
  );
}

export function MenuItem({
  children,
  onSelect,
  active = false,
  icon,
}: {
  children: ReactNode;
  onSelect: () => void;
  active?: boolean;
  icon?: ReactNode;
}) {
  return (
    <button
      type="button"
      role="menuitem"
      className={[styles.menuItem, active ? styles.menuItemActive : ''].filter(Boolean).join(' ')}
      onClick={onSelect}
    >
      {icon !== undefined ? <span className={styles.menuItemIcon}>{icon}</span> : null}
      <span className={styles.menuItemLabel}>{children}</span>
      {active ? <Icon name="check" className={styles.menuItemCheck} /> : null}
    </button>
  );
}

export function MenuHeader({ children }: { children: ReactNode }) {
  return (
    <div className={styles.menuHeader} role="presentation">
      {children}
    </div>
  );
}
