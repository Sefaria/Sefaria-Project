import { useEffect, useRef, type ReactNode } from "react";
import { useInterfaceLang } from "~/lib/i18n/interface-lang";
import { IconButton } from "../IconButton/IconButton";
import styles from "./Modal.module.css";

export interface ModalProps {
  open: boolean;
  onClose: () => void;
  /** Accessible name of the dialog. */
  label: string;
  children: ReactNode;
}

/**
 * A modal dialog on the native `<dialog>`: focus moves in and is kept there, the page behind is inert, Escape and a click
 * on the backdrop close it, and focus returns to what opened it. Replaces the old client's interrupting-message boxes
 * and SignUpModal shell (div overlay with a "×" role=button).
 *
 * @feature GUI-004 Sign-up modal for anonymous users
 */
export function Modal({ open, onClose, label, children }: ModalProps) {
  const ref = useRef<HTMLDialogElement>(null);
  const hebrew = useInterfaceLang() === "hebrew";
  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (open && !d.open) (d.showModal ? d.showModal() : d.setAttribute("open", ""));
    if (!open && d.open) (d.close ? d.close() : d.removeAttribute("open"));
  }, [open]);
  return (
    <dialog
      ref={ref}
      className={styles.dialog}
      aria-label={label}
      dir={hebrew ? "rtl" : "ltr"}
      onClose={onClose}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose(); // the backdrop
      }}
    >
      {open ? (
        <>
          <div className={styles.close}><IconButton icon="close" label={hebrew ? "סגירה" : "Close"} onClick={onClose} /></div>
          <div className={styles.body}>{children}</div>
        </>
      ) : null}
    </dialog>
  );
}
