// A countryMode of ALL matches every viewer
// INCLUDE matches if any candidate country is in the target list.
// EXCLUDE matches if any candidate country falls OUTSIDE the target list --
// consistent with maximizing recall: a viewer is excluded only once every plausible candidate is on the list.
const CountryMode = {
  ALL: "all",
  INCLUDE: "include",
  EXCLUDE: "exclude",
};

const matchesCountryTarget = (countriesToTarget, candidates) => {
  if (!countriesToTarget) return true;
  const targetCodes = (countriesToTarget.countries || []).map((country) => country.code?.toLowerCase());
  switch (countriesToTarget.countryMode) {
    case CountryMode.INCLUDE:
      return targetCodes.some((code) => candidates.has(code));
    case CountryMode.EXCLUDE:
      // No known candidates means no signal, not confirmed membership in the target list --
      // maximizing recall means an undetermined viewer is not excluded.
      return candidates.size === 0 || [...candidates].some((code) => !targetCodes.includes(code));
    case CountryMode.ALL:
    default:
      return true;
  }
};

export { matchesCountryTarget, CountryMode };
