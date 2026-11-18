// Adopting server-rendered HTML (PLAN §2.5, "How the browser takes over"). The server marks each region
// whose HTML the browser keeps with `data-dp-adopt="<key>"` (for example the docs body). Before React
// replaces #dp-root, `collectServerNodes` moves those regions' child nodes out of the document into
// fragments; `AdoptedHtml` later moves them into its own element instead of re-parsing a string, so
// images do not reload.

/** The attribute the server puts on an adoptable region; its value is the region's key. */
export const ADOPT_ATTRIBUTE = 'data-dp-adopt';

const adopted = new Map<string, DocumentFragment>();

/** Moves the child nodes of every `[data-dp-adopt]` element under `root` into the registry. */
export function collectServerNodes(root: ParentNode): void {
  for (const element of root.querySelectorAll(`[${ADOPT_ATTRIBUTE}]`)) {
    const key = element.getAttribute(ADOPT_ATTRIBUTE);
    if (!key || adopted.has(key)) continue;
    const fragment = element.ownerDocument.createDocumentFragment();
    fragment.append(...element.childNodes);
    adopted.set(key, fragment);
  }
}

/** Returns the server nodes collected for `key`, once; later calls return null. */
export function takeServerNodes(key: string): DocumentFragment | null {
  const fragment = adopted.get(key) ?? null;
  adopted.delete(key);
  return fragment;
}

/** Drops every collected region (after the first client-side navigation they are stale). */
export function clearServerNodes(): void {
  adopted.clear();
}
