import { useSyncExternalStore } from "react";

/**
 * Whether the phone's navigation menu is open. The menu button lives in the site header on library pages and in the text
 * panel's header while reading (the site header is hidden then, as on sefaria.org); both drive this one switch. SHL-062
 */
let open = false;
const listeners = new Set<() => void>();
export function setMobileMenuOpen(next: boolean) {
  if (open === next) return;
  open = next;
  listeners.forEach((l) => l());
}
export const useMobileMenuOpen = () =>
  useSyncExternalStore((cb) => { listeners.add(cb); return () => listeners.delete(cb); }, () => open, () => false);
