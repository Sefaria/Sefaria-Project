import { readerAnalytics } from "~/lib/analytics/reader";
import { copyEvents } from "~/lib/analytics/session";
import { useQueries, useQueryClient } from "@tanstack/react-query";
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { makeIndexLookup } from "~/lib/connections/links";
import { linkCountsBySegment, linksQueryOptions } from "~/lib/connections/queries";
import { nextToLoad, sectionsToTrim } from "~/lib/reader/column";
import type { ReaderSettings } from "~/lib/reader/settings";
import { cleanCopy } from "~/lib/reader/copy";
import { spreadNumbers } from "~/lib/reader/spread-numbers";
import type { TextPassage } from "~/lib/text/model";
import type { Highlight } from "~/lib/text/plan";
import type { SavedPosition } from "~/lib/reader/position-store";
import { segmentsInRange, selectedText } from "~/lib/reader/selection";
import { fetchInWantedVersions, selectionKey, textQueryOptions, type VersionSelection } from "~/lib/text/queries";
import { Spinner } from "~/ui/Spinner/Spinner";
import { InterfaceText } from "~/ui/InterfaceText/InterfaceText";
import { TextSection, type TextSectionProps } from "~/ui/TextSection/TextSection";
import styles from "./TextColumn.module.css";
import { INITIAL_POSITION_SCRIPT, useReadingScroll } from "./use-reading-scroll";

export interface TextColumnProps {
  /** Sections the route loaded (already in the library cache). */
  initial: TextPassage[];
  versions: VersionSelection;
  settings: ReaderSettings;
  /** The segment a link pointed at: brought to the focus line on arrival (before first paint when server-rendered). */
  target?: string;
  /** Words a search matched, highlighted in the `target` segment (SRC-058). */
  terms?: readonly string[];
  /** A verse range the URL keeps highlighted (a Torah portion or aliyah); may span sections. */
  highlight?: Highlight | null;
  /** A segment the reader selected (clicked): becomes the focus without scrolling. */
  selected?: string;
  /** The reader selected words in the text (mouse up with a selection inside the column). */
  onSelectWords?: (words: string, segmentRefs: string[]) => void;
  /** Put the reader back at a saved place when `token` changes (back/forward). */
  restore?: { token: string; position: SavedPosition };
  /** Lets the owner read the reader's place on demand (to save it in history). Returns an unregister function. */
  registerPosition?: (get: () => SavedPosition | undefined, engine?: { restorePosition: (pos: SavedPosition) => boolean; scrollToSegment: (ref: string) => void }) => () => void;
  /** The sections now loaded in the column (changes as the reader scrolls). */
  onSections?: (refs: string[]) => void;
  /**
   * The sections the address names now: windowing never drops these (the panel restarts the column when the address's sections are
   * not in it). They follow the reader as the address does; the sections the page opened with are not kept for their own sake.
   */
  pinned?: readonly string[];
  /** Versions `initial` is in, when they differ from `versions` (the column then swaps to `versions`). */
  initialVersionsKey?: string;
  /** Show the moving focus highlight (the sidebar is open). */
  showFocus: boolean;
  /** Phone layout with connections sharing the screen. */
  connectionsOnScreen?: boolean;
  /** The sidebar's active filter, so the dots beside verses count only what the sidebar shows. */
  linkFilter?: string[];
  /** The current segment changed (every boundary crossed while scrolling). */
  onFocus?: (segmentRef: string, passage: TextPassage) => void;
  /** Scrolling paused on a new current segment. */
  onSettled?: (segmentRef: string, passage: TextPassage) => void;
  onSelectSegment?: TextSectionProps["onSelectSegment"];
  onRefClick?: TextSectionProps["onRefClick"];
  onEntityClick?: TextSectionProps["onEntityClick"];
}

/**
 * The scrolling column of text. Sections load above and below from the library cache as the reader nears an
 * edge; the reader's place never moves when they arrive (see useReadingScroll). The current segment is
 * tracked continuously; while the sidebar is open it carries the blue highlight, which follows the reader.
 *
 * @feature TXD-052 Infinite scroll up and down
 * @feature TXD-053 Scroll container differs by device
 * @feature TXD-054 Initial and highlight scroll positioning
 * @feature TXD-055 Visible-ref tracking drives URL and header
 * @feature TXD-056 Loading placeholders and book title header
 */
/** Sections further than this many screens from the reader are let go (R-25). */
const WINDOW_SCREENS = 3;
/** Never fewer than this many sections in the column. */
const MIN_SECTIONS_KEPT = 3;
/** Trimming waits until the column has not scrolled for this long. */
const SCROLL_IDLE_MS = 400;

export function TextColumn(props: TextColumnProps) {
  const { initial, versions, settings, target, terms, highlight, selected, showFocus, connectionsOnScreen, linkFilter = [], onSelectSegment, onRefClick, onEntityClick } = props;
  // A text opened in a column (the old TextColumn.componentDidMount): select_content with its book and category (ANL-009)
  useEffect(() => {
    const p = initial[0];
    if (p) readerAnalytics.textOpened(p.indexTitle, p.primaryCategory);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const qc = useQueryClient();
  const [sections, setSections] = useState(initial);
  const [loading, setLoading] = useState({ up: false, down: false });
  const scrollerRef = useRef<HTMLDivElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const busy = useRef({ up: false, down: false });
  const sectionsRef = useRef(sections);
  sectionsRef.current = sections;
  const propsRef = useRef(props);
  propsRef.current = props;

  // Text the reader selects in this column: on mouseup for a mouse, and when the selection rests for one made by keyboard (Shift+arrows)
  // or touch (a long press and its handles), which end in no mouseup. One report per selection either way (lane R, D4).
  useEffect(() => listenForSelections(() => contentRef.current, (words, refs) => propsRef.current.onSelectWords?.(words, refs)), []);

  // Development aid: count column mounts (a remount while reading would be a visible reset).
  useEffect(() => {
    if (import.meta.env?.DEV) {
      const w = window as unknown as { __columnMounts?: { n: number; keys: string[] } };
      w.__columnMounts ??= { n: 0, keys: [] };
      w.__columnMounts.n++;
      w.__columnMounts.keys.push(initial.map((p) => p.ref).join("|"));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const passageOf = useCallback((segmentRef: string) => sectionsRef.current.find((p) => p.segments.some((s) => s.ref === segmentRef)), []);

  // The focus highlight is a DOM attribute owned by the column, so moving it never re-renders React.
  const focusedEl = useRef<Element | null>(null);
  const paintFocus = useCallback((segmentRef: string) => {
    const el = contentRef.current?.querySelector(`[role="group"][data-ref="${CSS.escape(segmentRef)}"]`) ?? null;
    if (el === focusedEl.current) return;
    focusedEl.current?.removeAttribute("data-focused");
    focusedEl.current?.removeAttribute("aria-current");
    el?.setAttribute("data-focused", "true");
    // with the sidebar open the highlighted verse is the selected one: say so to assistive technology too (R-31)
    if (showFocusRef.current) el?.setAttribute("aria-current", "true");
    focusedEl.current = el;
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const showFocusRef = useRef(showFocus);
  showFocusRef.current = showFocus;
  useEffect(() => {
    if (showFocus) focusedEl.current?.setAttribute("aria-current", "true");
    else focusedEl.current?.removeAttribute("aria-current");
  }, [showFocus]);
  // Every verse is a tab stop (Segment); its links and note markers are not, so Tab reads down the text verse by verse.
  // On a verse: Down/Up move to the next/previous verse, Right/Left (mirrored in a right-to-left verse and interface) step through
  // the links and markers inside it, and Esc goes from one of those back to its verse. Enter or Space chooses the verse, as before.
  const onSegmentKeys = (e: React.KeyboardEvent<HTMLDivElement>) => {
    const target = e.target as HTMLElement;
    const here = target.closest<HTMLElement>('[role="group"][data-selectable="true"]');
    if (!here) return;
    const go = (el: HTMLElement | undefined) => {
      if (!el) return;
      e.preventDefault();
      el.focus();
    };
    if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      const all = [...(contentRef.current?.querySelectorAll<HTMLElement>('[role="group"][data-selectable="true"]') ?? [])];
      return go(all[all.indexOf(here) + (e.key === "ArrowDown" ? 1 : -1)]);
    }
    if (e.key === "Escape" && target !== here) return go(here);
    if (e.key !== "ArrowRight" && e.key !== "ArrowLeft") return;
    const inner = [...here.querySelectorAll<HTMLElement>('a[href], [data-note][role="button"]')].filter((el) => el.getClientRects().length > 0);
    if (!inner.length) return;
    const forward = (e.key === "ArrowRight") !== (getComputedStyle(here).direction === "rtl" && document.documentElement.dir === "rtl");
    const at = inner.indexOf(target);
    // from the verse itself: the first (or last) one; past either end: back to the verse
    go(at === -1 ? (forward ? inner[0] : inner.at(-1)) : (inner[at + (forward ? 1 : -1)] ?? here));
  };

  // A different translation or source: swap every loaded section in place (the reader stays on their verse —
  // the engine keeps the current segment where it is while the text reflows). VER-003
  const versionKey = selectionKey(versions);
  const shownVersions = useRef(props.initialVersionsKey ?? versionKey);
  // Each section is swapped as soon as it arrives, merged into the column as it is NOW (a section the reader scrolled to meanwhile,
  // loaded in the new versions already, is kept); a section that fails keeps its text and the others still change (CODE_REVIEW
  // R-26: all-or-nothing, nothing until the farthest section came back, a failure left the old text under the new version's name,
  // and a section appended mid-swap was dropped by a snapshot).
  useEffect(() => {
    if (versionKey === shownVersions.current) return;
    let cancelled = false;
    shownVersions.current = versionKey;
    const failed: string[] = [];
    // what has arrived is committed once per frame, not once per section (one reflow, one anchor correction)
    const arrived = new Map<string, TextPassage>();
    let frame = 0;
    const flush = () => {
      frame = 0;
      if (cancelled || !arrived.size) return;
      const batch = new Map(arrived);
      arrived.clear();
      setSections((cur) => cur.map((x) => batch.get(x.ref) ?? x));
    };
    void Promise.allSettled(
      sectionsRef.current.map((p) =>
        qc.ensureQueryData({ ...textQueryOptions(p.ref, versions), revalidateIfStale: true }).then(
          (next) => {
            if (cancelled) return; // a later choice (or a remount) takes over
            arrived.set(next.ref, next);
            frame ||= requestAnimationFrame(flush);
          },
          (e) => void failed.push(`${p.ref}: ${e instanceof Error ? e.message : e}`),
        ),
      ),
    ).then(() => {
      if (!cancelled && failed.length) console.warn(`[reader] these sections could not change version and keep their text: ${failed.join("; ")}`);
    });
    return () => {
      cancelled = true;
      if (frame) cancelAnimationFrame(frame);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [versionKey]);

  const load = useCallback(
    async (direction: "up" | "down") => {
      if (busy.current[direction]) return;
      const ref = nextToLoad(sectionsRef.current, direction);
      if (!ref) return;
      busy.current[direction] = true;
      setLoading((l) => ({ ...l, [direction]: true }));
      try {
        // in the versions wanted when it arrives (a version change meanwhile swapped only what the column held: review F04)
        const passage = await fetchInWantedVersions((sel) => qc.ensureQueryData({ ...textQueryOptions(ref, sel), revalidateIfStale: true }), () => propsRef.current.versions);
        // Adding above is safe: the engine puts the reader back before the next paint.
        setSections((prev) => (prev.some((p) => p.ref === passage.ref) ? prev : direction === "up" ? [passage, ...prev] : [...prev, passage]));
      } catch {
        // A failed neighbour load is silent: scrolling again retries.
      } finally {
        busy.current[direction] = false;
        setLoading((l) => ({ ...l, [direction]: false }));
      }
    },
    [qc],
  );

  const focusRef = useRef<string | undefined>(undefined);
  const engine = useReadingScroll({
    scrollerRef,
    contentRef,
    connectionsOnScreen,
    onFocus: (ref) => {
      focusRef.current = ref;
      paintFocus(ref);
      const p = passageOf(ref);
      if (p) propsRef.current.onFocus?.(ref, p);
    },
    onSettled: (ref) => {
      const p = passageOf(ref);
      if (p) propsRef.current.onSettled?.(ref, p);
    },
    onNearEdge: (direction) => void load(direction),
  });

  // The first screen of a section opened with no verse to bring to the reading line (parity S4): as on sefaria.org, the column opens
  // scrolled past its top edge (the book's title, or the strip where the previous section loads), the section's title at the top of
  // the text (Psalms 23 opens on "23", not on the end of Psalm 22). It stays so through what arrives before the reader moves — the
  // previous section loading above, a short chapter that could not scroll that far until the next one came — and stands down the
  // moment they scroll, press a key or touch the page. The inline script does the same on a server-rendered load, before first paint.
  const atStart = useRef(!target && !props.restore);
  const startSection = initial[0]?.sectionRefs[0] ?? initial[0]?.ref;
  const startGap = useRef(0);
  const placeAtStart = useCallback(() => {
    const sc = scrollerRef.current, content = contentRef.current;
    if (!atStart.current || !sc || !content || !startSection) return;
    const sec = content.querySelector<HTMLElement>(`section[data-ref="${CSS.escape(startSection)}"]`);
    const seg = sec?.querySelector<HTMLElement>('[role="group"][data-ref]');
    if (!sec || !seg) return;
    // the space above the section's title (its margin, outside the section's box) stays above it, as the edge's end
    const edge = content.firstElementChild;
    if (edge && edge.nextElementSibling?.querySelector("section[data-ref]") === sec) startGap.current = sec.getBoundingClientRect().top - edge.getBoundingClientRect().bottom;
    const offset = textStartLine(sc) + startGap.current + seg.getBoundingClientRect().top - sec.getBoundingClientRect().top;
    engine.restorePosition({ ref: seg.dataset.ref!, offset });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [startSection]);
  useLayoutEffect(() => {
    if (!atStart.current) return;
    placeAtStart();
    const unlisten = () => {
      for (const e of STOP_EVENTS) window.removeEventListener(e, stop, true);
    };
    const stop = () => {
      atStart.current = false;
      unlisten();
    };
    for (const e of STOP_EVENTS) window.addEventListener(e, stop, { capture: true, passive: true });
    // the text's own face arriving reflows the section's title above its first verse
    void document.fonts?.ready.then(placeAtStart);
    // (an unmount only stops listening: StrictMode's second mount must still place)
    return unlisten;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Arriving at a linked segment (client-side navigation; the inline script handles the server-rendered load).
  useLayoutEffect(() => {
    if (target) atStart.current = false;
    if (target) engine.scrollToSegment(target);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [target]);

  // A clicked segment becomes the anchor at the moment of the click, before the sidebar opens and the
  // column reflows, so the verse under the reader's pointer is the one that stays put.
  const handleSelect = useCallback<NonNullable<TextColumnProps["onSelectSegment"]>>(
    (...args) => {
      engine.setFocus(args[0]);
      onSelectSegment?.(...args);
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [onSelectSegment],
  );

  // A clicked segment becomes current without moving the page.
  useEffect(() => {
    if (selected) atStart.current = false;
    if (selected) engine.setFocus(selected);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selected]);

  // Back/forward: put the reader back at the saved place (layout effect: before paint, so nothing flashes).
  const restoreToken = props.restore?.token;
  useLayoutEffect(() => {
    if (props.restore) atStart.current = false;
    if (props.restore) engine.restorePosition(props.restore.position);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [restoreToken]);

  // the engine's own placing, so a position put from outside (the reader state API) also becomes the engine's focus and anchor
  useEffect(() => props.registerPosition?.(engine.getPosition, { restorePosition: engine.restorePosition, scrollToSegment: engine.scrollToSegment }), [props.registerPosition, engine.getPosition, engine.restorePosition, engine.scrollToSegment]); // eslint-disable-line react-hooks/exhaustive-deps
  // In a layout effect, before the one below that looks at the edges and may move the URL: the panel must know which
  // sections the column holds before the URL it is about to write comes back (reaching the top of a tractate on a fast
  // scroll used to restart the column at its first page).
  useLayoutEffect(() => {
    props.onSections?.(sections.map((p) => p.ref));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sections]);

  // Windowing (CODE_REVIEW R-25): the column used to keep every section it ever loaded, so a long reading session paid more on every
  // scroll frame (segment lookups over the whole column), held every section's links, and refetched them all on a version change.
  // After each load, sections more than WINDOW_SCREENS screens away go; scrolling back loads them again from the cache. Kept always:
  // the section the reader is in, and the sections the address names now (`pinned`: the panel compares the address's sections with
  // what the column holds, and dropping them would restart the column). Not the sections the page opened with: keeping those stopped
  // every trim behind the reader at the first of them, so a long read kept everything (review F03). Removal above is not movement:
  // the anchor engine keeps the reader's verse still, as it does when a section is added above.
  const pinnedKey = (props.pinned ?? initial.map((p) => p.ref)).join("|");
  const pinnedRefs = useMemo(() => new Set(pinnedKey.split("|")), [pinnedKey]);
  const lastScrollAt = useRef(0);
  useEffect(() => {
    const scroller = scrollerRef.current;
    if (!scroller) return;
    const mark = () => void (lastScrollAt.current = performance.now());
    scroller.addEventListener("scroll", mark, { passive: true });
    return () => scroller.removeEventListener("scroll", mark);
  }, []);
  const [trimTick, setTrimTick] = useState(0);
  useEffect(() => {
    if (sections.length <= MIN_SECTIONS_KEPT) return;
    // not while the reader is still scrolling (a fling's momentum must not meet an anchor correction): look again once it is idle
    const idleFor = performance.now() - lastScrollAt.current;
    if (idleFor < SCROLL_IDLE_MS) {
      const t = setTimeout(() => setTrimTick((n) => n + 1), SCROLL_IDLE_MS - idleFor + 20);
      return () => clearTimeout(t);
    }
    const scroller = scrollerRef.current, content = contentRef.current;
    if (!scroller || !content) return;
    const view = scroller.getBoundingClientRect();
    const reach = WINDOW_SCREENS * view.height;
    const reading = focusRef.current ? passageOf(focusRef.current)?.ref : undefined;
    const keep = (ref: string) => ref === reading || pinnedRefs.has(ref);
    const box = (ref: string) => content.querySelector(`section[data-ref="${CSS.escape(ref)}"]`)?.getBoundingClientRect();
    const drop = sectionsToTrim(sections.map((p) => p.ref), box, view, reach, keep, MIN_SECTIONS_KEPT);
    if (drop.size) setSections((prev) => prev.filter((p) => !drop.has(p.ref)));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sections, trimTick]);

  // Sections were added: put the reader back in the same task (before any paint), then look at the edges again.
  useLayoutEffect(() => {
    engine.restore();
    placeAtStart();
    engine.check();
    // Sections were replaced (another translation): the current verse's passage object changed, so tell the
    // panel (its header names the version; its sidebar marks the current one).
    const f = focusRef.current;
    const p = f ? passageOf(f) : undefined;
    if (f && p) {
      paintFocus(f);
      propsRef.current.onFocus?.(f, p);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sections]);

  // Connection counts for the dots: one links request per loaded section (cached; fetched after hydration).
  const linkQueries = useQueries({ queries: sections.map((p) => linksQueryOptions(p.ref)) });
  const filterKey = linkFilter.join("|");
  // One string, not a spread: the number of queries grows with the sections, and React's deps must keep their length.
  const linksUpdatedKey = linkQueries.map((q) => q.dataUpdatedAt).join(",");
  // Counted per section and kept while that section's links and the filter are unchanged: a section added (or one section's links
  // arriving) leaves every other section's counts — and so its rendered verses — untouched (CODE_REVIEW R-12)
  const countsCache = useRef(new Map<string, { key: string; counts: Record<string, number> }>());
  const countsBySection = useMemo(() => {
    const out = new Map<string, Record<string, number>>();
    const next = new Map<string, { key: string; counts: Record<string, number> }>();
    sections.forEach((p, i) => {
      const q = linkQueries[i];
      const links = q?.data;
      if (!links) return;
      const key = `${q.dataUpdatedAt}|${filterKey}`;
      const hit = countsCache.current.get(p.ref);
      const counts = hit && hit.key === key ? hit.counts : linkCountsBySegment(links, filterKey ? filterKey.split("|") : [], makeIndexLookup(undefined, links));
      next.set(p.ref, { key, counts });
      out.set(p.ref, counts);
    });
    countsCache.current = next;
    return out;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sections, filterKey, linksUpdatedKey]);

  // Continuous layout: numbers of segments that begin on one line step apart (TXD-046)
  useEffect(() => {
    const el = contentRef.current;
    if (!el) return;
    spreadNumbers(el);
    const ro = new ResizeObserver(() => spreadNumbers(el));
    ro.observe(el);
    void document.fonts?.ready.then(() => spreadNumbers(el));
    return () => ro.disconnect();
  }, [sections, settings]);

  const first = sections[0]!;
  const last = sections.at(-1)!;
  return (
    <div ref={scrollerRef} className={styles.scroller} data-reader-scroller data-show-focus={showFocus ? "true" : "false"} data-testid="text-column">
      <div
        ref={contentRef}
        className={styles.content}
        onKeyDown={onSegmentKeys}
        onCopy={(e) => {
          const t = e.target as Element | null;
          if (t?.closest("input, textarea")) return;
          const sel = window.getSelection();
          if (!sel || sel.isCollapsed || !sel.rangeCount) return;
          const range = sel.getRangeAt(0);
          const anchor = range.commonAncestorContainer instanceof Element ? range.commonAncestorContainer : range.commonAncestorContainer.parentElement;
          const surface = anchor?.closest("[data-layout]") ?? anchor?.querySelector("[data-layout]");
          const fragment = range.cloneContents();
          // the old handleGACopyEvents: copy_text with the panel's book, and whether the selection spans languages or segments (ANL-011)
          const book = sections[0]?.indexTitle ?? null;
          copyEvents(
            { length: sel.toString().length, panelType: connectionsOnScreen ? "TextAndConnections" : "Text", book, category: book ? (sections[0]?.primaryCategory ?? null) : null },
            { en: fragment.querySelectorAll('[data-side="translation"]').length, he: fragment.querySelectorAll('[data-side="primary"]').length },
          );
          const { html, text } = cleanCopy(fragment, document, { continuous: surface?.getAttribute("data-layout") === "continuous", hebrewPanel: settings.language === "hebrew" });
          e.clipboardData.setData("text/html", html);
          e.clipboardData.setData("text/plain", text);
          e.preventDefault();
        }}
      >
        <div className={styles.edge} aria-hidden={!loading.up} data-column-start={atStart.current ? "" : undefined}>
          {first.prev ? (
            loading.up ? <Spinner /> : null
          ) : (
            <p className={styles.bookTitle}>
              <InterfaceText en={first.indexTitle} he={first.heIndexTitle} />
            </p>
          )}
        </div>
        {sections.map((p) => (
          <TextSection
            key={p.ref}
            passage={p}
            settings={settings}
            scrollTargetRef={target}
            terms={terms}
            highlight={highlight}
            linkCounts={countsBySection.get(p.ref)}
            onSelectSegment={handleSelect}
            onRefClick={onRefClick}
            onEntityClick={onEntityClick}
          />
        ))}
        <div className={styles.edge} data-testid={last.next ? undefined : "end-of-text"}>
          {last.next ? (loading.down ? <Spinner /> : null) : <InterfaceText en="End" he="סוף" />}
        </div>
      </div>
      {/* Runs during HTML parsing on a server-rendered load: places a linked verse before first paint. */}
      <script dangerouslySetInnerHTML={{ __html: INITIAL_POSITION_SCRIPT }} />
    </div>
  );
}

/** The reader's own input: any of these ends the column's opening placement. */
const STOP_EVENTS = ["wheel", "touchmove", "keydown", "pointerdown"] as const;

/**
 * Where the text starts on screen, as the reading engine measures it (from the top of whatever scrolls): 0 for the column on desktop;
 * on a phone, where the page scrolls, below the panel's sticky header. The inline script computes the same.
 */
function textStartLine(scroller: HTMLElement): number {
  const o = getComputedStyle(scroller).overflowY;
  if (o === "auto" || o === "scroll") return 0;
  const header = scroller.parentElement?.querySelector("header");
  const hs = header ? getComputedStyle(header) : null;
  return header && hs?.position === "sticky" ? (parseFloat(hs.top) || 0) + header.offsetHeight : 0;
}

/** How long a selection made by keyboard must rest before it counts. */
export const SELECTION_SETTLE_MS = 300;
/** The same for touch or a pen: longer, as a reader pauses while dragging a handle. */
export const TOUCH_SELECTION_SETTLE_MS = 700;
/** How long after a selecting key a selection change is the reader's. */
const KEY_GESTURE_MS = 1000;
/** How long after a touch or pen goes down a selection change is the reader's (a long press, then the handles). */
const TOUCH_GESTURE_MS = 10_000;

/** Keys that extend a selection: Shift with an arrow, Page Up/Down or Home/End. */
function selectsByKey(e: KeyboardEvent): boolean {
  return e.shiftKey && /^(Arrow(Up|Down|Left|Right)|Page(Up|Down)|Home|End)$/.test(e.key);
}

/**
 * Report text selected inside `root()`: the words and the segments they touch (the old handleTextSelection, which listened to mouseup
 * only). A mouse selection is reported on mouseup. One made by keyboard (Shift+arrows) or touch (a long press and its handles) ends in
 * no mouseup: it is reported when `selectionchange` has been quiet for a while, but only soon after such a gesture, so a selection
 * made by script or by the browser (find in page moves it to each match, Chrome sets it when the find bar closes) changes nothing.
 * While a mouse button is down the changes of a drag are not reported; a selection already reported (by either path) is not reported
 * again, and a selection outside the column is never reported. Returns the cleanup.
 */
export function listenForSelections(root: () => Element | null, report: (words: string, refs: string[]) => void, doc: Document = document): () => void {
  let last = "";
  let mouseDown = false;
  let keyAt = -Infinity;
  let touchAt = -Infinity;
  let timer: ReturnType<typeof setTimeout> | undefined;
  const now = () => performance.now();
  const check = () => {
    timer = undefined;
    const sel = doc.getSelection();
    const el = root();
    if (!sel || sel.isCollapsed || !sel.rangeCount) {
      last = "";
      return;
    }
    const range = sel.getRangeAt(0);
    if (!el || !el.contains(range.commonAncestorContainer)) return;
    const words = selectedText(range);
    if (!words) return;
    const refs = segmentsInRange(el, range);
    const key = `${words}\u0000${refs.join("|")}`;
    if (key === last) return;
    last = key;
    report(words, refs);
  };
  const onDown = (e: PointerEvent) => {
    if (e.pointerType === "touch" || e.pointerType === "pen") {
      touchAt = now();
      return;
    }
    if (e.pointerType !== "mouse" || e.button !== 0) return;
    mouseDown = true;
    clearTimeout(timer);
  };
  const onUp = (e: MouseEvent) => {
    // (pointerup, which comes first, has already released the button: see `release`)
    if (e.button !== 0) return;
    mouseDown = false;
    clearTimeout(timer);
    check();
  };
  // a mouseup that never comes (Ctrl+click's context menu on a Mac, the button released outside the window) must not leave the
  // listener deaf
  const release = () => void (mouseDown = false);
  const onKey = (e: KeyboardEvent) => {
    if (selectsByKey(e)) keyAt = now();
  };
  const onChange = () => {
    if (mouseDown) return;
    const t = now();
    const byKey = t - keyAt < KEY_GESTURE_MS;
    const byTouch = t - touchAt < TOUCH_GESTURE_MS;
    clearTimeout(timer);
    if (!byKey && !byTouch) {
      // not the reader's doing; a collapse still forgets what was reported, so the same text selected again counts
      if (doc.getSelection()?.isCollapsed) last = "";
      return;
    }
    timer = setTimeout(check, byKey ? SELECTION_SETTLE_MS : TOUCH_SELECTION_SETTLE_MS);
  };
  const view = doc.defaultView;
  doc.addEventListener("pointerdown", onDown, true);
  doc.addEventListener("mouseup", onUp, true);
  doc.addEventListener("pointerup", release, true);
  doc.addEventListener("pointercancel", release, true);
  doc.addEventListener("contextmenu", release, true);
  view?.addEventListener("blur", release);
  doc.addEventListener("keydown", onKey, true);
  doc.addEventListener("selectionchange", onChange);
  return () => {
    clearTimeout(timer);
    doc.removeEventListener("pointerdown", onDown, true);
    doc.removeEventListener("mouseup", onUp, true);
    doc.removeEventListener("pointerup", release, true);
    doc.removeEventListener("pointercancel", release, true);
    doc.removeEventListener("contextmenu", release, true);
    view?.removeEventListener("blur", release);
    doc.removeEventListener("keydown", onKey, true);
    doc.removeEventListener("selectionchange", onChange);
  };
}
