/**
 * One passive, rAF-coalesced scroll listener on `window` shared by the NG hooks.
 *
 * The document is the scroller in the NG reader (as on classic singlePanel, see the
 * mobile-scroll-container convention), which is what lets mobile browsers collapse their URL
 * bar while reading. Nothing in NG scrolls an inner container.
 */
const listeners = new Set();
let frame = null;
let lastY = null;
let idleTimer = null;
let lastEventAt = 0;
export const IDLE_MS = 140;

export function readScroll() {
  const doc = document.documentElement;
  const viewportHeight = window.innerHeight || doc.clientHeight;
  const documentHeight = Math.max(doc.scrollHeight, document.body ? document.body.scrollHeight : 0);
  const maxY = Math.max(0, documentHeight - viewportHeight);
  const rawY = window.pageYOffset !== undefined ? window.pageYOffset : doc.scrollTop;
  // Clamp: iOS rubber-banding reports negative offsets at the top and past-the-end at the bottom.
  const y = Math.min(Math.max(rawY, 0), maxY);
  return {y, maxY, viewportHeight, documentHeight};
}

function emit(idle) {
  const metrics = readScroll();
  const direction = lastY === null || metrics.y === lastY ? 'none' : (metrics.y > lastY ? 'down' : 'up');
  lastY = metrics.y;
  const event = {...metrics, direction, idle};
  listeners.forEach(fn => fn(event));
}

let scheduled = false;

function onScroll() {
  lastEventAt = Date.now();
  if (!scheduled) {
    scheduled = true;
    frame = window.requestAnimationFrame(() => { scheduled = false; frame = null; emit(false); });
  }
  clearTimeout(idleTimer);
  idleTimer = setTimeout(() => emit(true), IDLE_MS);
}

/** Subscribe to scroll metrics. Returns the unsubscribe function. Browser only. */
export function subscribeScroll(fn) {
  if (listeners.size === 0) {
    lastY = readScroll().y;
    window.addEventListener('scroll', onScroll, {passive: true});
    window.addEventListener('resize', onScroll, {passive: true});
  }
  listeners.add(fn);
  return () => {
    listeners.delete(fn);
    if (listeners.size === 0) {
      window.removeEventListener('scroll', onScroll);
      window.removeEventListener('resize', onScroll);
      if (frame !== null) { window.cancelAnimationFrame(frame); frame = null; }
      scheduled = false;
      clearTimeout(idleTimer);
    }
  };
}

export function isScrollIdle() {
  return Date.now() - lastEventAt >= IDLE_MS;
}

/** Re-evaluate listeners without a scroll event, e.g. after content changed the document height. */
export function pokeScroll() {
  if (listeners.size) { emit(isScrollIdle()); }
}
