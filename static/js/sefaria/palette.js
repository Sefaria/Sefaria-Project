var palette = {
  colors: {
    darkteal:  "#004e5f",
    raspberry: "#7c406f",
    green:     "#5d956f",
    paleblue:  "#9ab8cb",
    blue:      "#4871bf",
    orange:    "#cb6158",
    lightpink: "#c7a7b4",
    darkblue:  "#073570",
    darkpink:  "#ab4e66",
    lavender:  "#7f85a9",
    yellow:    "#ccb479",
    purple:    "#594176",
    lightblue: "#5a99b7",
    lightgreen:"#97b386",
    red:       "#802f3e",
    teal:      "#00827f",
    lightbg:   "#B8D4D3",
    tan:       "#D4896C"
  }
};
palette.categoryColors = {
  "Commentary":         "var(--sefaria-commentary-blue)",
  "Tanakh" :            "var(--sefaria-tanakh-teal)",
  "Midrash":            "var(--sefaria-midrash-green)",
  "Mishnah":            "var(--sefaria-mishnah-blue)",
  "Talmud":             "var(--sefaria-talmud-gold)",
  "Halakhah":           "var(--sefaria-halakhah-red)",
  "Kabbalah":           "var(--sefaria-kabbalah-purple)",
  "Philosophy":         "var(--sefaria-philosophy-purple)",  // to delete
  "Jewish Thought":     "var(--sefaria-philosophy-purple)",
  "Liturgy":            "var(--sefaria-liturgy-rose)",
  "Tanaitic":           "var(--sefaria-taanitic-green)",    // to delete
  "Tosefta":            "var(--sefaria-taanitic-green)",
  "Parshanut":          palette.colors.paleblue,
  "Chasidut":           "var(--sefaria-chasidut-green)",
  "Musar":              "var(--sefaria-mussar-purple)",
  "Responsa":           "var(--sefaria-responsa-red)",
  "Apocrypha":          "var(--sefaria-apocrypha-pink)",   // to delete
  "Second Temple":      "var(--sefaria-apocrypha-pink)",   // to delete
  "Other":              palette.colors.darkblue,    // to delete
  "Quoting Commentary": "var(--sefaria-responsa-red)",
  "Sheets":             palette.colors.darkblue,
  "Community":          palette.colors.raspberry,
  "Targum":             "var(--sefaria-philosophy-purple)",
  "Modern Works":       "var(--sefaria-modern-works-blue)",    // to delete
  "Modern Commentary":  "var(--sefaria-modern-works-blue)",
  "Reference":          "var(--sefaria-reference-orange)",
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
