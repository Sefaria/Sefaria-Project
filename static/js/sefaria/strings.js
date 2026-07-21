// Interface translation strings.
//
// The translation maps live in JSON so they can be edited in Weblate
// (which cannot parse .js). These JSON files are the source of truth, and
// every key is a stable ID (e.g. "header.log_in") — never English text:
//   i18n/interface/{en,he}.json          - general interface strings
//   i18n/interface-context/{en,he}.json  - strings scoped to a specific
//                                          component context (namespace = the
//                                          component, e.g. "follow_button.follow")
// en.json files are the Weblate source templates and also supply the English
// display text at runtime; he.json files hold the Hebrew. The two directories
// are merged into a single lookup map at load time.
import interfaceEn from './i18n/interface/en.json';
import interfaceHe from './i18n/interface/he.json';
import interfaceContextEn from './i18n/interface-context/en.json';
import interfaceContextHe from './i18n/interface-context/he.json';

const Strings = {
  _i18nInterfaceStrings: {
    en: {...interfaceEn, ...interfaceContextEn},
    he: {...interfaceHe, ...interfaceContextHe},
  },
};

export default Strings;
