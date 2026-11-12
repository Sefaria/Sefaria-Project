/**
 * Today's learning schedules (`GET /api/calendars?diaspora=1|0[&custom=…]`): the weekly portion, its haftarah, Daf Yomi and every
 * other schedule. Short-lived data: cached for the day's session only.
 *
 * Also the Learning Schedules page's model (the old CalendarsPage's reformatCalendars and its hard-coded descriptions) and the
 * targets of the /parashat-hashavua and /todays-daf-yomi shortcuts.
 *
 * @feature LIB-038 Sidebar module: Learning schedules
 * @feature LIB-039 Sidebar module: Weekly Torah portion
 * @feature LIB-040 Sidebar module: Daf Yomi
 * @feature CAL-001 Learning Schedules page
 * @feature CAL-002 Calendar listing cards
 * @feature CAL-003 Calendar APIs and quick redirects
 */
import { queryOptions } from "@tanstack/react-query";
import { SEFARIA_API_ORIGIN, apiJson } from "~/lib/api/client";
import { withPolicy } from "~/lib/cache/query-options";

export interface Bilingual {
  en: string;
  he: string;
}
export interface CalendarItem {
  title: Bilingual;
  displayValue: Bilingual;
  url: string;
  ref: string;
  heRef?: string;
  order?: number;
  /** The library category that colours the schedule's card ("Tanakh", "Talmud"…). */
  category?: string;
  /** Given by the API for some schedules (the weekly portion's summary); the page's own table covers the rest. */
  description?: Bilingual;
}

/**
 * The old site's textual custom (profile setting `textual_custom`): which haftarah a reader is shown in the weeks the customs differ.
 * The page asks with the reader's own; signed out it is "ashkenazi" (reader/views.py _get_user_calendar_params).
 */
export const SIGNED_OUT_CUSTOM = "ashkenazi";

/**
 * `diaspora`: the old site's request.diaspora — false for readers in Israel, whose weekly portion differs in some weeks (decided by
 * the server from the request's country: src/routes/__root.tsx). Kept in memory only (it was kept 90 days on
 * disk, so a reader offline or back after a week saw last week's portion first).
 * `custom`: sent only when given (the library sidebar sends none, as it always has here; the Learning Schedules page sends the reader's).
 */
export const calendarsQueryOptions = (diaspora = true, custom?: string) =>
  queryOptions<CalendarItem[]>({
    ...withPolicy("search", {
      queryKey: (custom ? ["calendars", diaspora ? "diaspora" : "israel", custom] : ["calendars", diaspora ? "diaspora" : "israel"]) as readonly string[],
      queryFn: async ({ signal }: { signal: AbortSignal }): Promise<CalendarItem[]> => {
        const r = await fetch(calendarsUrl(SEFARIA_API_ORIGIN, diaspora, custom), { signal });
        return (await apiJson<{ calendar_items: CalendarItem[] }>(r, `Calendars`)).calendar_items;
      },
    }),
    staleTime: 60 * 60 * 1000,
  });

/** The calendars API address (custom only when given, as the old client's Sefaria.updateCalendars sent it). */
export const calendarsUrl = (origin: string, diaspora: boolean, custom?: string) =>
  `${origin}/api/calendars?diaspora=${diaspora ? 1 : 0}${custom ? `&custom=${encodeURIComponent(custom)}` : ""}`;

export const parashah = (items: readonly CalendarItem[]) => items.find((c) => c.title.en === "Parashat Hashavua");
export const haftarot = (items: readonly CalendarItem[]) => items.filter((c) => c.title.en.startsWith("Haftarah"));
export const dafYomi = (items: readonly CalendarItem[]) => items.find((c) => c.title.en === "Daf Yomi");

// ---------------------------------------------------------------------------------------------------------------------------------
// The Learning Schedules page (static/js/CalendarsPage.jsx)

/** One card of the page: a schedule, its readings (several when the API repeats the title: a haftarah in parts), its description. */
export interface CalendarListing {
  /** The schedule's English name as the API gives it ("Haftarah (A)", "Daf Yomi"): the card's identity. */
  key: string;
  /** The card's title: the schedule's name, or for the weekly portion the portion's name ("Chayei Sara"). */
  title: Bilingual;
  /** "Talmud" / "Tanakh" after the title, in brackets (English interface only; the Hebrew strings are empty). */
  subtitle?: "Talmud" | "Tanakh";
  /** Where the title goes: the first reading. */
  href: string;
  category?: string;
  readings: { href: string; text: Bilingual }[];
  description?: Bilingual;
}

/** The page's three sections and the schedules each shows (any other schedule the API sends is not shown). */
export const CALENDAR_SECTIONS = {
  weeklyPortion: ["Parashat Hashavua", "Haftarah (A)", "Haftarah (S)", "Haftarah"],
  daily: ["Daf Yomi", "929", "Daily Mishnah", "Daily Rambam", "Daily Rambam (3 Chapters)", "Halakhah Yomit", "Arukh HaShulchan Yomi", "Tanakh Yomi", "Zohar for Elul", "Chok LeYisrael", "Tanya Yomi", "Yerushalmi Yomi"],
  weekly: ["Daf a Week"],
} as const;
export type CalendarSection = keyof typeof CALENDAR_SECTIONS;

interface Description {
  en?: string;
  he?: string;
  subtitle?: "Talmud" | "Tanakh";
}
/**
 * The old page's descriptions, keyed by schedule name without " (A)"/" (S)"; the API's own description wins. Copied verbatim from
 * static/js/CalendarsPage.jsx (also copied into the mobile app's exporter: keep the three in step).
 */
export const CALENDAR_DESCRIPTIONS: Record<string, Description> = {
  "Parashat Hashavua": {},
  Haftarah: {
    en: "The portion from Prophets (a section of the Bible) read on any given week, based on its thematic connection to the weekly Torah portion.",
    he: "קטע קבוע לכל פרשה מספרי הנביאים הנקרא בכל שבת ומועד, ויש לו קשר רעיוני לפרשת השבוע.",
  },
  "Daf Yomi": {
    en: "A learning program that covers a page of Talmud a day. In this way, the entire Talmud is completed in about seven and a half years.",
    he: "סדר לימוד לתלמוד הבבלי הכולל לימוד של דף אחד בכל יום. הלומדים בדרך זו מסיימים את קריאת התלמוד כולו בתוך כשבע שנים וחצי.",
    subtitle: "Talmud",
  },
  "929": {
    en: "A learning program in which participants study five of the Bible’s 929 chapters a week, completing it in about three and a half years.",
    he: 'סדר שבועי ללימוד תנ"ך שבו נלמדים בכל שבוע חמישה מתוך 929 פרקי התנ"ך. הלומדים בדרך זו מסיימים את קריאת התנ"ך כולו כעבור שלוש שנים וחצי.',
    subtitle: "Tanakh",
  },
  "Daily Mishnah": {
    en: "A program of daily learning in which participants study two Mishnahs (teachings) each day in order to finish the entire Mishnah in six years.",
    he: "סדר לימוד משנה שבמסגרתו נלמדות שתי משניות בכל יום. הלומדים בדרך זו מסיימים את קריאת המשנה כולה כעבור שש שנים.",
  },
  "Daily Rambam": {
    en: "A learning program that divides Maimonides’ Mishneh Torah legal code into daily units, to complete the whole work in three years.",
    he: 'סדר לימוד הספר ההלכתי של הרמב"ם, "משנה תורה", המחלק את הספר ליחידות יומיות. הלומדים בדרך זו מסיימים את קריאת הספר כולו בתוך שלוש שנים.',
  },
  "Daily Rambam (3 Chapters)": {
    en: "A learning program that divides Maimonides’ Mishneh Torah legal code into daily units, to complete the whole work in one year.",
    he: 'סדר לימוד הספר ההלכתי של הרמב"ם, "משנה תורה", המחלק את הספר ליחידות יומיות. הלומדים בדרך זו מסיימים את קריאת הספר כולו בתוך שנה אחת.',
  },
  "Daf a Week": {
    en: "A learning program that covers a page of Talmud a week. By going at a slower pace, it facilitates greater mastery and retention.",
    he: "סדר שבועי ללימוד התלמוד הבבלי שבו נלמד דף תלמוד אחד בכל שבוע. קצב הלימוד האיטי מאפשר ללומדים הפנמה ושליטה רבה יותר בחומר הנלמד.",
    subtitle: "Talmud",
  },
  "Halakhah Yomit": {
    en: "A four year daily learning program in which participants study central legal texts that cover most of the daily and yearly rituals.",
    he: "תוכנית ארבע־שנתית ללימוד מקורות הלכתיים מרכזיים העוסקים ברוב הלכות היום־יום והמועדים.",
  },
  "Arukh HaShulchan Yomi": {
    en: "A four-year daily learning program covering ritual halakhot, practical kashrut and interpersonal mitzvot within Rabbi Yechiel Michel Epstein’s legal code, Arukh HaShulchan.",
    he: "תכנית לימוד ארבע-שנתית של הלכות מעשיות מתוך ספר ערוך השלחן, חיבורו ההלכתי של הרב יחיאל מיכל עפשטיין.",
  },
  "Tanya Yomi": {
    en: "A daily learning cycle for completing Tanya annually, starting at the 19th of Kislev, “Rosh Hashanah of Chasidut.”",
    he: 'סדר לימוד המשלים את ספר התניא אחת לשנה, החל מיום י"ט בכסליו "ראש השנה לחסידות".',
  },
  "Tanakh Yomi": {
    en: "A daily learning cycle for completing Tanakh annually. On Shabbat, each Torah portion is recited. On weekdays, Prophets and Writings are recited according to the ancient Masoretic division of sedarim.",
    he: 'סדר לימוד המשלים את קריאת התנ"ך כולו אחת לשנה. בשבתות קוראים את התורה לפי סדר פרשיות השבוע. בימות החול קוראים את הנ"ך על פי חלוקת הסדרים של המסורה.',
    subtitle: "Tanakh",
  },
  "Zohar for Elul": {
    en: 'A 40 day learning schedule in which participants learn the Kabbalistic work "Tikkunei Zohar" over the course of the days between the First of the month of Elul and Yom Kippur.',
    he: 'סדר יומי ללימוד הספר "תיקוני הזהר". הסדר נמשך 40 יום, בתקופה שבין ראש חודש אלול ויום הכיפורים.',
  },
  "Chok LeYisrael": {
    en: "A book designed for daily study. Each day’s learning consists of biblical verses together with commentary, a chapter of Mishnah, and short passages of Talmud, Zohar, and of works of Halakhah and Musar.",
    he: "לימוד יומי הכולל פסוקי תנ״ך ופירושם, פרק משנה, קטע מהתלמוד, קטע מהזוהר, קטע מספר הלכה וקטע מספר מוסר.",
  },
};

/** A site path for a calendar url as the old page wrote it: "/" + the url, unencoded (Chok LeYisrael's is a Hebrew collection path). */
const sitePath = (url: string) => `/${url}`;

/**
 * The API's items as the page's cards (the old reformatCalendars): descriptions from the table unless the API gave one; the weekly
 * portion's card titled by the portion with its ref as the reading; consecutive items of the same schedule merged into one card.
 */
export function calendarListings(items: readonly CalendarItem[]): CalendarListing[] {
  const out: CalendarListing[] = [];
  for (const cal of items) {
    const known = CALENDAR_DESCRIPTIONS[cal.title.en.replace(/ \([AS]\)$/, "")];
    const description = cal.description ?? (known && known.en !== undefined ? { en: known.en, he: known.he ?? "" } : undefined);
    const portion = cal.title.en === "Parashat Hashavua";
    const reading = { href: sitePath(cal.url), text: portion ? { en: cal.ref, he: cal.heRef ?? cal.ref } : cal.displayValue };
    const last = out[out.length - 1];
    if (last && last.key === cal.title.en) {
      last.readings.push(reading);
      continue;
    }
    out.push({
      key: cal.title.en,
      title: portion ? cal.displayValue : cal.title,
      ...(!portion && known?.subtitle ? { subtitle: known.subtitle } : {}),
      href: sitePath(cal.url),
      ...(cal.category ? { category: cal.category } : {}),
      readings: [reading],
      ...(description ? { description } : {}),
    });
  }
  return out;
}

/** The cards of one section, in the API's order (the old page filtered the API's list, so its order wins over the section's). */
export const sectionListings = (listings: readonly CalendarListing[], section: CalendarSection) =>
  listings.filter((l) => (CALENDAR_SECTIONS[section] as readonly string[]).includes(l.key));

// ---------------------------------------------------------------------------------------------------------------------------------
// The shortcuts

/** The shortcut paths and the schedule each goes to (sefaria/urls_library.py; reader/views.py parashat_hashavua_redirect, daf_yomi_redirect). */
export const CALENDAR_SHORTCUTS: Readonly<Record<string, string>> = { "/parashat-hashavua": "Parashat Hashavua", "/todays-daf-yomi": "Daf Yomi" };

/** Characters Django's iri_to_uri leaves as they are (django.utils.encoding: quote(iri, safe="/#%[]=:;$&()+,!?*@'~")). */
const IRI_SAFE = /[A-Za-z0-9_.\-~/#%[\]=:;$&()+,!?*@']/;
const utf8 = new TextEncoder();
/** Django's iri_to_uri: every other character percent-encoded as UTF-8, upper-case hex. */
export function iriToUri(iri: string): string {
  let out = "";
  for (const ch of iri) out += IRI_SAFE.test(ch) ? ch : [...utf8.encode(ch)].map((b) => `%${b.toString(16).toUpperCase().padStart(2, "0")}`).join("");
  return out;
}

/**
 * Where a shortcut goes: "/" + the schedule's url, as Django's redirect writes the Location. The old views ask for today's items with
 * the defaults (diaspora, no custom) whatever the request says: `?diaspora=0` is ignored. They key the items by title, so a title the
 * API repeats goes to its last item. Null when the schedule is missing today.
 */
export function shortcutLocation(items: readonly CalendarItem[], schedule: string): string | null {
  const item = [...items].reverse().find((c) => c.title.en === schedule);
  return item ? iriToUri(`/${item.url}`) : null;
}
