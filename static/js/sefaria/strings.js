// Interface translation strings.
//
// The translation maps live in JSON so they can be edited in Weblate
// (which cannot parse .js). These JSON files are the source of truth, and
// every key is a stable ID (e.g. "header.log_in") — never English text:
//   i18n/interface/{en,he}.json - all interface strings, including ones scoped
//                                 to a specific component (namespace = the
//                                 component, e.g. "follow_button.follow")
// en.json is the Weblate source template and also supplies the English display
// text at runtime; he.json holds the Hebrew.
import interfaceEn from './i18n/interface/en.json';
import interfaceHe from './i18n/interface/he.json';

const Strings = {
  _i18nInterfaceStrings: {
    en: {...interfaceEn},
    he: {...interfaceHe},
  },
};

export default Strings;
