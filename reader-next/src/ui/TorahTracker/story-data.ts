import type { BarView, DonutSliceView, FavoriteView } from "./TorahTracker";

/** A donut and bars as the feature computes them (lib/torahtracker/stats.ts) for a reader mostly in Tanakh and Talmud. */
export const SLICES: DonutSliceView[] = [
  { key: "Tanakh", path: "M0,-139A139,139,0,1,1,-81.703,112.454L-76.413,105.172A130,130,0,1,0,0,-130Z", color: "#004e5f", title: "Tanakh: 60.00%", label: "Tanakh", percent: "60%", at: [97.08, 31.54] },
  { key: "Talmud", path: "M-81.703,112.454A139,139,0,0,1,-81.703,-112.454L-76.413,-105.172A130,130,0,0,0,-76.413,105.172Z", color: "#ccb479", title: "Talmud: 30.00%", label: "Talmud", percent: "30%", at: [-102.07, 0] },
  { key: "Etc", path: "M-81.703,-112.454A139,139,0,0,1,0,-139L0,-130A130,130,0,0,0,-76.413,-105.172Z", color: "#7f85a9", title: "Etc: 10.00%", label: "Etc", percent: undefined, at: [-31.54, -97.08] },
];
export const BARS: BarView[] = [
  { key: "Tanakh", label: "TANAKH", y: 21, user: 566, site: 189, color: "#004e5f" },
  { key: "Talmud", label: "TALMUD", y: 98, user: 283, site: 189, color: "#ccb479" },
];
export const FAVORITES: FavoriteView[] = [
  { href: "/Genesis.1.1", en: "Genesis 1:1", he: "בראשית א׳:א׳", color: "#004e5f" },
  { href: "/Berakhot.2a", en: "Berakhot 2a", he: "ברכות ב א", color: "#ccb479" },
];
