import { useQueryClient, useSuspenseQueries } from "@tanstack/react-query";
import { useLocation, useRouter } from "@tanstack/react-router";
import { useCallback, useDeferredValue, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { leaf, split, type LayoutNode } from "~/lib/layout/tree";
import { formatWith, parseWith, type ConnectionsView } from "~/lib/connections/url";
import { displayMenuAvailability, hasNikud, layoutKeyFor, type ReaderSettings } from "~/lib/reader/settings";
import { headerLabels } from "~/lib/reader/header";
import { useInterfaceLang } from "~/lib/i18n/interface-lang";
import { applySearchToSettings, languageToParam } from "~/lib/reader/url-state";
import type { TextPassage, VersionMeta } from "~/lib/text/model";
import { shouldActivateLookup } from "~/lib/lexicon/lookup";
import { highlightsOf, type SearchHit } from "~/lib/search/text-search";
import { versionKey, type TranslationVersion } from "~/lib/versions/translations";
import { isHighlighted } from "~/lib/text/plan";
import { prefetchNeighbours, selectionKey, textQueryOptions } from "~/lib/text/queries";
import { close, closeAside, openAside, openNextTo, panelOrder, replace, updatePanel, updateAside } from "~/lib/workspace/ops";
import type { AsideId, PanelId, TextPanelState, Workspace } from "~/lib/workspace/types";
import { DisplaySettingsMenu } from "~/ui/DisplaySettingsMenu/DisplaySettingsMenu";
import { IconButton } from "~/ui/IconButton/IconButton";
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
import { entryKey, navFor, readNavState, useWorkspaceNav, type NavState } from "../workspace/navigation";
import { panelForRef } from "../workspace/open-ref";
import { toRouterLocation } from "../shared/RouterLink";
import { ConnectionsPane } from "./ConnectionsPane";
import styles from "./TextPanel.module.css";
import { setMobileMenuOpen } from "../shell/mobile-menu";
import { SignUpModal } from "~/ui/SignUpModal/SignUpModal";
import type { ReaderRouteData } from "./reader-route";
import { useReaderSettings } from "./settings-context";
import { SETTLE_MS } from "./use-reading-scroll";
import { TextColumn } from "./TextColumn";

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
const addedPanel = (before: Workspace, after: Workspace): PanelId | undefined => panelOrder(after).find((id) => !before.panels[id]);

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
  const router = useRouter();
  const location = useLocation();
  const qc = useQueryClient();
  const [menuOpen, setMenuOpen] = useState(false);
  const [saveAsked, setSaveAsked] = useState(false);
  const id = panel.id;
  // The URL's versions when it names any, else what the loader resolved from the reader's preferences (VER-014).
  const versions = panel.versions.translation || panel.versions.primary ? panel.versions : data.versions;
  // In the versions the loader loaded: when the URL names new ones the column swaps them in itself, so the
  // panel never suspends (no loading flash) and never loses the reader's place.
  const initial = useSuspenseQueries({ queries: data.sectionRefs.map((r) => textQueryOptions(r, data.versions)) }).map((q) => q.data);
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
    (op: (ws: Workspace) => Workspace, opts: { replace?: boolean; state?: NavState } = {}) => nav.go(op(nav.current()), opts),
    [nav],
  );

  // ── which navigation is this, for this panel? ──────────────────────────────────────────────────────
  const navState = navFor(readNavState(location.state), id);
  const kind = navState.kind;
  const urlSegments = useMemo(() => {
    const p = initial[0]!;
    return data.highlight ? p.segments.filter((s) => isHighlighted(s.address, data.highlight!, p.addressTypes)).map((s) => s.ref) : [];
  }, [initial, data.highlight]);

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
  const registerPosition = useCallback((get: () => SavedPosition | undefined) => nav.registerPanel(id, get), [nav, id]);
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

  const onFocus = useCallback((ref: string, passage: TextPassage) => {
    setCurrent((c) => (c.ref === ref && c.passage === passage ? c : { ref, passage }));
  }, []);

  const asideRef = useRef(panel.asides);
  asideRef.current = panel.asides;
  const onSettled = useCallback(
    (ref: string) => {
      if (asideRef.current.length) setSelection([ref]);
      // The address bar always names the verse being read (like the old reader), without moving anything.
      apply((ws) => updatePanel(ws, id, { ref }), { replace: true, state: { nav: "scroll", panel: id } });
    },
    [apply, id],
  );

  // A range URL ("Genesis 1:3-5") collapses to its first verse once the column settles, as in the old reader
  // (verified on sefaria.org: the range is never highlighted as a whole, even with the sidebar open).
  const isRangeArrival = (kind === undefined || kind === "go") && urlSegments.length > 1;
  useEffect(() => {
    if (!isRangeArrival) return;
    const t = setTimeout(() => onSettled(urlSegments[0]!), SETTLE_MS);
    return () => clearTimeout(t);
  }, [isRangeArrival, urlSegments, onSettled]);

  // ── side panels ────────────────────────────────────────────────────────────────────────────────────
  const aside = panel.asides.find((a) => a.kind === "connections");
  const view: ConnectionsView | undefined = parseWith(aside?.view);
  const section = current.passage;
  const selectedRefs = useMemo(() => {
    if (selection) return selection;
    if (urlSegments.length) return urlSegments;
    return section.segments.map((s) => s.ref); // a section-level URL selects the whole section
  }, [selection, urlSegments, section]);
  // Keep the sidebar from competing with scrolling: it catches up when the main thread is free.
  const deferredRefs = useDeferredValue(selectedRefs);
  const sidebarSectionRef = useMemo(() => {
    const ref = deferredRefs[0];
    const p = ref ? [section, ...initial].find((x) => x.segments.some((s) => s.ref === ref)) : undefined;
    return (p ?? section).ref;
  }, [deferredRefs, section, initial]);
  const sidebarSection = [section, ...initial].find((p) => p.ref === sidebarSectionRef) ?? section;
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
      void router.navigate({ to: loc.to as never, params: loc.params as never, search: loc.search as never, resetScroll: false, state: { nav: "stay", panel: id } as never });
    },
    [router, id],
  );
  const closeSidebar = useCallback(() => {
    const ref = current.ref ?? data.ref;
    apply((ws) => closeAside(updatePanel(ws, id, { ref }), id), { state: { nav: "select", panel: id, ref } });
  }, [apply, id, current.ref, data.ref]);

  // ── the text ───────────────────────────────────────────────────────────────────────────────────────
  const viewRef = useRef(view);
  viewRef.current = view;
  const currentRef = useRef(current.ref);
  currentRef.current = current.ref;
  const onSelectSegment = useCallback(
    (ref: string) => {
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
          return openAside(updatePanel(ws, id, { ref }), id, { kind: "connections", view: keep ?? formatWith({ view: "resources" }) });
        },
        { state: { nav: "select", panel: id, ref } },
      );
    },
    [apply, id],
  );

  /** Send this panel to a text (the panel itself goes there; the others stay as they are). CON-033 */
  const openTextHere = useCallback(
    (ref: string) => apply((ws) => closeAside(updatePanel(ws, id, { ref }), id), { state: { nav: "go", panel: id } }),
    [apply, id],
  );

  /** Search in this text: a new query replaces the last (no history entry), and opening a hit sends this panel to it in the
   *  version it was found in, the sidebar staying on the results (SRC-094, SRC-096). */
  const onSearchQuery = useCallback(
    (q: string) => apply((ws) => openAside(ws, id, { kind: "connections", view: "SidebarSearch", sbsq: q }), { replace: true, state: { nav: "stay", panel: id } }),
    [apply, id],
  );
  // The aleph / ayin button in the sidebar's header: its own language (`lang2`), the text's language untouched (SHL-014)
  const onSidebarLang = useCallback(
    (l: "en" | "he") => apply((ws) => (aside ? updateAside(ws, id, aside.id, { lang: l }) : ws), { replace: true, state: { nav: "stay", panel: id } }),
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

  // A citation in the text opens the cited text beside this one (phones: in its place), a comment as its base
  // text with the commentator alongside. SHL-049, TXT-015
  const onRefClick = useCallback(
    (ref: string) => {
      void panelForRef(qc, ref).then((target) => {
        const before = nav.current();
        if (isSinglePanel()) {
          nav.go(replace(before, id, target), { state: { nav: "go" } });
          return;
        }
        const after = openNextTo(before, id, target);
        nav.go(after, { state: { nav: "go", panel: addedPanel(before, after) } });
      });
    },
    [qc, id, nav],
  );

  // Words selected in the text: with the sidebar open, a lookup of up to three Hebrew words in one segment switches it
  // to the dictionaries. A selection never opens a closed sidebar. (VERIFIED on sefaria.org; unlike there, the URL
  // follows every lookup, not just the first.) CON-042, TXD-059
  const onSelectWords = useCallback(
    (words: string, refs: string[]) => {
      if (!asideRef.current.length || refs.length !== 1 || !shouldActivateLookup(words)) return;
      const ref = refs[0]!;
      const inLexicon = parseWith(asideRef.current[0]?.view)?.view === "mode" && (parseWith(asideRef.current[0]?.view) as { mode?: string }).mode === "Lexicon";
      apply((ws) => openAside(updatePanel(ws, id, { ref }), id, { kind: "connections", view: "Lexicon", lookup: words }), { replace: inLexicon, state: { nav: "select", panel: id, ref } });
    },
    [apply, id],
  );

  // Continue Reading on the book page resumes from here (BOK-003)
  useEffect(() => {
    if (current.ref) rememberPlace(current.passage.indexTitle, current.ref);
  }, [current.ref, current.passage.indexTitle]);

  // A highlighted name in the text opens the Lexicon sidebar on who or what it is (CON-045, TXD-022). The segment it stands
  // in becomes the selection; the sidebar then belongs to this panel. Plain clicks only (a modified click opens the topic
  // page, which is the link's address).
  const onEntityClick = useCallback(
    (slug: string, e: React.MouseEvent) => {
      const a = (e.target as Element).closest("a");
      const seg = (e.target as Element).closest<HTMLElement>("[data-ref]");
      const ref = seg?.dataset.ref;
      if (!ref || !a) return;
      apply((ws) => openAside(updatePanel(ws, id, { ref }), id, { kind: "connections", view: "Lexicon", entity: { slug, text: a.textContent ?? "" } }), { state: { nav: "select", panel: id, ref } });
    },
    [apply, id],
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
  const onSelectSource = useCallback((v: VersionMeta) => apply((ws) => withSource(ws, v), { state: { nav: "stay", panel: id } }), [apply, withSource, id]);
  const versionOpenHref = useCallback(
    (v: VersionMeta) => nav.href(openAside(updatePanel(nav.current(), id, { ref: sidebarRef }), id, { kind: "connections", view: "Version Open", vside: versionKey(v) })),
    [nav, id, sidebarRef],
  );
  const translationHref = useCallback((v: TranslationVersion) => nav.href(withTranslation(nav.current(), v)), [nav, withTranslation]);
  const onSelectTranslation = useCallback(
    (v: TranslationVersion) => {
      apply((ws) => withTranslation(ws, v), { state: { nav: "stay", panel: id } });
      // Remember it for this corpus (the cookie the loader reads next time). VER-002
      void qc.fetchQuery(indexMetaQueryOptions(section.indexTitle)).then((m) => rememberTranslation(m.corpora?.[0], v.versionTitle), () => undefined);
    },
    [apply, withTranslation, id, qc, section.indexTitle],
  );
  // "Open Text": the passage itself, in that translation (old onRangeClick with the version).
  const onOpenTranslation = useCallback(
    (v: TranslationVersion) => apply((ws) => closeAside(withTranslation(ws, v, sidebarRef), id), { state: { nav: "go", panel: id } }),
    [apply, withTranslation, sidebarRef, id],
  );

  // The header's close button closes this panel; closing the only panel goes back to the library (SHL-048).
  const closePanel = useCallback(() => apply((ws) => close(ws, id)), [apply, id]);

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
  const header = headerLabels({
    sectionRef: section.sectionRef, heSectionRef: section.heSectionRef, categories: section.categories,
    translationVersion: section.translationVersion, primaryVersion: section.primaryVersion, language: settings.language, interfaceLang,
  });
  const shownVersions = { he: sidebarSection.primaryVersion?.versionTitle, en: sidebarSection.translationVersion?.versionTitle };
  const linkFilter = useMemo(() => (view?.view === "texts" && !view.filter.endsWith("|Essay") ? [view.filter] : []), [view?.view, view?.view === "texts" ? view.filter : ""]); // eslint-disable-line react-hooks/exhaustive-deps

  // Main view and side panels, arranged by the panel's own layout (default: side panels in a column).
  const frame: LayoutNode<typeof MAIN | AsideId> = useMemo(() => {
    if (!panel.asides.length) return leaf(MAIN);
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
              {header.attribution ? <span lang={header.lang}>{header.attribution.text}</span> : null}
              {header.version ? <span>{header.version}</span> : null}
            </>
          ) : undefined
        }
        start={
          <>
            <span className={styles.notPhone}><IconButton icon="close" label={alone ? "Back to the library" : "Close this text"} onClick={closePanel} /></span>
            <span className={styles.onlyPhone}><IconButton icon="menu" label="Menu" onClick={() => setMobileMenuOpen(true)} /></span>
          </>
        }
        end={
          <>
          <IconButton icon="bookmark" label={`Save "${section.ref}"`} onClick={() => setSaveAsked(true)} />
          <Popover
            open={menuOpen}
            onOpenChange={setMenuOpen}
            label="Text display options"
            flush
            trigger={(p) => <IconButton {...p} icon="font-size" label="Text display options" />}
          >
            <DisplaySettingsMenu settings={settings} availability={availability} layoutKey={layoutKeyFor(section.primaryCategory)} onChange={onChange} />
          </Popover>
          </>
        }
      />
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
        initial={initial}
        versions={versions}
        initialVersionsKey={selectionKey(data.versions)}
        restore={restore}
        registerPosition={registerPosition}
        onSections={onSections}
        settings={settings}
        target={entry.current.target}
        terms={navState.mine && navState.kind === "go" ? readNavState(location.state).terms : undefined}
        selected={selected}
        showFocus={Boolean(view)}
        connectionsOnScreen={Boolean(view)}
        linkFilter={linkFilter}
        onFocus={onFocus}
        onSettled={onSettled}
        onSelectSegment={onSelectSegment}
        onEntityClick={onEntityClick}
        onRefClick={onRefClick}
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
      aria-label={section.sectionRef}
      // Escape inside a panel closes it (SHL-071) — unless something inside already used the key (a menu, a dialog, a box)
      onKeyDown={(e) => {
        if (e.key !== "Escape" || e.defaultPrevented || e.isPropagationStopped()) return;
        if ((e.target as Element).closest("input, textarea, select, [role=dialog], dialog, [aria-expanded=true]")) return;
        closePanel();
      }}
    >
      <SplitView
        node={frame}
        renderLeaf={(leafId) =>
          leafId === MAIN ? (
            main
          ) : view ? (
            <div className={styles.aside}>
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
                onClose={closeSidebar}
                lang={aside?.lang}
                onLang={onSidebarLang}
              />
            </div>
          ) : null
        }
      />
    </section>
  );
}
