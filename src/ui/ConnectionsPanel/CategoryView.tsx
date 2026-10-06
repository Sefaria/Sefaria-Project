import type { MouseEvent } from "react";
import type { Catalog } from "~/lib/catalog/toc";
import { categoryDescription, categoryLabel } from "~/lib/connections/terms";
import type { CategorySummary } from "~/lib/connections/summary";
import { withHref, type ConnectionsView } from "~/lib/connections/url";
import { categoryColor } from "../tokens/category-color";
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
}

/**
 * One category's detail: an "All Commentary (N)" row, then each book with its count, short description and
 * English tag. Books with no links for this selection stay listed, greyed out.
 *
 * @feature CON-025 Category view with per-book filters
 * @feature CON-026 Text (book) filter chip
 */
export function CategoryView({ hrefFor, categories, catalog, basePath, search = "", current, onNavigate }: CategoryViewProps) {
  const href_ = (v: ConnectionsView) => (hrefFor ? hrefFor(v) : withHref(basePath ?? "", v, search));
  return (
    <div>
      {categories.map((c) => {
        const label = categoryLabel(c.category, catalog);
        const isQuoting = c.category === "Quoting Commentary";
        return (
          <div key={c.category}>
            <FilterRow
              label={{ en: `All ${label.en}`, he: `כל ${label.he}` }}
              count={c.count}
              hasEnglish={c.hasEnglish}
              color={categoryColor(c.category)}
              description={categoryDescription(c.category, catalog)}
              dimmed={c.count === 0}
              current={current === c.category}
              href={href_({ view: "texts", filter: c.category })}
              onNavigate={onNavigate}
            />
            {c.books.map((b) => (
              <FilterRow
                key={b.book}
                label={{ en: b.book, he: b.heBook }}
                count={b.count}
                hasEnglish={b.hasEnglish}
                color={categoryColor(c.category)}
                description={{ en: b.enShortDesc, he: b.heShortDesc }}
                dimmed={b.count === 0}
                current={current === (isQuoting ? `${b.book}|Quoting` : b.book)}
                // Quoting commentary books are filtered with a suffix so they don't match their own commentary.
                href={href_({ view: "texts", filter: isQuoting ? `${b.book}|Quoting` : b.book })}
                onNavigate={onNavigate}
              />
            ))}
          </div>
        );
      })}
    </div>
  );
}
