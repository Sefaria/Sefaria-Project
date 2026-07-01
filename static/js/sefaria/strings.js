// Interface translation strings.
//
// The English->Hebrew maps live in JSON so they can be edited in Weblate
// (which cannot parse .js). These JSON files are the source of truth:
//   i18n/interface/*.json          - flat map (English key -> value)
//   i18n/interface-context/*.json  - nested map, one namespace per component
// he.json holds the Hebrew translations consumed at runtime; en.json is the
// Weblate source template and is not imported here.
import interfaceStrings from './i18n/interface/he.json';
import interfaceStringsWithContext from './i18n/interface-context/he.json';

const Strings = {
  _i18nInterfaceStrings: interfaceStrings,
  _i18nInterfaceStringsWithContext: interfaceStringsWithContext,
};

export default Strings;
