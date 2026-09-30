/**
 * Synthetic Strapi payload factory.
 *
 * Builds the JSON body that `/api/strapi/graphql-cache` returns, so a spec can describe a content
 * state in code instead of publishing it in Strapi and recording it. Pure — no Playwright import,
 * no I/O — so it can be exercised directly by the contract spec.
 *
 * WHY THIS EXISTS ALONGSIDE THE RECORDINGS (they are complements, not rivals):
 *   Recordings prove Sefaria behaves correctly against a payload Strapi really produced. They stay
 *   the source of truth for the response SHAPE. What they cannot cheaply express is permutation:
 *   every extra combination of order x locale x targeting x date state is another hand-authored
 *   publishing session, and because the live Strapi instance is in a single state at any given
 *   moment, re-recording an older scenario later means reconstructing the state it was captured
 *   under. Two further classes are out of reach entirely — field values no editor would author
 *   (a buttonURL whose pathname collides with the page under test, for the excludedPaths gate) and
 *   responses Strapi will never send (malformed JSON, HTTP 500, a Strapi-v4 `{data:[...]}` wrapper).
 *
 *   Synthetic payloads also sidestep the HAR tax: `routeFromHAR` matches on the POST body, so
 *   adding one field to the GraphQL query in static/js/context.js invalidates every recording at
 *   once. A synthetic route matches the URL glob alone.
 *
 * THE RISK, AND WHAT CONTAINS IT: a hand-built fixture can drift from what Strapi actually returns,
 * and then tests pass against a shape that no longer exists. `strapi-payload-contract.spec.js`
 * closes that hole by asserting this module's field set equals the field set of every committed
 * recording. The recordings are the oracle; keep at least one of each content type among them.
 *
 * SHAPE CONSTRAINTS, each observed in a real recording rather than assumed:
 *   - Emit RAW PER-LOCALE ROWS, exactly as the endpoint does — not "a document with translations".
 *     The three surfaces consume locale differently (banners/modals merge the rows then gate on
 *     the active locale; sidebar ads fan out to one ad per locale), so only the raw shape stays
 *     correct for all three.
 *   - A localized field may hold the SAME or DIFFERENT values per locale. The bilingual banner
 *     points each locale at a different donation campaign; the bilingual sidebar ad uses an
 *     identical buttonURL in both. Sameness is a property of the content, not the schema, so no
 *     locale is ever derived from another.
 *   - Every localized field is INDEPENDENTLY NULLABLE per locale (a modalHeader authored in Hebrew
 *     and null in English on the same document).
 *   - A document may have ONE OR TWO locale rows.
 *   - Rows of one document may DISAGREE ON NON-LOCALIZED FIELDS. That is not a hypothetical: it is
 *     the bug class that motivated LOCALIZED_FIELDS, since groupByDocumentId takes shared fields
 *     from rows[0] (always English) and silently drops the other locale's value.
 */

const SUPPORTED_LOCALES = ['en', 'he'];

/** contentType -> the GraphQL collection name used to build the `<locale>_<alias>` response keys. */
const ALIAS_FOR = {
  banner: 'banners',
  modal: 'modals',
  sidebarAd: 'sidebarAds',
};

/**
 * The moment every synthetic scenario is pinned to.
 *
 * Specs install this on the page clock, and the date helpers below measure from it, so the content
 * window and the browser's idea of "now" cannot drift apart. Deliberately a MONTH AFTER every
 * recording's window: if a synthetic spec ever reached the real endpoint the date range would miss
 * the recorded content entirely, rather than half-matching and looking plausible.
 *
 * Unlike the recorded scenarios' `pinnedNow`, this value is not load-bearing for request matching —
 * synthetic routes match the URL glob alone — so it can be changed freely.
 */
const SYNTHETIC_NOW = '2026-09-15T16:00:00.000Z';

const shiftIso = (millis, from) => new Date(new Date(from).getTime() + millis).toISOString();

/** ISO timestamp `days` days from the pinned moment. Negative for the past. */
const daysFromNow = (days, from = SYNTHETIC_NOW) => shiftIso(days * 24 * 60 * 60 * 1000, from);

/** ISO timestamp `hours` hours from the pinned moment. Negative for the past. */
const hoursFromNow = (hours, from = SYNTHETIC_NOW) => shiftIso(hours * 60 * 60 * 1000, from);

/**
 * The start/end field names per content type.
 *
 * Worth abstracting: the three surfaces spell the same concept three ways, and picking the wrong
 * pair yields a row that parses fine and is simply never date-active — a silent, confusing miss.
 * All six are NON-localized (they live outside LOCALIZED_FIELDS), so a window belongs in `shared`.
 */
const WINDOW_FIELDS = {
  banner: ['bannerStartDate', 'bannerEndDate'],
  modal: ['modalStartDate', 'modalEndDate'],
  sidebarAd: ['startTime', 'endTime'],
};

/**
 * Every field the GraphQL query in static/js/context.js asks for, with a default.
 *
 * FULL FIELD SET, NOT A MINIMAL ONE. A spec should state only what it cares about, but the emitted
 * row must still look like a real response: a payload missing fields would let a test pass where
 * real data would fail, because code reading an absent field sees `undefined` and quietly does
 * nothing. The contract spec holds this list to exactly what the recordings contain.
 *
 * Values are recognisably synthetic so a failure screenshot is never mistaken for real content,
 * but their SHAPES are copied from the recordings — markdown in the body text, a `#RRGGBB`
 * background, `both_logged_in_and_logged_out`, an off-site donation URL.
 *
 * The default button URLs point at a path no spec navigates to. That matters: `shouldShow()`
 * appends `new URL(buttonURL).pathname` to its excluded-paths list, so a careless default could
 * suppress every banner and modal on the page under test and make each absence assertion pass for
 * the wrong reason.
 */
const FIELD_DEFAULTS = {
  banner: {
    documentId: null, // auto-assigned per document; see nextIdentifiers()
    internalBannerName: null, // auto-assigned; keys the localStorage dismissal
    bannerText: 'Synthetic banner text with a **bold** run',
    buttonText: 'Synthetic banner button',
    buttonURL: 'https://donate.example.org/synthetic-banner-campaign',
    bannerStartDate: null, // filled from `window`
    bannerEndDate: null,
    bannerBackgroundColor: '#004E5F',
    showDelay: 1,
    showTo: 'both_logged_in_and_logged_out',
    showToNewVisitors: true,
    showToReturningVisitors: true,
    showToSustainers: true,
    showToNonSustainers: true,
    shouldDeployOnMobile: true,
    countriesToTarget: null, // null targets everyone
    locale: null, // set per emitted row
    createdAt: daysFromNow(-30),
    updatedAt: daysFromNow(-1),
    publishedAt: daysFromNow(-1),
  },

  modal: {
    documentId: null,
    internalModalName: null,
    modalHeader: 'Synthetic Modal Header',
    modalText: 'Synthetic modal body text.',
    buttonText: 'Synthetic modal button',
    buttonURL: 'https://donate.example.org/synthetic-modal-campaign',
    modalStartDate: null,
    modalEndDate: null,
    showDelay: 1,
    showTo: 'both_logged_in_and_logged_out',
    showToNewVisitors: true,
    showToReturningVisitors: true,
    showToSustainers: true,
    showToNonSustainers: true,
    shouldDeployOnMobile: true,
    countriesToTarget: null,
    locale: null,
    createdAt: daysFromNow(-30),
    updatedAt: daysFromNow(-1),
    publishedAt: daysFromNow(-1),
  },

  sidebarAd: {
    documentId: null,
    internalCampaignId: null, // auto-assigned; React uses it as the list key
    title: 'Synthetic Sidebar Ad',
    bodyText: 'Synthetic sidebar ad body text.',
    buttonText: 'Synthetic ad button',
    buttonURL: 'https://example.org/synthetic-ad',
    buttonAboveOrBelow: 'below',
    buttonIcon: null,
    startTime: null,
    endTime: null,
    // Exclude-only rule: eligible on any page that does not carry the 'nowhere' keyword, i.e.
    // everywhere. Page keyword targets come from the open refs, so an INCLUDE rule would make an
    // ad depend on which text is open — rarely what a test means to vary.
    keywords: '!nowhere',
    showTo: 'all',
    debug: false,
    hasBlueBackground: false,
    isNewsletterSubscriptionInputForm: false,
    newsletterMailingLists: [],
    locale: null,
    createdAt: daysFromNow(-30),
    updatedAt: daysFromNow(-1),
    publishedAt: daysFromNow(-1),
  },
};

const fieldNames = (contentType) => Object.keys(FIELD_DEFAULTS[contentType]);

/**
 * Per-document identifiers that MUST be unique, with the consequence of a collision.
 *
 * None of these fail loudly when duplicated, which is why they are generated rather than defaulted
 * to a constant:
 *   documentId          - groupByDocumentId's join key. Two documents sharing one are MERGED into
 *                         a single entry, so a two-item selection test would silently become a
 *                         one-item test.
 *   internalBannerName  - keys `banner_<name>` / `modal_<name>` in localStorage, so dismissing one
 *   internalModalName     document would dismiss its namesake too, across tests.
 *   internalCampaignId  - React's list key for sidebar ads; duplicates trigger reconciliation
 *                         warnings and can drop a sibling from the DOM.
 */
const IDENTIFIER_FIELDS = {
  banner: ['documentId', 'internalBannerName'],
  modal: ['documentId', 'internalModalName'],
  sidebarAd: ['documentId', 'internalCampaignId'],
};

/** mapValues({a: 1}, (v) => v + 1) -> {a: 2} */
const mapValues = (object, fn) =>
  Object.fromEntries(Object.entries(object).map(([key, value]) => [key, fn(value, key)]));

/**
 * Fill any identifier the caller left unset, deriving it from the document's position.
 *
 * Position rather than a module-level counter, so the factory stays a pure function of its input:
 * the same documents always produce the same bytes, and building a document without using it can
 * never shift another document's name. An identifier set explicitly in `shared` or a locale block
 * is left alone.
 */
const identifiersFor = (contentType, index) =>
  Object.fromEntries(
    IDENTIFIER_FIELDS[contentType].map((field) => [field, `synthetic-${contentType}-${index + 1}`]),
  );

const withIdentifiers = (contentType, index) => (row) => {
  const generated = identifiersFor(contentType, index);
  const explicit = Object.entries(row).filter(([field, value]) => field in generated && value !== null);
  return { ...row, ...generated, ...Object.fromEntries(explicit) };
};

const assertKnownFields = (contentType, fields, where) => {
  const known = new Set(fieldNames(contentType));
  const unknown = Object.keys(fields).filter((field) => !known.has(field));
  // Silently ignoring an unknown key is the main hazard of a defaults-merging builder: the test
  // reads as though it set something, the payload does not contain it, and the assertion fails
  // for a reason nowhere near the typo.
  if (unknown.length) {
    throw new Error(
      `Unknown ${contentType} field(s) in ${where}: ${unknown.join(', ')}.\n` +
        `Known fields: ${fieldNames(contentType).join(', ')}.\n` +
        `If Strapi really did gain a field, add it to FIELD_DEFAULTS — strapi-payload-contract.spec.js ` +
        `will confirm it against the recordings.`,
    );
  }
  return fields;
};

/**
 * Build one document's per-locale rows.
 *
 * @param contentType  'banner' | 'modal' | 'sidebarAd'
 * @param window       {start, end} ISO strings; defaults to a window active at SYNTHETIC_NOW.
 * @param shared       fields applied to every locale row of this document.
 * @param locales      {en?, he?} — a key's PRESENCE creates that locale's row; its value overrides
 *                     fields for that row alone.
 *
 * A locale block may carry ANY field, not only the localized ones. That single mechanism covers
 * both things the recordings demand: localized fields differ per locale naturally, and setting a
 * NON-localized field inside a locale block emits rows that disagree — which is how the
 * `rows[0]`-wins merge behaviour (the bug class that motivated LOCALIZED_FIELDS) stays testable.
 */
const assertSupportedLocales = (contentType, locales) => {
  const unsupported = Object.keys(locales).filter((locale) => !SUPPORTED_LOCALES.includes(locale));
  if (unsupported.length) {
    throw new Error(`Unsupported locale(s): ${unsupported.join(', ')}. Supported: ${SUPPORTED_LOCALES.join(', ')}.`);
  }
  // An empty `locales` yields a document with no rows, which reaches the app as "nothing
  // published" — an absence assertion would then pass without testing anything.
  if (!Object.keys(locales).length) {
    throw new Error(`A ${contentType} needs at least one locale; got none.`);
  }
  return locales;
};

const buildDocument = (contentType, { window: dateWindow = {}, shared = {}, locales = { en: {} } } = {}) => {
  const [startField, endField] = WINDOW_FIELDS[contentType];
  const { start = daysFromNow(-1), end = daysFromNow(1) } = dateWindow;

  const base = {
    ...FIELD_DEFAULTS[contentType],
    [startField]: start,
    [endField]: end,
    ...assertKnownFields(contentType, shared, 'shared'),
  };

  return {
    contentType,
    rows: mapValues(assertSupportedLocales(contentType, locales), (overrides, locale) => ({
      ...base,
      ...assertKnownFields(contentType, overrides || {}, `locales.${locale}`),
      locale,
    })),
  };
};

const banner = (spec) => buildDocument('banner', spec);
const modal = (spec) => buildDocument('modal', spec);
const sidebarAd = (spec) => buildDocument('sidebarAd', spec);

/** A `countriesToTarget` value; `countries` are ISO codes, e.g. targetCountries('include', ['GB']). */
const targetCountries = (countryMode, codes = []) => ({
  countryMode,
  countries: codes.map((code) => ({ name: code, code })),
});

/**
 * Assemble documents into the response body `/api/strapi/graphql-cache` returns.
 *
 * ROW ORDER WITHIN EACH ALIAS IS THE ORDER DOCUMENTS ARE PASSED — a guarantee, not an accident.
 * Selection ranks eligible documents by specificity and urgency (strapiSelection.js), and payload
 * order is the FINAL tie-break — so the tests that pin tie-break outcomes, and every test that
 * lists a decoy first to prove position cannot explain a winner, depend on this being stable.
 *
 * Note this reproduces the endpoint faithfully but not `groupByDocumentId`'s downstream ordering:
 * that function flattens all `en` rows before all `he` rows, so a Hebrew-only document always
 * sorts after every document with an English row, whatever order they are passed here.
 */
const assertRightBucket = (contentType, documents) => {
  const misplaced = documents.find((doc) => doc.contentType !== contentType);
  // A modal handed to `banners` would be emitted under the banner aliases carrying modal fields:
  // valid JSON that no surface can render, and nothing downstream would say why.
  if (misplaced) {
    throw new Error(`strapiPayload received a ${misplaced.contentType} in the ${contentType} list.`);
  }
  return documents;
};

const strapiPayload = ({ banners = [], modals = [], sidebarAds = [] } = {}) => ({
  data: Object.fromEntries(
    Object.entries({ banner: banners, modal: modals, sidebarAd: sidebarAds }).flatMap(
      ([contentType, documents]) => {
        const rowsPerDocument = assertRightBucket(contentType, documents).map((doc, index) =>
          mapValues(doc.rows, withIdentifiers(contentType, index)),
        );
        return SUPPORTED_LOCALES.map((locale) => [
          `${locale}_${ALIAS_FOR[contentType]}`,
          rowsPerDocument.filter((rows) => rows[locale]).map((rows) => rows[locale]),
        ]);
      },
    ),
  ),
});

export {
  SUPPORTED_LOCALES,
  ALIAS_FOR,
  FIELD_DEFAULTS,
  WINDOW_FIELDS,
  SYNTHETIC_NOW,
  fieldNames,
  daysFromNow,
  hoursFromNow,
  banner,
  modal,
  sidebarAd,
  targetCountries,
  strapiPayload,
};
