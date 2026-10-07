/**
 * The reading-scroll engine: everything that makes scrolling through text feel solid.
 *
 *  - One scroll container, chosen by CSS: on desktop the text column scrolls itself (like the old reader, so
 *    panels scroll independently); on a phone the page scrolls (so the browser chrome can collapse).
 *  - Anchor keeping: the segment being read stays at the same place on screen through *any* content change —
 *    sections added above, fonts arriving, the column narrowing when the sidebar opens, a footnote opening.
 *    The browser's own scroll anchoring is switched off (it is not in every browser and would double-correct).
 *    Corrections run in a ResizeObserver callback or the next animation frame, i.e. before paint: never visible.
 *    Scrolling moves in whole device pixels but text heights are fractional (a 22px font at 1.6 is 35.2px a
 *    line), so the leftover fraction of each correction goes into a sub-pixel padding above the content —
 *    otherwise a section added above can leave the text a fraction lower, and it paints a pixel off.
 *  - Focus tracking with the old client's exact rule (see `pickFocusSegment`), every frame while scrolling, so
 *    the highlight follows the reader; `onSettled` fires once scrolling pauses (for the URL).
 *  - Edge detection for loading the previous / next section well before the reader gets there.
 *
 * @feature TXD-052 Infinite scroll up and down
 * @feature TXD-053 Scroll container differs by device
 * @feature TXD-055 Visible-ref tracking drives URL and header
 */
import { useCallback, useEffect, useRef, type RefObject } from "react";
import type { SavedPosition } from "~/lib/reader/position-store";
import { focusRule, LOAD_MARGIN, pickFocusSegment, TARGET_OFFSET_PAST_THRESHOLD, type SectionRect } from "~/lib/reader/column";

export interface ReadingScrollOptions {
  /** The element that scrolls on desktop. When its CSS overflow is not scrollable, the window scrolls instead. */
  scrollerRef: RefObject<HTMLElement | null>;
  /** The column's content (all sections). */
  contentRef: RefObject<HTMLElement | null>;
  /** Called (at most once per frame) when the current segment changes. */
  onFocus?: (segmentRef: string) => void;
  /** Called when scrolling has paused for {@link SETTLE_MS} and the current segment differs from last time. */
  onSettled?: (segmentRef: string) => void;
  /** Called when an edge of the content is within {@link LOAD_MARGIN} of the viewport. */
  onNearEdge?: (direction: "up" | "down") => void;
  /** Phone layout with the connections sharing the screen (focus line moves up to a quarter of the window). */
  connectionsOnScreen?: boolean;
}

export interface ReadingScroll {
  /** Make `segmentRef` current without scrolling (e.g. the reader clicked it). */
  setFocus: (segmentRef: string) => void;
  /** Bring a segment to the focus line (the threshold), instantly. */
  scrollToSegment: (segmentRef: string) => void;
  /** Where the reader is: the current segment and its distance from the top of the scrolling area. */
  getPosition: () => SavedPosition | undefined;
  /** Put the reader back where {@link getPosition} found them. False when that segment is not loaded. */
  restorePosition: (pos: SavedPosition) => boolean;
  /** Re-run edge detection (after new content arrives). */
  check: () => void;
  /**
   * Put the reader back in place now. Call from a layout effect right after content changes, so the
   * correction lands in the same task as the change: nothing can measure or paint the shifted state.
   */
  restore: () => void;
}

/** Old client: debounced 100ms. */
export const SETTLE_MS = 100;

const SEGMENTS = '[role="group"][data-ref]';
const segmentSelector = (ref: string) => `[role="group"][data-ref="${typeof CSS !== "undefined" && CSS.escape ? CSS.escape(ref) : ref.replace(/"/g, '\\"')}"]`;

/** Is segment `a` earlier in the text than segment `b`? */
function isBefore(content: HTMLElement, a: string, b: string): boolean {
  const ea = content.querySelector(segmentSelector(a));
  const eb = content.querySelector(segmentSelector(b));
  if (!ea || !eb) return false;
  return !!(ea.compareDocumentPosition(eb) & Node.DOCUMENT_POSITION_FOLLOWING);
}

function isScrollable(el: HTMLElement): boolean {
  const o = getComputedStyle(el).overflowY;
  return o === "auto" || o === "scroll";
}

export function useReadingScroll(opts: ReadingScrollOptions): ReadingScroll {
  const optsRef = useRef(opts);
  optsRef.current = opts;

  const state = useRef({
    focus: undefined as string | undefined,
    anchor: undefined as { ref: string; offset: number; scrollTop: number } | undefined,
    /** Development counters (read by tests): every correction applied, in px. */
    corrections: [] as number[],
    height: 0,
    settled: undefined as string | undefined,
    userScrolled: false,
    /** When the reader last scrolled by hand (wheel, touch, keys, scrollbar). */
    lastIntent: 0,
    /** When a segment was chosen (clicked or linked). Until the reader next scrolls, it stays current. */
    pinnedAt: -1,
    /** scrollTop at the last step, for the direction of travel. */
    lastScrollTop: 0,
    /** Sub-pixel padding above the content, in [0, 1): the part of a correction scrolling can't make. */
    pad: 0,
    frame: 0,
    settleTimer: 0 as ReturnType<typeof setTimeout> | 0,
  });

  // ── geometry ───────────────────────────────────────────────────────────────────────────────────────
  const scroller = useCallback((): HTMLElement | Window => {
    const el = optsRef.current.scrollerRef.current;
    return el && isScrollable(el) ? el : window;
  }, []);
  const viewportTop = useCallback((): number => {
    const s = scroller();
    return s === window ? 0 : (s as HTMLElement).getBoundingClientRect().top;
  }, [scroller]);
  const viewportHeight = useCallback((): number => {
    const s = scroller();
    return s === window ? window.innerHeight : (s as HTMLElement).clientHeight;
  }, [scroller]);
  const scrollBy = useCallback(
    (dy: number) => {
      const s = scroller();
      if (s === window) window.scrollTo(0, window.scrollY + dy);
      else (s as HTMLElement).scrollTop += dy;
    },
    [scroller],
  );
  const offsetOf = useCallback((el: Element) => el.getBoundingClientRect().top - viewportTop(), [viewportTop]);
  const scrollTopNow = useCallback((): number => {
    const s = scroller();
    return s === window ? window.scrollY : (s as HTMLElement).scrollTop;
  }, [scroller]);

  const rule = useCallback(() => focusRule(window.innerHeight, { mobile: scroller() === window, connectionsOnScreen: optsRef.current.connectionsOnScreen }), [scroller]);

  /** The current segment, found by binary search (segment positions only grow down the page). */
  const computeFocus = useCallback((): string | undefined => {
    const content = optsRef.current.contentRef.current;
    if (!content) return undefined;
    const segs = content.querySelectorAll<HTMLElement>(SEGMENTS);
    if (!segs.length) return undefined;
    const top = viewportTop();
    const r = rule();
    const rectOf = (i: number): SectionRect => {
      const b = segs[i]!.getBoundingClientRect();
      return { ref: segs[i]!.dataset.ref!, top: b.top - top, bottom: b.bottom - top };
    };
    let lo = 0;
    let hi = segs.length - 1;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      const m = rectOf(mid);
      if (m.bottom > r.middle || m.top >= r.threshold - 1) hi = mid;
      else lo = mid + 1;
    }
    // Continuous (inline) layout can make positions non-monotonic across a line: confirm with a short scan back.
    const window_ = [];
    for (let i = Math.max(0, lo - 3); i <= Math.min(segs.length - 1, lo + 1); i++) window_.push(rectOf(i));
    return pickFocusSegment(window_, r) ?? rectOf(lo).ref;
  }, [viewportTop, rule]);

  // ── anchor keeping ─────────────────────────────────────────────────────────────────────────────────
  const restoreAnchor = useCallback(() => {
    const s = state.current;
    const content = optsRef.current.contentRef.current;
    if (!s.anchor || !content) return;
    const el = content.querySelector(segmentSelector(s.anchor.ref));
    if (!el) return;
    // Where the anchor would be if only the reader's own scrolling had happened since we recorded it.
    // Anything beyond that is a content shift, and only that is corrected — never the reader's scroll.
    const expected = s.anchor.offset - (scrollTopNow() - s.anchor.scrollTop);
    const delta = offsetOf(el) - expected;
    if (Math.abs(delta) >= 0.5) {
      scrollBy(delta);
      s.corrections.push(Math.round(delta));
    }
    // What scrolling couldn't take (a fraction of a pixel; more only when the scroll hit an end) goes into the padding.
    const rest = offsetOf(el) - expected;
    if (Math.abs(rest) > 0.02 && Math.abs(rest) < 1) {
      let pad = s.pad - rest;
      if (pad < 0) {
        pad += 1;
        scrollBy(1);
      } else if (pad >= 1) {
        pad -= 1;
        scrollBy(-1);
      }
      s.pad = pad;
      content.style.paddingTop = pad ? `${pad}px` : "";
    }
    s.anchor = { ref: s.anchor.ref, offset: offsetOf(el), scrollTop: scrollTopNow() };
  }, [offsetOf, scrollBy, scrollTopNow]);

  const recordAnchor = useCallback(() => {
    const s = state.current;
    const content = optsRef.current.contentRef.current;
    if (!s.focus || !content) return;
    const el = content.querySelector(segmentSelector(s.focus));
    if (el) s.anchor = { ref: s.focus, offset: offsetOf(el), scrollTop: scrollTopNow() };
  }, [offsetOf, scrollTopNow]);

  const checkEdges = useCallback(() => {
    const content = optsRef.current.contentRef.current;
    if (!content) return;
    const b = content.getBoundingClientRect();
    const top = b.top - viewportTop();
    const bottom = b.bottom - viewportTop();
    if (top > -LOAD_MARGIN) optsRef.current.onNearEdge?.("up");
    if (bottom < viewportHeight() + LOAD_MARGIN) optsRef.current.onNearEdge?.("down");
  }, [viewportTop, viewportHeight]);

  // ── the per-frame step ─────────────────────────────────────────────────────────────────────────────
  const step = useCallback(() => {
    const s = state.current;
    s.frame = 0;
    const content = optsRef.current.contentRef.current;
    if (!content) return;
    // If the content changed since we last looked, put the reader back first, then measure.
    const h = content.offsetHeight;
    if (h !== s.height) {
      restoreAnchor();
      s.height = h;
    }
    // A chosen segment stays current through reflows (the sidebar opening narrows the column, which moves
    // the reading line onto a different verse); only the reader's own scrolling moves the focus on.
    const pinned = s.pinnedAt > s.lastIntent;
    let focus = pinned ? s.focus : computeFocus();
    // The focus only moves when the reader moves, and only the way they are going. Near the end of the loaded text a verse can't be
    // brought up to the reading line, so the rule briefly prefers the verse above it — scrolling down must
    // never send the address bar backwards.
    const st = scrollTopNow();
    const travel = st - s.lastScrollTop;
    s.lastScrollTop = st;
    // Content changing around the reader (sections added, a reflow) is not movement: the anchor keeps them
    // on the same verse, so the focus stays.
    if (focus && s.focus && focus !== s.focus && (travel === 0 || isBefore(content, focus, s.focus) === travel > 0)) focus = s.focus;
    if (focus && focus !== s.focus) {
      s.focus = focus;
      optsRef.current.onFocus?.(focus);
    }
    recordAnchor();
    checkEdges();
    if (s.userScrolled) {
      if (s.settleTimer) clearTimeout(s.settleTimer);
      s.settleTimer = setTimeout(() => {
        s.settleTimer = 0;
        if (s.focus && s.focus !== s.settled) {
          s.settled = s.focus;
          optsRef.current.onSettled?.(s.focus);
        }
      }, SETTLE_MS);
    }
  }, [computeFocus, recordAnchor, checkEdges, restoreAnchor, scrollTopNow]);

  const schedule = useCallback(() => {
    if (!state.current.frame) state.current.frame = requestAnimationFrame(step);
  }, [step]);

  useEffect(() => {
    const s = state.current;
    const content = opts.contentRef.current;
    if (!content) return;
    // Our own anchor keeping replaces the browser's.
    content.style.overflowAnchor = "none";
    const sc = opts.scrollerRef.current;
    if (sc) sc.style.overflowAnchor = "none";
    // Take over place keeping from the pre-hydration script.
    (sc as (HTMLElement & { __keepPlace?: () => void }) | null)?.__keepPlace?.();
    document.documentElement.style.overflowAnchor = "none";

    // Scroll events don't bubble, but a capturing listener on the document hears every container's — so it
    // works whether the column or the window scrolls (decided by CSS, which may arrive after this runs).
    const onScroll = (e: Event) => {
      const t = e.target;
      const col = optsRef.current.scrollerRef.current;
      if (t === document || t === col) schedule();
    };
    // Wheel/touch/keys mark the reader's intent (programmatic corrections never count as reading).
    const intent = () => {
      s.userScrolled = true;
      s.lastIntent = performance.now();
    };
    // Grabbing the scrollbar is scrolling too. (A click on a segment also lands here, but it is pinned
    // after this, in the click handler, so it still wins.)
    const pointerIntent = (e: PointerEvent) => {
      const col = optsRef.current.scrollerRef.current;
      if (e.target === col || e.target === document.documentElement) intent();
    };
    document.addEventListener("scroll", onScroll, { capture: true, passive: true });
    window.addEventListener("wheel", intent, { passive: true });
    window.addEventListener("touchmove", intent, { passive: true });
    window.addEventListener("keydown", intent);
    window.addEventListener("pointerdown", pointerIntent, { passive: true });
    window.addEventListener("resize", schedule);

    // Content resized (sections added, fonts loaded, column narrowed, footnote opened): keep the reader's place.
    const ro = new ResizeObserver(() => {
      const h = content.offsetHeight;
      if (h !== s.height) {
        restoreAnchor();
        s.height = h;
      }
      schedule();
    });
    ro.observe(content);
    if (sc) ro.observe(sc);

    // Development aid: the engine's state is inspectable (tests and the jank probe read it).
    if (import.meta.env?.DEV) (window as unknown as { __readingScroll?: unknown }).__readingScroll = s;
    s.height = content.offsetHeight;
    if (!s.focus) s.focus = computeFocus();
    if (s.focus) optsRef.current.onFocus?.(s.focus);
    recordAnchor();
    checkEdges();
    return () => {
      document.removeEventListener("scroll", onScroll, { capture: true });
      window.removeEventListener("wheel", intent);
      window.removeEventListener("touchmove", intent);
      window.removeEventListener("keydown", intent);
      window.removeEventListener("pointerdown", pointerIntent);
      window.removeEventListener("resize", schedule);
      ro.disconnect();
      // Clear the ids too: React may run this effect again (StrictMode, fast refresh) with the same state object,
      // and a stale frame id would make `schedule` think a frame is still pending — forever.
      if (s.frame) cancelAnimationFrame(s.frame);
      if (s.settleTimer) clearTimeout(s.settleTimer);
      s.frame = 0;
      s.settleTimer = 0;
    };
    // The engine is set up once per column; options are read through optsRef.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const setFocus = useCallback(
    (ref: string) => {
      const s = state.current;
      s.focus = ref;
      s.settled = ref;
      s.pinnedAt = performance.now();
      recordAnchor();
      optsRef.current.onFocus?.(ref);
    },
    [recordAnchor],
  );

  const scrollToSegment = useCallback(
    (ref: string) => {
      const content = optsRef.current.contentRef.current;
      const el = content?.querySelector(segmentSelector(ref));
      if (!el) return;
      const line = rule().threshold + TARGET_OFFSET_PAST_THRESHOLD;
      const delta = offsetOf(el) - line;
      if (Math.abs(delta) >= 0.5) scrollBy(delta);
      const s = state.current;
      s.focus = ref;
      s.settled = ref;
      s.pinnedAt = performance.now();
      s.anchor = { ref, offset: offsetOf(el), scrollTop: scrollTopNow() };
      optsRef.current.onFocus?.(ref);
    },
    [offsetOf, rule, scrollBy, scrollTopNow],
  );

  const getPosition = useCallback((): SavedPosition | undefined => {
    const s = state.current;
    const el = s.focus ? optsRef.current.contentRef.current?.querySelector(segmentSelector(s.focus)) : null;
    return s.focus && el ? { ref: s.focus, offset: offsetOf(el) } : undefined;
  }, [offsetOf]);

  const restorePosition = useCallback(
    (pos: SavedPosition): boolean => {
      const el = optsRef.current.contentRef.current?.querySelector(segmentSelector(pos.ref));
      if (!el) return false;
      const delta = offsetOf(el) - pos.offset;
      if (Math.abs(delta) >= 0.5) scrollBy(delta);
      const s = state.current;
      s.focus = pos.ref;
      s.settled = pos.ref;
      s.pinnedAt = performance.now(); // stays current until the reader scrolls
      s.anchor = { ref: pos.ref, offset: offsetOf(el), scrollTop: scrollTopNow() };
      optsRef.current.onFocus?.(pos.ref);
      return true;
    },
    [offsetOf, scrollBy, scrollTopNow],
  );

  const restore = useCallback(() => {
    const content = optsRef.current.contentRef.current;
    if (!content) return;
    restoreAnchor();
    state.current.height = content.offsetHeight;
  }, [restoreAnchor]);

  return { setFocus, scrollToSegment, getPosition, restorePosition, check: schedule, restore };
}

/**
 * Inline script that runs while the server-rendered page is being parsed, before first paint: it brings the
 * linked verse to the focus line so a deep link never shows the top of the chapter first and then jumps.
 * Until the app hydrates it also keeps the verse there while fonts and styles arrive and reflow the text
 * (every animation frame, which runs before layout and paint, plus a ResizeObserver for reflows within a
 * frame), and it stands down the moment the reader scrolls or the engine takes over. If web fonts are still
 * arriving (the first layout, forced by the first placement, is what requests them), the text stays invisible (the header is not) until they are in and the verse is placed — at most
 * 600ms; with the fonts preloaded it is usually a frame or two. Without this a first visit shows the verse
 * in the fallback font for a frame, then jumps.
 * Kept tiny and dependency-free. Thresholds match FOCUS_THRESHOLD.
 */
export const INITIAL_POSITION_SCRIPT = `(function(){var c,shown=0;function show(){if(!shown&&c){shown=1;c.style.visibility="";}}try{var s=document.currentScript;c=s&&s.closest("[data-reader-scroller]");if(!c)return;var t=c.querySelector('[data-scroll-target="true"]');if(!t)return;
function place(){var o=getComputedStyle(c).overflowY,w=!(o==="auto"||o==="scroll"),th=(w?70:140)+2,d=t.getBoundingClientRect().top-(w?0:c.getBoundingClientRect().top)-th;if(Math.abs(d)<0.5)return;if(w)window.scrollTo(0,window.scrollY+d);else c.scrollTop+=d;}
place();var f=document.fonts;if(f&&f.status!=="loaded"){c.style.visibility="hidden";f.ready.then(function(){place();show();});setTimeout(show,600);}if(!window.ResizeObserver){show();return;}
var ro=new ResizeObserver(place),live=1,tick=function(){if(live){place();requestAnimationFrame(tick);}},stop=function(){live=0;show();ro.disconnect();["wheel","touchmove","keydown","pointerdown"].forEach(function(e){removeEventListener(e,stop,true)});};requestAnimationFrame(tick);
ro.observe(c);ro.observe(c.firstElementChild||c);["wheel","touchmove","keydown","pointerdown"].forEach(function(e){addEventListener(e,stop,true)});c.__keepPlace=stop;}catch(e){show();}})();`;
