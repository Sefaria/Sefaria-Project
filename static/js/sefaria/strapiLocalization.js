// Locale plumbing shared by context.js (banners/modals) and Promotions.jsx (sidebar ads).

const SUPPORTED_LOCALES = ["en", "he"]; // first entry is the default/base locale

const LOCALE_TO_INTERFACE_LANG = { en: "english", he: "hebrew" };

const INTERFACE_LANG_TO_LOCALE = Object.fromEntries(
  Object.entries(LOCALE_TO_INTERFACE_LANG).map(([locale, lang]) => [lang, locale]),
);

const LOCALIZED_FIELDS = {
  banner: ["bannerText", "buttonText", "buttonURL"],
  modal: ["modalHeader", "modalText", "buttonText", "buttonURL"],
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

// rowsByLocale: {en: [row, ...], he: [row, ...]} where each row carries its own
// `documentId` and `locale` fields (the GraphQL alias's locale, per Strapi v5 docs).
// Returns one entry per distinct documentId, merging whichever locales are present.
const groupByDocumentId = (rowsByLocale, localizedFields) => {
  const allRows = SUPPORTED_LOCALES.flatMap((locale) => rowsByLocale[locale] || []);
  const rowsByDocumentId = groupBy(allRows, (row) => row.documentId);
  return Object.values(rowsByDocumentId).map((rows) => {
    const byLocale = keyBy(rows, (row) => row.locale);
    // Non-text fields (dates, targeting, showTo, ...) are identical across locale rows of the same document, so any row can supply them.
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
  groupBy,
  keyBy,
  omit,
  mapLocales,
  groupByDocumentId,
  buildInterfaceTextDoc,
};
