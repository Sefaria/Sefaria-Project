import { useRef, type KeyboardEvent, type ReactNode } from "react";
import { dirOf, useInterfaceLang } from "~/lib/i18n/interface-lang";
import { Icon, type IconName } from "../Icon/Icon";
import styles from "./SegmentedControl.module.css";

export interface SegmentedOption<T extends string> {
  value: T;
  /** Visible text; for `iconOnly` it becomes the accessible name and tooltip. */
  label: ReactNode;
  /** Plain-text name, required when `label` is not a string and the option is icon-only. */
  ariaLabel?: string;
  icon?: IconName;
  disabled?: boolean;
}

export interface SegmentedControlProps<T extends string> {
  value: T;
  onValueChange: (value: T) => void;
  options: readonly SegmentedOption<T>[];
  /** Accessible name of the group (e.g. "Language"). Required. */
  label: string;
  iconOnly?: boolean;
  block?: boolean;
  /** "segmented" (default): joined buttons. "rows": full-width rows with a radio circle at the end (the display menu's language choice). "tiles": loose icon tiles (its layout choice). */
  appearance?: "segmented" | "rows" | "tiles";
}

/**
 * Single choice among a few visible options, as a radio group. Arrow keys move and select (reversed in
 * right-to-left interfaces). The one segmented control: replaces ToggleSet, LayoutButtons,
 * SourceTranslationsButtons, SearchToggle, TabbedToggleSet, SubCategoryToggle and the language radios.
 *
 * @feature SHL-018 Source / Translation / Both language toggle
 * @feature SHL-021 Layout buttons by language-direction state
 */
export function SegmentedControl<T extends string>({ value, onValueChange, options, label, iconOnly, block, appearance = "segmented" }: SegmentedControlProps<T>) {
  const rtl = dirOf(useInterfaceLang()) === "rtl";
  const refs = useRef<(HTMLButtonElement | null)[]>([]);

  const move = (from: number, step: 1 | -1) => {
    const n = options.length;
    for (let i = 1; i <= n; i++) {
      const idx = (from + step * i + n * i) % n;
      if (!options[idx]!.disabled) {
        refs.current[idx]?.focus();
        onValueChange(options[idx]!.value);
        return;
      }
    }
  };
  const onKeyDown = (e: KeyboardEvent, index: number) => {
    const forward = rtl ? "ArrowLeft" : "ArrowRight";
    const backward = rtl ? "ArrowRight" : "ArrowLeft";
    if (e.key === forward || e.key === "ArrowDown") (e.preventDefault(), move(index, 1));
    else if (e.key === backward || e.key === "ArrowUp") (e.preventDefault(), move(index, -1));
  };

  const checkedIndex = Math.max(0, options.findIndex((o) => o.value === value));
  return (
    <div role="radiogroup" aria-label={label} className={`${styles.group} ${block ? styles.block : ""} ${appearance === "rows" ? styles.rows : appearance === "tiles" ? styles.tiles : ""}`}>
      {options.map((o, i) => {
        const text = o.ariaLabel ?? (typeof o.label === "string" ? o.label : undefined);
        return (
          <button
            key={o.value}
            ref={(el) => void (refs.current[i] = el)}
            type="button"
            role="radio"
            aria-checked={o.value === value}
            aria-disabled={o.disabled || undefined}
            aria-label={iconOnly ? text : undefined}
            title={iconOnly ? text : undefined}
            tabIndex={i === checkedIndex ? 0 : -1}
            className={`${styles.option} ${iconOnly ? styles.iconOnly : ""}`}
            onClick={() => !o.disabled && onValueChange(o.value)}
            onKeyDown={(e) => onKeyDown(e, i)}
          >
            {o.icon ? <Icon name={o.icon} size="1.4em" /> : null}
            {iconOnly ? null : <span className={styles.text}>{o.label}</span>}
            {appearance === "rows" ? <span className={styles.radio} aria-hidden="true">{o.value === value ? <Icon name="check" size="12px" /> : null}</span> : null}
          </button>
        );
      })}
    </div>
  );
}
