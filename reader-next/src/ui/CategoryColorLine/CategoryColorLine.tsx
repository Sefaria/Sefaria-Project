import { categoryColor } from "../tokens/category-color";

/**
 * The 4px category-coloured bar at the top of a panel or page. Decorative: the category name is always
 * rendered nearby, so colour is never the only carrier of meaning.
 * Replaces CategoryColorLine, ColorBarBox, RainbowLine and ad-hoc `--category-color` styles.
 *
 * @feature GUI-013 Category color line
 */
export function CategoryColorLine({ category }: { category: string | readonly string[] | undefined }) {
  const key = Array.isArray(category) ? (category[0] as string | undefined) : (category as string | undefined);
  return <div aria-hidden="true" style={{ height: 4, width: "100%", background: categoryColor(key) }} />;
}
