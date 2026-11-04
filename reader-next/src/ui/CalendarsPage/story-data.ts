import { calendarListings, sectionListings, type CalendarItem } from "~/lib/library/calendars";

/** A day of /api/calendars as sefaria.org answered it on 2026-11-04 (trimmed): the stories' data. */
export const DAY: CalendarItem[] = [
  { title: { en: "Parashat Hashavua", he: "פרשת השבוע" }, displayValue: { en: "Chayei Sara", he: "חיי שרה" }, url: "Genesis.23.1-25.18", ref: "Genesis 23:1-25:18", heRef: "בראשית כ״ג:א׳-כ״ה:י״ח", category: "Tanakh", description: { en: "Chayyei Sarah (“The Life of Sarah”) opens as Sarah dies and Abraham buys the Cave of Machpelah to bury her.", he: "פרשת חיי שרה נפתחת במות שרה. אברהם קונה את מערת המכפלה וקובר בה את אשתו." } },
  { title: { en: "Haftarah", he: "הפטרה" }, displayValue: { en: "I Kings 1:1-31", he: "מלכים א א׳:א׳-ל״א" }, url: "I_Kings.1.1-31", ref: "I Kings 1:1-31", category: "Tanakh" },
  { title: { en: "Daf Yomi", he: "דף יומי" }, displayValue: { en: "Bekhorot 47", he: "בכורות מ״ז" }, url: "Bekhorot.47", ref: "Bekhorot 47", category: "Talmud" },
  { title: { en: "929", he: "929" }, displayValue: { en: "I Kings 22 (309)", he: "מלכים א כ״ב (309)" }, url: "I_Kings.22", ref: "I Kings 22", category: "Tanakh" },
  { title: { en: "Daily Mishnah", he: "משנה יומית" }, displayValue: { en: "Mishnah Oholot 15:4-5", he: "משנה אהלות ט״ו:ד׳-ה׳" }, url: "Mishnah_Oholot.15.4-5", ref: "Mishnah Oholot 15:4-5", category: "Mishnah" },
  { title: { en: "Yerushalmi Yomi", he: "ירושלמי יומי" }, displayValue: { en: "Jerusalem Talmud Sanhedrin 16", he: "תלמוד ירושלמי סנהדרין טז" }, url: "Jerusalem_Talmud_Sanhedrin.3.5.7-6.3", ref: "Jerusalem Talmud Sanhedrin 3:5:7-6:3", category: "Talmud" },
  { title: { en: "Daf a Week", he: "דף השבוע" }, displayValue: { en: "Nazir 16", he: "נזיר ט״ז" }, url: "Nazir.16", ref: "Nazir 16", category: "Talmud" },
];
const L = calendarListings(DAY);
export const SECTIONS = { weeklyPortion: sectionListings(L, "weeklyPortion"), daily: sectionListings(L, "daily"), weekly: sectionListings(L, "weekly") };
