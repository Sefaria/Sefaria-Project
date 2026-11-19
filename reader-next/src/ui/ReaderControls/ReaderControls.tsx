import { forwardRef, type ButtonHTMLAttributes } from "react";
import { useInterfaceLang } from "~/lib/i18n/interface-lang";
import styles from "./ReaderControls.module.css";

/**
 * The text panel's bar buttons as the old ReaderControls drew them (VERIFIED on sefaria.org, 1280px, 2026-10-29): a 44px serif "×"
 * in a 40x56 box; the bookmark image (18px, flush to the end of a 30x56 box); the "A" image (17x16, `lang_icon_english.svg`, the
 * Hebrew interface's `lang_icon_hebrew.svg`) in a 40x56 box. No hover background — hovering the bookmark or the "A" fades in the
 * old white tooltip card with the button's name (`.tooltip-toggle::before`); the "×" has none.
 *
 * @feature SHL-074 In-panel text header (ReaderControls) @feature SHL-017 Display options dropdown
 */
type ButtonProps = Omit<ButtonHTMLAttributes<HTMLButtonElement>, "children"> & { label: string };

export function CloseTextButton({ label, className, ...rest }: ButtonProps) {
  return (
    <button type="button" {...rest} className={[styles.close, className].filter(Boolean).join(" ")} aria-label={label} title={label}>
      <span aria-hidden="true">×</span>
    </button>
  );
}

export function SaveTextButton({ label, saved, className, ...rest }: ButtonProps & { saved?: boolean }) {
  return (
    <button type="button" {...rest} className={[styles.save, styles.tooltip, className].filter(Boolean).join(" ")} aria-label={label} aria-pressed={saved} data-tooltip={label}>
      <img src={saved ? "/icons/bookmark-filled.svg" : "/icons/bookmark.svg"} alt="" width={18} height={18} />
    </button>
  );
}

/** The "Aa" menu's trigger; takes the Popover's trigger props. */
export const DisplayOptionsButton = forwardRef<HTMLButtonElement, ButtonProps>(function DisplayOptionsButton({ label, className, ...rest }, ref) {
  const he = useInterfaceLang() === "hebrew";
  return (
    <button ref={ref} type="button" {...rest} className={[styles.options, styles.tooltip, className].filter(Boolean).join(" ")} aria-label={label} data-tooltip={label} data-he={he || undefined}>
      <img src={he ? "/img/lang_icon_hebrew.svg" : "/img/lang_icon_english.svg"} alt="" />
    </button>
  );
});
