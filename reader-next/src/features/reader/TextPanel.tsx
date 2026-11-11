import { selectionRange } from "~/lib/user/topic-links";
import { useQuery, useQueryClient, useSuspenseQueries } from "@tanstack/react-query";
import { useLocation, useRouter } from "@tanstack/react-router";
import { useCallback, useDeferredValue, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { leaf, split, type LayoutNode } from "~/lib/layout/tree";
import { formatWith, parseWith, type ConnectionsView } from "~/lib/connections/url";
import { displayMenuAvailability, hasNikud, layoutKeyFor, type ReaderSettings } from "~/lib/reader/settings";
import { headerLabels, narrowToVerses } from "~/lib/reader/header";
import { useInterfaceLang } from "~/lib/i18n/interface-lang";
import { applySearchToSettings, languageToParam } from "~/lib/reader/url-state";
import type { TextPassage, VersionMeta } from "~/lib/text/model";
import { shouldActivateLookup } from "~/lib/lexicon/lookup";
import { highlightsOf, type SearchHit } from "~/lib/search/text-search";
import { versionKey, type TranslationVersion } from "~/lib/versions/translations";
import { isHighlighted } from "~/lib/text/plan";
import { highlightOf, keepsRange as rangeIsKept, selectionAddress, wholeSectionRange } from "~/lib/text/range-selection";
import { prefetchNeighbours, selectionKey, textQueryOptions } from "~/lib/text/queries";
import { close, closeAside, openAside, openNextToWithId, panelOrder, replace, updatePanel, updateAside } from "~/lib/workspace/ops";
import type { AsideId, PanelId, TextPanelState, Workspace } from "~/lib/workspace/types";
import { DisplaySettingsMenu } from "~/ui/DisplaySettingsMenu/DisplaySettingsMenu";
import { IconButton } from "~/ui/IconButton/IconButton";
import { CloseTextButton, DisplayOptionsButton, SaveTextButton } from "~/ui/ReaderControls/ReaderControls";
import { InterfaceText } from "~/ui/InterfaceText/InterfaceText";
import { PanelHeader } from "~/ui/PanelHeader/PanelHeader";
import { Popover } from "~/ui/Popover/Popover";
import { SplitView } from "~/ui/SplitView/SplitView";
import type { SavedPosition } from "~/lib/reader/position-store";
import { indexMetaQueryOptions } from "~/lib/text/commentary";
import { TextColumnBanner } from "~/ui/TextColumnBanner/TextColumnBanner";
import { rememberPlace } from "~/lib/reader/last-place";
import { refToUrl } from "~/lib/ref/url";
import { dismissBanner, openTransBannerApplies } from "~/lib/reader/translations-banner";
import { rememberTranslation } from "~/lib/versions/prefs-source";
import { entryKey, navFor, panelKeysOf, readNavState, useWorkspaceNav, type NavState } from "../workspace/navigation";
import { panelForRef } from "../workspace/open-ref";
import { toRouterLocation } from "../shared/RouterLink";
// Not a lazy chunk (tried once to shrink the first load): a server-rendered sidebar whose chunk was still loading at hydration left a Suspense
// boundary that React later hid, unmounting query observers mid-fetch; the cancelled fetch surfaced as a "CancelledError" page (seen
// on /Genesis.1.3-5?with=all). Split it with the route manifest, where the router loads a page's chunks before it hydrates.
import { ConnectionsPane } from "./ConnectionsPane";
import styles from "./TextPanel.module.css";
import { setMobileMenuOpen } from "../shell/mobile-menu";
import { SignUpModal } from "~/ui/SignUpModal/SignUpModal";
import { VisuallyHidden } from "~/ui/VisuallyHidden/VisuallyHidden";
import { shownVersions as panelVersionsShown, type ReaderRouteData } from "./reader-route";
import { useReaderSettings } from "./settings-context";
import { placeSegment, scrollSegmentToLine } from "~/lib/reader-state/sefaria/slices/dom-position";
import { TextColumn } from "./TextColumn";
import { readerAnalytics } from "~/lib/analytics";
import { useViewer } from "~/features/auth/viewer";
import { legacyVersions } from "~/lib/user/history";
import { useReaderHistory, useSaved, type PanelPlace } from "./use-reader-history";
import { dirFor } from "~/lib/i18n/direction";
import { useRecordSessionEntry } from "~/features/reader-state/recording/entry";

export interface TextPanelProps {
  panel: TextPanelState;
  data: ReaderRouteData;
  /** [main, aside] shares inside the panel (from the workspace's sizing policy). */
  innerSizes?: number[];
  /** Whether other panels are open (closing this one then keeps the reader in the workspace). */
  alone: boolean;
}

const SINGLE_PANEL_QUERY = "(max-width: 842px)";
const isSinglePanel = () => typeof window !== "undefined" && window.matchMedia(SINGLE_PANEL_QUERY).matches;
const MAIN = "main" as const;

/** The panel added by an operation (the id in `after` that was not in `before`). */

/**
 * A text panel: the reading column with its header, and the panel's own side panels (the connections sidebar).
 * Everything it changes goes through workspace operations on itself (docs/WORKSPACE.md); it never knows where
 * it sits among other panels.
 *
 * @feature SHL-031 Text panel (reading column) @feature SHL-033 Connections sidebar panel @feature SHL-046
 */
export function TextPanel({ panel, data, innerSizes, alone }: TextPanelProps) {
  const { settings: stored, update } = useReaderSettings();
  // Stable object identity so memoised sections don't re-render when nothing changed.
  const settings0 = useMemo(() => applySearchToSettings(stored, { lang: panel.lang, aliyot: panel.aliyot }), [stored, panel.lang, panel.aliyot]);
  const nav = useWorkspaceNav();
  // A sidebar the reader opens has one language: Hebrew if the reader's default is Hebrew, else English (the old openTextListAt
  // never lets a connections panel be bilingual; only an old link without lang2 shows bi)
  const newSidebarLang: "he" | "en" = stored.language === "hebrew" ? "he" : "en";
  const router = useRouter();
  const location = useLocation();
  const qc = useQueryClient();
  const [menuOpen, setMenuOpen] = useState(false);
  // "Record session" in the display menu (docs/READER_STATE_API.md, "Recording and replay"); closes the menu so the dock is in view
  const sessionEntry = useRecordSessionEntry();
  const [saveAsked, setSaveAsked] = useState(false);
  const id = panel.id;
  // What the loader resolved (the URL plus the reader's preferences, VER-014), unless the URL has since named other versions.
  const versions = panelVersionsShown(panel.versions, data);
  // In the versions the loader loaded: when the URL names new ones the column swaps them in itself, so the
  // panel never suspends (no loading flash) and never loses the reader's place.
  // one array per change of the data, not per render: a new array each render made every memo below recompute and
  // useDeferredValue schedule an extra render
  const initialQueries = useSuspenseQueries({ queries: data.sectionRefs.map((r) => textQueryOptions(r, data.versions)) });
  const initialKey = initialQueries.map((q) => q.dataUpdatedAt).join(",");
  const initial = useMemo(() => initialQueries.map((q) => q.data), [initialKey, data.sectionRefs.join("|"), selectionKey(data.versions)]); // eslint-disable-line react-hooks/exhaustive-deps
  // A text with nothing in Hebrew (an English-original work, no source version) cannot be shown "Hebrew only": the old
  // reader turns the panel bilingual (VERIFIED: Philo, Teshuvot haRashba with lang=he → lang=bi, English text, Latin numerals).
  const first = initial[0];
  const noHebrew = !!first && (!!first.primaryVersion || !!first.translationVersion) && first.primaryVersion?.direction !== "rtl" && first.translationVersion?.direction !== "rtl";
  // And the other way round: nothing in English (no translation at all) makes an English panel a Hebrew one (Peri Megadim,
  // VERIFIED: its segments are numbered א, ב in English mode).
  const noEnglish = !!first && !first.translationVersion && first.primaryVersion?.direction === "rtl";
  const settings = useMemo(
    () => (noHebrew && settings0.language === "hebrew" ? { ...settings0, language: "bilingual" as const } : noEnglish && settings0.language === "english" ? { ...settings0, language: "hebrew" as const } : settings0),
    [settings0, noHebrew, noEnglish],
  );

  /** Apply an operation to the workspace as it is now, and go there. */
  const apply = useCallback(
    (op: (ws: Workspace) => Workspace, opts: { replace?: boolean; state?: NavState } = {}) => {
      const ws = nav.current();
      // a panel acts only while it is open: an update that arrives after it closed (a reading position settling) must not reopen it
      // or navigate elsewhere
      if (!ws.panels[id]) return Promise.resolve();
      return nav.go(op(ws), opts);
    },
    [nav, id],
  );

  // ── which navigation is this, for this panel? ──────────────────────────────────────────────────────
  const navState = navFor(readNavState(location.state), id);
  const kind = navState.kind;
  // across every section the URL's range spans (one comment in chapter 1 and one in chapter 2 is still a range)
  const urlSegments = useMemo(
    () => (data.highlight ? initial.flatMap((p) => p.segments.filter((s) => isHighlighted(s.address, data.highlight!, p.addressTypes)).map((s) => s.ref)) : []),
    [initial, data.highlight],
  );

  // The column keeps its sections across navigations that don't move this panel; a real navigation to other
  // sections starts a new column, and a real navigation within them scrolls to the linked verse.
  // The sections the column holds right now (it adds them as the reader scrolls). If the URL names sections the
  // column does not hold — back to another text, say — the column starts over, whatever kind of entry it is.
  const columnSections = useRef(data.sectionRefs);
  const entry = useRef({ key: data.sectionRefs.join("|"), target: urlSegments[0] });
  const heldByColumn = data.sectionRefs.every((r) => columnSections.current.includes(r));
  // "Starts over" is decided once per history entry: re-rendering the same entry (the initial one carries no `nav` at all)
  // must not throw away what the column has since added, or reaching the top of a tractate restarts it.
  const thisEntry = entryKey(location.state) ?? "initial";
  const seenEntry = useRef(thisEntry);
  const newEntry = seenEntry.current !== thisEntry;
  seenEntry.current = thisEntry;
  if ((newEntry && (kind === undefined || kind === "go")) || !heldByColumn) {
    entry.current = { key: data.sectionRefs.join("|"), target: urlSegments[0] };
    columnSections.current = data.sectionRefs;
  }
  // A panel that arrives beside the first takes keyboard focus on its first control (I18-003), so tabbing carries on there.
  const rootEl = useRef<HTMLElement>(null);
  useEffect(() => {
    if (kind !== "go" || panelOrder(nav.current())[0] === id) return;
    // and, when the row of panels overflows, the row scrolls to show it (SHL-040)
    rootEl.current?.scrollIntoView({ inline: "nearest", block: "nearest" });
    rootEl.current?.querySelector<HTMLElement>('a[href], button:not([aria-disabled="true"]), input, [tabindex]:not([tabindex="-1"])')?.focus({ preventScroll: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const selected = kind === "select" ? (navState.ref ?? urlSegments[0]) : undefined;

  // Back/forward: the place this panel's reader had at this entry (see WorkspaceNavProvider).
  const saved = nav.restoreFor(entryKey(location.state), id);
  const key = entryKey(location.state);
  const restore = useMemo(() => (saved && key ? { token: key, position: saved } : undefined), [key, saved?.ref, saved?.offset]); // eslint-disable-line react-hooks/exhaustive-deps
  // Also how the reader state API's scroll slice puts this panel's reader somewhere (a replay, a followed leader), by the panel's
  // stable key. Through the column's scroll engine when it offers it (so the placed segment becomes the engine's focus and anchor, and
  // anchor keeping holds it through reflows); else measured on the panel's own DOM (lib/reader-state/sefaria/slices/dom-position.ts).
  const panelKey = panel.key ?? id;
  const connectionsOnScreenRef = useRef(false);
  const registerPosition = useCallback(
    (get: () => SavedPosition | undefined, engine?: { restorePosition: (pos: SavedPosition) => boolean; scrollToSegment: (ref: string) => void }) =>
      nav.registerPanel(id, get, {
        key: panelKey,
        restorePosition: (pos) => (engine ? engine.restorePosition(pos) : !!rootEl.current && placeSegment(rootEl.current, pos)),
        scrollToSegment: (ref) => {
          if (!engine) return !!rootEl.current && scrollSegmentToLine(rootEl.current, ref, { connectionsOnScreen: connectionsOnScreenRef.current });
          if (!rootEl.current?.querySelector(`[role="group"][data-ref="${CSS.escape(ref)}"]`)) return false;
          engine.scrollToSegment(ref);
          return true;
        },
      }),
    [nav, id, panelKey],
  );
  const onSections = useCallback((refs: string[]) => void (columnSections.current = refs), []);

  // ── the reader's current place ─────────────────────────────────────────────────────────────────────
  const [current, setCurrent] = useState<{ ref: string | undefined; passage: TextPassage }>({ ref: urlSegments[0], passage: initial[0]! });
  // The sidebar shows the URL's selection until the reader moves; then the verse they settle on.
  const [selection, setSelection] = useState<string[] | null>(null);
  useEffect(() => {
    if (kind === undefined || kind === "go") setSelection(null);
    else if (kind === "select" && selected) setSelection([selected]);
  }, [kind, selected]);

  useEffect(() => {
    prefetchNeighbours(qc, current.passage, versions);
  }, [qc, current.passage, versions]);

  const onFocus = useCallback(
    (ref: string, passage: TextPassage) => {
      setCurrent((c) => (c.ref === ref && c.passage === passage ? c : { ref, passage }));
      nav.panelMoved();
    },
    [nav],
  );
  // The scroll slice also hears scrolling inside one long segment (no focus change); panelMoved throttles to a frame.
  useEffect(() => {
    const onScroll = (e: Event) => {
      const t = e.target;
      // the page scrolls on a phone (any panel's listener may tell it: one notice per frame either way); on desktop, this column
      if (t === document || (t instanceof Element && t.matches("[data-reader-scroller]") && !!rootEl.current?.contains(t))) nav.panelMoved();
    };
    document.addEventListener("scroll", onScroll, { capture: true, passive: true });
    return () => document.removeEventListener("scroll", onScroll, { capture: true });
  }, [nav]);

  const asideRef = useRef(panel.asides);
  asideRef.current = panel.asides;
  // Segments the reader selected (text selected across several of them): highlighted, sidebar open or closed (legacy parity,
  // lib/text/range-selection.ts). Reading on, or choosing a verse, drops it.
  const [picked, setPicked] = useState<string[] | null>(null);
  // a navigation (a link, Back/Forward to another entry) ends a selection at once, not when the next scroll settles
  useEffect(() => {
    if (kind === undefined || kind === "go") setPicked(null);
  }, [thisEntry, kind]);
  const onSettled = useCallback(
    (ref: string) => {
      setPicked(null);
      if (asideRef.current.length) setSelection([ref]);
      nav.panelMoved();
      // The address bar always names the verse being read (like the old reader), without moving anything.
      apply((ws) => updatePanel(ws, id, { ref }), { replace: true, state: { nav: "scroll", panel: id } });
    },
    [apply, id, nav],
  );

  // Every range of several segments stays in the address and highlighted, inside one section or across sections, sidebar open or
  // closed (owner decision 2026-11-10; the old reader's occasional collapse is a race, not ported: lib/text/range-selection.ts).
  const keepsRange = rangeIsKept({ segments: urlSegments.length });
  // A range of whole sections ("Genesis 6-8", "Berakhot 2a-2b", "Genesis 1-50") is all highlighted at once, by address (sections the
  // column loads later are blue as they arrive); without the sidebar its address is written by its segments (Genesis.6.1-8.22,
  // Genesis.1.1-50.26), in place, as sefaria.org does, once its last section's length is known: one request for that section when it
  // is not among those loaded with the page. Nothing in the column moves (a replaced entry, "stay").
  const rewritesSectionRange = (kind === undefined || kind === "go") && !panel.asides.length;
  const sectionRange0 = useMemo(() => (data.highlight ? null : wholeSectionRange(data.ref, data.sectionRefs[0], initial)), [data.highlight, data.ref, data.sectionRefs, initial]);
  const lastSectionQ = useQuery({
    ...textQueryOptions(sectionRange0?.lastSection ?? "", data.versions),
    enabled: rewritesSectionRange && !!sectionRange0 && !sectionRange0.ref,
  });
  const lastSection = lastSectionQ.data;
  const sectionRange = useMemo(
    () => (sectionRange0 && !sectionRange0.ref && lastSection ? wholeSectionRange(data.ref, data.sectionRefs[0], [...initial, lastSection]) : sectionRange0),
    [sectionRange0, lastSection, data.ref, data.sectionRefs, initial],
  );
  const rangeHighlight = keepsRange ? data.highlight : (sectionRange?.highlight ?? null);
  const writeSectionRange = rewritesSectionRange && !!sectionRange?.ref && sectionRange.ref !== data.ref;
  useEffect(() => {
    const ref = sectionRange?.ref;
    if (!writeSectionRange || !ref) return;
    apply((ws) => updatePanel(ws, id, { ref }), { replace: true, state: { nav: "stay", panel: id } });
  }, [writeSectionRange, sectionRange, apply, id]);
  const shownHighlight = useMemo(() => (picked ? highlightOf(picked, current.passage.book) : null) ?? rangeHighlight, [picked, current.passage.book, rangeHighlight]);

  // ── side panels ────────────────────────────────────────────────────────────────────────────────────
  const aside = panel.asides.find((a) => a.kind === "connections");
  const view: ConnectionsView | undefined = parseWith(aside?.view);
  connectionsOnScreenRef.current = Boolean(view);
  const section = current.passage;
  const selectedRefs = useMemo(() => {
    if (selection) return selection;
    if (urlSegments.length) return urlSegments;
    return section.segments.map((s) => s.ref); // a section-level URL selects the whole section
  }, [selection, urlSegments, section]);
  // Keep the sidebar from competing with scrolling: it catches up when the main thread is free. The verses and the section they
  // were chosen in are deferred together: deferring the verses alone looked the last chapter's verses up in the next chapter's
  // links at a chapter boundary, and the sidebar said "no connections" for a moment.
  const sidebarInput = useMemo(() => ({ refs: selectedRefs, section }), [selectedRefs, section]);
  const deferredInput = useDeferredValue(sidebarInput);
  const deferredRefs = deferredInput.refs;
  const sidebarSectionRef = useMemo(() => {
    const ref = deferredRefs[0];
    const p = ref ? [deferredInput.section, section, ...initial].find((x) => x.segments.some((s) => s.ref === ref)) : undefined;
    return (p ?? deferredInput.section).ref;
  }, [deferredRefs, deferredInput.section, section, initial]);
  const sidebarSection = [deferredInput.section, section, ...initial].find((p) => p.ref === sidebarSectionRef) ?? deferredInput.section;
  const sidebarRef = deferredRefs.length === 1 ? deferredRefs[0]! : data.ref;

  /** The address of a sidebar view of this panel (a real link: it can be opened in a new tab). */
  const hrefFor = useCallback(
    (v: ConnectionsView) => nav.href(openAside(updatePanel(nav.current(), id, { ref: sidebarRef }), id, { kind: "connections", view: formatWith(v) })),
    [nav, id, sidebarRef],
  );
  /** A sidebar view link: its address is this workspace with the view changed; nothing on screen moves. */
  const goSidebarView = useCallback(
    (href: string) => {
      const loc = toRouterLocation(href);
      // the panels keep their stable keys (as every workspace command writes them): without them a panel renumbered by an earlier
      // close was rebuilt by a mere change of sidebar view
      const state: NavState = { nav: "stay", panel: id, panelKeys: panelKeysOf(nav.current()) };
      void router.navigate({ to: loc.to as never, search: loc.search as never, resetScroll: false, state: state as never });
    },
    [router, id, nav],
  );
  // Keyboard focus that was in the sidebar goes back to the verse it was open on (the one marked current) when the sidebar closes,
  // so Tab carries on from there; legacy left it on <body> or the panel's Close link.
  const asideBox = useRef<HTMLDivElement>(null);
  const closeSidebar = useCallback(() => {
    const ref = current.ref ?? data.ref;
    const active = document.activeElement;
    const focusWasThere = !!active && !!asideBox.current?.contains(active);
    void Promise.resolve(apply((ws) => closeAside(updatePanel(ws, id, { ref }), id), { state: { nav: "select", panel: id, ref } })).then(() => {
      if (focusWasThere) focusVerseAfterClose(rootEl.current, ref);
    });
  }, [apply, id, current.ref, data.ref]);

  // ── the text ───────────────────────────────────────────────────────────────────────────────────────
  const viewRef = useRef(view);
  viewRef.current = view;
  const currentRef = useRef(current.ref);
  currentRef.current = current.ref;
  const onSelectSegment = useCallback(
    (ref: string) => {
      setPicked(null);
      readerAnalytics.segmentClicked(ref, !viewRef.current);
      // Selecting the verse that is already current while the sidebar is open closes the sidebar.
      if (viewRef.current && currentRef.current === ref) {
        apply((ws) => closeAside(updatePanel(ws, id, { ref }), id), { state: { nav: "select", panel: id, ref } });
        return;
      }
      apply(
        (ws) => {
          const existing = ws.panels[id]?.asides.find((a) => a.kind === "connections");
          // choosing another verse ends a name's card (the old closeNamedEntityInConnectionPanel)
          const keep = existing?.entity ? undefined : existing?.view;
          return openAside(updatePanel(ws, id, { ref }), id, { kind: "connections", view: keep ?? formatWith({ view: "resources" }), ...(existing ? {} : { lang: newSidebarLang }) });
        },
        { state: { nav: "select", panel: id, ref } },
      );
    },
    [apply, id, newSidebarLang],
  );

  /**
   * "Open" from the sidebar (a connected text, a translation's or a version's Open Text), exactly as sefaria.org: the sidebar is
   * replaced by a new text panel right after this one, showing that text as itself (a comment is not turned into its base text),
   * in the version chosen if any; bilingual when this panel is, else in the sidebar's language. This panel keeps its verse.
   * VERIFIED: Genesis 1:1 + Rashi → Open → /Genesis.1.1?lang=bi&aliyot=0&p2=Rashi_on_Genesis.1.1.1&lang2=bi (50/50).
   * Old ReaderPanel.handleTextListClick → showBaseText → openPanelAt(replace). Phones: this panel goes there. CON-033, VER-011
   */
  const openFromSidebar = useCallback(
    (ref: string, versions: { primary?: string; translation?: string } = {}) => {
      const before = nav.current();
      if (isSinglePanel()) {
        apply((ws) => closeAside(updatePanel(ws, id, { ref, versions: { ...versions } }), id), { state: { nav: "go", panel: id } });
        return;
      }
      const aside = before.panels[id]?.asides.find((a) => a.kind === "connections");
      const lang = settings.language === "bilingual" ? "bi" : aside?.lang === "he" ? "he" : aside?.lang === "en" ? "en" : settings.language === "hebrew" ? "he" : "en";
      const [after, opened] = openNextToWithId(closeAside(before, id), id, { kind: "text", ref, versions: { ...versions }, lang });
      nav.go(after, { state: { nav: "go", panel: opened } });
    },
    [apply, nav, id, settings.language],
  );
  const openTextHere = useCallback((ref: string) => openFromSidebar(ref), [openFromSidebar]);

  /** Search in this text: a new query replaces the last (no history entry), and opening a hit sends this panel to it in the
   *  version it was found in, the sidebar staying on the results (SRC-094, SRC-096). */
  const onSearchQuery = useCallback(
    (q: string) => apply((ws) => openAside(ws, id, { kind: "connections", view: "SidebarSearch", sbsq: q }), { replace: true, state: { nav: "stay", panel: id } }),
    [apply, id],
  );
  // The aleph / ayin button in the sidebar's header: its own language (`lang2`), the text's language untouched (SHL-014)
  const onSidebarLang = useCallback(
    (l: "en" | "he") => (readerAnalytics.languageToggled(l === "he" ? "hebrew" : "english"), apply((ws) => (aside ? updateAside(ws, id, aside.id, { lang: l }) : ws), { replace: true, state: { nav: "stay", panel: id } })),
    [apply, id, aside],
  );
  const openSearchHit = useCallback(
    (hit: SearchHit) => {
      const s = hit._source;
      const key = `${s.languageFamilyName}|${s.version}`;
      apply((ws) => updatePanel(ws, id, { ref: s.ref, versions: s.isPrimary ? { ...versions, primary: key } : { ...versions, translation: key } }), { state: { nav: "go", panel: id, terms: highlightsOf(hit) } });
    },
    [apply, id, versions],
  );

  /** Table of contents links: this panel goes there and its sidebar stays on the contents (VERIFIED on sefaria.org). BOK-008 */
  const goToRef = useCallback((ref: string) => apply((ws) => updatePanel(ws, id, { ref }), { state: { nav: "go", panel: id } }), [apply, id]);

  // A citation inside the sidebar (a dictionary entry) opens the cited text after this panel and the sidebar stays (the old
  // onCitationClick from a connections panel; VERIFIED on sefaria.org: …&with=Lexicon&lang2=bi&p3=…). Phones: in its place.
  // A comment opens as its base text with the commentator alongside. SHL-049, TXT-015, CON-038
  const onRefClick = useCallback(
    (ref: string) => {
      void panelForRef(qc, ref).then((target) => {
        const before = nav.current();
        if (isSinglePanel()) {
          nav.go(replace(before, id, target), { state: { nav: "go" } });
          return;
        }
        const [after, opened] = openNextToWithId(before, id, target);
        nav.go(after, { state: { nav: "go", panel: opened } });
      });
    },
    [qc, id, nav],
  );

  // A citation in the text, exactly as sefaria.org (owner decision 2026-10-06; ReaderApp.handleCitationClick): whatever is next to
  // this panel closes — its sidebar, or else the next panel, even one the reader opened — the verse holding the citation becomes
  // this panel's current verse, and the cited text opens right after it. VERIFIED: [Ramban, Exodus 1] → citation →
  // [Ramban on Genesis 1:1:1, Exodus 12:2]; a second citation replaces the first.
  const onCitationClick = useCallback(
    (ref: string, e?: React.MouseEvent) => {
      readerAnalytics.citationClicked(ref);
      const verse = (e?.target as Element | undefined)?.closest<HTMLElement>("[data-ref]")?.dataset.ref;
      void panelForRef(qc, ref).then((target) => {
        const before = nav.current();
        if (isSinglePanel()) {
          nav.go(replace(before, id, target), { state: { nav: "go" } });
          return;
        }
        let ws = before;
        if (ws.panels[id]?.asides.length) ws = closeAside(ws, id);
        else {
          const order = panelOrder(ws);
          const next = order[order.indexOf(id) + 1];
          if (next) ws = close(ws, next);
        }
        if (verse) ws = updatePanel(ws, id, { ref: verse });
        const [after, opened] = openNextToWithId(ws, id, target);
        nav.go(after, { state: { nav: "go", panel: opened } });
      });
    },
    [qc, id, nav],
  );

  // Words selected in the text: with the sidebar open, a lookup of up to three Hebrew words in one segment switches it
  // to the dictionaries. A selection never opens a closed sidebar. (VERIFIED on sefaria.org; unlike there, the URL
  // follows every lookup, not just the first.) CON-042, TXD-059
  const sectionSegmentsRef = useRef<string[]>([]);
  sectionSegmentsRef.current = current.passage.segments.map((s) => s.ref);
  const onSelectWords = useCallback(
    (words: string, refs: string[]) => {
      // Text selected across several segments: they are highlighted, the sidebar (if open) shows them, and the address follows the
      // old reader's rule (lib/text/range-selection.ts), replacing the entry. A selection never opens a closed sidebar.
      if (refs.length > 1) {
        setPicked(refs);
        const sidebarOpen = asideRef.current.length > 0;
        if (sidebarOpen) setSelection(refs);
        const ref = selectionAddress(refs, { sidebarOpen, sectionSegments: sectionSegmentsRef.current });
        if (ref) apply((ws) => updatePanel(ws, id, { ref }), { replace: true, state: { nav: "stay", panel: id } });
        return;
      }
      if (!asideRef.current.length || refs.length !== 1 || !shouldActivateLookup(words)) return;
      const ref = refs[0]!;
      const inLexicon = parseWith(asideRef.current[0]?.view)?.view === "mode" && (parseWith(asideRef.current[0]?.view) as { mode?: string }).mode === "Lexicon";
      apply((ws) => openAside(updatePanel(ws, id, { ref }), id, { kind: "connections", view: "Lexicon", lookup: words }), { replace: inLexicon, state: { nav: "select", panel: id, ref } });
    },
    [apply, id],
  );

  // A highlighted name in the text opens the Lexicon sidebar on who or what it is (CON-045, TXD-022). The segment it stands
  // in becomes the selection; the sidebar then belongs to this panel. Plain clicks only (a modified click opens the topic
  // page, which is the link's address).
  const onEntityClick = useCallback(
    (slug: string, e: React.MouseEvent) => {
      const a = (e.target as Element).closest("a");
      const seg = (e.target as Element).closest<HTMLElement>("[data-ref]");
      const ref = seg?.dataset.ref;
      if (!ref || !a) return;
      readerAnalytics.namedEntityClicked(slug);
      apply((ws) => openAside(updatePanel(ws, id, { ref }), id, { kind: "connections", view: "Lexicon", entity: { slug, text: a.textContent ?? "" }, ...(ws.panels[id]?.asides.length ? {} : { lang: newSidebarLang }) }), { state: { nav: "select", panel: id, ref } });
    },
    [apply, id, newSidebarLang],
  );

  // A stored setting changed from the menu must win over the same setting in the URL.
  const onChange = (patch: Partial<ReaderSettings>) => {
    update(patch);
    if (patch.language !== undefined && panel.lang) apply((ws) => updatePanel(ws, id, { lang: languageToParam(patch.language!) }), { replace: true, state: { nav: "stay", panel: id } });
    if (patch.aliyotTorah !== undefined && panel.aliyot !== undefined) apply((ws) => updatePanel(ws, id, { aliyot: patch.aliyotTorah ? 1 : 0 }), { replace: true, state: { nav: "stay", panel: id } });
  };

  // ── versions ───────────────────────────────────────────────────────────────────────────────────────
  /** The panel with a translation chosen. VERIFIED on sefaria.org (2026-10-05): choosing a translation always
   *  makes the panel bilingual, whatever it showed (the old _getPanelLangOnVersionChange: "has both versions"
   *  is always true in a text panel). VER-003, VER-012 */
  const withTranslation = useCallback(
    (ws: Workspace, v: TranslationVersion, ref?: string) =>
      updatePanel(ws, id, { versions: { ...versions, translation: `${v.languageFamilyName}|${v.versionTitle}` }, lang: "bi", ...(ref ? { ref } : {}) }),
    [id, versions],
  );
  const translationPreviewHref = useCallback(
    (v: TranslationVersion) => nav.href(openAside(updatePanel(nav.current(), id, { ref: sidebarRef }), id, { kind: "connections", view: "Translation Open", vside: versionKey(v) })),
    [nav, id, sidebarRef],
  );
  /** Choosing a source version: like a translation, it makes the panel bilingual (verified), but is not remembered. */
  const withSource = useCallback(
    (ws: Workspace, v: VersionMeta) => updatePanel(ws, id, { versions: { ...versions, primary: `${v.languageFamilyName}|${v.versionTitle}` }, lang: "bi" }),
    [id, versions],
  );
  const selectSourceHref = useCallback((v: VersionMeta) => nav.href(withSource(nav.current(), v)), [nav, withSource]);
  const onSelectSource = useCallback(
    (v: VersionMeta) => {
      readerAnalytics.versionChosen(section.indexTitle, v.versionTitle, v.language ?? "he", settings.language);
      apply((ws) => withSource(ws, v), { state: { nav: "stay", panel: id } });
    },
    [apply, withSource, id, section.indexTitle, settings.language],
  );
  const versionOpenHref = useCallback(
    (v: VersionMeta) => nav.href(openAside(updatePanel(nav.current(), id, { ref: sidebarRef }), id, { kind: "connections", view: "Version Open", vside: versionKey(v) })),
    [nav, id, sidebarRef],
  );
  const translationHref = useCallback((v: TranslationVersion) => nav.href(withTranslation(nav.current(), v)), [nav, withTranslation]);
  const onSelectTranslation = useCallback(
    (v: TranslationVersion) => {
      readerAnalytics.versionChosen(section.indexTitle, v.versionTitle, v.language ?? "en", settings.language);
      apply((ws) => withTranslation(ws, v), { state: { nav: "stay", panel: id } });
      // Remember it for this corpus (the cookie the loader reads next time). VER-002
      void qc.fetchQuery(indexMetaQueryOptions(section.indexTitle)).then((m) => rememberTranslation(m.corpora?.[0], v.versionTitle), () => undefined);
    },
    [apply, withTranslation, id, qc, section.indexTitle, settings.language],
  );
  // "Open Text": the passage itself, in that translation (old onRangeClick with the version).
  const onOpenTranslation = useCallback(
    (v: TranslationVersion) => openFromSidebar(sidebarRef, { translation: `${v.languageFamilyName}|${v.versionTitle}` }),
    [openFromSidebar, sidebarRef],
  );
  /** A source version's Open Text (Version Open view): as a translation's, with that version as the source. */
  const onOpenSource = useCallback(
    (v: VersionMeta) => openFromSidebar(sidebarRef, { primary: `${v.languageFamilyName}|${v.versionTitle}` }),
    [openFromSidebar, sidebarRef],
  );

  // The header's close button closes this panel; closing the only panel goes back to the library (SHL-048).
  // Closing one of several panels leaves keyboard focus on the panel beside it (its current verse), not on <body>.
  const closePanel = useCallback(() => {
    const panels = [...document.querySelectorAll<HTMLElement>("section[data-panel-id]")];
    const at = rootEl.current ? panels.indexOf(rootEl.current) : -1;
    const beside = at < 0 ? undefined : (panels[at - 1] ?? panels[at + 1]);
    const hadFocus = !!rootEl.current?.contains(document.activeElement);
    return Promise.resolve(apply((ws) => close(ws, id))).then(() => {
      if (hadFocus && beside) focusVerseAfterClose(beside);
    });
  }, [apply, id]);

  // "Want to change the translation?" (TXD-064): after mount, so the server render and the first client render agree
  const [bannerGone, setBannerGone] = useState(Boolean(data.bannerDismissed));
  const transBanner = !bannerGone && openTransBannerApplies(data.corpus, settings.language);

  // The strip comes and goes with the panel's language; the column below it must not move the text the reader is on:
  // when its height changes the column's scroll position moves by the same amount.
  const bannerBox = useRef<HTMLDivElement>(null);
  const bannerHeight = useRef(0);
  useLayoutEffect(() => {
    const h = bannerBox.current?.offsetHeight ?? 0;
    const delta = h - bannerHeight.current;
    const first = bannerHeight.current === 0 && delta === h && h === 0;
    bannerHeight.current = h;
    const scroller = bannerBox.current?.parentElement?.querySelector<HTMLElement>("[data-reader-scroller]") ?? null;
    if (delta && scroller && !first && scrolledOnce.current) scroller.scrollTop += delta;
    scrolledOnce.current = true;
  }, [transBanner]);
  const scrolledOnce = useRef(false);

  const showsSource = settings.language !== "english";
  const sample = section.segments.find((s) => s.primary && hasNikud(s.primary))?.primary ?? section.segments[0]?.primary ?? "";
  const availability = displayMenuAvailability({ settings, book: section.book, primaryCategory: section.primaryCategory, hebrewSample: sample, showsSource });
  const interfaceLang = useInterfaceLang();
  const he = interfaceLang === "hebrew";
  // the bar's accessible names in the interface's language (strings from legacy's interface/he.json where it has them)
  const displayOptionsLabel = he ? "אפשרויות תצוגת טקסט" : "Text display options";

  // A polite live region names the section the reader has moved into, once it is settled (legacy's header was aria-live).
  // Once per section, never per verse, and not on arrival (the page's title and heading say where the reader is).
  const sectionName = he ? section.heSectionRef : section.sectionRef;
  const [announced, setAnnounced] = useState("");
  const announcedFor = useRef(sectionName);
  useEffect(() => {
    if (sectionName === announcedFor.current) return;
    const t = setTimeout(() => {
      announcedFor.current = sectionName;
      setAnnounced(sectionName);
    }, ANNOUNCE_SETTLE_MS);
    return () => clearTimeout(t);
  }, [sectionName]);

  // ── signed-in: reading history and Save (USL-010, USL-011) ──────────────────────────────────────────────
  const viewer = useViewer();
  // Continue Reading on the book page resumes from here (BOK-003), for this reader only
  const viewerId = viewer?.id ?? null;
  useEffect(() => {
    if (current.ref) rememberPlace(current.passage.indexTitle, current.ref, viewerId);
  }, [current.ref, current.passage.indexTitle, viewerId]);
  const place: PanelPlace | null = useMemo(() => {
    // the old getHistoryObject: the chosen verses while the sidebar is open (normRef of the selection), else the section being read
    const chosen = view && deferredRefs.length && deferredRefs.length < sidebarSection.segments.length ? selectionRange(deferredRefs, deferredRefs[0]!) : null;
    return {
      ref: chosen ?? section.sectionRef,
      heRef: chosen ? undefined : section.heSectionRef,
      // the versions shown (the address's, completed by the reader's preferences as the loader resolved them), as the old reader's
      // currVersions carried its preferences: a preferred translation not named in the address was saved as none
      versions: legacyVersions(versions),
      book: section.indexTitle,
      language: settings.language,
    };
  }, [view, deferredRefs, sidebarSection, section.sectionRef, section.heSectionRef, section.indexTitle, versions, settings.language]);
  useReaderHistory(viewer, place, Boolean(view));
  const save = useSaved(viewer, place, () => setSaveAsked(true));
  // a kept Torah portion / aliyah range names its verses in this section, as the old header does
  const rangeVerses = useMemo(
    () => (rangeHighlight ? section.segments.filter((s) => isHighlighted(s.address, rangeHighlight, section.addressTypes)).map((s) => Number(s.address[s.address.length - 1])).filter(Number.isFinite) : []),
    [rangeHighlight, section],
  );
  // With the sidebar open on verses narrower than their section, the title names them ("Genesis 6:16"), as sefaria.org's header shows
  // the panel's current ref (the selected segment); otherwise the section being read, or a kept portion's verses
  const chosenVerses = useMemo(() => {
    if (!view || !deferredRefs.length || deferredRefs.length >= sidebarSection.segments.length) return [];
    const chosen = new Set(deferredRefs);
    return sidebarSection.segments.filter((s) => chosen.has(s.ref)).map((s) => Number(s.address[s.address.length - 1])).filter(Number.isFinite);
  }, [view, deferredRefs, sidebarSection]);
  const titled = chosenVerses.length ? sidebarSection : section;
  const header = headerLabels(narrowToVerses({
    sectionRef: titled.sectionRef, heSectionRef: titled.heSectionRef, categories: titled.categories,
    translationVersion: titled.translationVersion, primaryVersion: titled.primaryVersion, language: settings.language, interfaceLang,
  }, chosenVerses.length ? chosenVerses : rangeVerses));
  const shownVersions = { he: sidebarSection.primaryVersion?.versionTitle, en: sidebarSection.translationVersion?.versionTitle };
  const linkFilter = useMemo(() => (view?.view === "texts" && !view.filter.endsWith("|Essay") ? [view.filter] : []), [view?.view, view?.view === "texts" ? view.filter : ""]); // eslint-disable-line react-hooks/exhaustive-deps

  // Main view and side panels, arranged by the panel's own layout (default: side panels in a column).
  // Without a sidebar the frame is still a row (of one): a bare leaf there and a row once the sidebar opens put the reading column
  // under different elements, and React rebuilt it — loaded sections, scroll engine, footnotes and selection — on every open and
  // close (the workspace keeps its row of panels the same way). Not split(): it normalises a row of one to a leaf.
  const frame: LayoutNode<typeof MAIN | AsideId> = useMemo(() => {
    if (!panel.asides.length) return { type: "split", direction: "row", children: [leaf(MAIN)], sizes: [1] } as LayoutNode<typeof MAIN | AsideId>;
    const asides = panel.asideLayout ?? split("column", panel.asides.map((a) => leaf(a.id)));
    return split("row", [leaf(MAIN), asides], innerSizes && innerSizes.length === 2 ? innerSizes : [0.68, 0.32]);
  }, [panel.asides, panel.asideLayout, innerSizes]);

  const main = (
    <div className={styles.text}>
      <PanelHeader
        sticky
        category={section.categories}
        title={<a href={`/${refToUrl(section.indexTitle)}`} lang={header.lang} dir={header.lang === "he" ? "rtl" : "ltr"} style={{ color: "inherit", textDecoration: "none" }}>{header.title}</a>}
        subtitle={
          header.attribution || header.version ? (
            <>
              {header.attribution ? <span lang={header.lang} dir={dirFor(header.lang)}>{header.attribution.text}</span> : null}
              {header.version ? <span>{header.version}</span> : null}
            </>
          ) : undefined
        }
        start={
          <>
            <span className={styles.notPhone}><CloseTextButton label={alone ? (he ? "חזרה לספריה" : "Back to the library") : he ? "סגירת הטקסט" : "Close this text"} onClick={() => void closePanel()} /></span>
            <span className={styles.onlyPhone}><IconButton icon="menu" label={he ? "תפריט" : "Menu"} onClick={() => setMobileMenuOpen(true)} /></span>
          </>
        }
        end={
          <>
          <SaveTextButton
            saved={viewer ? save.isSaved : undefined}
            label={saveLabel(save.isSaved, he, place?.ref ?? section.ref, place ? place.heRef : section.heSectionRef)}
            onClick={save.click}
          />
          <Popover
            open={menuOpen}
            onOpenChange={(o) => {
              // the old DisplaySettingsButton's click event (onclick_ToolTipped), on opening the menu
              if (o && !menuOpen) readerAnalytics.displayOptionsClicked({ categories: section.categories, book: section.book, refs: view && selectedRefs.length === 1 ? [section.ref, selectedRefs[0]!] : [section.ref], interfaceLang });
              setMenuOpen(o);
            }}
            label={displayOptionsLabel}
            flush
            panelClassName={styles.displayMenu}
            trigger={(p) => <DisplayOptionsButton {...p} label={displayOptionsLabel} />}
          >
            <DisplaySettingsMenu settings={settings} availability={availability} layoutKey={layoutKeyFor(section.primaryCategory)} onChange={onChange} directions={{ primary: section.primaryVersion?.direction, translation: section.translationVersion?.direction }}
              onRecordSession={sessionEntry ? () => (setMenuOpen(false), sessionEntry.onRecordSession()) : undefined}
              onLoadRecording={sessionEntry ? () => (setMenuOpen(false), sessionEntry.onLoadRecording()) : undefined} />
          </Popover>
          </>
        }
      />
      <VisuallyHidden role="status" aria-live="polite" aria-atomic="true" data-testid="reader-announcer">{announced}</VisuallyHidden>
      <SignUpModal kind={saveAsked ? "save" : undefined} onClose={() => setSaveAsked(false)} next={typeof window === "undefined" ? "/" : window.location.href} />
      <div ref={bannerBox}>
      {transBanner ? (
        <TextColumnBanner
          onClose={() => { dismissBanner(); setBannerGone(true); }}
          actions={[{ name: "Go to translations", label: <InterfaceText en="Go to translations" he="לרשימת התרגומים" />, onClick: () => goSidebarView(hrefFor({ view: "mode", mode: "Translations" })) }]}
        >
          <InterfaceText en={<>Want to <strong>change</strong> the translation?</>} he="מעוניינים בתרגום אחר?" />
        </TextColumnBanner>
      ) : null}
      </div>
      <TextColumn
        key={entry.current.key}
        pinned={data.sectionRefs}
        initial={initial}
        versions={versions}
        initialVersionsKey={selectionKey(data.versions)}
        restore={restore}
        registerPosition={registerPosition}
        onSections={onSections}
        settings={settings}
        target={entry.current.target}
        highlight={shownHighlight}
        terms={navState.mine && navState.kind === "go" ? readNavState(location.state).terms : undefined}
        selected={selected}
        showFocus={Boolean(view)}
        connectionsOnScreen={Boolean(view)}
        linkFilter={linkFilter}
        onFocus={onFocus}
        onSettled={onSettled}
        onSelectSegment={onSelectSegment}
        onEntityClick={onEntityClick}
        onRefClick={onCitationClick}
        onSelectWords={onSelectWords}
      />
    </div>
  );

  return (
    <section
      ref={rootEl}
      className={styles.panel}
      data-panel-id={id}
      data-has-aside={view ? "true" : "false"}
      // a name of its own: the sections inside are regions named by their refs, and two landmarks may not share a name
      aria-label={interfaceLang === "hebrew" ? `חלון קריאה: ${section.heSectionRef}` : `Reading panel: ${section.sectionRef}`}
      // Escape inside a panel closes it (SHL-071) — unless something inside already used the key (a menu, a dialog, a box). With the
      // sidebar open it closes the sidebar only, wherever the focus is (in legacy the sidebar is a panel of its own, so Escape there
      // closed just it): Escape never throws a reader with the sidebar open out to the library.
      onKeyDown={(e) => {
        if (e.key !== "Escape" || e.defaultPrevented || e.isPropagationStopped()) return;
        if ((e.target as Element).closest("input, textarea, select, [role=dialog], dialog, [aria-expanded=true]")) return;
        e.preventDefault();
        if (view) {
          const ref = current.ref ?? data.ref;
          const fromAside = !!asideBox.current?.contains(e.target as Node);
          void Promise.resolve(apply((ws) => closeAside(updatePanel(ws, id, { ref }), id), { state: { nav: "select", panel: id, ref } })).then(() => {
            if (fromAside) focusVerseAfterClose(rootEl.current, ref);
          });
          return;
        }
        void closePanel();
      }}
    >
      <SplitView
        node={frame}
        renderLeaf={(leafId) =>
          leafId === MAIN ? (
            main
          ) : view ? (
            <div className={styles.aside} ref={asideBox}>
              <ConnectionsPane
                view={view}
                hrefFor={hrefFor}
                sectionRef={sidebarSectionRef}
                section={sidebarSection}
                selectedRefs={deferredRefs}
                baseCategory={section.primaryCategory}
                settings={settings}
                shownVersions={shownVersions}
                onNavigate={goSidebarView}
                onOpenText={openTextHere}
                onGoToRef={goToRef}
                versions={versions}
                searchQuery={aside?.sbsq}
                onSearchQuery={onSearchQuery}
                onOpenSearchHit={openSearchHit}
                translationHref={translationHref}
                translationPreviewHref={translationPreviewHref}
                versionFilter={aside?.vside}
                selectSourceHref={selectSourceHref}
                onSelectSource={onSelectSource}
                versionOpenHref={versionOpenHref}
                lookupWords={aside?.lookup}
                entity={aside?.entity}
                onOpenRef={onRefClick}
                currentSourceTitle={versions.primary?.split("|").slice(1).join("|") || undefined}
                onSelectTranslation={onSelectTranslation}
                onOpenTranslation={onOpenTranslation}
                onOpenSource={onOpenSource}
                allOpenRefs={panelOrder(nav.current()).map((pid) => nav.current().panels[pid]?.ref).filter((r): r is string => !!r)}
                onClose={closeSidebar}
                // a bilingual sidebar (an old link's lang2=bi) shows as the text's language for now
                lang={aside?.lang === "bi" ? undefined : aside?.lang}
                onLang={onSidebarLang}
              />
            </div>
          ) : null
        }
      />
    </section>
  );
}

/** How long the reader stays in a new section before the live region names it (a fling through several says only the last). */
const ANNOUNCE_SETTLE_MS = 700;

/** The bookmark button's name: Save "Genesis 1" / Remove "Genesis 1", in Hebrew שמירת "בראשית א׳" / הסרת "בראשית א׳". */
function saveLabel(saved: boolean, he: boolean, ref: string, heRef: string | undefined): string {
  if (he) return `${saved ? "הסרת" : "שמירת"} "${heRef ?? ref}"`;
  return `${saved ? "Remove" : "Save"} "${ref}"`;
}

/**
 * After the sidebar or a panel closed: keyboard focus to `panel`'s verse `ref` (else its current or reading verse), without moving the
 * text — once React has drawn the change, and only if focus was left with nowhere to be (on <body>, or on a control now removed).
 */
function focusVerseAfterClose(panel: HTMLElement | null, ref?: string) {
  requestAnimationFrame(() => {
    const active = document.activeElement;
    if (!panel?.isConnected || (active && active !== document.body && active.isConnected)) return;
    const verse =
      (ref ? panel.querySelector<HTMLElement>(`[role="group"][data-ref="${CSS.escape(ref)}"]`) : null) ??
      panel.querySelector<HTMLElement>('[role="group"][aria-current="true"], [role="group"][data-focused="true"]');
    verse?.focus({ preventScroll: true });
  });
}
