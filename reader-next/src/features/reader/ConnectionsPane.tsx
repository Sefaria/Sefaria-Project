import { useInfiniteQuery, useQueries, useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo } from "react";
import { tocQueryOptions } from "~/lib/catalog/toc";
import { filterLinks, linksForRefs, makeIndexLookup, sortLinks, withoutEssays, type RelatedLink } from "~/lib/connections/links";
import { linksQueryOptions } from "~/lib/connections/queries";
import { resourceCounts, resourcesQueryOptions } from "~/lib/connections/related";
import { refToUrl } from "~/lib/ref/url";
import { categoryView, essaysFor, linkSummary, topLevelSummary } from "~/lib/connections/summary";
import { categoryLabel } from "~/lib/connections/terms";
import type { ConnectionsView } from "~/lib/connections/url";
import { useInterfaceLang } from "~/lib/i18n/interface-lang";
import type { ReaderSettings } from "~/lib/reader/settings";
import { vocalizationMode } from "~/lib/reader/settings";
import type { Segment, TextPassage } from "~/lib/text/model";
import { segmentsInRef, containingSectionRef } from "~/lib/text/segments-in-ref";
import { textQueryOptions } from "~/lib/text/queries";
import { CategoryView } from "~/ui/ConnectionsPanel/CategoryView";
import { ConnectionsPanel, ResourcesTitle } from "~/ui/ConnectionsPanel/ConnectionsPanel";
import { ResourcesView } from "~/ui/ConnectionsPanel/ResourcesView";
import { TextList, type LinkedTextItem } from "~/ui/ConnectionsPanel/TextList";
import { InterfaceText } from "~/ui/InterfaceText/InterfaceText";
import { categoryColor } from "~/ui/tokens/category-color";
import { EmptyState, LoadingState } from "~/ui/Feedback/Feedback";
import { TranslationsView } from "~/ui/TranslationsView/TranslationsView";
import { allTranslationsQueryOptions, bucketLanguage, bucketTranslations, currentFirst, languageName, orderLanguages, parseVersionKey, type TranslationVersion } from "~/lib/versions/translations";
import { TranslationOpenView } from "~/ui/TranslationsView/TranslationOpenView";
import { AboutView } from "~/ui/AboutView/AboutView";
import { entriesForCategories, lexiconQueryOptions, shouldActivateLookup } from "~/lib/lexicon/lookup";
import { useDictionarySearch } from "../shared/useDictionarySearch";
import { DictionarySearch } from "~/ui/DictionarySearch/DictionarySearch";
import { LexiconView } from "~/ui/LexiconView/LexiconView";
import { readerAnalytics, uaEvent } from "~/lib/analytics";
import { useViewer } from "~/features/auth/viewer";
import { deleteNote, notesQuery, saveNote } from "~/lib/user/notes";
import { syncHistory } from "~/lib/user/history";
import { NotesView } from "~/ui/NotesView/NotesView";
import { AddToSheetView } from "~/ui/AddToSheetView/AddToSheetView";
import { addConnection, addToSheet, createSheet, sourcesFor, userSheetsQuery, type SheetVersion } from "~/lib/user/sheets";
import { AddConnectionView } from "~/ui/AddConnectionView/AddConnectionView";
import { VOICES } from "~/lib/shell/links";
import { NamedEntityView } from "~/ui/NamedEntityView/NamedEntityView";
import { entityQueryOptions, entitySourceNote } from "~/lib/connections/entity";
import { localizedRef, topicsForRefs } from "~/lib/connections/topics";
import { TopicsView } from "~/ui/TopicsView/TopicsView";
import { manuscriptsForRefs, mediaForRefs } from "~/lib/connections/media";
import { mergePages, sitesOf, sortPages, webPagesQueryOptions } from "~/lib/connections/webpages";
import { WebPagesView } from "~/ui/WebPagesView/WebPagesView";
import { ManuscriptsView } from "~/ui/ManuscriptsView/ManuscriptsView";
import { TorahReadingsView } from "~/ui/TorahReadingsView/TorahReadingsView";
import { useEffect, useState } from "react";
import { indexDetailsQueryOptions } from "~/lib/catalog/index-details";
import { tocStructures, type TocIndexRecord } from "~/lib/toc/model";
import { TocView } from "~/ui/TocView/TocView";
import { mergeTextResultsVersions, searchPathQueryOptions, textSearchQueryOptions, type SearchHit } from "~/lib/search/text-search";
import { versionApiToParam } from "~/lib/workspace/url";
import { SidebarSearch } from "~/ui/SidebarSearch/SidebarSearch";
import { useLocation } from "@tanstack/react-router";
import { currVersionsOf, sendFeedback } from "~/lib/feedback/feedback";
import { ShareView } from "~/ui/ShareView/ShareView";
import type { SignUpKind } from "~/lib/auth/signup-content";
import { SignUpModal } from "~/ui/SignUpModal/SignUpModal";
import { AdvancedToolsView } from "~/ui/AdvancedToolsView/AdvancedToolsView";
import { FeedbackView } from "~/ui/FeedbackView/FeedbackView";
import { aboutVersions, versionSectionOrder } from "~/lib/versions/about";
import { bookVersionsQueryOptions, versionsQueryOptions } from "~/lib/versions/book-versions";
import type { VersionMeta } from "~/lib/text/model";
import { SITE_ORIGIN } from "~/lib/config";

export interface ConnectionsPaneProps {
  view: ConnectionsView;
  /** The address of each sidebar view (the owning panel decides; docs/WORKSPACE.md). */
  hrefFor: (view: ConnectionsView) => string;
  /** The section containing the selection and the segments selected within it. */
  sectionRef: string;
  section: TextPassage | undefined;
  selectedRefs: string[];
  baseCategory: string | undefined;
  settings: ReaderSettings;
  /** Titles of the versions on screen, for essays that apply to one translation. */
  shownVersions: Record<string, string | undefined>;
  /** Follow a sidebar view link. */
  onNavigate: (href: string) => void;
  /** Open a connected text (in the owning panel, CON-033). */
  onOpenText: (ref: string) => void;
  /** The panel with a translation chosen (a real link), and choosing it / opening the passage in it. */
  translationHref: (v: TranslationVersion) => string;
  /** The sidebar previewing a translation (a link on each preview), and the version it now previews (`vside`). */
  translationPreviewHref: (v: TranslationVersion) => string;
  versionFilter?: string;
  /** The About box's version actions: choose a source version, preview a version in the sidebar. */
  selectSourceHref: (v: VersionMeta) => string;
  onSelectSource: (v: VersionMeta) => void;
  versionOpenHref: (v: VersionMeta) => string;
  /** Title of the source version the URL names (`vhe`), if any. */
  currentSourceTitle?: string;
  /** A name clicked in the text (`namedEntity`): the Lexicon view then shows who or what it is. */
  entity?: { slug: string; text: string };
  /** The words a Lexicon view looks up (`lookup`), and opening a text from it (a citation, a dictionary entry). */
  lookupWords?: string;
  onOpenRef: (ref: string) => void;
  /** Send the owning panel to a place, leaving the sidebar as it is (table of contents links). */
  onGoToRef: (ref: string) => void;
  /** The versions the panel shows ("<language>|<title>"), reported with feedback. */
  versions?: { primary?: string; translation?: string };
  /** Search in this text (`sbsq`): the query run, running a new one, and opening a hit. */
  searchQuery?: string;
  onSearchQuery: (query: string) => void;
  onOpenSearchHit: (hit: SearchHit) => void;
  onSelectTranslation: (v: TranslationVersion) => void;
  onOpenTranslation: (v: TranslationVersion) => void;
  /** A source version's Open Text: a new panel in that version (as a translation's). */
  onOpenSource?: (v: VersionMeta) => void;
  /** The texts open in every panel (each panel's chosen verse or section), for Add Connection (the old allOpenRefs). */
  allOpenRefs?: string[];
  onClose: () => void;
  /** The sidebar's own language (`lang2`) and changing it (the aleph / ayin button in its header). */
  lang?: "en" | "he";
  onLang?: (lang: "en" | "he") => void;
}

/** In the sidebar one language shows at a time: bilingual follows the interface language. */
function sidebarLanguage(language: ReaderSettings["language"], interfaceLang: "english" | "hebrew"): "hebrew" | "english" {
  return language === "bilingual" ? interfaceLang : language;
}

const textOf = (segs: Segment[], side: "primary" | "translation") => segs.map((s) => s[side]).filter(Boolean).join(" ");

/**
 * The resources sidebar for the selected verse(s). Loads the section's links (once; cached), the catalog,
 * and — for the connected-texts view — the text of each link, grouped by containing section so all of
 * Rashi's comments on a verse arrive in one request.
 *
 * @feature CON-012 @feature CON-019 @feature CON-025 @feature CON-030 @feature CON-032 @feature CON-071
 */
function ConnectionsPaneInner(props: ConnectionsPaneProps & { onSignUp: (kind: SignUpKind) => void }) {
  const { view, hrefFor, sectionRef, selectedRefs, settings, onNavigate, onOpenText, onClose } = props;
  // signed in: the reader's notes on the selection (the Notes tool and its count in Tools)
  const viewer = useViewer();
  const uid = viewer?.id ?? null;
  const notesRefs = selectedRefs.length ? selectedRefs : [sectionRef];
  const notesQ = useQuery(notesQuery(uid, notesRefs));
  const qcNotes = useQueryClient();
  const interfaceLang = useInterfaceLang();
  const hebrew = interfaceLang === "hebrew";
  const catalogQ = useQuery(tocQueryOptions());
  const linksQ = useQuery(linksQueryOptions(sectionRef));
  const catalog = catalogQ.data;
  const sectionLinks = linksQ.data;

  const selected = useMemo(() => (sectionLinks ? linksForRefs(sectionLinks, selectedRefs) : []), [sectionLinks, selectedRefs]);
  const lookup = useMemo(() => makeIndexLookup(catalog, sectionLinks ?? []), [catalog, sectionLinks]);

  const narrower = props.section ? selectedRefs.length < props.section.segments.length : true;
  const summary = useMemo(
    () => linkSummary(selected, { catalog, baseCategory: props.baseCategory, sectionLinks, narrowerThanSection: narrower, hebrew }),
    [selected, catalog, props.baseCategory, sectionLinks, narrower, hebrew],
  );

  const link = hrefFor;
  const resourcesHref = link({ view: "resources" });

  // Connected texts: filter, sort, then load each link's containing section.
  const filter = view.view === "texts" ? view.filter : undefined;
  const listLinks = useMemo(() => {
    if (!filter) return [] as RelatedLink[];
    const filtered = filterLinks(filter.endsWith("|Essay") ? selected : withoutEssays(selected), [filter], lookup);
    return sortLinks(filtered, hebrew);
  }, [filter, selected, lookup, hebrew]);

  const sectionRefsToLoad = useMemo(() => [...new Set(listLinks.map((l) => containingSectionRef(l.sourceRef)))], [listLinks]);
  const passages = useQueries({ queries: sectionRefsToLoad.map((r) => textQueryOptions(r, {})) });
  const passageByRef = new Map(sectionRefsToLoad.map((r, i) => [r, passages[i]?.data] as const));
  const waiting = filter !== undefined && listLinks.length > 0 && passages.some((q) => q.isPending);

  const items: LinkedTextItem[] = listLinks.map((l) => {
    const passage = passageByRef.get(containingSectionRef(l.sourceRef));
    const segs = passage ? segmentsInRef(passage, l.sourceRef) : [];
    const primary = passage?.primaryVersion;
    const translation = passage?.translationVersion;
    const p = textOf(segs, "primary");
    const t = textOf(segs, "translation");
    return {
      id: l._id,
      sourceRef: l.sourceRef,
      sourceHeRef: l.sourceHeRef,
      href: `/${l.sourceRef.replace(/ /g, "_").replace(/:/g, ".")}`,
      primary: p && primary ? { html: p, lang: primary.actualLanguage, dir: primary.direction } : undefined,
      translation: t && translation ? { html: t, lang: translation.actualLanguage, dir: translation.direction } : undefined,
      number: l.category === "Commentary" ? String(l.anchorVerse) : undefined,
      loading: !passage,
    };
  });

  // the sidebar's own language (`lang2`, the toggle in its header) wins; else the text's setting (never both at once, SHL-014)
  const language = props.lang ? (props.lang === "he" ? "hebrew" : "english") : sidebarLanguage(settings.language, interfaceLang);
  const shownLang = language === "hebrew" ? "he" : "en";
  const nav = (h: string) => onNavigate(h);

  // Resources rows: sheets, topics, manuscripts, readings (section data), web pages (the selection), translations.
  const onResources = view.view === "resources";
  const onTopics = view.view === "mode" && view.mode === "Topics";
  const onManuscripts = view.view === "mode" && view.mode === "manuscripts";
  const onReadings = view.view === "mode" && view.mode === "Torah Readings";
  const resourcesQ = useQuery({ ...resourcesQueryOptions(sectionRef), enabled: onResources || onTopics || onManuscripts || onReadings });
  const selectionRef = selectedRefs.length === 1 ? selectedRefs[0]! : sectionRef;
  // Web pages count only once their pages are cached (visiting the view loads them), as on sefaria.org.
  const webQ = useQuery({ ...webPagesQueryOptions(selectionRef), enabled: false });
  // The translations of this verse (not of the whole section): Berakhot 2a:1 has 5, the amud 6.
  const verseVersionsQ = useQuery({ ...versionsQueryOptions(selectionRef), enabled: onResources });
  const translations = (verseVersionsQ.data ?? []).filter((v) => !v.isSource).length;
  const counts = resourcesQ.data && verseVersionsQ.data ? resourceCounts(resourcesQ.data, selectedRefs, { webpages: webQ.data ? webQ.data.length : null, translations }) : undefined;
  const sheetsHref = `${hebrew ? "https://chiburim.sefaria.org.il" : VOICES}/sheets-with-ref/${refToUrl(selectionRef)}`;

  const onTranslations = view.view === "mode" && view.mode === "Translations";
  const onTranslationOpen = view.view === "mode" && view.mode === "Translation Open";
  const translationsQ = useQuery({ ...allTranslationsQueryOptions(selectionRef), enabled: onTranslations || onTranslationOpen });
  const currentTranslation = props.section?.translationVersion?.versionTitle;
  const translationLanguages = useMemo(() => {
    if (!translationsQ.data) return [];
    const buckets = bucketTranslations(translationsQ.data);
    return orderLanguages(Object.keys(buckets)).map((code) => ({ code, name: languageName(code, interfaceLang), versions: currentFirst(buckets[code]!, code, currentTranslation) }));
  }, [translationsQ.data, interfaceLang, currentTranslation]);

  // About this Text, and previewing one of its source versions (Version Open).
  const onAbout = view.view === "mode" && view.mode === "About";
  const onVersionOpen = view.view === "mode" && view.mode === "Version Open";
  const indexTitle = props.section?.indexTitle ?? "";
  /** What VersionBlock reported for a click on a version: to, from (the version shown in that language), categories, book. */
  const versionClick = (v: { versionTitle: string; language?: string; isPrimary?: boolean }) => ({
    to: v.versionTitle,
    from: (v.isPrimary ?? v.language === "he") ? props.shownVersions?.he : props.shownVersions?.en,
    categories: props.section?.categories ?? [],
    book: indexTitle,
  });
  // Search in this text: the book's search path first, then the query inside it, a page at a time
  const onSidebarSearch = view.view === "mode" && view.mode === "SidebarSearch";
  const searchPathQ = useQuery({ ...searchPathQueryOptions(indexTitle), enabled: onSidebarSearch && !!indexTitle });
  const searchQ = useInfiniteQuery({ ...textSearchQueryOptions(props.searchQuery ?? "", searchPathQ.data ?? ""), enabled: onSidebarSearch && !!props.searchQuery && searchPathQ.data !== undefined });
  const searchHits = useMemo(() => (searchQ.data ? mergeTextResultsVersions(searchQ.data.pages.flatMap((p) => p.hits)) : undefined), [searchQ.data]);
  const location = useLocation();
  const onNavigation = view.view === "mode" && view.mode === "Navigation";
  const detailsQ = useQuery({ ...indexDetailsQueryOptions(indexTitle), enabled: (onAbout || onNavigation || onSidebarSearch) && !!indexTitle });
  const lexiconName = (detailsQ.data as { lexiconName?: string } | undefined)?.lexiconName;
  // dictionary books: the search box looks words up instead of searching text (SRC-020)
  const dict = useDictionarySearch({ lexiconName, title: indexTitle, open: props.onGoToRef });
  const anyDict = useDictionarySearch({});
  const bookVersionsQ = useQuery({ ...bookVersionsQueryOptions(indexTitle), enabled: onAbout && !!indexTitle });
  const available = props.section?.availableVersions ?? [];
  const wantedSource = parseVersionKey(props.versionFilter);
  const sourcePreview = onVersionOpen ? available.find((v) => v.versionTitle === wantedSource?.title) : undefined;
  const sourceTextQ = useQuery({ ...textQueryOptions(selectionRef, sourcePreview ? { primary: `${sourcePreview.languageFamilyName}|${sourcePreview.versionTitle}` } : {}), enabled: onVersionOpen && !!sourcePreview });

  // Lexicon: the words selected in the text (or typed into the box). A typed search is not limited to the text's
  // categories and sends no lookup_ref; picking new words in the text clears it. CON-042, CON-043
  const onLexicon = view.view === "mode" && view.mode === "Lexicon";
  const [typedWord, setTypedWord] = useState<string | undefined>();
  useEffect(() => setTypedWord(undefined), [props.lookupWords]);
  const lookingUp = typedWord ?? props.lookupWords;
  const lookupRef = typedWord ? undefined : selectedRefs[0];
  const entityQ = useQuery({ ...entityQueryOptions(props.entity?.slug ?? ""), enabled: onLexicon && !!props.entity });
  const lexiconQ = useQuery({ ...lexiconQueryOptions(lookingUp ?? "", lookupRef), enabled: onLexicon && !!lookingUp && shouldActivateLookup(lookingUp, !!typedWord) });
  const lexiconEntries = lexiconQ.data ? (typedWord ? lexiconQ.data : entriesForCategories(lexiconQ.data, props.section?.categories)) : undefined;
  // LexiconBox: each lookup's answer reported as "Open" / "Open No Result" / <categories>/<book>
  useEffect(() => {
    if (!lexiconEntries || !lookingUp) return;
    const where = props.section ? ` / ${props.section.categories.join("/")}/${props.section.indexTitle}` : "";
    readerAnalytics.lexiconLookup(`${lexiconEntries.length === 0 ? "Open No Result" : "Open"}${where}`, lookingUp);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lexiconQ.data, lookingUp]);

  // Web pages: one request per selected verse (the old client did the same), merged, sorted, grouped by site.
  const onWebPages = view.view === "webpages";
  const pageQs = useQueries({ queries: onWebPages ? selectedRefs.map((r) => webPagesQueryOptions(r)) : [] });

  if (view.view === "webpages") {
    const pages = sortPages(mergePages(pageQs.map((q) => q.data)), interfaceLang);
    const shown = view.site ? pages.filter((p) => p.siteName === view.site) : pages;
    const failed = pageQs.find((q) => q.isError);
    return (
      <ConnectionsPanel
        label="Web Pages"
        back={{ href: view.site ? hrefFor({ view: "webpages" }) : resourcesHref, label: view.site ? <InterfaceText en="Web Pages" he="דפי אינטרנט" /> : <InterfaceText en="Resources" he="קישורים וכלים" /> }}
        lang={shownLang} onLang={props.onLang} onClose={onClose}
      >
        <WebPagesView
          pages={shown}
          sites={sitesOf(pages, interfaceLang)}
          site={view.site}
          loading={pageQs.some((q) => q.isPending)}
          error={failed ? "Unable to load web pages." : undefined}
          siteHref={(name) => hrefFor({ view: "webpages", site: name })}
          onSite={(name) => onNavigate(hrefFor({ view: "webpages", site: name }))}
          refLabel={(r) => localizedRef(r, props.section, hebrew ? "he" : "en")}
        />
      </ConnectionsPanel>
    );
  }

  if (onManuscripts || onReadings) {
    const back = { href: resourcesHref, label: <InterfaceText en="Resources" he="קישורים וכלים" /> };
    return (
      <ConnectionsPanel label={onManuscripts ? "Manuscripts" : "Torah Readings"} back={back} lang={shownLang} onLang={props.onLang} onClose={onClose}>
        {resourcesQ.isPending ? (
          <LoadingState />
        ) : onManuscripts ? (
          <ManuscriptsView pages={manuscriptsForRefs(resourcesQ.data?.manuscripts, selectedRefs)} />
        ) : (
          <TorahReadingsView clips={mediaForRefs(resourcesQ.data?.media, selectedRefs)} />
        )}
      </ConnectionsPanel>
    );
  }

  if (onTopics) {
    const topics = topicsForRefs(resourcesQ.data?.topics, selectedRefs);
    return (
      <ConnectionsPanel label="Topics" back={{ href: resourcesHref, label: <InterfaceText en="Resources" he="קישורים וכלים" /> }} lang={shownLang} onLang={props.onLang} onClose={onClose}>
        <TopicsView
          topics={topics}
          loading={resourcesQ.isPending}
          refLabel={localizedRef(selectionRef, props.section, hebrew ? "he" : "en")}
          topicHref={(slug) => `${SITE_ORIGIN}/topics/${slug}`}
          lang={language === "hebrew" ? "he" : "en"}
        />
      </ConnectionsPanel>
    );
  }

  if (onLexicon && props.entity) {
    const note = entitySourceNote(selectionRef, { en: localizedRef(selectionRef, props.section, "en"), he: localizedRef(selectionRef, props.section, "he") });
    return (
      <ConnectionsPanel label="Dictionaries" back={{ href: resourcesHref, label: <InterfaceText en="Resources" he="קישורים וכלים" /> }} lang={shownLang} onLang={props.onLang} onClose={onClose}>
        <NamedEntityView answer={entityQ.data} text={props.entity.text} topicHref={(slug) => `${SITE_ORIGIN}/topics/${slug}`} sourceNote={interfaceLang === "hebrew" ? note.he : note.en} />
      </ConnectionsPanel>
    );
  }

  if (onLexicon) {
    const active = !!lookingUp && shouldActivateLookup(lookingUp, !!typedWord);
    return (
      <ConnectionsPanel label="Dictionaries" back={{ href: resourcesHref, label: <InterfaceText en="Resources" he="קישורים וכלים" /> }} lang={shownLang} onLang={props.onLang} onClose={onClose}>
        <LexiconView
          words={lookingUp}
          loading={active && lexiconQ.isPending}
          entries={active ? lexiconEntries : undefined}
          onSearch={setTypedWord}
          getCompletions={anyDict.getCompletions}
          onCitation={(ref) => (readerAnalytics.citationClicked(ref), props.onOpenRef(ref))}
          onEntry={(ref) => (readerAnalytics.dictionaryEntryClicked(ref), props.onOpenRef(ref))}
        />
      </ConnectionsPanel>
    );
  }

  if (onSidebarSearch) {
    const hitHref = (hit: SearchHit) => {
      const s = hit._source;
      return `/${refToUrl(s.ref)}?${s.isPrimary ? "vhe" : "ven"}=${versionApiToParam(`${s.languageFamilyName}|${s.version}`)}`;
    };
    return (
      <ConnectionsPanel label="Search in this text" back={{ href: resourcesHref, label: <InterfaceText en="Resources" he="קישורים וכלים" /> }} lang={shownLang} onLang={props.onLang} onClose={onClose}>
        {lexiconName ? <DictionarySearch getCompletions={dict.getCompletions} onSubmit={dict.openEntry} /> : <SidebarSearch
          query={props.searchQuery}
          onSearch={props.onSearchQuery}
          results={searchHits}
          loading={searchPathQ.isPending || searchQ.isPending}
          loadingMore={searchQ.isFetchingNextPage}
          hasMore={searchQ.hasNextPage}
          onLoadMore={() => void searchQ.fetchNextPage()}
          error={searchQ.isError || searchPathQ.isError}
          hrefFor={hitHref}
          onOpen={(hit) => props.onOpenSearchHit(hit)}
        />}
      </ConnectionsPanel>
    );
  }

  if (view.view === "mode" && view.mode === "Share") {
    const url = typeof window === "undefined" ? location.href : new URL(location.href, window.location.origin).href;
    return (
      <ConnectionsPanel label="Share" back={{ href: resourcesHref, label: <InterfaceText en="Resources" he="קישורים וכלים" /> }} lang={shownLang} onLang={props.onLang} onClose={onClose}>
        <ShareView url={url} />
      </ConnectionsPanel>
    );
  }

  if (view.view === "mode" && view.mode === "Notes" && viewer) {
    const refresh = () => qcNotes.invalidateQueries({ queryKey: ["user", "notes", uid] });
    return (
      <ConnectionsPanel label="Notes" back={{ href: resourcesHref, label: <InterfaceText en="Resources" he="קישורים וכלים" /> }} lang={shownLang} onLang={props.onLang} onClose={onClose}>
        <NotesView
          notes={notesQ.data}
          allNotesHref={`${SITE_ORIGIN}/texts/notes`}
          onSave={async (text, id) => {
            await saveNote(text, notesRefs, id);
            uaEvent("Tools", "Note Save Private", notesRefs.join("/"));
            await refresh();
          }}
          onDelete={async (id) => {
            await deleteNote(id);
            uaEvent("Tools", "Delete Note", id);
            await refresh();
          }}
        />
      </ConnectionsPanel>
    );
  }

  if (view.view === "mode" && view.mode === "Add To Sheet" && viewer) {
    const sv = (v: { versionTitle: string; direction?: string } | undefined): SheetVersion | undefined =>
      v ? { versionTitle: v.versionTitle, direction: v.direction === "rtl" ? "rtl" : "ltr" } : undefined;
    const last = notesRefs.at(-1)!;
    const citationEn = notesRefs.length === 1 ? notesRefs[0]! : `${notesRefs[0]}-${last.slice(last.lastIndexOf(":") + 1)}`;
    return (
      <ConnectionsPanel label="Add to Sheet" back={{ href: resourcesHref, label: <InterfaceText en="Resources" he="קישורים וכלים" /> }} lang={shownLang} onLang={props.onLang} onClose={onClose}>
        <AddToSheetSection
          uid={uid}
          citation={{ en: citationEn, he: notesRefs.length === 1 && props.section?.segments.length === 1 ? props.section.heRef : citationEn }}
          citationHref={`/${refToUrl(citationEn)}`}
          refs={notesRefs}
          primary={sv(props.section?.primaryVersion)}
          translation={sv(props.section?.translationVersion)}
        />
      </ConnectionsPanel>
    );
  }

  if (view.view === "mode" && view.mode === "Add Connection" && viewer) {
    return (
      <ConnectionsPanel label="Add Connection" back={{ href: hrefFor({ view: "mode", mode: "Advanced Tools" }), label: <InterfaceText en="Advanced" he="כלים מתקדמים" /> }} lang={shownLang} onLang={props.onLang} onClose={onClose}>
        <AddConnectionView
          refs={props.allOpenRefs?.length ? props.allOpenRefs : notesRefs}
          onAdd={async (refs, type) => {
            await addConnection(refs, type);
            uaEvent("Tools", "Add Connection", refs.join("/"));
            await qcNotes.invalidateQueries({ queryKey: ["links"] }); // the old Sefaria.clearLinks()
          }}
        />
      </ConnectionsPanel>
    );
  }

  if (view.view === "mode" && view.mode === "Feedback") {
    return (
      <ConnectionsPanel label="Feedback" back={{ href: resourcesHref, label: <InterfaceText en="Resources" he="קישורים וכלים" /> }} lang={shownLang} onLang={props.onLang} onClose={onClose}>
        <FeedbackView
          signedIn={!!viewer}
          onSubmit={(s) =>
            (readerAnalytics.feedbackSent(window.location.href), sendFeedback({ refs: selectedRefs.length ? selectedRefs : [sectionRef], type: s.type, url: window.location.href, currVersions: currVersionsOf(props.versions?.primary, props.versions?.translation), email: s.email, msg: s.msg, uid: viewer?.id ?? null }))
          }
        />
      </ConnectionsPanel>
    );
  }

  if (onNavigation) {
    const record = detailsQ.data as unknown as TocIndexRecord | undefined;
    const structures = record?.schema ? tocStructures(record, { ref: selectionRef, sectionRef }) : [];
    return (
      <ConnectionsPanel label="Table of Contents" back={{ href: resourcesHref, label: <InterfaceText en="Resources" he="קישורים וכלים" /> }} lang={shownLang} onLang={props.onLang} onClose={onClose}>
        {detailsQ.isPending ? <LoadingState /> : (
          <>
            {lexiconName ? <div style={{ marginBlockEnd: 16 }}><DictionarySearch getCompletions={dict.getCompletions} onSubmit={dict.openEntry} /></div> : null}
            <TocView structures={structures} onOpenRef={props.onGoToRef} placeKey={selectionRef} />
          </>
        )}
      </ConnectionsPanel>
    );
  }

  if (onAbout) {
    const category = props.baseCategory ? categoryLabel(props.baseCategory, catalog) : undefined;
    return (
      <ConnectionsPanel label="About This Text" back={{ href: resourcesHref, label: <InterfaceText en="Resources" he="קישורים וכלים" /> }} lang={shownLang} onLang={props.onLang} onClose={onClose}>
        <AboutView
          details={detailsQ.data}
          loading={detailsQ.isPending}
          category={category}
          lang={language === "hebrew" ? "he" : "en"}
          titleHref={`/${refToUrl(indexTitle)}`}
          authorHref={(slug) => `${SITE_ORIGIN}/topics/${slug}`}
          topicHref={(slug) => `${SITE_ORIGIN}/topics/${slug}`}
          versions={aboutVersions(available, { translationTitle: props.section?.translationVersion?.versionTitle, sourceTitle: props.currentSourceTitle })}
          order={versionSectionOrder(settings.language)}
          urlRef={refToUrl(selectionRef)}
          selectSourceHref={props.selectSourceHref}
          onSelectSource={(v) => (readerAnalytics.versionSelectClicked(versionClick(v)), props.onSelectSource(v))}
          openHref={(v) => (v.isPrimary ? props.versionOpenHref(v) : props.translationPreviewHref(v as unknown as TranslationVersion))}
          onOpen={(v) => (readerAnalytics.versionTitleClicked(versionClick(v)), onNavigate(v.isPrimary ? props.versionOpenHref(v) : props.translationPreviewHref(v as unknown as TranslationVersion)))}
          bookVersions={bookVersionsQ.data ?? []}
        />
      </ConnectionsPanel>
    );
  }

  if (onVersionOpen) {
    const segments = sourceTextQ.data?.segments ?? [];
    const html = segments.map((sg) => sg.primary).filter(Boolean).join(" ");
    const version = sourcePreview && html ? ({ ...sourcePreview, text: html } as unknown as TranslationVersion) : undefined;
    return (
      <ConnectionsPanel label="Version" back={{ href: hrefFor({ view: "mode", mode: "About" }), label: <InterfaceText en="About This Text" he="אודות ספר זה" /> }} lang={shownLang} onLang={props.onLang} onClose={onClose}>
        <TranslationOpenView
          loading={!!sourcePreview && sourceTextQ.isPending}
          version={version}
          lang={sourcePreview ? bucketLanguage(sourcePreview) : "he"}
          openHref={sourcePreview ? props.selectSourceHref(sourcePreview) : hrefFor({ view: "resources" })}
          onOpen={() => sourcePreview && (props.onOpenSource ?? props.onSelectSource)(sourcePreview)}
        />
      </ConnectionsPanel>
    );
  }

  if (onTranslationOpen) {
    const wanted = parseVersionKey(props.versionFilter);
    const previewed = translationsQ.data?.find((v) => v.versionTitle === wanted?.title);
    return (
      <ConnectionsPanel label="Translation" back={{ href: hrefFor({ view: "mode", mode: "Translations" }), label: <InterfaceText en="Translations" he="תרגומים" /> }} lang={shownLang} onLang={props.onLang} onClose={onClose}>
        <TranslationOpenView
          loading={translationsQ.isPending}
          version={previewed}
          lang={previewed ? bucketLanguage(previewed) : "en"}
          openHref={previewed ? props.translationHref(previewed) : hrefFor({ view: "resources" })}
          onOpen={() => previewed && props.onOpenTranslation(previewed)}
        />
      </ConnectionsPanel>
    );
  }

  if (onTranslations) {
    return (
      <ConnectionsPanel label="Translations" back={{ href: resourcesHref, label: <InterfaceText en="Resources" he="קישורים וכלים" /> }} lang={shownLang} onLang={props.onLang} onClose={onClose}>
        <TranslationsView
          languages={translationLanguages}
          loading={translationsQ.isPending}
          currentTitle={currentTranslation}
          selectHref={props.translationHref}
          onSelect={(v) => (readerAnalytics.versionSelectClicked(versionClick(v)), props.onSelectTranslation(v))}
          openHref={props.translationHref}
          onOpen={(v) => props.onOpenTranslation(v)}
          previewHref={props.translationPreviewHref}
          onPreview={(v) => (readerAnalytics.versionTitleClicked(versionClick(v)), onNavigate(props.translationPreviewHref(v)))}
          urlRef={refToUrl(selectionRef)}
        />
      </ConnectionsPanel>
    );
  }

  if (view.view === "mode" && view.mode === "Advanced Tools") {
    return (
      <ConnectionsPanel label="Advanced" back={{ href: resourcesHref, label: <InterfaceText en="Resources" he="קישורים וכלים" /> }} lang={shownLang} onLang={props.onLang} onClose={onClose}>
        <AdvancedToolsView
          onAddTranslation={() =>
            viewer
              ? // the old addTranslation: Django's translation page, coming back here
                window.location.assign(`${SITE_ORIGIN}/translate/${refToUrl(notesRefs[0]!)}?next=${encodeURIComponent(window.location.pathname + window.location.search)}`)
              : props.onSignUp("add-translation")
          }
          onAddConnection={() => (viewer ? onNavigate(hrefFor({ view: "mode", mode: "Add Connection" })) : props.onSignUp("add-connection"))}
        />
      </ConnectionsPanel>
    );
  }

  if (view.view === "mode") {
    // Sidebar tools not built yet in this reader: say so, and link to the same view on sefaria.org.
    const label = view.mode;
    return (
      <ConnectionsPanel label={label} back={{ href: resourcesHref, label: <InterfaceText en="Resources" he="קישורים וכלים" /> }} lang={shownLang} onLang={props.onLang} onClose={onClose}>
        <EmptyState title={<InterfaceText en={label} he={label} />}>
          <InterfaceText en="This tool is not built yet in the new reader." he="הכלי הזה עדיין לא נבנה בקורא החדש." />{" "}
          <a href={`${SITE_ORIGIN}${hrefFor(view)}`} target="_blank" rel="noopener noreferrer">
            <InterfaceText en="Open it on sefaria.org" he="פתיחה בספריא" />
          </a>
        </EmptyState>
      </ConnectionsPanel>
    );
  }

  if (view.view === "resources") {
    return (
      <ConnectionsPanel label="Resources" title={<ResourcesTitle />} lang={shownLang} onLang={props.onLang} onClose={onClose}>
        {linksQ.isPending ? (
          <LoadingState />
        ) : (
          <ResourcesView
            summary={topLevelSummary(summary, essaysFor(sectionLinks ?? [], props.shownVersions))}
            catalog={catalog}
            hrefFor={hrefFor}
            onNavigate={nav}
            counts={counts}
            sheetsHref={sheetsHref}
            signedIn={!!viewer}
            notesCount={notesQ.data?.length ?? 0}
          />
        )}
      </ConnectionsPanel>
    );
  }

  if (view.view === "category") {
    const label = categoryLabel(view.category, catalog);
    return (
      <ConnectionsPanel label={view.category} back={{ href: resourcesHref, label: <InterfaceText en="Resources" he="קישורים וכלים" /> }} lang={shownLang} onLang={props.onLang} onClose={onClose}>
        {linksQ.isPending ? <LoadingState /> : <CategoryView categories={categoryView(summary, view.category)} catalog={catalog} hrefFor={hrefFor} onNavigate={nav} />}
      </ConnectionsPanel>
    );
  }

  // Connected texts for a filter. "Back" goes to the category the filter belongs to, else to Resources.
  const name = filter!.split("|")[0]!;
  const first = listLinks[0];
  // a book with nothing on this verse still has its category (and so its colour): another verse's link knows it
  const category = first?.category ?? sectionLinks?.find((l) => l.collectiveTitle.en === name)?.category ?? name;
  const isCategoryFilter = !first || first.collectiveTitle.en !== name;
  const backView: ConnectionsView = isCategoryFilter ? { view: "resources" } : { view: "category", category: category === "Quoting Commentary" ? "Commentary" : category };
  const backLabel = backView.view === "category" ? categoryLabel(backView.category, catalog) : { en: "Resources", he: "קישורים וכלים" };
  const title = first && !isCategoryFilter ? { en: first.collectiveTitle.en, he: first.collectiveTitle.he } : categoryLabel(name, catalog);
  const hideItemTitles = category === "Commentary" && name !== "Commentary";

  return (
    <ConnectionsPanel label={title.en} back={{ href: link(backView), label: <InterfaceText en={backLabel.en} he={backLabel.he} /> }} lang={shownLang} onLang={props.onLang} onClose={onClose}>
      <TextList
        title={title}
        color={categoryColor(category)}
        items={items}
        language={language}
        vocalization={vocalizationMode(settings.vowels)}
        hideItemTitles={hideItemTitles}
        loading={linksQ.isPending || waiting}
        emptyMessage={<InterfaceText en={`No connections known for ${title.en} here.`} he={`אין קשרים ידועים ל${title.he}.`} />}
        onOpen={(href) => {
          const item = items.find((i) => i.href === href);
          if (item) readerAnalytics.textFromListClicked(item.sourceRef);
          if (item) onOpenText(item.sourceRef);
          else nav(href);
        }}
        // a citation inside a connected text opens it after this panel; the sidebar stays (CON-038, the old onCitationClick)
        onRefClick={(ref) => (readerAnalytics.citationClicked(ref), props.onOpenRef(ref))}
        // signed in: a connected text dwelt on is recorded as secondary history (CON-036)
        onDwell={
          viewer
            ? (ref) => void syncHistory([{ ref, versions: { en: null, he: null }, book: ref.replace(/[\s,]+[\d:ab.-]+$/, ""), language: language === "hebrew" ? "hebrew" : "english", secondary: true }]).catch(() => undefined)
            : undefined
        }
      />
    </ConnectionsPanel>
  );
}

/** Tools that need an account, and what the sign-up modal says for each (GUI-004, CON-011). */
const SIGN_IN_TOOLS: Partial<Record<string, SignUpKind>> = { Notes: "notes", "Add To Sheet": "add-to-sheet", "Add Connection": "add-connection" };

/**
 * The sidebar's content for the open view. Views that need an account (Notes, Add to Sheet, Add Connection, and the
 * Advanced tools Add Translation / Add Connection) show the Resources home with the sign-up modal over it — nobody is
 * signed in in this client yet — and closing the modal returns to Resources.
 */
export function ConnectionsPane(props: ConnectionsPaneProps) {
  const location = useLocation();
  const [asked, setAsked] = useState<SignUpKind>();
  const viewer = useViewer();
  // only a signed-out reader is asked to sign up; a signed-in reader gets the tool itself (CON-011)
  const gated = props.view.view === "mode" && !viewer ? SIGN_IN_TOOLS[props.view.mode] : undefined;
  const resources: ConnectionsView = { view: "resources" };
  const kind = gated ?? asked;
  const close = () => {
    setAsked(undefined);
    if (gated) props.onNavigate(props.hrefFor(resources));
  };
  return (
    <>
      <ConnectionsPaneInner {...props} view={gated ? resources : props.view} onSignUp={setAsked} />
      <SignUpModal kind={kind} onClose={close} next={location.href} />
    </>
  );
}

/** The Add to Sheet tool's data: the reader's sheets, adding, creating (lib/user/sheets.ts). */
function AddToSheetSection({ uid, citation, citationHref, refs, primary, translation }: { uid: number | null; citation: { en: string; he: string }; citationHref: string; refs: string[]; primary?: SheetVersion; translation?: SheetVersion }) {
  const qc = useQueryClient();
  const sheets = useQuery(userSheetsQuery(uid));
  return (
    <AddToSheetView
      citation={citation}
      citationHref={citationHref}
      sheets={sheets.data}
      sheetHref={(id) => `${VOICES}/sheets/${id}`}
      onCreate={async (title) => {
        const sheet = await createSheet(title);
        qc.setQueryData(userSheetsQuery(uid).queryKey, (list = []) => [sheet, ...list]);
        return sheet;
      }}
      onAdd={async (sheet) => {
        await addToSheet(sheet.id, sourcesFor(refs, primary, translation));
        uaEvent("Tools", "Add to Source Sheet Save", refs.join("/"));
        // the sheet just used moves to the front (updateUserSheets)
        qc.setQueryData(userSheetsQuery(uid).queryKey, (list = []) => [sheet, ...list.filter((s) => s.id !== sheet.id)]);
      }}
    />
  );
}
