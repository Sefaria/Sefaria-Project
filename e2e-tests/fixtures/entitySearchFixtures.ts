/**
 * Fixture payloads for the `/api/entity-search` endpoint.
 *
 * The Books / Authors / Topics tabs on the rewritten search page are fed by
 * `Sefaria.search.entitySearch()` (static/js/sefaria/search.js), which returns
 * `{hits: [...], total: N}`. Sorting and category filtering of those hits happen
 * ENTIRELY IN THE BROWSER — see `sortEntityHits` in static/js/SearchSortDropdown.jsx
 * and `getSortedEntityData` in static/js/SearchPage.jsx:228. The API never receives
 * a `sort` param. That is why mocking this endpoint gives exact, deterministic
 * coverage of sort/filter behavior rather than an approximation.
 *
 * Field names below mirror the real ES documents (see `make_topic_index_document`
 * and `make_book_index_document` in sefaria/search.py). Only the fields the card
 * builders actually read are populated.
 */

/** One hit as returned by /api/entity-search. */
export interface EntityHit {
  slug: string;
  subtype?: 'topic' | 'author';
  title_en: string;
  title_he?: string;
  description_en?: string;
  description_he?: string;
  /** authors only — may be null to exercise the "undated" branch of sortEntityHits */
  birthYear?: number | string | null;
  deathYear?: number | string | null;
  /** books only — negative values are BCE */
  compDate?: number | null;
  /** books only — categories[0] is what the Books-tab category filter matches on */
  categories?: string[];
}

// ---------------------------------------------------------------------------
// Authors
// ---------------------------------------------------------------------------

/**
 * Deliberately NOT in alphabetical or chronological order, so a passing sort
 * assertion can only mean the sort actually ran.
 *
 * `Zechariah ben Avkulas` carries no years at all: sortEntityHits pushes undated
 * hits to the end for BOTH directions (`if (ya == null) return 1`), which is the
 * easiest behavior to regress.
 */
export const AUTHOR_HITS: EntityHit[] = [
  {
    slug: 'rambam',
    subtype: 'author',
    title_en: 'Rambam',
    title_he: 'רמב"ם',
    description_en: 'Medieval Sephardic rabbi, physician and philosopher.',
    birthYear: 1138,
    deathYear: 1204,
  },
  {
    slug: 'rashi',
    subtype: 'author',
    title_en: 'Rashi',
    title_he: 'רש"י',
    description_en: 'Medieval French commentator on the Tanakh and Talmud.',
    birthYear: 1040,
    deathYear: 1105,
  },
  {
    slug: 'hillel',
    subtype: 'author',
    title_en: 'Hillel the Elder',
    title_he: 'הלל הזקן',
    description_en: 'Sage of the Second Temple period.',
    // BCE — exercises the negative-year branch of formatEntityYear/authorLifespan.
    birthYear: -110,
    deathYear: -10,
  },
  {
    slug: 'ibn-ezra',
    subtype: 'author',
    title_en: 'Abraham Ibn Ezra',
    title_he: 'אברהם אבן עזרא',
    description_en: 'Medieval Spanish commentator, poet and grammarian.',
    birthYear: 1089,
    deathYear: 1167,
  },
  {
    slug: 'zechariah-ben-avkulas',
    subtype: 'author',
    title_en: 'Zechariah ben Avkulas',
    title_he: 'זכריה בן אבקולס',
    description_en: 'Sage with no recorded dates.',
    birthYear: null,
    deathYear: null,
  },
];

/** Fixture order — what the Relevance (default) sort must leave untouched. */
export const AUTHORS_BY_RELEVANCE = [
  'Rambam', 'Rashi', 'Hillel the Elder', 'Abraham Ibn Ezra', 'Zechariah ben Avkulas',
];

/** localeCompare on title_en. */
export const AUTHORS_BY_ALPHA = [
  'Abraham Ibn Ezra', 'Hillel the Elder', 'Rambam', 'Rashi', 'Zechariah ben Avkulas',
];

/** deathYear ?? birthYear, ascending; undated last. */
export const AUTHORS_BY_YEAR_ASC = [
  'Hillel the Elder', 'Rashi', 'Abraham Ibn Ezra', 'Rambam', 'Zechariah ben Avkulas',
];

/** deathYear ?? birthYear, descending; undated STILL last (not first). */
export const AUTHORS_BY_YEAR_DESC = [
  'Rambam', 'Abraham Ibn Ezra', 'Rashi', 'Hillel the Elder', 'Zechariah ben Avkulas',
];

// ---------------------------------------------------------------------------
// Books
// ---------------------------------------------------------------------------

/**
 * Six books spread over four real top-level TOC categories. The Books-tab filter
 * sidebar is built from `Sefaria.toc` (SearchPage.jsx:215), so the category names
 * here must be genuine top-level categories or no checkbox will exist to click.
 *
 * No `url` field: that is reserved for author-works aggregation rows, and its
 * absence sends these through the individual-work branch of `bookHitCardProps`
 * (SearchPage.jsx:163), which derives href from title_en.
 */
export const BOOK_HITS: EntityHit[] = [
  {
    slug: 'genesis',
    title_en: 'Genesis',
    title_he: 'בראשית',
    description_en: 'The first book of the Torah.',
    compDate: -1000,
    categories: ['Tanakh', 'Torah'],
  },
  {
    slug: 'pirkei-avot',
    title_en: 'Pirkei Avot',
    title_he: 'פרקי אבות',
    description_en: 'Mishnaic tractate of ethical teachings.',
    compDate: 200,
    categories: ['Mishnah', 'Seder Nezikin'],
  },
  {
    slug: 'berakhot',
    title_en: 'Berakhot',
    title_he: 'ברכות',
    description_en: 'Talmudic tractate on blessings and prayer.',
    compDate: 500,
    categories: ['Talmud', 'Bavli'],
  },
  {
    slug: 'rashi-on-genesis',
    title_en: 'Rashi on Genesis',
    title_he: 'רש"י על בראשית',
    description_en: "Rashi's commentary on the book of Genesis.",
    compDate: 1090,
    categories: ['Tanakh', 'Commentary'],
  },
  {
    slug: 'mishneh-torah',
    title_en: 'Mishneh Torah',
    title_he: 'משנה תורה',
    description_en: "Rambam's code of Jewish law.",
    compDate: 1180,
    categories: ['Halakhah', 'Mishneh Torah'],
  },
  {
    slug: 'shulchan-arukh',
    title_en: 'Shulchan Arukh',
    title_he: 'שולחן ערוך',
    description_en: "Karo's code of Jewish law.",
    compDate: 1565,
    categories: ['Halakhah', 'Shulchan Arukh'],
  },
];

export const BOOKS_BY_RELEVANCE = [
  'Genesis', 'Pirkei Avot', 'Berakhot', 'Rashi on Genesis', 'Mishneh Torah', 'Shulchan Arukh',
];

export const BOOKS_BY_ALPHA = [
  'Berakhot', 'Genesis', 'Mishneh Torah', 'Pirkei Avot', 'Rashi on Genesis', 'Shulchan Arukh',
];

/** compDate ascending — Genesis is BCE and must lead. */
export const BOOKS_BY_YEAR_ASC = [
  'Genesis', 'Pirkei Avot', 'Berakhot', 'Rashi on Genesis', 'Mishneh Torah', 'Shulchan Arukh',
];

export const BOOKS_BY_YEAR_DESC = [
  'Shulchan Arukh', 'Mishneh Torah', 'Rashi on Genesis', 'Berakhot', 'Pirkei Avot', 'Genesis',
];

/**
 * The Books filter matches `categories[0]` only (SearchPage.jsx:238), so a book
 * filed under ['Tanakh', 'Commentary'] counts as Tanakh.
 */
export const BOOKS_IN_TANAKH = ['Genesis', 'Rashi on Genesis'];
export const BOOKS_IN_HALAKHAH = ['Mishneh Torah', 'Shulchan Arukh'];

/**
 * Two categories selected at once. Multiple filters OR together, and filtering
 * runs AFTER sorting (SearchPage.jsx:232-240), so with the default Relevance
 * sort the survivors keep their original fixture order.
 */
export const BOOKS_IN_TANAKH_OR_HALAKHAH = [
  'Genesis', 'Rashi on Genesis', 'Mishneh Torah', 'Shulchan Arukh',
];

// ---------------------------------------------------------------------------
// Topics
// ---------------------------------------------------------------------------

/** Topics have no year data, so their sort menu offers Relevance and A-Z only. */
export const TOPIC_HITS: EntityHit[] = [
  { slug: 'shabbat',     subtype: 'topic', title_en: 'Shabbat',     title_he: 'שבת',   description_en: 'The Jewish day of rest.' },
  { slug: 'prayer',      subtype: 'topic', title_en: 'Prayer',      title_he: 'תפילה', description_en: 'Communication with the Divine.' },
  { slug: 'charity',     subtype: 'topic', title_en: 'Charity',     title_he: 'צדקה',  description_en: 'The obligation to give.' },
  { slug: 'torah-study', subtype: 'topic', title_en: 'Torah Study', title_he: 'תלמוד תורה', description_en: 'The mitzvah of learning Torah.' },
];

export const TOPICS_BY_RELEVANCE = ['Shabbat', 'Prayer', 'Charity', 'Torah Study'];
export const TOPICS_BY_ALPHA = ['Charity', 'Prayer', 'Shabbat', 'Torah Study'];

/**
 * Builds `count` synthetic topic hits for pagination tests. Titles are
 * zero-padded so index order and alphabetical order coincide, which keeps
 * "did page 2 append in the right place?" assertions unambiguous.
 */
export const makeTopicHits = (count: number): EntityHit[] =>
  Array.from({ length: count }, (_, i) => {
    const n = String(i + 1).padStart(2, '0');
    return {
      slug: `paged-topic-${n}`,
      subtype: 'topic' as const,
      title_en: `Paged Topic ${n}`,
      title_he: `נושא ${n}`,
      description_en: `Synthetic topic ${n} used for infinite-scroll coverage.`,
    };
  });

/** Sort-option display names, mirroring ENTITY_SORT_OPTIONS in SearchSortDropdown.jsx. */
export const SORT_OPTION_NAMES = {
  books: ['Relevance', 'Composition Date (Oldest First)', 'Composition Date (Newest First)', 'A-Z'],
  authors: ['Relevance', 'Year (Oldest First)', 'Year (Newest First)', 'A-Z'],
  topics: ['Relevance', 'A-Z'],
} as const;
