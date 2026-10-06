/**
 * The library catalog: every book and category, from `/api/index`. Small to use, large to fetch (~7 MB), so it
 * is a "catalog"-class query: cached for a day in memory, thirty days on disk, shared by every page.
 *
 * It answers: what is this book's Hebrew title, categories and description? What order are the top
 * categories in? Those drive the connections summary, book colours, and (later) the library pages.
 *
 * @feature LIB-001 Browse the Library category grid (this is its data)
 */
import { queryOptions } from "@tanstack/react-query";
import { index } from "@vendor/sefaria-toolkit/client/index";
import { getSefariaClient, unwrap } from "~/lib/api/client";
import { withPolicy } from "~/lib/cache/query-options";

export interface TocBook {
  title: string;
  heTitle: string;
  categories: string[];
  primary_category?: string;
  order?: number;
  enShortDesc?: string;
  heShortDesc?: string;
  enDesc?: string;
  heDesc?: string;
  corpus?: string;
  dependence?: string;
  base_text_titles?: string[];
  base_text_mapping?: string;
  collectiveTitle?: string;
  heCollectiveTitle?: string;
  /** Not listed in category pages. */
  hidden?: boolean;
  base_text_order?: number;
  /** A collection listed inside a category (links out to Voices). */
  isCollection?: boolean;
  slug?: string;
}

export interface TocCategory {
  category: string;
  heCategory: string;
  enShortDesc?: string;
  heShortDesc?: string;
  enDesc?: string;
  heDesc?: string;
  /** Primary categories always get their own page link, however deep (Mishneh Torah, Shulchan Arukh, Tur). */
  isPrimary?: boolean;
  /** Search groups this category (and what is below it) under another top-level name ("Tanakh Commentary"). */
  searchRoot?: string;
  order?: number;
  base_text_order?: number;
  /** Absent on a few empty categories. */
  contents?: TocNode[];
}

export type TocNode = TocBook | TocCategory;
export const isCategory = (n: TocNode): n is TocCategory => "category" in n;

export interface Catalog {
  /** Top-level categories in library order. */
  topCategories: string[];
  books: ReadonlyMap<string, TocBook>;
  /** The raw tree, for the library pages. */
  tree: TocNode[];
}

export function buildCatalog(tree: TocNode[]): Catalog {
  const books = new Map<string, TocBook>();
  const walk = (nodes: TocNode[]) => {
    for (const n of nodes) {
      if (isCategory(n)) walk(n.contents ?? []);
      else books.set(n.title, n);
    }
  };
  walk(tree);
  return { tree, books, topCategories: tree.filter(isCategory).map((c) => c.category) };
}

export async function fetchCatalog(signal?: AbortSignal): Promise<Catalog> {
  const result = await index.getIndex({ client: getSefariaClient(), signal });
  return buildCatalog(unwrap(result, "Table of contents") as unknown as TocNode[]);
}

// The catalog is large and rarely changes. Store the raw tree (cheap to structured-clone) and rebuild the lookup maps on read.
export const tocQueryOptions = () =>
  queryOptions<TocNode[], Error, Catalog>({
    ...withPolicy("catalog", {
      queryKey: ["catalog", "toc"] as const,
      queryFn: async ({ signal }: { signal: AbortSignal }): Promise<TocNode[]> => (await fetchCatalog(signal)).tree,
    }),
    select: buildCatalog,
  });
