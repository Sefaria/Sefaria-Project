import { categoryColor } from "../tokens/category-color";
import { bothEvent, useOnceFullyVisible } from "~/lib/analytics";

/**
 * The 4px category-coloured bar at the top of a panel or page. Decorative: the category name is always
 * rendered nearby, so colour is never the only carrier of meaning.
 * Replaces CategoryColorLine, ColorBarBox, RainbowLine and ad-hoc `--category-color` styles.
 *
 * Its first full view in a session is reported as header_viewed (shares the header's session key, as on sefaria.org).
 *
 * @feature GUI-013 Category color line
 * @feature ANL-003 Header and category line impression events
 */
export function CategoryColorLine({ category }: { category: string | readonly string[] | undefined }) {
  const key = Array.isArray(category) ? (category[0] as string | undefined) : (category as string | undefined);
  const seen = useOnceFullyVisible<HTMLDivElement>(() => bothEvent("header_viewed", { impression_type: "category_color_line" }), "sa.header_viewed");
  return <div ref={seen} aria-hidden="true" style={{ height: 4, width: "100%", background: categoryColor(key) }} />;
}
