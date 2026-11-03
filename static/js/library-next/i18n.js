/**
 * Interface-language strings for Library Next.
 *
 * Strings live in per-feature `strings.js` files shaped `{ key: { en, he } }` and are merged with
 * `addStrings()`. The interface language follows Django's (`DJANGO_VARS.props.interfaceLang`,
 * `english|hebrew`) and the header toggle; `<html dir>` follows the language.
 *
 *   import { addStrings, useT, t, lang, dir } from '../i18n';
 *   addStrings({ 'browse.title': { en: 'Browse', he: 'עיון' } });
 *   const { t, lang, dir } = useT();   // in components (re-renders on language change)
 *   t('browse.title'); t('greeting', { name });   // `{name}` placeholders
 *
 * `lang` and `dir` are live bindings (`en|he`, `ltr|rtl`) for non-React code.
 */
import { useEffect, useState } from 'react';

const strings = {};
const listeners = new Set();

export let lang = 'en';
export let dir = 'ltr';

/** Merge `{ key: { en, he } }` into the registry. Later additions win, so features can override. */
export function addStrings(map) {
  Object.assign(strings, map);
}

export function hasString(key) {
  return key in strings;
}

/** Translate `key` in the current language, falling back to English, then to the key itself. */
export function t(key, vars) {
  const entry = strings[key];
  let out = entry ? (entry[lang] ?? entry.en ?? key) : key;
  if (vars) {
    out = out.replace(/\{(\w+)\}/g, (m, name) => (name in vars ? String(vars[name]) : m));
  }
  return out;
}

/** Pick `he` or `en` from a `{ en, he }` object (Sefaria API titles) for the current language. */
export function pick(obj, fallback = '') {
  if (!obj) { return fallback; }
  return obj[lang] || obj.en || obj.he || fallback;
}

export function toShortLang(interfaceLang) {
  return (interfaceLang || 'english').slice(0, 2) === 'he' ? 'he' : 'en';
}

export function toLongLang(shortLang) {
  return shortLang === 'he' ? 'hebrew' : 'english';
}

function applyToDocument() {
  if (typeof document === 'undefined') { return; }
  document.documentElement.setAttribute('lang', lang);
  document.documentElement.setAttribute('dir', dir);
}

/**
 * Set the interface language in memory (`en|he` or `english|hebrew`). Called once at bootstrap
 * from DJANGO_VARS; use `switchInterfaceLang()` for the user-facing toggle.
 */
export function setLang(next) {
  const short = toShortLang(next);
  if (short === lang) { applyToDocument(); return; }
  lang = short;
  dir = short === 'he' ? 'rtl' : 'ltr';
  applyToDocument();
  listeners.forEach(fn => fn(lang));
}

export function subscribe(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

/**
 * The header toggle: set the classic `interfaceLang` cookie the way the classic site does and
 * reload through `/interface/<language>?next=`, which also updates the profile and handles
 * language domains. Set the cookie first so a dev harness without that route still switches.
 */
export function switchInterfaceLang(next, { navigate = true } = {}) {
  const long = toLongLang(toShortLang(next));
  if (typeof document !== 'undefined') {
    document.cookie = `interfaceLang=${long}; path=/; max-age=${60 * 60 * 24 * 365}; samesite=lax`;
  }
  setLang(long);
  if (navigate && typeof window !== 'undefined') {
    const here = window.location.pathname + window.location.search;
    window.location.assign(`/interface/${long}?next=${encodeURIComponent(here)}`);
  }
}

/** Current language as React state; re-renders on `setLang`. */
export function useLang() {
  const [current, setCurrent] = useState(lang);
  useEffect(() => subscribe(setCurrent), []);
  return current;
}

/** `{ t, lang, dir }` bound to the current language. */
export function useT() {
  const current = useLang();
  return { t, lang: current, dir: current === 'he' ? 'rtl' : 'ltr' };
}

/** Test helper: forget every registered string. */
export function _resetStrings() {
  for (const key of Object.keys(strings)) { delete strings[key]; }
}
