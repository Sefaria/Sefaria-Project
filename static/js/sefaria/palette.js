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
  "Commentary":         palette.colors.blue,
  "Tanakh" :            palette.colors.darkteal,
  "Midrash":            palette.colors.green,
  "Mishnah":            palette.colors.lightblue,
  "Talmud":             palette.colors.yellow,
  "Halakhah":           palette.colors.red,
  "Kabbalah":           palette.colors.purple,
  "Philosophy":         palette.colors.lavender,
  "Liturgy":            palette.colors.darkpink,
  "Tanaitic":           palette.colors.teal,
  "Parshanut":          palette.colors.paleblue,
  "Chasidut":           palette.colors.lightgreen,
  "Musar":              palette.colors.raspberry,
  "Responsa":           palette.colors.orange,
  "Apocrypha":          palette.colors.lightpink,
  "Other":              palette.colors.darkblue,
  "Quoting Commentary": palette.colors.orange,
  "Sheets":             palette.colors.raspberry,
  "Community":          palette.colors.raspberry,
  "Targum":             palette.colors.lavender,
  "Modern Works":       palette.colors.lightbg,
  "Modern Commentary":  palette.colors.lightbg,
  "Reference":          palette.colors.tan  
};
palette.categoryColor = function(cat) {
  if (cat in palette.categoryColors) {
    return palette.categoryColors[cat];
  }
  return palette.categoryColors["Other"];
};

module.exports = palette;
