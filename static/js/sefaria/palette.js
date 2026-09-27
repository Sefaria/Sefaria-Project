// Colours are CSS values, so every consumer must drop them into a style (borderColor, backgroundColor,
// an SVG fill...), never parse them. Each one names the semantic category token from theme-tokens.css (dark
// values are lightened there) with the raw palette colour as fallback, so light mode is unchanged.
// Entries without an exact category match keep their literal; the two that fail 3:1 on dark surfaces read
// a dark-only override from theme-dark-overrides.css (--dm-palette-*).
// The key order of palette.colors is load-bearing: categoryColor() hashes unknown categories into it.
var palette = {
  colors: {
    darkteal:  "var(--color-cat-tanakh, var(--tanakh-teal))",          // #004e5f
    raspberry: "var(--dm-palette-raspberry, #7c406f)",
    green:     "var(--color-cat-midrash, var(--midrash-green))",       // #5d956f
    paleblue:  "#9ab8cb",
    blue:      "#4871bf",
    orange:    "var(--color-cat-responsa, var(--responsa-red))",       // #cb6158
    lightpink: "#c7a7b4",
    darkblue:  "var(--dm-palette-darkblue, #073570)",
    darkpink:  "var(--color-cat-liturgy, var(--liturgy-rose))",       // #ab4e66
    lavender:  "var(--color-cat-philosophy, var(--philosophy-purple))", // #7f85a9
    yellow:    "var(--color-cat-talmud, var(--talmud-gold))",          // #ccb479
    purple:    "var(--color-cat-kabbalah, var(--kabbalah-purple))",    // #594176
    lightblue: "var(--color-cat-mishnah, var(--mishnah-blue))",        // #5a99b7
    lightgreen:"var(--color-cat-chasidut, var(--chasidut-green))",     // #97b386
    red:       "var(--color-cat-halakhah, var(--halakhah-red))",       // #802f3e
    teal:      "var(--color-cat-taanitic, var(--taanitic-green))",     // #00827f
    lightbg:   "var(--color-cat-modern-works, var(--modern-works-blue))", // #B8D4D3
    tan:       "var(--color-cat-reference, var(--reference-orange))"   // #D4896C
  }
};
palette.categoryColors = {
  "Commentary":         "var(--color-cat-commentary, var(--commentary-blue))",
  "Tanakh" :            "var(--color-cat-tanakh, var(--tanakh-teal))",
  "Midrash":            "var(--color-cat-midrash, var(--midrash-green))",
  "Mishnah":            "var(--color-cat-mishnah, var(--mishnah-blue))",
  "Talmud":             "var(--color-cat-talmud, var(--talmud-gold))",
  "Halakhah":           "var(--color-cat-halakhah, var(--halakhah-red))",
  "Kabbalah":           "var(--color-cat-kabbalah, var(--kabbalah-purple))",
  "Jewish Thought":     "var(--color-cat-philosophy, var(--philosophy-purple))",
  "Liturgy":            "var(--color-cat-liturgy, var(--liturgy-rose))",
  "Tosefta":            "var(--color-cat-taanitic, var(--taanitic-green))",
  "Chasidut":           "var(--color-cat-chasidut, var(--chasidut-green))",
  "Musar":              "var(--color-cat-mussar, var(--mussar-purple))",
  "Responsa":           "var(--color-cat-responsa, var(--responsa-red))",
  "Second Temple":      "var(--color-cat-apocrypha, var(--apocrypha-pink))",
  "Quoting Commentary": "var(--color-cat-responsa, var(--responsa-red))",
  "Sheets":             "var(--color-accent, var(--sefaria-blue))",
  "Sheet":              "var(--color-accent, var(--sefaria-blue))",
  "Targum":             "var(--color-cat-miscellaneous, var(--miscelaneous-green))",
  "Modern Commentary":  "var(--color-cat-modern-works, var(--modern-works-blue))",
  "Reference":          "var(--color-cat-reference, var(--reference-orange))",
  "System":             "var(--color-accent, var(--sefaria-blue))",
  "Static":             "linear-gradient(90deg, #00505E 0% 10%, #5698B4 10% 20%, #CCB37C 20% 30%, #5B9370 30% 40%, #823241 40% 50%, #5A4474 50% 60%, #AD4F66 60% 70%, #7285A6 70% 80%, #00807E 80% 90%, #4872B3 90% 100%)"
};
palette.categoryColor = function(cat) {
  if (cat in palette.categoryColors) {
    return palette.categoryColors[cat];
  }

  // For unknown categories, map the string a color (random, but stable)
  const colors = Object.values(palette.colors);
  let idx = 0;
  cat = typeof cat == "string" ? cat : "";
  cat.split("").map(letter => {idx += letter.charCodeAt(0);});
  idx = idx % colors.length;

  return colors[idx];
};

export default palette;
