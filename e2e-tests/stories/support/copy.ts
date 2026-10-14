// BINDING LAYER. Stories quote English copy but name its translation key, e.g.
// "Ask" [assistant.floating_button.label]. Steps must read the value by key so
// Weblate copy edits don't break them (story-doc rule "Words in quotes").
import * as fs from 'fs';
import * as path from 'path';
import { LANGUAGES } from '../../globals';

const I18N_DIR = path.join(__dirname, '../../../static/js/sefaria/i18n/interface');

const catalogs: Record<string, Record<string, string>> = {};
const catalog = (lang: string) => {
  const file = lang === LANGUAGES.HE ? 'he.json' : 'en.json';
  if (!catalogs[file]) catalogs[file] = JSON.parse(fs.readFileSync(path.join(I18N_DIR, file), 'utf8'));
  return catalogs[file];
};

export class CopyKeyMissing extends Error {}

/**
 * The interface string for `key` in `lang`, from Sefaria's interface catalog.
 *
 * Keys under `assistant.*` belong to the <lc-chatbot> component's own svelte-i18n
 * catalog, which ships inside the chatbot bundle and is not in this repo. Until
 * that catalog is reachable here, those keys are looked up in Sefaria's catalog
 * too, and a missing key throws CopyKeyMissing. That is an honest red: the story
 * names copy that doesn't exist yet. See ../README.md, "Copy".
 */
export const copy = (key: string, lang: string = LANGUAGES.EN): string => {
  const value = catalog(lang)[key];
  if (value === undefined) {
    throw new CopyKeyMissing(`Copy key "${key}" has no ${lang} value in static/js/sefaria/i18n/interface/`);
  }
  return value;
};
