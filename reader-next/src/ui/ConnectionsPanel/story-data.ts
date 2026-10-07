/** Small, real data for connections stories: a trimmed slice of the recorded Genesis 1 links and a compact catalog. */
import { buildCatalog, type TocNode } from "~/lib/catalog/toc";
import type { RelatedLink } from "~/lib/connections/links";
import links from "./story-links.json";

export const STORY_LINKS = links as unknown as RelatedLink[];

const book = (title: string, heTitle: string, categories: string[], enShortDesc?: string, heShortDesc?: string): TocNode => ({ title, heTitle, categories, enShortDesc, heShortDesc });

export const STORY_CATALOG = buildCatalog([
  { category: "Tanakh", heCategory: 'תנ"ך', enShortDesc: "The Hebrew Bible", heShortDesc: "מקרא", contents: [book("Genesis", "בראשית", ["Tanakh", "Torah"])] },
  { category: "Mishnah", heCategory: "משנה", enShortDesc: "The first written compilation of the Oral Torah.", heShortDesc: "", contents: [] },
  { category: "Talmud", heCategory: "תלמוד", enShortDesc: "The central text of rabbinic Judaism.", heShortDesc: "", contents: [] },
  { category: "Midrash", heCategory: "מדרש", contents: [] },
  { category: "Halakhah", heCategory: "הלכה", contents: [] },
  { category: "Kabbalah", heCategory: "קבלה", contents: [] },
  { category: "Chasidut", heCategory: "חסידות", contents: [] },
  { category: "Jewish Thought", heCategory: "מחשבת ישראל", contents: [] },
  { category: "Musar", heCategory: "מוסר", contents: [] },
  { category: "Reference", heCategory: "מילונים", contents: [] },
]);
