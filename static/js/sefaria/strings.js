// Interface translation strings.
//
// The translation maps live in JSON so they can be edited in Weblate
// (which cannot parse .js). These JSON files are the source of truth:
//   i18n/keyed/en.json             - keyed strings: stable ID (e.g. "header.log_in") -> English
//   i18n/keyed/he.json             - keyed strings: stable ID -> Hebrew
//   i18n/keyed/english-to-id.json  - legacy English text -> keyed ID, so dynamic
//                                    (non-literal) lookups of migrated strings still
//                                    resolve; generated alongside the keyed maps,
//                                    not translator-editable
//   i18n/interface/*.json          - legacy flat map (English key -> value) for strings
//                                    only reachable with dynamic (non-literal) text
//   i18n/interface-context/*.json  - legacy nested map, one namespace per component
// en.json files are the Weblate source templates; he.json files hold the Hebrew
// consumed at runtime. Keyed en.json is also consumed at runtime (it supplies the
// English display text for keyed IDs).
import keyedStringsEn from './i18n/keyed/en.json';
import keyedStringsHe from './i18n/keyed/he.json';
import englishToKeyedId from './i18n/keyed/english-to-id.json';
import interfaceStrings from './i18n/interface/he.json';
import interfaceStringsWithContext from './i18n/interface-context/he.json';

const Strings = {
  _i18nKeyedStrings: {en: keyedStringsEn, he: keyedStringsHe},
  _i18nEnglishToKeyedId: englishToKeyedId,
  _i18nInterfaceStrings: interfaceStrings,
  _i18nInterfaceStringsWithContext: interfaceStringsWithContext,
};

export default Strings;
