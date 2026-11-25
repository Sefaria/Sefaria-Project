import { readerAnalytics } from "~/lib/analytics/reader";
import type { MouseEvent } from "react";
import type { Catalog } from "~/lib/catalog/toc";
import { categoryDescription, categoryLabel } from "~/lib/connections/terms";
import type { CategorySummary } from "~/lib/connections/summary";
import { withHref, type ConnectionsView } from "~/lib/connections/url";
import { categoryColor } from "../tokens/category-color";
import styles from "./CategoryView.module.css";
import { FilterRow } from "./FilterRow";

export interface CategoryViewProps {
  /** The rows to show (see `categoryView`): usually one category; Commentary shows two. */
  categories: CategorySummary[];
  catalog: Catalog | undefined;
  /** Path of the selected text; links are `basePath?with=…`. Ignored when `hrefFor` is given. */
  basePath?: string;
  /** Where a sidebar view lives (the owning panel decides, e.g. `w2=` in a multi-panel URL). */
  hrefFor?: (view: ConnectionsView) => string;
  /** Display state kept on every link ("&lang=en"), so navigating the sidebar never resets the reader. */
  search?: string;
  /** The active filter, if any. */
  current?: string;
  onNavigate?: (href: string, event: MouseEvent) => void;
  /** The sidebar's language (`lang2`): names and descriptions show in it alone. Defaults to the interface's. */
  lang?: "en" | "he";
}

/**
 * One category's detail (the old ConnectionsSummary with showBooks): each category topped by a rule in its colour,
 * an "All Commentary (N)" row, then each book with its count, short description and English tag, in the sidebar's
 * language. Books with no links for this selection stay listed, greyed out and without a count.
 *
 * @feature CON-025 Category view with per-book filters
 * @feature CON-026 Text (book) filter chip
 */
export function CategoryView({ hrefFor, categories, catalog, basePath, search = "", current, onNavigate, lang }: CategoryViewProps) {
  const href_ = (v: ConnectionsView) => (hrefFor ? hrefFor(v) : withHref(basePath ?? "", v, search));
  return (
    <div className={styles.root}>
      {categories.map((c) => {
        const label = categoryLabel(c.category, catalog);
        const isQuoting = c.category === "Quoting Commentary";
        return (
          <div key={c.category} className={styles.group} style={{ ["--_color" as string]: categoryColor(c.category) }}>
            <FilterRow
              variant="list"
              lead
              contentLang={lang}
              label={{ en: `All ${label.en}`, he: `כל הקישורים ל${label.he}` }}
              count={c.count}
              hasEnglish={c.hasEnglish}
              color={categoryColor(c.category)}
              description={categoryDescription(c.category, catalog)}
              dimmed={c.count === 0}
              current={current === c.category}
              href={href_({ view: "texts", filter: c.category })}
              onNavigate={onNavigate}
              onTrack={() => readerAnalytics.categoryFilterClicked(c.category)}
            />
            {c.books.map((b) => (
              <FilterRow
                key={b.book}
                variant="list"
                contentLang={lang}
                label={{ en: b.book, he: b.heBook }}
                // the old TextFilter drops "(0)": a greyed row is count enough
                count={b.count || undefined}
                hasEnglish={b.hasEnglish}
                color={categoryColor(c.category)}
                description={{ en: b.enShortDesc, he: b.heShortDesc }}
                dimmed={b.count === 0}
                current={current === (isQuoting ? `${b.book}|Quoting` : b.book)}
                // Quoting commentary books are filtered with a suffix so they don't match their own commentary.
                href={href_({ view: "texts", filter: isQuoting ? `${b.book}|Quoting` : b.book })}
                onNavigate={onNavigate}
                onTrack={() => readerAnalytics.textFilterClicked(isQuoting ? `${b.book}|Quoting` : b.book)}
              />
            ))}
          </div>
        );
      })}
    </div>
  );
}
