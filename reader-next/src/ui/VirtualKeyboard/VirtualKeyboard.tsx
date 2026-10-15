import { useState } from "react";
import { HEBREW_ROWS, isControl, keyFace, type ControlKey } from "~/lib/keyboard/hebrew";
import styles from "./VirtualKeyboard.module.css";

export interface VirtualKeyboardProps {
  /** A character key pressed. */
  onType: (text: string) => void;
  /** Backspace, Enter, Tab. */
  onControl: (key: "Bksp" | "Enter" | "Tab") => void;
}

/**
 * The on-screen Hebrew keyboard: the old site's (Shift and Caps for the second faces, Alt-Gr for the few third ones), as buttons
 * that never take focus from the text box they type into. Shift and Alt-Gr apply to the next key only; Caps stays on.
 *
 * @feature SRC-017 Virtual Hebrew keyboard in search box
 */
export function VirtualKeyboard({ onType, onControl }: VirtualKeyboardProps) {
  const [shift, setShift] = useState(false);
  const [caps, setCaps] = useState(false);
  const [altGr, setAltGr] = useState(false);
  const m = { shift, caps, altGr };
  const press = (face: string) => {
    if (isControl(face)) {
      const k = face as ControlKey;
      if (k === "Shift") setShift((s) => !s);
      else if (k === "Caps") setCaps((c) => !c);
      else if (k === "AltGr") setAltGr((a) => !a);
      else onControl(k);
      return;
    }
    onType(face);
    setShift(false);
    setAltGr(false);
  };
  return (
    <div className={styles.kb} role="group" aria-label="Hebrew keyboard" dir="ltr" lang="he">
      {HEBREW_ROWS.map((row, r) => (
        <div key={r} className={styles.row}>
          {row.map((key, i) => {
            const face = keyFace(key, m);
            const control = isControl(key[0]);
            const on = (face === "Shift" && shift) || (face === "Caps" && caps) || (face === "AltGr" && altGr);
            return (
              <button
                key={`${r}-${i}`}
                type="button"
                className={styles.key}
                data-control={control || undefined}
                data-wide={control || face === " " || undefined}
                data-space={face === " " || undefined}
                aria-pressed={control && ["Shift", "Caps", "AltGr"].includes(face) ? on : undefined}
                aria-label={face === " " ? "Space" : undefined}
                // the text box keeps focus (and its caret)
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => press(face)}
              >
                {face === " " ? "" : face}
              </button>
            );
          })}
        </div>
      ))}
    </div>
  );
}
