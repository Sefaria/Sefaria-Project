/**
 * Which history entry the document was loaded at. Some old pages wrote a different address after a full page load than after
 * arriving inside the app (a topic page writes `?sort=Relevance&…` only when the server rendered it), so a page asks whether it
 * is showing the entry the browser loaded.
 *
 * The entry is known by the router's history index, not its key: replacing the address (as the topic page does once its tabs exist)
 * gives the entry a new key but keeps its index. Entries before it belong to earlier documents, and a new entry pushed after going
 * Back to it gets the next index.
 */
let loadIndex: number | undefined;

const indexOf = (state: unknown): number | undefined => {
  const i = (state as { __TSR_index?: unknown } | undefined)?.__TSR_index;
  return typeof i === "number" ? i : undefined;
};

/** Called once, while the app first renders in the browser, with the browser history's state at that moment (the router's own location is still the server's while hydrating). */
export function markLoadEntry(state: unknown): void {
  if (typeof window === "undefined" || loadIndex !== undefined) return;
  loadIndex = indexOf(state) ?? 0;
}

/** Whether this location's history entry is the one the document was loaded at. */
export const isLoadEntry = (state: unknown): boolean => loadIndex !== undefined && (indexOf(state) ?? 0) === loadIndex;
