/**
 * Category → colour. Port of the old client's palette.js `categoryColor`, so every category, book and
 * ref keeps the colour users already know. Returns a CSS value (a `var(--sefaria-cat-*)` reference, a
 * gradient for static pages, or a stable hashed fallback for categories we have not named).
 *
 * @feature LIB-019 Category and text colour coding
 * @feature GUI-013 Category colour line
 */

const CATEGORY_VARS: Record<string, string> = {
  Commentary: "var(--sefaria-cat-commentary)",
  Tanakh: "var(--sefaria-cat-tanakh)",
  Midrash: "var(--sefaria-cat-midrash)",
  Mishnah: "var(--sefaria-cat-mishnah)",
  Talmud: "var(--sefaria-cat-talmud)",
  Halakhah: "var(--sefaria-cat-halakhah)",
  Kabbalah: "var(--sefaria-cat-kabbalah)",
  "Jewish Thought": "var(--sefaria-cat-jewish-thought)",
  Liturgy: "var(--sefaria-cat-liturgy)",
  Tosefta: "var(--sefaria-cat-tosefta)",
  Chasidut: "var(--sefaria-cat-chasidut)",
  Musar: "var(--sefaria-cat-musar)",
  Responsa: "var(--sefaria-cat-responsa)",
  "Second Temple": "var(--sefaria-cat-second-temple)",
  "Quoting Commentary": "var(--sefaria-cat-responsa)",
  Sheets: "var(--sefaria-cat-sheets)",
  Sheet: "var(--sefaria-cat-sheets)",
  Targum: "var(--sefaria-cat-targum)",
  "Modern Commentary": "var(--sefaria-cat-modern-commentary)",
  Reference: "var(--sefaria-cat-reference)",
  System: "var(--sefaria-cat-sheets)",
  Static:
    "linear-gradient(90deg, #00505E 0% 10%, #5698B4 10% 20%, #CCB37C 20% 30%, #5B9370 30% 40%, #823241 40% 50%, #5A4474 50% 60%, #AD4F66 60% 70%, #7285A6 70% 80%, #00807E 80% 90%, #4872B3 90% 100%)",
};

/** Colours used (stably, by hashing the name) for categories with no assigned colour. */
const FALLBACK_COLORS = [
  "#004e5f", "#7c406f", "#5d956f", "#9ab8cb", "#4871bf", "#cb6158", "#c7a7b4", "#073570", "#ab4e66",
  "#7f85a9", "#ccb479", "#594176", "#5a99b7", "#97b386", "#802f3e", "#00827f", "#b8d4d3", "#d4896c",
] as const;

export function categoryColor(category: string | undefined | null): string {
  const key = typeof category === "string" ? category : "";
  const named = CATEGORY_VARS[key];
  if (named) return named;
  let sum = 0;
  for (const ch of key) sum += ch.charCodeAt(0);
  return FALLBACK_COLORS[sum % FALLBACK_COLORS.length]!;
}

/**
 * Colour for a book given its API metadata: the primary category when present, else the first
 * category (old `Sefaria.palette.indexColor`). Unknown books get the "Other" fallback.
 */
export function bookColor(book: { primary_category?: string; primaryCategory?: string; categories?: string[] } | undefined): string {
  if (!book) return categoryColor("Other");
  return categoryColor(book.primary_category ?? book.primaryCategory ?? book.categories?.[0] ?? "Other");
}
