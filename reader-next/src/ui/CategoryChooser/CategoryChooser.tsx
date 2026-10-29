import { subcategories } from "~/lib/book/index-editor";
import type { TocNode } from "~/lib/catalog/toc";
import styles from "./CategoryChooser.module.css";

/**
 * The old CategoryChooser (Misc.jsx): the top-level categories, then a menu for each level below the chosen path. Used by
 * the moderators' Index Editor and Category Editor.
 */
export function CategoryChooser({ tree, categories, onChange, rootOption }: {
  tree: readonly TocNode[];
  categories: string[];
  onChange: (c: string[]) => void;
  /** Offer the root itself (a top-level category's parent), labelled so. */
  rootOption?: string;
}) {
  const levels: { path: string[]; options: string[] }[] = [];
  for (let i = 0; i <= categories.length; i++) {
    const options = subcategories(tree, categories.slice(0, i));
    if (!options.length) break;
    levels.push({ path: categories.slice(0, i), options });
  }
  return (
    <div className={styles.chooser}>
      {levels.map(({ path, options }, i) => (
        <select key={i} aria-label={i === 0 ? "Category" : `Subcategory ${i}`} value={categories[i] ?? ""} onChange={(e) => onChange(e.target.value ? [...path, e.target.value] : path)}>
          {i > 0 ? <option value="">Choose a subcategory</option> : rootOption ? <option value="">{rootOption}</option> : null}
          {options.map((o) => <option key={o} value={o}>{o}</option>)}
        </select>
      ))}
    </div>
  );
}
