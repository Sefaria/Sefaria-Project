// Scroll spy for the right-rail table of contents (contract C6 `TableOfContents`; PLAN §6.2 G: "the
// current section marked while scrolling"). Works on the React TOC and on page_doc.html's server TOC,
// which share the markup nav.dp-toc > ul > li > a.dp-toc-link[href="#id"].
//
// On load and at the top of the page, the current entry is the last heading whose top has passed `offset`
// pixels below the top of the viewport (live marks the first entry before any heading has been passed).
// While scrolling, an entry becomes current when its heading is in the band [0, offset) at the top of the
// window, and stays current while no heading is in it, as live's waypoints do. It gets the class dp-active
// and aria-current="location".
import type { Cleanup } from './types';

export const SPY_OFFSET = 80;

function decodeHash(href: string): string {
  const raw = href.startsWith('#') ? href.slice(1) : href;
  try {
    return decodeURIComponent(raw);
  } catch {
    return raw;
  }
}

/** Index of the current entry for the given heading tops (viewport coordinates). */
export function currentIndex(tops: (number | null)[], offset: number = SPY_OFFSET): number {
  let current = -1;
  tops.forEach((top, i) => {
    if (top !== null && top <= offset) current = i;
  });
  if (current < 0) current = tops.findIndex((t) => t !== null);
  return current;
}

/** Index of the last heading in the band [0, offset) at the top of the window, or -1 when none is there. */
export function bandIndex(tops: (number | null)[], offset: number = SPY_OFFSET): number {
  let found = -1;
  tops.forEach((top, i) => {
    if (top !== null && top >= 0 && top < offset) found = i;
  });
  return found;
}

export function markCurrent(links: HTMLAnchorElement[], index: number): void {
  links.forEach((link, i) => {
    const active = i === index;
    link.classList.toggle('dp-active', active);
    if (active) link.setAttribute('aria-current', 'location');
    else link.removeAttribute('aria-current');
  });
}

export interface ScrollSpyOptions {
  offset?: number;
  /** Where the headings live; defaults to the TOC's document. */
  root?: ParentNode;
  /** The element that scrolls; defaults to the window. */
  scroller?: HTMLElement | Window;
}

export function attachScrollSpy(nav: HTMLElement, options: ScrollSpyOptions = {}): Cleanup {
  const doc = nav.ownerDocument;
  const root = options.root ?? doc;
  const scroller = options.scroller ?? doc.defaultView ?? window;
  const offset = options.offset ?? SPY_OFFSET;
  const links = [...nav.querySelectorAll<HTMLAnchorElement>('a.dp-toc-link[href^="#"]')];
  if (links.length === 0) return () => {};
  const headings = links.map((link) => {
    const id = decodeHash(link.getAttribute('href') ?? '');
    if (!id) return null;
    const byId = (root as Document).getElementById?.(id) ?? null;
    return byId ?? root.querySelector<HTMLElement>(`[id="${CSS.escape(id)}"]`);
  });

  let frame = 0;
  let current = -1;
  const mark = (index: number) => {
    current = index;
    markCurrent(links, index);
  };
  const update = () => {
    frame = 0;
    const tops = headings.map((h) => (h ? h.getBoundingClientRect().top : null));
    const view = doc.defaultView;
    // First run, or back at the top of the page: the rule above (the first entry before any heading has passed).
    if (current < 0 || (view?.scrollY ?? 0) <= 0) {
      mark(currentIndex(tops, offset));
      return;
    }
    // Afterwards, as live (measured on /docs/linker-v3): an entry becomes current when its heading is in the band
    // at the top of the window; while no heading is there (a long figure or table), the current entry stays.
    const band = bandIndex(tops, offset);
    if (band >= 0 && band !== current) mark(band);
  };
  const schedule = () => {
    if (frame) return;
    const view = doc.defaultView;
    frame = view?.requestAnimationFrame ? view.requestAnimationFrame(update) : (update(), 0);
  };
  const onClick = (event: Event) => {
    const link = (event.target as Element | null)?.closest<HTMLAnchorElement>('a.dp-toc-link');
    const index = link ? links.indexOf(link) : -1;
    if (index >= 0) mark(index);
  };
  update();
  scroller.addEventListener('scroll', schedule, { passive: true });
  doc.defaultView?.addEventListener('resize', schedule);
  nav.addEventListener('click', onClick);
  return () => {
    if (frame) doc.defaultView?.cancelAnimationFrame(frame);
    scroller.removeEventListener('scroll', schedule);
    doc.defaultView?.removeEventListener('resize', schedule);
    nav.removeEventListener('click', onClick);
  };
}
