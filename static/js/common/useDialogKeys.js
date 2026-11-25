import { useEffect } from 'react';

const FOCUSABLE =
  'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

/* A modal dialog's keys: the given element takes focus when the dialog opens and focus returns to where it was on
   close, Tab stays inside the dialog, and Escape closes it. */
export const useDialogKeys = (focusRef, onEscape) => {
  useEffect(() => {
    const opener = typeof document !== 'undefined' ? document.activeElement : null;
    if (focusRef.current) {
      focusRef.current.focus();
    }
    const onKeyDown = (e) => {
      if (e.key === 'Escape') {
        onEscape();
        return;
      }
      if (e.key !== 'Tab' || !focusRef.current) {
        return;
      }
      const dialog = focusRef.current.closest('[role="dialog"], [role="alertdialog"]');
      const focusable = dialog ? Array.from(dialog.querySelectorAll(FOCUSABLE)) : [];
      if (!focusable.length) {
        return;
      }
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (!dialog.contains(document.activeElement)) {
        e.preventDefault();
        first.focus();
      } else if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    };
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('keydown', onKeyDown);
      if (opener && opener.isConnected && typeof opener.focus === 'function') {
        opener.focus();
      }
    };
  }, []);
};
