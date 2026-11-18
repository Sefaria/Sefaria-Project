// The sidebar's names (contract C6 "Sidebar", live's strings `common.sidebar.*`) and its keyboard shortcut.
export const SIDEBAR_LABEL = 'Secondary navigation';
export const FILTER_LABEL = 'Filter pages';
export const NO_MATCHES = 'No matching pages';
export const HIDE_SIDEBAR_LABEL = 'Hide sidebar navigation';
export const SHOW_SIDEBAR_LABEL = 'Show sidebar navigation';

/** Below this width the sidebar is the sub-nav panel (C5 breakpoint 768). */
export const MOBILE_QUERY = '(width <= 768px)';

/** Cmd-/ or Ctrl-/, without Shift or Alt (live's `aria-keyshortcuts="Control+/ Meta+/"`). */
export function isFilterShortcut(event: {
  key: string;
  metaKey: boolean;
  ctrlKey: boolean;
  shiftKey: boolean;
  altKey: boolean;
}): boolean {
  return (event.metaKey || event.ctrlKey) && !event.shiftKey && !event.altKey && event.key === '/';
}
