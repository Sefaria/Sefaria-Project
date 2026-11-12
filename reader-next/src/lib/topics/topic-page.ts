/**
 * The single topic page (`/topics/<slug>`) as the old client built it (static/js/TopicPage.jsx, Story.jsx, sefaria.js getTopic /
 * processTopicsTabsData / _deriveTabDataForTopicLink), as pure functions over reader-owned types. The adapter (topic-page-source.ts)
 * turns the API's answer into these types on the server; nothing here sees an API shape.
 *
 * @feature TOP-015 Topic page data loading
 * @feature TOP-016 Topic source tab bucketing
 * @feature TOP-020 Topic page tabs
 * @feature TOP-022 Topic source filter and sort
 * @feature TOP-023 Topic source cards
 * @feature TOP-025 Topic side column: metadata and links
 * @feature TOP-026 Parasha readings panel
 * @feature TOP-018 Parasha topic sponsorship text
 * @feature TOP-028 AI-generated topic text disclosure and admin prompt tools
 */
import { formatSections, parseHumanRef } from "~/lib/ref/url";
import { encodeHebrewNumeral } from "~/lib/ref/hebrew-numerals";
import type { AzLang, Bilingual } from "./topic-model";

export type { Bilingual } from "./topic-model";

/** The tabs that list sources, in the old useAllPossibleSourceTabs order. (Sheets are the Voices host's only tab: not on the Library.) */
export const SOURCE_TABS = ["popular-writing-of", "admin", "notable-sources", "sources"] as const;
export type SourceTabKey = (typeof SOURCE_TABS)[number];
/** An author's works: the old "Works on Sefaria" tab (`author-works-on-sefaria`), first when there are any. */
export const WORKS_TAB = "author-works-on-sefaria";
export type TabKey = SourceTabKey | typeof WORKS_TAB;
/** The sort the old page starts with (reader/views.py topic_page: initialTopicSort = GET sort or "Relevance"). */
export const DEFAULT_SORT = "Relevance";
export const REF_SORT_OPTIONS = ["Relevance", "Chronological"] as const;
/** Sefaria._topicPageSize: how many sources one bulk-text request carries. */
export const TOPIC_PAGE_SIZE = 70;
/** FilterableList pageSize: how many more sources each scroll to the bottom shows. */
export const DISPLAY_PAGE_SIZE = 20;

/** One language's curation of a source on this topic (a RefTopicLink's description). */
export interface LinkDescription {
  title?: string;
  prompt?: string;
  ai_title?: string;
  published?: boolean;
  review_state?: string;
  /** The link has ai_context (the moderators' Generate button). */
  hasAiContext?: boolean;
}
export interface RefOrder {
  availableLangs: string[];
  numDatasource: number;
  tfidf: number;
  pr: number;
  curatedPrimacy: { en: number; he: number };
  comp_date?: number;
  order_id?: string;
}
/** A source linked to the topic. `index` is its book's title (the old Sefaria.parseRef(ref).index). */
export interface TopicSource {
  ref: string;
  order?: RefOrder;
  descriptions?: { en?: LinkDescription; he?: LinkDescription };
  index?: string;
}
/** The sources of one link type ("about", "popular-writing-of"), in the server's order. */
export interface RefLinkGroup {
  linkType: string;
  refs: TopicSource[];
}
/** What a source card needs from its book's index: its categories (filter, analytics, colour) and its primary category (the label). */
export interface IndexMeta {
  categories: string[];
  primaryCategory?: string;
  /** The primary category's Hebrew name (the label in the Hebrew interface). */
  heCategory?: string;
}
/** A related topic in the side column. */
export interface TopicLinkItem {
  topic: string;
  title: Bilingual;
  /** order.tfidf (undefined: the link has no order) */
  tfidf?: number;
  hasOrder: boolean;
  shouldDisplay?: boolean;
  pools?: string[];
  isCategory?: boolean;
}
export interface TopicLinkGroup {
  title: Bilingual;
  pluralTitle?: Bilingual;
  shouldDisplay?: boolean;
  links: TopicLinkItem[];
}
export interface AuthorWork {
  url: string;
  title: Bilingual;
  description: { en?: string; he?: string };
}
export interface TopicCategoryRef {
  slug: string;
  en: string;
  he: string;
}
export interface LearnMoreLink {
  /** Wikipedia, Jewish Encyclopedia, National Library of Israel */
  title: string;
  titleHe: string;
  en?: string;
  he?: string;
}
/** The whole page, as the server hands it to the browser. */
export interface TopicPageModel {
  slug: string;
  primaryTitle: Bilingual;
  description?: { en?: string; he?: string };
  image?: { uri: string; caption: { en?: string; he?: string } };
  ref?: { en: string; he: string; url: string };
  parasha?: string;
  portalSlug?: string;
  learnMore: LearnMoreLink[];
  timePeriod?: { name: { en?: string; he?: string }; yearRange: { en?: string; he?: string } };
  links: TopicLinkGroup[];
  refs: RefLinkGroup[];
  works: AuthorWork[];
  /** The category the page names under its title (the old displayTopicTocCategory: the last of its parents). */
  category?: TopicCategoryRef;
  /** The category's subtopics (the first 20 of its TOC page), the side column's fallback when the topic has no links. */
  siblings: { slug: string; en: string; he: string }[];
  /** Every category above the topic, outermost first, slugs joined by "|" (the old getPanelCategory). */
  panelCategory: string;
  indexes: Record<string, IndexMeta>;
  /** reader/views.py topic_page: noindex when the topic would not show in lists (should_display(MIN_SOURCES, textual_only)). */
  noindex: boolean;
}

/** The text of a source as `/api/bulktext` answers it (sized 500–600 characters). */
export interface SourceText {
  ref: string;
  heRef?: string;
  en?: string;
  he?: string;
  error?: boolean;
}

export type ContentLangPref = "english" | "hebrew" | "bilingual";

// ---------------------------------------------------------------------------------------------------------------------------- tabs

export interface TopicTab {
  key: SourceTabKey;
  title: Bilingual;
  refs: TopicSource[];
}

const TAB_TITLES: Record<SourceTabKey, Bilingual> & { all: Bilingual } = {
  "popular-writing-of": { en: "Top Citations", he: "ציטוטים עיקריים" },
  admin: { en: "Admin", he: "עריכה" },
  "notable-sources": { en: "Notable Sources", he: "מקורות מרכזיים" },
  sources: { en: "Sources", he: "מקורות" },
  all: { en: "All Sources", he: "כל המקורות" },
};

/** isLinkPublished: a description not explicitly unpublished. */
export const isLinkPublished = (lang: AzLang, s: TopicSource) => s.descriptions?.[lang]?.published !== false;
const isLinkReviewed = (lang: AzLang, s: TopicSource) => s.descriptions?.[lang]?.review_state !== "not reviewed";
/** doesLinkHaveAiContent: an AI title in the interface language that is published. */
export const hasAiContent = (lang: AzLang, s: TopicSource) => (s.descriptions?.[lang]?.ai_title?.length ?? 0) > 0 && isLinkPublished(lang, s);

/**
 * Sefaria.processTopicsTabsData on the Library: "popular-writing-of" links are Top Citations; an "about" link with a published title or
 * prompt in the interface language is a Notable Source, any other a Source; Sources then becomes the superset (notable first), titled
 * "All Sources" when only notable ones exist; moderators get an Admin copy of it.
 */
export function bucketTabs(groups: readonly RefLinkGroup[], lang: AzLang, moderator: boolean): Partial<Record<SourceTabKey, TopicTab>> {
  const tabs: Partial<Record<SourceTabKey, TopicTab>> = {};
  const add = (key: SourceTabKey, s: TopicSource) => (tabs[key] ??= { key, title: TAB_TITLES[key], refs: [] }).refs.push(s);
  for (const g of groups) {
    for (const s of g.refs) {
      if (g.linkType === "popular-writing-of") add("popular-writing-of", s);
      else if (g.linkType === "about") {
        const d = s.descriptions?.[lang];
        add((d?.title || d?.prompt) && d?.published !== false ? "notable-sources" : "sources", s);
      }
    }
  }
  if (tabs["notable-sources"]) {
    const plain = tabs.sources?.refs ?? [];
    tabs.sources = { key: "sources", title: tabs.sources ? tabs.sources.title : TAB_TITLES.all, refs: [...tabs["notable-sources"].refs, ...plain] };
  }
  if (moderator && tabs.sources) tabs.admin = { ...tabs.sources, key: "admin", title: TAB_TITLES.admin };
  return tabs;
}

export interface TabEntry {
  id: TabKey;
  title: Bilingual;
}

/** The tabs shown, in order: Works on Sefaria (an author with works), then the source tabs that exist. */
export function visibleTabs(tabs: Partial<Record<SourceTabKey, TopicTab>>, works: readonly AuthorWork[]): TabEntry[] {
  const out: TabEntry[] = SOURCE_TABS.filter((k) => tabs[k]).map((k) => ({ id: k, title: tabs[k]!.title }));
  if (works.length) out.unshift({ id: WORKS_TAB, title: { en: "Works on Sefaria", he: "חיבורים וכתבים בספריא" } });
  return out;
}

/**
 * The tab shown: the URL's when it names one of the page's tabs, else the first (the old TabView fell back to index 0 and wrote the
 * first tab's id into the URL).
 */
export const activeTab = (tabs: readonly TabEntry[], requested: string | undefined): TabKey | undefined =>
  tabs.find((t) => t.id === requested)?.id ?? tabs[0]?.id;

/** The pseudo-tabs after the real ones: the filter funnel (not on Notable Sources or Works) and the language "A" (not on Works). */
export function pseudoTabs(tabs: readonly TabEntry[], current: TabKey | undefined): { filter: boolean; lang: boolean } {
  return {
    filter: tabs.length > 0 && current !== "notable-sources" && current !== WORKS_TAB,
    lang: tabs.length > 0 && current !== WORKS_TAB,
  };
}

// ---------------------------------------------------------------------------------------------------------------------- sort, filter

/** processTopicsTabsData's normalisation of `order` (missing numbers become their defaults). */
export function normalizeOrder(o: Partial<RefOrder> & Record<string, unknown> | undefined): RefOrder | undefined {
  if (!o) return undefined;
  return {
    ...(o.comp_date !== undefined ? { comp_date: o.comp_date as number } : {}),
    ...(o.order_id !== undefined ? { order_id: o.order_id as string } : {}),
    availableLangs: o.availableLangs ?? [],
    numDatasource: o.numDatasource || 1,
    tfidf: o.tfidf || 0,
    pr: o.pr || 0,
    curatedPrimacy: { he: o.curatedPrimacy?.he || 0, en: o.curatedPrimacy?.en || 0 },
  };
}

/**
 * The old refSort: sources with an order first; Chronological by composition date then order_id; otherwise (Relevance, or any other
 * value the URL carries) by curated primacy in the interface language, then (English) sources with an English text first, then
 * PageRank, then numDatasource × tf-idf.
 */
export function refSort(option: string, lang: AzLang) {
  return (x: TopicSource, y: TopicSource): number => {
    const a = x.order, b = y.order;
    if (!a && !b) return 0;
    if (!a || !b) return Number(!!b) - Number(!!a);
    if (option === "Chronological") {
      if (a.comp_date === b.comp_date) {
        if ((a.order_id ?? "") < (b.order_id ?? "")) return -1;
        if ((b.order_id ?? "") < (a.order_id ?? "")) return 1;
        return 0;
      }
      return (a.comp_date ?? NaN) - (b.comp_date ?? NaN);
    }
    if (a.curatedPrimacy[lang] > 0 || b.curatedPrimacy[lang] > 0) return b.curatedPrimacy[lang] - a.curatedPrimacy[lang];
    if (lang === "en" && a.availableLangs.length !== b.availableLangs.length) {
      if (a.availableLangs.includes("en")) return -1;
      if (b.availableLangs.includes("en")) return 1;
      return 0;
    }
    if (a.pr !== b.pr) return b.pr - a.pr;
    return b.numDatasource * b.tfidf - a.numDatasource * a.tfidf;
  };
}

/** Sort with the old comparator's quirks kept (a stable sort, as Array.prototype.sort). */
export const sortSources = <T extends TopicSource>(items: readonly T[], option: string, lang: AzLang): T[] => [...items].sort(refSort(option, lang));

/** The old refFilter: the filter (lower-cased) found in the English text, the Hebrew text, the ref or the book's categories. */
export function refMatches(filter: string, s: TopicSource, text: SourceText | undefined, meta: IndexMeta | undefined): boolean {
  const f = filter.toLowerCase();
  const n = (v: string | undefined) => (v ? v.toLowerCase() : "");
  return [text?.en, text?.he, text?.ref ?? s.ref, meta?.categories.join(" ")].some((v) => n(v).includes(f));
}

// ------------------------------------------------------------------------------------------------------------------------- a card

export type CardMode = "admin" | "notable" | "all" | "citations";
/** Which card each tab renders (the old refRenderWrapper arguments). */
export const cardModeOf = (tab: SourceTabKey): CardMode => (tab === "admin" ? "admin" : tab === "notable-sources" ? "notable" : tab === "sources" ? "all" : "citations");

export interface CardDisplay {
  /** Shown at all (a source missing the chosen language is hidden on Notable Sources and Sources). */
  visible: boolean;
  /** The curated title and prompt in a <details> (Notable Sources, Admin). */
  introduced: boolean;
  /** Which side(s) of the text: the only one there is, else the reader's choice. */
  language: ContentLangPref;
}

/** TopicTextPassage's rules. */
export function cardDisplay(mode: CardMode, s: TopicSource, text: SourceText, pref: ContentLangPref, lang: AzLang): CardDisplay {
  const heOnly = !text.en, enOnly = !text.he;
  const language: ContentLangPref = enOnly || heOnly ? (heOnly ? "hebrew" : "english") : pref;
  const hideMissing = mode === "notable" || mode === "all";
  const displayDescription = mode === "notable" || mode === "admin";
  const visible = !((heOnly && pref === "english" && hideMissing) || (enOnly && pref === "hebrew" && hideMissing));
  return { visible, introduced: !!s.descriptions?.[lang]?.title && displayDescription, language };
}

/**
 * The legacy Sefaria.normRef of a ref (makeRef: the book with `_` for spaces, URI-encoded — "Zohar%2C_Shemot.51.376" — then the
 * sections; a range keeps only what differs).
 */
export function legacyNormRef(ref: string): string {
  const p = parseHumanRef(ref);
  const book = encodeURIComponent(p.title.replace(/ /g, "_"));
  return p.sections.length ? `${book}.${formatSections(p.sections, p.toSections, ".")}` : book;
}

/** The analytics batch on each source (the old _extractAnalyticsDataFromRef). */
export const sourceAnalytics = (position: number, s: TopicSource, meta: IndexMeta | undefined, lang: AzLang) => ({
  position,
  ai: hasAiContent(lang, s) ? "ai" : "human",
  item_id: s.ref,
  content_id: s.index,
  content_type: meta?.categories.join("|"),
});

/** The language toggle's three choices and the content language each sets (LangSelectInterface). */
export const LANG_CHOICES = [
  { id: "source", pref: "hebrew", en: "Source", he: "מקור" },
  { id: "translation", pref: "english", en: "Translation", he: "תרגום" },
  { id: "sourcewtrans", pref: "bilingual", en: "Source with Translation", he: "מקור ותרגום" },
] as const satisfies readonly { id: string; pref: ContentLangPref; en: string; he: string }[];
export const langChoiceOf = (pref: ContentLangPref) => LANG_CHOICES.find((c) => c.pref === pref)!.id;

// ------------------------------------------------------------------------------------------------------------------ the side column

/** Sefaria.shouldDisplayInActiveModule on the Library. */
const displayable = (l: { shouldDisplay?: boolean; pools?: string[] }) => !!l.shouldDisplay && !!l.pools?.includes("library");

function sortLinks(links: readonly TopicLinkItem[], lang: AzLang): TopicLinkItem[] {
  return links.filter(displayable).sort((a, b) => {
    if (!!a.title[lang] !== !!b.title[lang]) return Number(!!b.title[lang]) - Number(!!a.title[lang]);
    if (!a.hasOrder && !b.hasOrder) return 0;
    if (a.hasOrder !== b.hasOrder) return Number(b.hasOrder) - Number(a.hasOrder);
    return (b.tfidf ?? NaN) - (a.tfidf ?? NaN);
  });
}

export interface SideSection {
  /** What the section shows: the plural title when it holds more than one link. */
  title: Bilingual;
  links: TopicLinkItem[];
  /** The singular title (the old sort compared it, not the plural). */
  sortTitle: Bilingual;
}

/**
 * preprocessLinksByType: the link types to show (shouldDisplay, with a link displayable here), each list filtered and sorted
 * (interface-language titles first, then tf-idf), titled in the plural when it holds more than one; "Related" first, then alphabetical.
 * With none, the category's subtopics — which the old code mapped to objects without `shouldDisplay`, so its own filter dropped
 * them all: the section shows its title over an empty list (kept as on sefaria.org).
 */
export function sideSections(page: Pick<TopicPageModel, "links" | "category" | "siblings">, lang: AzLang): SideSection[] {
  let out: SideSection[] = page.links
    .filter((g) => !!g.shouldDisplay && g.links.some(displayable))
    .map((g) => {
      const links = sortLinks(g.links, lang);
      return { title: links.length > 1 && g.pluralTitle ? g.pluralTitle : g.title, sortTitle: g.title, links };
    });
  if (!out.length) {
    const c = page.category;
    const title = { en: c ? c.en : "Explore Topics", he: c ? c.he : "נושאים כלליים" };
    const defaults: TopicLinkItem[] = page.siblings.slice(0, 20).map((s) => ({ topic: s.slug, title: { en: s.en, he: s.he }, isCategory: !c, hasOrder: false }));
    out = [{ title, sortTitle: title, links: sortLinks(defaults, lang) }];
  }
  return out.sort((a, b) => {
    const ar = a.sortTitle.en.includes("Related"), br = b.sortTitle.en.includes("Related");
    if (ar && br) return 0;
    if (ar) return -1;
    if (br) return 1;
    return a.sortTitle.en.localeCompare(b.sortTitle.en);
  });
}

/** The side column shows ten links of a section, then More / Less. */
export const SIDE_LIST_SIZE = 10;

/** The topic's properties → the "Learn More" links (Wikipedia, Jewish Encyclopedia, National Library of Israel). */
export const LEARN_MORE_KEYS = [
  { en: "enWikiLink", he: "heWikiLink", title: "Wikipedia", titleHe: "ויקיפדיה" },
  { en: "jeLink", he: "jeLink", title: "Jewish Encyclopedia", titleHe: "האנציקלופדיה היהודית" },
  { en: "enNliLink", he: "heNliLink", title: "National Library of Israel", titleHe: "הספרייה הלאומית" },
] as const;

/**
 * TopicMetaData's links: the interface language's URL, else the other one with "(Hebrew)" / "(אנגלית)" after the title; none without
 * either. Opens in a new tab.
 */
export function learnMoreLinks(links: readonly LearnMoreLink[], lang: AzLang): { url: string; en: string; he: string }[] {
  return links.flatMap((l) => {
    const own = lang === "he" ? l.he : l.en;
    const url = own || (lang === "he" ? l.en : l.he);
    if (!url) return [];
    return [{ url, en: l.title + (own ? "" : " (Hebrew)"), he: l.titleHe + (own ? "" : " (אנגלית)") }];
  });
}

/** The topic's titles in the side column's links and header: "Related", "Learn More", "Lived", "Readings". */
export const hasLearnMore = (links: readonly LearnMoreLink[]) => links.some((l) => l.en || l.he);

// -------------------------------------------------------------------------------------------------------------------- the readings

/** The parasha's next reading, as the readings panel shows it (from `/api/calendars/next-read/<parasha>`). */
export interface ParashaReading {
  date: string;
  aliyot: string[];
  haftarot: { url: string; en: string; he: string }[];
}

/** The aliyot links: 1–7, then "M" (maftir; Hebrew numerals and מ in Hebrew). */
export const aliyaLabel = (i: number): Bilingual => (i < 7 ? { en: String(i + 1), he: encodeHebrewNumeral(i + 1) } : { en: "M", he: "מ" });

/** The old norm_hebrew_ref: a Hebrew ref without geresh and gershayim. */
export const normHebrewRef = (s: string) => s.replace(/[׳״]/g, "");

/** Sefaria.util.localeDate: "October 30, 2027" / "30 באוקטובר 2027". */
export function localeDate(date: string, lang: AzLang): string {
  return new Date(date).toLocaleDateString(lang === "en" ? "en-US" : "he-Hebr-IL", { year: "numeric", month: "long", day: "numeric" });
}

const HEBCAL_MONTHS: Record<string, { en: string; he: string }> = {
  Tishri: { en: "Tishrei", he: "תִשְׁרֵי" },
  Heshvan: { en: "Cheshvan", he: "חֶשְׁוָן" },
  Kislev: { en: "Kislev", he: "כִּסְלֵו" },
  Tevet: { en: "Tevet", he: "טֵבֵת" },
  Shevat: { en: "Sh'vat", he: "שְׁבָט" },
  "Adar I": { en: "Adar I", he: "אַדָר א׳" },
  Adar: { en: "Adar", he: "אַדָר" },
  "Adar II": { en: "Adar II", he: "אַדָר ב׳" },
  Nisan: { en: "Nisan", he: "נִיסָן" },
  Iyar: { en: "Iyyar", he: "אִיָיר" },
  Sivan: { en: "Sivan", he: "סִיוָן" },
  Tamuz: { en: "Tamuz", he: "תַּמּוּז" },
  Av: { en: "Av", he: "אָב" },
  Elul: { en: "Elul", he: "אֱלוּל" },
};

const ordinal = (n: number) => {
  const t = n % 100;
  if (t >= 11 && t <= 13) return `${n}th`;
  return `${n}${({ 1: "st", 2: "nd", 3: "rd" } as Record<number, string>)[n % 10] ?? "th"}`;
};

/**
 * Sefaria.util.hebrewCalendarDateStr (hebcal's HDate.render / renderGematriya): "29th of Tishrei, 5788" / "כ״ט תִשְׁרֵי תשפ״ח". The
 * Hebrew date comes from the platform's Hebrew calendar (ICU, the same in Node and the browser); hebcal's month names are kept.
 */
export function hebrewCalendarDate(date: string, lang: AzLang): string {
  const parts = new Intl.DateTimeFormat("en-u-ca-hebrew", { day: "numeric", month: "long", year: "numeric" }).formatToParts(new Date(date));
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? "";
  const day = Number(get("day")), year = Number(get("year"));
  const month = HEBCAL_MONTHS[get("month")] ?? { en: get("month"), he: get("month") };
  return lang === "en" ? `${ordinal(day)} of ${month.en}, ${year}` : `${encodeHebrewNumeral(day)} ${month.he} ${encodeHebrewNumeral(year % 1000)}`;
}

// ------------------------------------------------------------------------------------------------------------------ the dedication

/** TopicSponsorship: the hard-coded dedications of a few Torah portions (markdown), shown on a topic with a ref. */
export const TOPIC_SPONSORSHIPS: Record<string, Bilingual> = {
  "parashat-bereshit": {
    en: "Parashat Bereshit, or Genesis, is dedicated to the [Sefaria Pioneers](/pioneers), Sefaria's earliest champions whose immense generosity was essential to the genesis of Sefaria and the digital future of Torah.",
    he: "פרשת בראשית מוקדשת [לחלוצי ספריא](/pioneers), מי שעודדו ותמכו בנו בראשית דרכנו ושבזכות נדיבותם הרבה עלה באפשרותנו ליצור את העתיד הדיגיטלי של התורה ושאר המקורות.",
  },
  "parashat-lech-lecha": {
    en: "Sponsored by The Rita J. & Stanley H. Kaplan Family Foundation in honor of Scott and Erica Belsky’s wedding anniversary.",
    he: "נתרם על-ידי קרן משפחת ריטה ג’. וסטנלי ה. קפלן, לכבוד יום הנישואים של סקוט ואריקה בלסקי.",
  },
  "parashat-toldot": {
    en: "Dedicated by Nancy (née Ackerman) and Alex Warshofsky in gratitude for Jewish learning as their daughter, Avigayil, is called to the Torah as a bat mitzvah, and in loving memory of Freydl Gitl who paved the way in her Jewish life.",
    he: "מוקדש על-ידי ננסי (שם נעורים: אקרמן) ואלכס ורשופסקי בתודה על לימודי היהדות, לציון עלייתה של בתם אביגיל לתורה לרגל בת המצווה שלה ולזכרה האהוב של פריידי גיטל שסללה את הדרך בחייה היהודיים.",
  },
  "parashat-vayigash": {
    en: 'Dedicated by Linda and Leib Koyfman in memory of Dr. Douglas Rosenman, z"l, beloved father of Hilary Koyfman, and father-in-law of Mo Koyfman.',
    he: 'נתרם על-ידי לינדה ולייב קויפמן לזכר ד"ר דאגלס רוזנמן ז"ל, אביה האהוב של הילארי קויפמן וחותנו של מו קויפמן',
  },
  "parashat-achrei-mot": {
    en: "Dedicated by Kevin Waldman in loving memory of his grandparents, Rose and Morris Waldman, who helped nurture his commitment to Jewish life.",
    he: "מוקדש על-ידי קווין ולדמן לזכרם האהוב של סביו, רוז ומוריס ולדמן, שעזרו לטפח את מחויבותו לחיים יהודיים.",
  },
  "parashat-vaetchanan": {
    en: 'Shabbat Nachamu learning is dedicated in memory of Jerome L. Stern, Yehuda Leib ben David Shmuel, z"l.',
    he: 'הלימוד לשבת נחמו מוקדש לזכרו של ג\'רום ל. שטרן, יהודה לייב בן דוד שמואל ז"ל.',
  },
  "parashat-vzot-haberachah": {
    en: "Parashat VeZot HaBerakhah is dedicated to the victims of the October 7th, 2023, terrorist attack in Israel.",
    he: "פרשת ״וזאת הברכה״ מוקדשת לקורבנות מתקפת הטרור והטבח הנורא שאירע ב-7 באוקטובר 2023.",
  },
};

// ------------------------------------------------------------------------------------------------------------------ the moderators

/** getLinksToGenerate: "about" links with AI context and no prompt in the interface language. */
export const linksToGenerate = (about: readonly TopicSource[], lang: AzLang) => about.filter((s) => s.descriptions?.[lang]?.hasAiContext && !s.descriptions?.[lang]?.prompt);
/** getLinksToPublish: "about" links unpublished but not "not reviewed". */
export const linksToPublish = (about: readonly TopicSource[], lang: AzLang) => about.filter((s) => !isLinkPublished(lang, s) && isLinkReviewed(lang, s));

// ------------------------------------------------------------------------------------------------------------------------- the URL

/**
 * The page's address as the old ReaderApp wrote it: `topics/<slug>` (or `topics/b/<slug>`, the test version), then `&sort=<sort>` when
 * the panel had a sort (the server's default "Relevance" on a full page load, or one the reader chose), then `&tab=<tab>` once the tabs
 * exist, the first `&` made a `?`. Arriving inside the app the panel had no sort: `?tab=<tab>` alone.
 */
export const topicPageSearch = (sort: string | undefined, tab: string | undefined): { sort?: string; tab?: string } => ({
  ...(sort !== undefined ? { sort } : {}),
  ...(tab ? { tab } : {}),
});

/** SluggedAbstractMongoRecord.normalize_slug: the slug Django looks up (and the old client wrote back into the URL). */
export function normalizeTopicSlug(slug: string): string {
  return slug
    .toLowerCase()
    .replace(/Ḥ/g, "H")
    .replace(/ḥ/g, "h")
    .trim()
    .replace(/[ /]/g, "-")
    .replace(/[^a-z0-9()\-א-ת]/g, "")
    .replace(/-+/g, "-");
}

/** reader/views.py topic_page's title and description. */
export function topicPageHead(page: Pick<TopicPageModel, "primaryTitle" | "description">, lang: AzLang): { title: string; description: string } {
  const t = page.primaryTitle[lang];
  const desc = page.description?.[lang];
  // the Hebrew catalogue's translation of this sentence is obsolete (#~ in locale/he django.po): Hebrew pages get the English one
  const base = `Jewish texts about ${t} from Torah, Talmud and other sources in Sefaria's library.`;
  return {
    title: lang === "he" ? `${t} | מקורות מתוך ספריית ספריא` : `${t} | Texts from the Sefaria Library`,
    description: desc ? `${base} ${desc}` : base,
  };
}
