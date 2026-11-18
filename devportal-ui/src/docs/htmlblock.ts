// HTMLBlock frames (PLAN §2.6, contract C6 `HtmlBlockFrame`): each block renders as
//   iframe.dp-htmlblock-frame[sandbox="allow-same-origin allow-popups allow-popups-to-escape-sandbox"]
// served by /_portal/htmlblock/<revision>/<n>. The sandbox has no allow-scripts, so the frame cannot
// size itself; allow-same-origin lets this page read the frame document's height. The height goes in
// the frame's `height` attribute, not a style (the page CSP has no 'unsafe-inline').
import type { Cleanup } from './types';

export const FRAME_SANDBOX = 'allow-same-origin allow-popups allow-popups-to-escape-sandbox';

/** Content height of a same-origin frame, or null while its document is not readable. */
export function frameContentHeight(frame: HTMLIFrameElement): number | null {
  let doc: Document | null;
  try {
    doc = frame.contentDocument;
  } catch {
    return null;
  }
  if (!doc || !doc.documentElement) return null;
  // The root element's own box, not scrollHeight: scrollHeight never drops below the frame's current
  // height, so a frame could grow but never shrink (for instance once web fonts make text shorter).
  const height = doc.documentElement.getBoundingClientRect().height;
  return height > 0 ? Math.ceil(height) : null;
}

/** The frame document's content box (`.dp-htmlblock-document`, the body's one child), or null. */
function frameContent(frame: HTMLIFrameElement): HTMLElement | null {
  let doc: Document | null;
  try {
    doc = frame.contentDocument;
  } catch {
    return null;
  }
  const content = doc?.body?.firstElementChild;
  return content && 'style' in content ? (content as HTMLElement) : null;
}

/** True when `parent` has text (not just white space) before `child` (top) or after it (bottom). */
function textBeside(parent: Element, child: Element, side: 'top' | 'bottom'): boolean {
  const nodes = Array.from(parent.childNodes);
  const at = nodes.indexOf(child);
  const beside = side === 'top' ? nodes.slice(0, at) : nodes.slice(at + 1);
  return beside.some((n) => n.nodeType === 3 && (n.textContent ?? '').trim() !== '');
}

/**
 * The block's element whose margin would collapse out of the block on one side if the HTML were inline: down the
 * first (or last) element children while each is an in-flow block with no padding, border or overflow on that side
 * and no text before (or after) it.
 */
function collapsingEdge(content: HTMLElement, side: 'top' | 'bottom'): Element | null {
  // A loaded frame document has its own view; a document without one (made by script) is styled by this window.
  const view = content.ownerDocument.defaultView ?? window;
  let parent: Element = content;
  let edge: Element | null = null;
  for (let depth = 0; depth < 32; depth += 1) {
    const child = side === 'top' ? parent.firstElementChild : parent.lastElementChild;
    if (!child || textBeside(parent, child, side)) break;
    const cs = view.getComputedStyle(child);
    const floated = (cs.float || 'none') !== 'none';
    if (cs.display !== 'block' || floated || cs.position === 'absolute' || cs.position === 'fixed') break;
    edge = child;
    const inset =
      side === 'top'
        ? (parseFloat(cs.paddingTop) || 0) + (parseFloat(cs.borderTopWidth) || 0)
        : (parseFloat(cs.paddingBottom) || 0) + (parseFloat(cs.borderBottomWidth) || 0);
    if (inset > 0 || (cs.overflow || 'visible') !== 'visible') break;
    parent = child;
  }
  return edge;
}

/**
 * The margins the block's HTML would give the page if it were inline, as on live: there the margins of its first
 * and last elements collapse out of the block into the article (the Hebrew guide's opening h2, 28px; the "Powered
 * by Sefaria" call-to-action's 32px bottom margin), so live's block box starts and ends at their borders. In the
 * frame document they stay inside the content box (`.dp-htmlblock-document`, whose clearfix stops the collapse),
 * so they are read from the geometry: the distance from the content box's edge to the edge element's border.
 */
export function frameOuterMargins(frame: HTMLIFrameElement): { top: number; bottom: number } | null {
  const content = frameContent(frame);
  if (!content) return null;
  const c = content.getBoundingClientRect();
  const first = collapsingEdge(content, 'top');
  const last = collapsingEdge(content, 'bottom');
  const top = first ? first.getBoundingClientRect().top - c.top : 0;
  const bottom = last ? c.bottom - last.getBoundingClientRect().bottom : 0;
  if (!Number.isFinite(top) || !Number.isFinite(bottom)) return null;
  const px = (n: number) => Math.max(0, Math.round(n * 100) / 100);
  return { top: px(top), bottom: px(bottom) };
}

/**
 * Sets the frame's height attribute to its content height. Returns the height set, or null. The margins that
 * would collapse out of the block (frameOuterMargins) are taken out of the frame document (a negative margin on
 * its content box) and put on the block's wrapper, so the frame's box is where live's block box is and the
 * content inside it is where live draws it (D-12: docs_hebrew_citations_rtl).
 */
export function sizeFrame(frame: HTMLIFrameElement): number | null {
  const block = frame.parentElement;
  const content = frameContent(frame);
  const margins = frameOuterMargins(frame);
  if (block?.classList.contains('dp-htmlblock') && content && margins) {
    // Through the CSSOM (allowed by both CSPs, unlike a style attribute in the markup).
    content.style.marginTop = margins.top ? `-${margins.top}px` : '';
    content.style.marginBottom = margins.bottom ? `-${margins.bottom}px` : '';
    // Important: on live the margins escape even where the block is the body's first or last child, whose own
    // margin `.dp-markdown > :first-child` / `:last-child` zero with !important (as live's markdown-body does).
    const set = (prop: string, px: number) =>
      px ? block.style.setProperty(prop, `${px}px`, 'important') : block.style.removeProperty(prop);
    set('margin-top', margins.top);
    set('margin-bottom', margins.bottom);
  }
  const height = frameContentHeight(frame);
  if (height !== null && frame.getAttribute('height') !== String(height)) {
    frame.setAttribute('height', String(height));
  }
  return height;
}

export function enhanceHtmlBlockFrames(root: ParentNode): Cleanup {
  const cleanups: Cleanup[] = [];
  for (const frame of root.querySelectorAll<HTMLIFrameElement>('iframe.dp-htmlblock-frame')) {
    // Never widen the sandbox: whatever the markup says, the frame keeps exactly this value.
    if (frame.getAttribute('sandbox') !== FRAME_SANDBOX) frame.setAttribute('sandbox', FRAME_SANDBOX);
    let observer: ResizeObserver | null = null;
    const onLoad = () => {
      sizeFrame(frame);
      observer?.disconnect();
      const doc = frame.contentDocument;
      if (doc?.documentElement && typeof ResizeObserver !== 'undefined') {
        observer = new ResizeObserver(() => sizeFrame(frame));
        observer.observe(doc.documentElement);
        if (doc.body) observer.observe(doc.body);
      }
      void doc?.fonts?.ready.then(() => sizeFrame(frame));
    };
    const onResize = () => sizeFrame(frame);
    frame.addEventListener('load', onLoad);
    window.addEventListener('resize', onResize);
    if (frame.contentDocument?.readyState === 'complete' && frame.contentDocument.URL !== 'about:blank') onLoad();
    cleanups.push(() => {
      frame.removeEventListener('load', onLoad);
      window.removeEventListener('resize', onResize);
      observer?.disconnect();
    });
  }
  return () => cleanups.forEach((c) => c());
}
