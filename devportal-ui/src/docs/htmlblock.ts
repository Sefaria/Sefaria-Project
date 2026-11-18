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

/**
 * The margins the block's first and last elements would give the page if the HTML were inline, as on live:
 * there they collapse out of the block into the article (the "Powered by Sefaria" call-to-action's 32px
 * bottom margin). Inside the frame they stay inside its document, so the block passes them on instead.
 */
export function frameOuterMargins(frame: HTMLIFrameElement): { top: number; bottom: number } | null {
  let doc: Document | null;
  try {
    doc = frame.contentDocument;
  } catch {
    return null;
  }
  const body = doc?.body;
  const view = doc?.defaultView;
  if (!body || !view) return null;
  const first = body.firstElementChild;
  const last = body.lastElementChild;
  const px = (el: Element | null, side: 'marginTop' | 'marginBottom') =>
    el ? Math.max(0, parseFloat(view.getComputedStyle(el)[side]) || 0) : 0;
  return { top: px(first, 'marginTop'), bottom: px(last, 'marginBottom') };
}

/** Sets the frame's height attribute to its content height. Returns the height set, or null. */
export function sizeFrame(frame: HTMLIFrameElement): number | null {
  const height = frameContentHeight(frame);
  if (height !== null && frame.getAttribute('height') !== String(height)) {
    frame.setAttribute('height', String(height));
  }
  // The block's margins go on its wrapper through the CSSOM (allowed by the CSP, unlike a style attribute).
  const block = frame.parentElement;
  const margins = frameOuterMargins(frame);
  if (block?.classList.contains('dp-htmlblock') && margins) {
    block.style.marginTop = margins.top ? `${margins.top}px` : '';
    block.style.marginBottom = margins.bottom ? `${margins.bottom}px` : '';
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
