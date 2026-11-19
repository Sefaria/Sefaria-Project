import type { TocNode } from "~/lib/catalog/toc";
import { hebrewCategoryNames, tocItemsByCategories, withDefaultCorpus } from "~/lib/library/category-model";
import sample from "./toc-sample.json";

/** A trimmed copy of the real catalog (src/ui/CategoryPage/toc-sample.json): top categories, Torah in full. */
export const TREE = sample as unknown as TocNode[];
const names = hebrewCategoryNames(TREE);
export const he = (c: string) => names.get(c) ?? c;
export const contentsOf = (path: string[]) => tocItemsByCategories(TREE, withDefaultCorpus(path));
export { withDefaultCorpus };
