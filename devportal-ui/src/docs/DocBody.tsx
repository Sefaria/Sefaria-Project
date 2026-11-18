// The article body (PLAN §2.5). React never renders Markdown: on the first page it adopts the server's
// body nodes (moved, not re-parsed, so images do not reload); after a client-side navigation it inserts
// the payload's `bodyHtml`, which the server rendered and sanitized. Either way the enhancers then
// attach the docs behaviours to that DOM.
import { useLayoutEffect, useRef } from 'react';
import { BODY_ELEMENT_ID } from './adopt';
import { enhanceArticle, type EnhanceOptions } from './enhance';

export interface DocBodyProps {
  /** Server-rendered, sanitized HTML (payload `page.bodyHtml`). */
  html: string;
  /** Nodes taken from the server markup with takeServerBody; used instead of `html` when given. */
  adopt?: Node[] | null;
  enhance?: EnhanceOptions;
  /** Called with the result of the enhancers (tests use it to wait for highlighting). */
  onEnhanced?: (highlighted: Promise<number>) => void;
}

export function DocBody({ html, adopt, enhance, onEnhanced }: DocBodyProps) {
  const ref = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (adopt && adopt.length > 0) el.replaceChildren(...adopt);
    else el.innerHTML = html;
    const enhanced = enhanceArticle(el, enhance);
    onEnhanced?.(enhanced.highlighted);
    return enhanced.cleanup;
  }, [html, adopt, enhance, onEnhanced]);
  return <div className="dp-markdown" id={BODY_ELEMENT_ID} ref={ref} />;
}
