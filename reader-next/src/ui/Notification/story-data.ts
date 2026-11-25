import type { NotificationView } from "./Notification";

/** Notifications of each kind, as the feature turns /api/updates and /api/notifications into them (trimmed from sefaria.org). */
export const NOTIFICATIONS: NotificationView[] = [
  {
    id: "1",
    date: "3 weeks ago",
    type: "index",
    href: "/Ben_Yehuda_Dictionary",
    title: { en: "Ben Yehuda Dictionary", he: "מילון בן־יהודה" },
    text: { en: "Historical Hebrew dictionary authored by Eliezer Ben-Yehuda and published throughout the 20th-century", he: "מילון עברי היסטורי שחיבר אליעזר בן־יהודה, ראה אור לאורך המאה ה־20" },
  },
  {
    id: "2",
    date: "3 weeks ago",
    type: "version",
    href: "/Learning_to_Read_Midrash",
    title: { en: "Learning to Read Midrash", he: "לפשוטו של מדרש" },
    language: "he",
    version: "Learning to Read Midrash, Hebrew edition; Trans. by Eliezer Kamon, Maggid Books, 2024",
    text: { en: "21st-century book by Simi Peters that presents a systematic approach to studying Midrash" },
  },
  { id: "3", date: "2 months ago", type: "general", text: { en: 'New Spanish translation of the Tanakh: <a href="/Genesis.1">Tanaj Español</a>', he: 'תרגום ספרדי חדש לתנ״ך: <a href="/Genesis.1">Tanaj Español</a>' } },
  { id: "4", date: "1 day ago", type: "sheet publish", name: "Ada Lovelace", profileUrl: "/profile/ada", imageUrl: "/img/icon.png", sheetHref: "/sheets/1", sheetTitle: "Shabbat Candles", summary: "Sources on lighting candles" },
];
