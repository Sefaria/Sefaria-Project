/**
 * Fixture payloads for the `/api/entity-search` endpoint.
 *
 * The Books / Authors / Topics tabs on the rewritten search page are fed by
 * `Sefaria.search.entitySearch()` (static/js/sefaria/search.js), which returns
 * `{hits: [...], total: N}` plus `categoryCounts` for books.
 *
 * Sorting and category filtering happen ON THE SERVER, over the entire match set
 * (`entity_search` in sefaria/helper/search.py): the page sends `sort` and repeated
 * `filter` params and renders the response as-is. `installEntitySearchMock` mirrors
 * those semantics against the fixtures below, so the expected orderings here are
 * exact rather than approximate.
 *
 * Field names below mirror the real ES documents (see `make_topic_index_document`
 * and `make_book_index_document` in sefaria/search.py). Only the fields the card
 * builders and the mock's sort/filter logic actually read are populated.
 */

/** One hit as returned by /api/entity-search. */
export interface EntityHit {
  slug: string;
  subtype?: 'topic' | 'author';
  title_en: string;
  title_he?: string;
  description_en?: string;
  description_he?: string;
  /** authors only — displayed on the card as the lifespan */
  birthYear?: number | string | null;
  deathYear?: number | string | null;
  /**
   * authors only — the single sortable year the backend derives at index time
   * (death year, falling back to birth year; `_author_sort_year` in
   * sefaria/search.py). This, NOT birthYear/deathYear, is what the year sorts key
   * on; null exercises the "undated hits go last in both directions" branch.
   */
  sortYear?: number | null;
  /** books only — negative values are BCE; the field the book year sorts key on */
  compDate?: number | null;
  /** books only — the category path the Books-tab filter matches against */
  categories?: string[];
}

// ---------------------------------------------------------------------------
// Authors
// ---------------------------------------------------------------------------

/**
 * Deliberately NOT in alphabetical or chronological order, so a passing sort
 * assertion can only mean the sort actually ran.
 *
 * `Zechariah ben Avkulas` carries no years at all: undated hits sort to the end
 * for BOTH directions (`missing: "_last"` in `_entity_sort_clauses`), which is the
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
    sortYear: 1204,
  },
  {
    slug: 'rashi',
    subtype: 'author',
    title_en: 'Rashi',
    title_he: 'רש"י',
    description_en: 'Medieval French commentator on the Tanakh and Talmud.',
    birthYear: 1040,
    deathYear: 1105,
    sortYear: 1105,
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
    sortYear: -10,
  },
  {
    slug: 'ibn-ezra',
    subtype: 'author',
    title_en: 'Abraham Ibn Ezra',
    title_he: 'אברהם אבן עזרא',
    description_en: 'Medieval Spanish commentator, poet and grammarian.',
    birthYear: 1089,
    deathYear: 1167,
    sortYear: 1167,
  },
  {
    slug: 'zechariah-ben-avkulas',
    subtype: 'author',
    title_en: 'Zechariah ben Avkulas',
    title_he: 'זכריה בן אבקולס',
    description_en: 'Sage with no recorded dates.',
    birthYear: null,
    deathYear: null,
    sortYear: null,
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

/** sortYear ascending; undated last. */
export const AUTHORS_BY_YEAR_ASC = [
  'Hillel the Elder', 'Rashi', 'Abraham Ibn Ezra', 'Rambam', 'Zechariah ben Avkulas',
];

/** sortYear descending; undated STILL last (not first). */
export const AUTHORS_BY_YEAR_DESC = [
  'Rambam', 'Abraham Ibn Ezra', 'Rashi', 'Hillel the Elder', 'Zechariah ben Avkulas',
];

// ---------------------------------------------------------------------------
// Books
// ---------------------------------------------------------------------------

/**
 * Six books spread over four real top-level TOC categories. The Books-tab filter
 * sidebar is built from `Sefaria.toc` (`makeBookCategoryFilters` in SearchPage.jsx),
 * so the category names here must be genuine top-level categories or no checkbox
 * will exist to click. They also drive the mock's `categoryCounts`, which is what
 * decides whether a category row is shown at all (`hideEmpty`).
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
 * The filter matches a category path and everything nested under it (the same
 * `make_path_filter` rule the text search uses), so a book filed under
 * ['Tanakh', 'Commentary'] is matched by the path 'Tanakh'.
 */
export const BOOKS_IN_TANAKH = ['Genesis', 'Rashi on Genesis'];
export const BOOKS_IN_HALAKHAH = ['Mishneh Torah', 'Shulchan Arukh'];

/**
 * Two categories selected at once — multiple filters OR together. With the
 * default Relevance sort the survivors keep their original fixture order.
 */
export const BOOKS_IN_TANAKH_OR_HALAKHAH = [
  'Genesis', 'Rashi on Genesis', 'Mishneh Torah', 'Shulchan Arukh',
];

/**
 * The counts the sidebar must show for BOOK_HITS — one entry per ancestor
 * category, over the WHOLE match set. These are what `categoryCounts` reports and
 * they do not move when a category is selected or when more pages are loaded,
 * which is the property that keeps every category clickable after a filter is on.
 */
export const BOOK_CATEGORY_COUNTS: Record<string, number> = {
  Tanakh: 2,
  Mishnah: 1,
  Talmud: 1,
  Halakhah: 2,
};

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
