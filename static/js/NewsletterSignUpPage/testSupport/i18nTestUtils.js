/**
 * Shared i18n helpers for the newsletter sign-up page tests.
 *
 * Mimics the real Sefaria._ for keyed interface strings: a key that matches the keyed-string shape
 * is resolved from the real en.json / he.json (Hebrew falls back to English); anything else is
 * passed through unchanged. Not named *.test.js, so Jest does not treat it as a test file.
 *
 * Inside jest.mock factories use:  const { translate } = require("../testSupport/i18nTestUtils");
 * (Lives outside __tests__ because Jest treats every file in __tests__ as a test suite.)
 */
const en = require("../../sefaria/i18n/interface/en.json");
const he = require("../../sefaria/i18n/interface/he.json");

const KEYED_STRING_ID_REGEX = /^[a-z0-9_]+(\.[a-z0-9_]+)+$/;

const isKey = (s) => typeof s === "string" && KEYED_STRING_ID_REGEX.test(s);
const isHebrew = (lang) => lang === "hebrew" || lang === "he";

function translate(idOrText, lang = "english") {
  if (!isKey(idOrText)) return idOrText;
  if (isHebrew(lang) && idOrText in he) return he[idOrText];
  return idOrText in en ? en[idOrText] : idOrText;
}

/** Like Sefaria._keyedString(id, "en" | "he"). */
function keyedString(id, lang) {
  return translate(id, lang);
}

const enText = (key) => translate(key, "english");
const heText = (key) => translate(key, "hebrew");

/** Like Sefaria._bilingual(id): resolves a keyed id in both languages at once,
 *  regardless of the mock's current interfaceLang — same shape as the real one. */
const bilingual = (idOrText) => ({ en: enText(idOrText), he: heText(idOrText) });

/** Escapes text the way renderToString does, for comparing against rendered HTML. */
const escapeHtml = (s) =>
  String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#x27;");

module.exports = { translate, keyedString, enText, heText, bilingual, escapeHtml, isKey };
