// How the rest of the portal opens search: the header's SearchToggle calls `openSearch()` (or dispatches
// the event itself); Cmd-K on macOS and Ctrl-K elsewhere open it from anywhere.

/** Window event that opens the search modal. */
export const OPEN_SEARCH_EVENT = 'dp:open-search';

export function openSearch(target: Window = window): void {
  target.dispatchEvent(new Event(OPEN_SEARCH_EVENT));
}

/** Cmd-K or Ctrl-K, without Shift or Alt. */
export function isSearchShortcut(event: KeyboardEvent): boolean {
  return (event.metaKey || event.ctrlKey) && !event.shiftKey && !event.altKey && event.key.toLowerCase() === 'k';
}
