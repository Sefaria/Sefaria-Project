import { useEffect, useRef, type ReactNode } from 'react';
import { cx } from './cx';
import styles from './Dialog.module.css';

export type DialogPlacement = 'modal' | 'sheet';

interface DialogProps {
  /** Called when the user dismisses the dialog (Escape or backdrop click). */
  onClose: () => void;
  /** Id of the element that titles the dialog. */
  labelledBy: string;
  /**
   * `modal`: full screen below 640px, centred from 640px.
   * `sheet`: a bottom sheet at every width.
   */
  placement?: DialogPlacement;
  children: ReactNode;
}

let scrollLocks = 0;
function lockScroll() {
  if (scrollLocks++ === 0) document.body.classList.add('dp-scroll-locked');
}
function unlockScroll() {
  if (--scrollLocks === 0) document.body.classList.remove('dp-scroll-locked');
}

/**
 * A native <dialog> shown with showModal(): the browser supplies the focus
 * trap, Escape handling and top layer. Mount it to open it, unmount to close.
 * Focus returns to whatever had it before opening.
 */
export function Dialog({ onClose, labelledBy, placement = 'modal', children }: DialogProps) {
  const ref = useRef<HTMLDialogElement>(null);
  const onCloseRef = useRef(onClose);

  useEffect(() => {
    onCloseRef.current = onClose;
  });

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    const invoker = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    // close events are queued, so one from a previous close() (React strict mode
    // re-runs effects) can arrive after we've reopened; only react to a real close.
    const handleClose = () => {
      if (!dialog.open) onCloseRef.current();
    };
    // A click whose press and release both landed on the <dialog> itself (not on
    // its content) is a backdrop click. Escape and the close button are the keyboard paths.
    let pressedBackdrop = false;
    const handleDown = (e: MouseEvent) => {
      pressedBackdrop = e.target === dialog;
    };
    const handleClick = (e: MouseEvent) => {
      if (pressedBackdrop && e.target === dialog) onCloseRef.current();
      pressedBackdrop = false;
    };
    dialog.addEventListener('close', handleClose);
    dialog.addEventListener('mousedown', handleDown);
    dialog.addEventListener('click', handleClick);
    dialog.showModal();
    lockScroll();
    return () => {
      dialog.removeEventListener('close', handleClose);
      dialog.removeEventListener('mousedown', handleDown);
      dialog.removeEventListener('click', handleClick);
      if (dialog.open) dialog.close();
      unlockScroll();
      invoker?.focus();
    };
  }, []);

  return (
    <dialog ref={ref} className={cx(styles.dialog, styles[placement])} aria-labelledby={labelledBy}>
      {children}
    </dialog>
  );
}
