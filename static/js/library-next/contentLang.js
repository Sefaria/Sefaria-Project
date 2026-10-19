/**
 * Content language: which text languages the reader and lists show. `he` (Hebrew), `en`
 * (English/translation) or `bi` (both). Persisted in the store (`kv.contentLang`); when unset,
 * the current persona's default applies.
 *
 *   import { useContentLang, CONTENT_LANGS } from '../contentLang';
 *   const [contentLang, setContentLang] = useContentLang();
 */
import { useEffect, useState } from 'react';
import { kv } from './store';
import { getPersonaDef } from './persona';

export const CONTENT_LANG_KEY = 'contentLang';
export const CONTENT_LANGS = ['he', 'en', 'bi'];

export const CONTENT_LANG_LABELS = {
  he: { en: 'Hebrew', he: 'עברית' },
  en: { en: 'English', he: 'אנגלית' },
  bi: { en: 'Both', he: 'שתיהן' },
};

export function isContentLang(value) {
  return CONTENT_LANGS.includes(value);
}

/** The effective content language: the stored choice, else the persona default. */
export function getContentLang() {
  const stored = kv.get(CONTENT_LANG_KEY);
  return isContentLang(stored) ? stored : getPersonaDef().contentLang;
}

export function setContentLang(value) {
  if (!isContentLang(value)) { throw new Error(`Unknown content language: ${value}`); }
  kv.set(CONTENT_LANG_KEY, value);
}

/** Forget the explicit choice so the persona default applies again. */
export function clearContentLang() {
  kv.remove(CONTENT_LANG_KEY);
}

/** `[contentLang, setContentLang]`; re-renders on change (persona changes included). */
export function useContentLang() {
  const [value, setValue] = useState(getContentLang);
  useEffect(() => kv.subscribe(() => setValue(getContentLang())), []);
  return [value, setContentLang];
}
