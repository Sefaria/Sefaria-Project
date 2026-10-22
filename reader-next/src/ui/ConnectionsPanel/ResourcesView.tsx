import { readerAnalytics } from "~/lib/analytics/reader";
import { useState, type MouseEvent } from "react";
import type { Catalog } from "~/lib/catalog/toc";
import { categoryDescription, categoryLabel } from "~/lib/connections/terms";
import type { ResourceCounts } from "~/lib/connections/related";
import type { TopLevelSummary } from "~/lib/connections/summary";
import { withHref, type ConnectionsView } from "~/lib/connections/url";
import { Icon, type IconName } from "../Icon/Icon";
import { InterfaceText } from "../InterfaceText/InterfaceText";
import { categoryColor } from "../tokens/category-color";
import { FilterRow, PanelSectionHeading } from "./FilterRow";
import styles from "./ResourcesView.module.css";

export interface ResourcesViewProps {
  summary: TopLevelSummary;
  catalog: Catalog | undefined;
  /** Path of the text the panel belongs to ("/Genesis.1.1"), for building each row's link. */
  /** Path of the selected text; links are `basePath?with=…`. Ignored when `hrefFor` is given. */
  basePath?: string;
  /** Where a sidebar view lives (the owning panel decides, e.g. `w2=` in a multi-panel URL). */
  hrefFor?: (view: ConnectionsView) => string;
  /** Display state kept on every link ("&lang=en"), so navigating the sidebar never resets the reader. */
  search?: string;
  onNavigate?: (href: string, event: MouseEvent) => void;
  /**
   * Counts for the Resources and top Tools rows (old `resourcesButtonCounts`). Absent while loading: the rows
   * wait rather than appear and then vanish.
   */
  counts?: ResourceCounts;
  /** Notes on the selection (old `notesTotalCount`); 0 when signed out. */
  notesCount?: number;
  /** Where the Sheets row goes: the Voices "sheets with this ref" page, in a new tab (CON-017). */
  sheetsHref?: string;
  /** Compare Text is offered only when panels can sit side by side (old multiPanel). */
  showCompare?: boolean;
  /** Whether a reader is signed in (the account tools report their mode only then). */
  signedIn?: boolean;
}

interface ToolRow {
  key: string;
  label: { en: string; he: string };
  icon: IconName;
  /** A sidebar view; or an external page (new tab). */
  view?: ConnectionsView;
  external?: string;
  /** undefined: no count; null: count not known yet (shown without a number). */
  count?: number | null;
  alwaysShow?: boolean;
}

/** Old ToolsButton: hidden when its count is 0 unless always shown; a number only when there is one. */
const visible = (r: ToolRow) => r.count === undefined || r.count === null || r.count > 0 || r.alwaysShow;

/**
 * The sidebar's home: top tools (About, Table of Contents, Search in this Text, Translations), "Related Texts"
 * (connection categories with counts; essays first; four rows until "More"; Quoting Commentary folded into
 * Commentary), Resources (sheets, web pages, topics, manuscripts, Torah readings) and Tools.
 *
 * @feature CON-013 Top tool buttons
 * @feature CON-014 Resources list
 * @feature CON-015 Tools list
 * @feature CON-017 Sheets resource opens Voices in new tab
 * @feature CON-012 Resources home view
 * @feature CON-019 Connection categories summary
 * @feature CON-023 Top-level summary: Quoting Commentary merged, collapse to 4
 * @feature CON-024 Essay links in summary
 */
export function ResourcesView({ hrefFor, summary, catalog, basePath, search = "", onNavigate, counts, notesCount = 0, sheetsHref, showCompare, signedIn = false }: ResourcesViewProps) {
  const href_ = (v: ConnectionsView) => (hrefFor ? hrefFor(v) : withHref(basePath ?? "", v, search));
  const [expanded, setExpanded] = useState(false);
  const rows = expanded ? summary.categories : summary.visible;
  const none = summary.categories.length === 0 && summary.essays.length === 0;

  const mode = (m: Extract<ConnectionsView, { view: "mode" }>["mode"]): ConnectionsView => ({ view: "mode", mode: m });
  const top: ToolRow[] = [
    { key: "about", label: { en: "About this Text", he: "אודות הטקסט" }, icon: "info", view: mode("About") },
    { key: "toc", label: { en: "Table of Contents", he: "תוכן העניינים" }, icon: "list", view: mode("Navigation") },
    { key: "search", label: { en: "Search in this Text", he: "חיפוש בטקסט" }, icon: "search", view: mode("SidebarSearch") },
    { key: "translations", label: { en: "Translations", he: "תרגומים" }, icon: "translate", view: mode("Translations"), count: counts ? counts.translations : null },
    ...(counts?.guides ? [{ key: "guide", label: { en: "Guided Learning", he: "מדריך" }, icon: "school" as const, view: mode("Guide") }] : []),
  ];
  const resources: ToolRow[] = counts
    ? [
        { key: "sheets", label: { en: "Sheets", he: "דפי מקורות" }, icon: "file", external: sheetsHref, count: counts.sheets },
        { key: "webpages", label: { en: "Web Pages", he: "דפי אינטרנט" }, icon: "globe", view: mode("WebPages"), count: counts.webpages },
        { key: "topics", label: { en: "Topics", he: "נושאים" }, icon: "hash", view: mode("Topics"), count: counts.topics },
        { key: "manuscripts", label: { en: "Manuscripts", he: "כתבי יד" }, icon: "scroll", view: mode("manuscripts"), count: counts.manuscripts },
        { key: "readings", label: { en: "Torah Readings", he: "קריאה בתורה" }, icon: "audio", view: mode("Torah Readings"), count: counts.audio },
      ]
    : [];
  const tools: ToolRow[] = [
    { key: "add", label: { en: "Add to Sheet", he: "הוספה לדף מקורות" }, icon: "file-plus", view: mode("Add To Sheet") },
    { key: "dictionaries", label: { en: "Dictionaries", he: "מילונים" }, icon: "book", view: mode("Lexicon") },
    ...(showCompare ? [{ key: "compare", label: { en: "Compare Text", he: "טקסט להשוואה" }, icon: "columns" as const, view: mode("Add Connection") }] : []),
    { key: "notes", label: { en: "Notes", he: "הערות" }, icon: "note", view: mode("Notes"), count: notesCount, alwaysShow: true },
    { key: "share", label: { en: "Share", he: "שיתוף" }, icon: "share", view: mode("Share") },
    { key: "feedback", label: { en: "Feedback", he: "משוב" }, icon: "message", view: mode("Feedback") },
    { key: "advanced", label: { en: "Advanced", he: "כלים מתקדמים" }, icon: "sliders", view: mode("Advanced Tools") },
  ];
  const renderRows = (rows: ToolRow[]) =>
    rows.filter(visible).map((r) => (
      <FilterRow
        key={r.key}
        label={r.label}
        icon={r.icon}
        count={r.count ? r.count : undefined}
        color="var(--sefaria-color-text-secondary)"
        tool
        href={r.external ?? href_(r.view!)}
        external={Boolean(r.external)}
        onNavigate={r.external ? undefined : onNavigate}
        onTrack={() => (r.key === "compare" ? (readerAnalytics.toolClicked(r.label.en, undefined, signedIn), readerAnalytics.compareOpened()) : readerAnalytics.toolClicked(r.label.en, r.view?.view === "mode" ? r.view.mode : undefined, signedIn))}
        trailing={r.external ? <Icon name="external-link" size="1em" label="Opens in a new tab" /> : undefined}
      />
    ));
  // Old panel: the Resources section shows when any of its counts is non-zero or unknown.
  const showResources = resources.some((r) => r.count === null || (r.count ?? 0) > 0);

  return (
    <div>
      <div className={styles.topTools}>{renderRows(top)}</div>
      <section aria-label="Related Texts">
      <PanelSectionHeading>
        <InterfaceText en="Related Texts" he="טקסטים קשורים" />
      </PanelSectionHeading>
      {none ? (
        <p className={styles.empty}>
          <InterfaceText en="No connections known here." he="אין קישורים ידועים כאן." />
        </p>
      ) : null}
      {summary.essays.map((e) => (
        <FilterRow
          key={e.sourceRef}
          label={e.title}
          icon="file"
          color="var(--sefaria-cat-targum)"
          href={href_({ view: "texts", filter: `${e.title.en}|Essay` })}
          onNavigate={onNavigate}
        />
      ))}
      {rows.map((c) => (
        <FilterRow
          key={c.category}
          label={categoryLabel(c.category, catalog)}
          count={c.count}
          hasEnglish={c.hasEnglish}
          color={categoryColor(c.category)}
          href={href_({ view: "category", category: c.category })}
          onNavigate={onNavigate}
          onTrack={() => readerAnalytics.connectionsCategoryClicked(c.category)}
        />
      ))}
      {summary.hiddenCount > 0 ? (
        <button type="button" className={styles.more} aria-expanded={expanded} onClick={() => {
          readerAnalytics.toolClicked(expanded ? "See Less" : "More", undefined, signedIn);
          setExpanded((v) => !v);
        }}>
          <span className={styles.moreIcon}><Icon name="dots" size="1.4em" /></span>
          <InterfaceText en={expanded ? "See Less" : "More"} he={expanded ? "פחות" : "עוד"} />
        </button>
      ) : null}
      </section>
      {showResources ? (
        <section aria-label="Resources">
          <PanelSectionHeading>
            <InterfaceText en="Resources" he="משאבים" />
          </PanelSectionHeading>
          {renderRows(resources)}
        </section>
      ) : null}
      <section aria-label="Tools">
        <PanelSectionHeading>
          <InterfaceText en="Tools" he="כלים" />
        </PanelSectionHeading>
        {renderRows(tools)}
      </section>
    </div>
  );
}

export { categoryDescription };
