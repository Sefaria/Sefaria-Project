/**
 * The reader's and sidebar's events, with the old names: `Sefaria.track.event(...)` (sent through GTM's ga shim) and the GA4
 * events of TextColumn, ToolsButton and VersionBlock. One function per old call site; components call these.
 *
 * Not ported: "Display Option Click" (only the retired ToggleOption sent it; the current display menu sends nothing).
 *
 * @feature ANL-009 Reader interaction event names
 * @feature ANL-012 Sidebar analytics events
 */
import { gtagEvent, uaEvent } from "./core";

/** Tool modes that need an account (ConnectionsPanel: signed out they open the sign-up modal and set no mode). */
const SIGN_IN_MODES = new Set(["Add To Sheet", "Notes", "Add Connection"]);

export const readerAnalytics = {
  /** TextColumn.componentDidMount: a text opened in a column. */
  textOpened: (book: string, primaryCategory: string | undefined) => gtagEvent("select_content", { content_type: primaryCategory, item_id: book }),
  /** A verse clicked (TextRange.handleClick); with no sidebar open it also opens one (ReaderPanel.handleBaseSegmentClick). */
  segmentClicked: (ref: string, opensSidebar: boolean) => {
    uaEvent("Reader", "Text Segment Click", ref);
    if (opensSidebar) uaEvent("Reader", "Open Connections Panel", ref);
  },
  citationClicked: (ref: string) => uaEvent("Reader", "Citation Link Click", ref),
  namedEntityClicked: (slug: string) => uaEvent("Reader", "Named Entity Link Click", slug),
  /** An aleph / ayin language button (ReaderPanel.toggleLanguage). */
  languageToggled: (to: "english" | "hebrew") => uaEvent("Reader", "Change Language", to),
  versionChosen: (book: string, versionTitle: string | null, versionLanguage: string, panelLanguage: string) =>
    uaEvent("Reader", "Choose Version", versionTitle ? `${book} / ${versionTitle} / ${versionLanguage}` : `${book} / default version / ${panelLanguage}`),
  translationPreferenceSet: (lang: string) => uaEvent("Reader", "Set Translation Language Preference", lang),
  /** "Compare Text" (ReaderApp.openComparePanel). */
  compareOpened: () => uaEvent("Reader", "Other Text Click"),
  /** A sidebar tool button (ToolsButton): feature_clicked, then the mode it sets (setConnectionsMode), if any. */
  toolClicked: (en: string, mode: string | undefined, signedIn: boolean) => {
    gtagEvent("feature_clicked", { name: `tools_button_${en}` });
    if (!mode || (SIGN_IN_MODES.has(mode) && !signedIn)) return;
    uaEvent("Tools", `${mode} Click`);
  },
  /** Related Texts: a category opened (top level), "All <category>" chosen, a book chosen. */
  connectionsCategoryClicked: (category: string) => uaEvent("Reader", "Connections Category Click", category),
  categoryFilterClicked: (category: string) => uaEvent("Reader", "Category Filter Click", category),
  textFilterClicked: (filter: string, inRecent = false) => uaEvent("Reader", inRecent ? "Text Filter in Recent Click" : "Text Filter Click", filter),
  /** A connected text opened from the list (TextRange/TextList onRangeClick). */
  textFromListClicked: (ref: string) => uaEvent("Reader", "Click Text from TextList", ref),
  /** VersionBlock: a version's title (opens it in the sidebar) or Select (opens it in the panel). */
  versionTitleClicked: (p: { to: string; from: string | undefined; categories: string[]; book: string }) =>
    gtagEvent("onClick_version_title", { element_name: "version_title", change_to: p.to, change_from: `${p.from}`, categories: p.categories.join(","), book: p.book }),
  versionSelectClicked: (p: { to: string; from: string | undefined; categories: string[]; book: string }) =>
    gtagEvent("onClick_select_version", { element_name: "select_version", change_to: p.to, change_from: `${p.from}`, categories: p.categories.join(","), book: p.book }),
  versionDownloaded: (label: string) => uaEvent("Reader", "Version Download", label),
  feedbackSent: (url: string) => uaEvent("Tools", "Send Feedback", url),
  lexiconLookup: (action: string, words: string) => uaEvent("Lexicon", action, words),
  dictionaryEntryClicked: (ref: string) => uaEvent("Reader", "Click Dictionary Entry from Lookup", ref),
};
