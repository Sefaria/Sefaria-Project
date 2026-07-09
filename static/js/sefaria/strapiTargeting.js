// A countryMode of "all" matches every viewer
// "include" matches if any candidate country is in the target list.
// "exclude" matches if any candidate country falls OUTSIDE the target list --
// consistent with maximizing recall: a viewer is excluded only once every plausible candidate is on the list.
const matchesCountryTarget = (countriesToTarget, candidates) => {
  if (!countriesToTarget || countriesToTarget.countryMode === "all") return true;
  const targetCodes = (countriesToTarget.countries || []).map((country) => country.code?.toLowerCase());
  return countriesToTarget.countryMode === "include"
    ? targetCodes.some((code) => candidates.has(code))
    : [...candidates].some((code) => !targetCodes.includes(code));
};

export { matchesCountryTarget };
