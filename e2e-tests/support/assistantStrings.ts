import * as fs from 'fs';
import * as path from 'path';
import { LANGUAGES } from '../globals';

/**
 * Look up user-facing text by translation key, for the Library Assistant tests.
 *
 * The LA behavior stories require tests to "read the value by key, never match
 * the English or Hebrew words", so a copy edit in Weblate doesn't break a test.
 * Two catalogs are involved:
 *
 *  - `assistant.*` keys live in the ai-chatbot repo (the `<lc-chatbot>` widget),
 *    at `<AI_CHATBOT_REPO_PATH>/src/i18n/locales/{en,he}.json`.
 *  - Sefaria's own keys (e.g. `header.library_assistant`) live in
 *    `static/js/sefaria/i18n/interface/{en,he}.json` in this repo.
 *
 * `AI_CHATBOT_REPO_PATH` comes from the environment (e2e-tests/.env is loaded by
 * both Playwright configs). A relative path is resolved from the Sefaria-Project
 * folder; it defaults to `../ai-chatbot`. Whatever branch is checked out there is
 * what gets read, so point it at the ai-chatbot branch you are testing against.
 */

const SEFARIA_PROJECT_ROOT = path.resolve(__dirname, '..', '..');

export const AI_CHATBOT_REPO_PATH = path.resolve(
  SEFARIA_PROJECT_ROOT,
  process.env.AI_CHATBOT_REPO_PATH || '../ai-chatbot',
);

type Catalog = Record<string, string>;
const cache = new Map<string, Catalog>();

function loadCatalog(file: string, hint: string): Catalog {
  const cached = cache.get(file);
  if (cached) return cached;
  if (!fs.existsSync(file)) {
    throw new Error(`Translation file not found: ${file}. ${hint}`);
  }
  const catalog = JSON.parse(fs.readFileSync(file, 'utf8')) as Catalog;
  cache.set(file, catalog);
  return catalog;
}

/** Both catalogs fall back to English when a Hebrew value is missing or empty. */
function lookup(enFile: string, heFile: string, key: string, language: string, hint: string): string {
  const en = loadCatalog(enFile, hint);
  const he = language === LANGUAGES.HE ? loadCatalog(heFile, hint) : {};
  const value = he[key] || en[key];
  if (!value) {
    throw new Error(`Unknown translation key "${key}" (looked in ${enFile}).`);
  }
  return value;
}

/** Text for an `assistant.*` key from the ai-chatbot repo's locale files. */
export function assistantString(key: string, language: string): string {
  const dir = path.join(AI_CHATBOT_REPO_PATH, 'src', 'i18n', 'locales');
  return lookup(
    path.join(dir, 'en.json'),
    path.join(dir, 'he.json'),
    key,
    language,
    'Set AI_CHATBOT_REPO_PATH in e2e-tests/.env to the folder where the ai-chatbot repo is checked out.',
  );
}

/**
 * Every `assistant.*` key in ai-chatbot's English locale file that matches `pattern`,
 * sorted. For lists the widget builds from numbered keys (e.g. the rotating thinking
 * messages, `assistant.thinking.array.NN`), so a new key added in Weblate is picked up.
 */
export function assistantKeys(pattern: RegExp): string[] {
  const file = path.join(AI_CHATBOT_REPO_PATH, 'src', 'i18n', 'locales', 'en.json');
  const catalog = loadCatalog(file, 'Set AI_CHATBOT_REPO_PATH in e2e-tests/.env to the folder where the ai-chatbot repo is checked out.');
  return Object.keys(catalog).filter((key) => pattern.test(key)).sort();
}

/** Text for a Sefaria interface key (static/js/sefaria/i18n/interface/*.json). */
export function sefariaString(key: string, language: string): string {
  const dir = path.join(SEFARIA_PROJECT_ROOT, 'static', 'js', 'sefaria', 'i18n', 'interface');
  return lookup(path.join(dir, 'en.json'), path.join(dir, 'he.json'), key, language, '');
}

/**
 * The empty-search body that points to the assistant, as it reads on screen: its translation
 * marks the line break with {br} and puts the assistant's name in with {assistant}.
 */
export function noResultsAssistantBody(tab: string, language: string): string {
  return sefariaString(`search.no_results.${tab}.body.library_assistant`, language)
    .replace(/\{br\}/g, '')
    .replace(/\{assistant\}/g, sefariaString('header.library_assistant', language));
}

/** Escape a string so it can be dropped into a RegExp literally. */
export function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
