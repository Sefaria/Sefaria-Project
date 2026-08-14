// Locale plumbing shared by context.js (banners/modals) and Promotions.jsx (sidebar ads).

const SUPPORTED_LOCALES = ["en", "he"]; // first entry is the default/base locale

const LOCALE_TO_INTERFACE_LANG = { en: "english", he: "hebrew" };

const INTERFACE_LANG_TO_LOCALE = Object.fromEntries(
  Object.entries(LOCALE_TO_INTERFACE_LANG).map(([locale, lang]) => [lang, locale]),
);

// `countriesToTarget` is localized even though it isn't text: editors can target each locale
// separately in Strapi — showing a Hebrew-interface promotion to readers in the US but not in
// Israel, say — so it has to survive the per-document merge rather than being taken from whichever
// locale row happens to come first. Sidebar ads have no targeting field at all.
const LOCALIZED_FIELDS = {
  banner: ["bannerText", "buttonText", "buttonURL", "countriesToTarget"],
  modal: ["modalHeader", "modalText", "buttonText", "buttonURL", "countriesToTarget"],
  sidebarAd: ["title", "bodyText", "buttonText", "buttonURL"],
};

// Generic helpers (lodash/Ruby-style building blocks) -----------------------

// groupBy([{a:1},{a:1},{a:2}], x => x.a) -> {1: [...], 2: [...]}
// TODO: Come back to this
// Not Object.groupBy: it's a built-in *method* (not syntax), so Babel passes it through unchanged and it relies on native runtime support. 
// Jest runs on Node 20 (CI + local), which predates Object.groupBy (added in Node 21 / V8 12.1) - 
// so it's `undefined` there and any test touching it throws `TypeError: Object.groupBy is not a function`. 
// The Node test runtime, not the browser, is the constraint; modern browsers have supported it since ~2024. 
// Hand-roll it so the code runs identically in both environments.
const groupBy = (list, keyFn) => {
  const result = {};
  list.forEach((item) => {
    const key = keyFn(item);
    (result[key] || (result[key] = [])).push(item);
  });
  return result;
};

// keyBy([{id:1},{id:2}], x => x.id) -> {1: {id:1}, 2: {id:2}}
const keyBy = (list, keyFn) => Object.fromEntries(list.map((item) => [keyFn(item), item]));

// omit({a:1, b:2}, ["b"]) -> {a:1}
const omit = (obj, keys) => {
  const keysToDrop = new Set(keys);
  return Object.fromEntries(Object.entries(obj).filter(([key]) => !keysToDrop.has(key)));
};

// mapLocales(locale => locale.toUpperCase()) -> {en: "EN", he: "HE"}
const mapLocales = (fn) => Object.fromEntries(SUPPORTED_LOCALES.map((locale) => [locale, fn(locale)]));

// A row we can actually work with: a real object carrying the documentId that everything
// downstream keys on. Anything else (null, a stray string, a row Strapi returned without an
// id) is DROPPED rather than processed — one bad row must cost only itself. Before this
// guard, a single null in any locale array threw here, and the catch in context.js then
// swallowed every surface: no modal, no banner, no sidebar ads, for every viewer.
const isUsableRow = (row) => Boolean(row) && typeof row === "object" && row.documentId != null;

// The prefix the resilience tests grep for — dropping bad rows must be LOUD, not silent, or a
// misbehaving Strapi looks identical to "nothing published" and nobody investigates.
const SKIPPED_ROWS_LOG = "Skipped unusable Strapi row(s):";

// rowsByLocale: {en: [row, ...], he: [row, ...]} where each row carries its own
// `documentId` and `locale` fields (the GraphQL alias's locale, per Strapi v5 docs).
// Returns one entry per distinct documentId, merging whichever locales are present.
const groupByDocumentId = (rowsByLocale, localizedFields) => {
  const rawRows = SUPPORTED_LOCALES.flatMap((locale) => rowsByLocale[locale] || []);
  const allRows = rawRows.filter(isUsableRow);
  if (allRows.length < rawRows.length) {
    console.error(`${SKIPPED_ROWS_LOG} ${rawRows.length - allRows.length} of ${rawRows.length}`);
  }
  const rowsByDocumentId = groupBy(allRows, (row) => row.documentId);
  return Object.values(rowsByDocumentId).map((rows) => {
    const byLocale = keyBy(rows, (row) => row.locale);
    // Whatever is left after the localized fields (dates, showDelay, showTo, ...) is expected to be
    // identical across locale rows of the same document, so any row can supply it. Anything an
    // editor can vary per locale must be listed in LOCALIZED_FIELDS instead — otherwise the first
    // row silently wins and the other locale's value is dropped.
    const sharedFields = omit(rows[0], [...localizedFields, "locale"]);
    return { ...sharedFields, byLocale, locales: rows.map((row) => row.locale) };
  });
};

// Rewrites each localized field on a grouped doc into the {en, he} object shape consumed by InterfaceText and the manual .en/.he conditionals in Misc.jsx.
const buildInterfaceTextDoc = (groupedDoc, localizedFields) => {
  const { byLocale, locales, ...sharedFields } = groupedDoc;
  const localizedValues = Object.fromEntries(
    localizedFields.map((field) => [field, mapLocales((locale) => byLocale[locale]?.[field] ?? null)]),
  );
  return { ...sharedFields, ...localizedValues, locales };
};

export {
  SUPPORTED_LOCALES,
  LOCALE_TO_INTERFACE_LANG,
  INTERFACE_LANG_TO_LOCALE,
  LOCALIZED_FIELDS,
  SKIPPED_ROWS_LOG,
  groupBy,
  keyBy,
  omit,
  mapLocales,
  groupByDocumentId,
  buildInterfaceTextDoc,
};
