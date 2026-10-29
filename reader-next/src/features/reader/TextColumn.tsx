import { readerAnalytics } from "~/lib/analytics/reader";
import { copyEvents } from "~/lib/analytics/session";
import { useQueries, useQueryClient } from "@tanstack/react-query";
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { makeIndexLookup } from "~/lib/connections/links";
import { linkCountsBySegment, linksQueryOptions } from "~/lib/connections/queries";
import { nextToLoad } from "~/lib/reader/column";
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
  registerPosition?: (get: () => SavedPosition | undefined) => () => void;
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
    moveTabStop(el as HTMLElement | null);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // One tab stop in the column: the verse being read (R-31). DOM attributes, like the focus highlight: no re-render per verse.
  const tabStop = useRef<HTMLElement | null>(null);
  const moveTabStop = (el: HTMLElement | null) => {
    if (!el || el === tabStop.current) return;
    if (tabStop.current?.isConnected) tabStop.current.tabIndex = -1;
    el.tabIndex = 0;
    tabStop.current = el;
  };
  const showFocusRef = useRef(showFocus);
  showFocusRef.current = showFocus;
  // until the reading position is known the first verse is the tab stop; and when its verse leaves the page (windowing trimmed its
  // section, a version swap re-rendered it), the verse being read takes it, so the text never loses its only tab stop
  useEffect(() => {
    if (tabStop.current?.isConnected) return;
    const reading = focusedEl.current?.isConnected ? (focusedEl.current as HTMLElement) : null;
    moveTabStop(reading ?? contentRef.current?.querySelector<HTMLElement>('[role="group"][data-selectable="true"]') ?? null);
  }); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (showFocus) focusedEl.current?.setAttribute("aria-current", "true");
    else focusedEl.current?.removeAttribute("aria-current");
  }, [showFocus]);
  // Arrow keys move between verses (the tab stop goes with them); Enter or Space chooses the verse, as before.
  const onSegmentKeys = (e: React.KeyboardEvent<HTMLDivElement>) => {
    if (e.key !== "ArrowDown" && e.key !== "ArrowUp") return;
    const here = (e.target as HTMLElement).closest<HTMLElement>('[role="group"][data-selectable="true"]');
    if (!here || here !== e.target) return;
    const all = [...(contentRef.current?.querySelectorAll<HTMLElement>('[role="group"][data-selectable="true"]') ?? [])];
    const next = all[all.indexOf(here) + (e.key === "ArrowDown" ? 1 : -1)];
    if (!next) return;
    e.preventDefault();
    moveTabStop(next);
    next.focus();
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
        qc.ensureQueryData(textQueryOptions(p.ref, versions)).then(
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
        const passage = await fetchInWantedVersions((sel) => qc.ensureQueryData(textQueryOptions(ref, sel)), () => propsRef.current.versions);
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

  // Arriving at a linked segment (client-side navigation; the inline script handles the server-rendered load).
  useLayoutEffect(() => {
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
    if (selected) engine.setFocus(selected);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selected]);

  // Back/forward: put the reader back at the saved place (layout effect: before paint, so nothing flashes).
  const restoreToken = props.restore?.token;
  useLayoutEffect(() => {
    if (props.restore) engine.restorePosition(props.restore.position);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [restoreToken]);

  useEffect(() => props.registerPosition?.(engine.getPosition), [props.registerPosition, engine.getPosition]); // eslint-disable-line react-hooks/exhaustive-deps
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
    const drop = new Set<string>();
    for (const p of sections) {
      const b = box(p.ref);
      if (!b || keep(p.ref) || b.bottom > view.top - reach) break;
      drop.add(p.ref);
    }
    for (const p of [...sections].reverse()) {
      const b = box(p.ref);
      if (!b || keep(p.ref) || b.top < view.bottom + reach) break;
      drop.add(p.ref);
    }
    if (drop.size && sections.length - drop.size >= MIN_SECTIONS_KEPT) setSections((prev) => prev.filter((p) => !drop.has(p.ref)));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sections, trimTick]);

  // Sections were added: put the reader back in the same task (before any paint), then look at the edges again.
  useLayoutEffect(() => {
    engine.restore();
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
        onMouseUp={() => {
          const sel = window.getSelection();
          const root = contentRef.current;
          if (!sel || sel.isCollapsed || !sel.rangeCount || !root) return;
          const range = sel.getRangeAt(0);
          if (!root.contains(range.commonAncestorContainer)) return;
          const words = selectedText(range);
          if (words) props.onSelectWords?.(words, segmentsInRange(root, range));
        }}
      >
        <div className={styles.edge} aria-hidden={!loading.up}>
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
