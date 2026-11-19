// Taking over the server-rendered article body (PLAN §2.5).

/** Id of the server-rendered body element in page_doc.html. */
export const BODY_ELEMENT_ID = 'dp-article-body';

/**
 * Detaches and returns the server-rendered body's child nodes. Call it before React replaces the
 * server markup (before `root.render`), and pass the result to DocBody's `adopt`.
 */
export function takeServerBody(doc: Document): Node[] | null {
  const el = doc.getElementById(BODY_ELEMENT_ID);
  if (!el) return null;
  const nodes = [...el.childNodes];
  nodes.forEach((n) => n.parentNode?.removeChild(n));
  return nodes;
}
