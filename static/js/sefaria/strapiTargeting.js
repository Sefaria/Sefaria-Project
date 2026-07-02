import Sefaria from './sefaria';

// A countryMode of "all" matches every country. "include" matches only the listed countries.
// "exclude" matches every country except the listed ones.
const matchesCountryTarget = (countriesToTarget) => {
  if (!countriesToTarget || countriesToTarget.countryMode === "all") return true;
  const countryCodes = (countriesToTarget.countries || []).map((country) => country.code?.toLowerCase());
  const isIncluded = countryCodes.includes(Sefaria.countryCode);
  return countriesToTarget.countryMode === "include" ? isIncluded : !isIncluded;
};

export { matchesCountryTarget };
