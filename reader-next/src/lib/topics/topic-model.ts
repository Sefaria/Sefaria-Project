/**
 * The rules the old topics navigation pages apply to topic data (static/js/sefaria/sefaria.js, common/TopicTOCCard.jsx,
 * TopicPageAll.jsx, TopicLandingPage/*), as pure functions.
 *
 * @feature TOP-005 Topic word cloud (salad)
 * @feature TOP-008 Random topic cards with descriptions
 * @feature TOP-012 Topic card
 * @feature TOP-013 Topic category page
 * @feature TOP-014 All Topics A-Z index
 * @feature TOP-030 Topic data model behaviors
 */
export interface Bilingual {
  en: string;
  he: string;
}
export type Module = "library" | "voices";
export type AzLang = "en" | "he";

/** What a topic list (pools, trending, the A–Z list, the TOC) gives for one topic: Topic.contents(). */
export interface TopicSummary {
  slug: string;
  primaryTitle: Bilingual;
  description?: { en?: string; he?: string };
  categoryDescription?: { en?: string; he?: string };
  shouldDisplay?: boolean;
  displayOrder?: number;
  pools?: string[];
}
export interface TopicListItem extends TopicSummary {
  titles?: { text: string; lang: string; primary?: boolean }[];
}

/** Sefaria.getTopicPoolNameForModule: Voices reads the "sheets" pool. */
export const poolForModule = (module: Module) => (module === "voices" ? "sheets" : "library");

/** Sefaria.getLangSpecificTopicPoolName("general"): general_en / general_he by the interface language. */
export const generalPool = (lang: AzLang) => `general_${lang}`;

/** Sefaria.shouldDisplayInActiveModule: displayable, and in the module's pool. */
export const shouldDisplayInModule = (t: Pick<TopicSummary, "shouldDisplay" | "pools"> | undefined, module: Module = "library") =>
  !!t?.shouldDisplay && !!t.pools?.includes(poolForModule(module));

const stripInitialPunctuation = (s: string) => s.replace(/^["#]/, "");

/**
 * Sefaria.sortTopicsCompareFn: by displayOrder (a top-level slug counts as 10000 — the old "bandaid"), then alphabetically in the
 * interface language with a leading `"` or `#` ignored; in Hebrew a topic without a Hebrew title goes last. Plain code-unit
 * comparison, as the old `<`.
 */
export function sortTopicsCompare(lang: AzLang, topLevel: ReadonlySet<string> = new Set()) {
  return (a: TopicSummary, b: TopicSummary): number => {
    const [ao, bo] = [a, b].map((x) => (topLevel.has(x.slug) ? 10000 : (x.displayOrder ?? 10000)));
    if (ao === bo) {
      const [aa, ba] = [a, b].map((x) =>
        lang === "he"
          ? x.primaryTitle.he.length ? stripInitialPunctuation(x.primaryTitle.he) : "תתת" + stripInitialPunctuation(x.primaryTitle.en)
          : x.primaryTitle.en.length ? stripInitialPunctuation(x.primaryTitle.en) : stripInitialPunctuation(x.primaryTitle.he),
      );
      return aa! < ba! ? -1 : 1;
    }
    return ao! - bo!;
  };
}

export interface TopicCardData {
  slug: string;
  href: string;
  title: Bilingual;
  description?: { en?: string; he?: string };
  isCategory: boolean;
}

/**
 * The old TopicTOCCard: a category links to /topics/category/<slug> with its categoryDescription, a topic to /topics/<slug> with its
 * description; "Parashat " / "פרשת " is dropped from the title; a topic without both titles shows no card (null).
 */
export function topicCard(t: TopicSummary & { isCategory?: boolean }, showDescription = true): TopicCardData | null {
  const en = t.primaryTitle?.en;
  const he = t.primaryTitle?.he;
  if (!en || !he) return null;
  const isCategory = !!t.isCategory;
  return {
    slug: t.slug,
    href: `/topics/${isCategory ? "category/" : ""}${t.slug}`,
    title: { en: en.replace(/^Parashat /, ""), he: he.replace(/^פרשת /, "") },
    description: showDescription ? (isCategory ? t.categoryDescription : t.description) : undefined,
    isCategory,
  };
}

/** String.prototype.stripNikkud of the old util.js. */
export const stripNikkud = (s: string) => s.replace(/[֑-ׇ]/g, "");

/** The letters of the A–Z bar: A–Z, or א–ת without ך ן ף ץ (AlphabeticalTopicsNav; its list misses ם, which therefore shows). */
export function azLetters(lang: AzLang): string[] {
  const [a, z] = lang === "he" ? ["א", "ת"] : ["A", "Z"];
  const out: string[] = [];
  for (let c = a.charCodeAt(0); c <= z.charCodeAt(0); c++) {
    const ch = String.fromCharCode(c);
    if (!["ך", "ן", "ף", "ץ"].includes(ch)) out.push(ch);
  }
  return out;
}

/** A–Z without a filter: the module's topics whose interface-language title starts with the letter, alphabetical (nikkud stripped). */
export function azSlice(list: readonly TopicListItem[], letter: string, lang: AzLang, module: Module = "library"): TopicListItem[] {
  // the letter as the URL has it: /topics/all/A matches nothing ("There are no topics here."), as on sefaria.org (VERIFIED 2026-11-04)
  return list
    .filter((t) => shouldDisplayInModule(t, module) && (lang === "he" ? t.primaryTitle.he : t.primaryTitle.en).toLowerCase().startsWith(letter))
    .sort((a, b) => (stripNikkud(b.primaryTitle[lang]) > stripNikkud(a.primaryTitle[lang]) ? -1 : 1))
    .map(({ titles: _t, ...rest }) => rest);
}

/** Only a filter of two or more characters applies ("dont filter by one letter. not useful"). Lower-cased, as typed. */
export const normalizeFilter = (s: string) => s.toLowerCase();
export const filterApplies = (filter: string) => filter.length > 1;

/**
 * A–Z with a filter: every title of the topic (any language) containing it, the server's order (most sources first) kept but
 * topics with an interface-language title first.
 */
export function azFiltered(list: readonly TopicListItem[], filter: string, lang: AzLang, module: Module = "library"): TopicListItem[] {
  const f = normalizeFilter(filter);
  return list
    .filter((t) => shouldDisplayInModule(t, module) && (t.titles ?? []).some((x) => x.text.toLowerCase().includes(f)))
    .map((t, i) => [t, i] as const)
    .sort(([a, ai], [b, bi]) => Number(!!b.primaryTitle[lang]) - Number(!!a.primaryTitle[lang]) || ai - bi)
    .map(([t]) => t);
}

/** The landing page's random cards: topics with a description in the interface language, the first `n`. */
export function describedDeck(topics: readonly TopicSummary[], lang: AzLang, n: number): TopicSummary[] {
  return topics.filter((t) => t.description?.[lang]).slice(0, n);
}

/** How many topics the random cards ask the pool for: n³ (3 → 27 on a wide screen, 10 → 1000 on a phone). */
export const deckPoolSize = (n: number) => n ** 3;

const capitalizeFirst = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
const disambiguation = (title: string) => /\((.*?)\)$/.exec(title)?.[1];
const withoutDisambiguation = (title: string) => title.replace(/\s*\(.*?\)\s*$/, "").trim();

export interface TopicSuggestion {
  text: string;
  categoryText: string;
  slug: string;
}

/**
 * The landing search's suggestions (TopicLandingSearch getSuggestions): the title's first letter capitalised, a trailing
 * "(…)" dropped when it only names one of the topic's categories, and the category path "(Cat > Sub)" in the typed language.
 */
export function topicSuggestions(completions: readonly { key: string; title: string }[], lang: AzLang, categories: (slug: string) => Bilingual[] | undefined): TopicSuggestion[] {
  return completions.map((c) => {
    const cats = categories(c.key);
    const same = cats?.some((cat) => disambiguation(c.title) === cat[lang]);
    const title = same ? withoutDisambiguation(c.title) : c.title;
    return { text: capitalizeFirst(title), categoryText: cats?.length ? `(${cats.map((cat) => cat[lang]).join(" > ")})` : "", slug: c.key };
  });
}
