import { useLayoutEffect, useRef } from 'react';
import { takeServerNodes } from './adopt';

export interface AdoptedHtmlProps {
  /** The `data-dp-adopt` key of the server region this element takes over on the first render. */
  adoptKey: string;
  /** The same HTML from the payload (sanitized on the server, PLAN §2.6); used when there are no server nodes. */
  html: string;
  className?: string;
}

/**
 * Server-rendered HTML that React does not render (PLAN §2.5): on the first page it adopts the server's
 * nodes for `adoptKey`; after a client-side navigation it sets the payload's HTML. React never manages
 * the element's children, so behaviors attached to them stay attached.
 */
export function AdoptedHtml({ adoptKey, html, className }: AdoptedHtmlProps) {
  const ref = useRef<HTMLDivElement>(null);
  const first = useRef(true);
  useLayoutEffect(() => {
    const element = ref.current;
    if (element === null) return;
    const nodes = first.current ? takeServerNodes(adoptKey) : null;
    first.current = false;
    if (nodes !== null) element.replaceChildren(nodes);
    else element.innerHTML = html;
  }, [adoptKey, html]);
  return <div ref={ref} className={className} data-dp-adopted={adoptKey} />;
}
