import { useEffect, useRef, useState, type RefObject } from "react";
import { Icon } from "../Icon/Icon";
import { VirtualKeyboard } from "./VirtualKeyboard";
import styles from "./KeyboardLauncher.module.css";

export interface KeyboardLauncherProps {
  /** The text box the keys type into. */
  inputRef: RefObject<HTMLInputElement | null>;
  value: string;
  onChange: (value: string) => void;
  /** The Enter key. */
  onEnter: () => void;
  /** The box has focus: the launcher shows (it stays while the keyboard is open). */
  focused: boolean;
}

/**
 * The little keyboard icon at the end of a search box and the Hebrew keyboard it opens beneath. Keys type at the caret; the
 * box never loses focus to the keyboard. English interface only (the caller decides). SRC-017
 */
export function KeyboardLauncher({ inputRef, value, onChange, onEnter, focused }: KeyboardLauncherProps) {
  const [open, setOpen] = useState(false);
  const box = useRef<HTMLSpanElement>(null);
  const caret = useRef<number | null>(null);
  useEffect(() => {
    if (!open) return;
    const off = (e: PointerEvent) => !box.current?.contains(e.target as Node) && !inputRef.current?.contains(e.target as Node) && setOpen(false);
    const key = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("pointerdown", off);
    document.addEventListener("keydown", key);
    return () => { document.removeEventListener("pointerdown", off); document.removeEventListener("keydown", key); };
  }, [open, inputRef]);
  // put the caret back after the typed text once React has written the new value
  useEffect(() => {
    const el = inputRef.current;
    if (el && caret.current !== null) { el.setSelectionRange(caret.current, caret.current); caret.current = null; }
  }, [value, inputRef]);
  const edit = (insert: string, back = false) => {
    const el = inputRef.current;
    const a = el?.selectionStart ?? value.length, b = el?.selectionEnd ?? value.length;
    const start = back && a === b ? Math.max(0, a - 1) : a;
    if (el) el.focus();
    caret.current = start + insert.length;
    onChange(value.slice(0, start) + insert + value.slice(b));
  };
  if (!focused && !open) return null;
  return (
    <span ref={box} className={styles.wrap}>
      <button type="button" className={styles.launcher} aria-label="Hebrew keyboard" aria-expanded={open} onMouseDown={(e) => e.preventDefault()} onClick={() => setOpen((o) => !o)}>
        <Icon name="keyboard" size="1.2em" />
      </button>
      {open ? (
        <span className={styles.pop} onMouseDown={(e) => e.preventDefault()}>
          <VirtualKeyboard onType={(t) => edit(t)} onControl={(k) => (k === "Bksp" ? edit("", true) : k === "Enter" ? onEnter() : edit("\t"))} />
        </span>
      ) : null}
    </span>
  );
}
