// A countryMode of ALL matches every viewer
// INCLUDE matches if any candidate country is in the target list.
// EXCLUDE matches only if NO candidate country is in the target list. Candidate countries are
// plausible identities, so one matching possibility is enough both to include a viewer in a
// targeted campaign and to withhold them from a campaign that excludes that country.
// Because EXCLUDE is the exact negation of INCLUDE, `include [X]` and `exclude [X]` split every
// viewer between them — even ambiguous or unknown ones — with no overlap and no gap. Two adjacent
// campaigns can therefore run at once as a true partition; keep that invariant when editing.
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
      // With no candidates there is no evidence that the viewer belongs to an excluded country,
      // so an undetermined viewer still matches. An empty target list likewise excludes nobody.
      return !targetCodes.some((code) => candidates.has(code));
    case CountryMode.ALL:
    default:
      return true;
  }
};

export { matchesCountryTarget, CountryMode };
