// Builds a SET of plausible countries for a viewer, not a single predicted country. A modal/banner
// shows if its targets intersect this set. Recall is maximized deliberately: better to catch everyone
// who might belong to a country than to miss someone, since the outward link (e.g. a country-specific
// donation page) self-corrects any false positives this buys.
import Sefaria from './sefaria';

// (a) Territories whose residents receive a REAL, VERIFIED tax benefit from the sovereign entity
// (e.g. Puerto Rico residents are US federal taxpayers) -- rewrite the territory to its sovereign.
// Verify each entry against the actual entity before adding.
const TERRITORY_TO_SOVEREIGN = {
  PR: "US", GU: "US", VI: "US", AS: "US", MP: "US", UM: "US",
};

// (b) Territories that are only a PLAUSIBLE stand-in for a sovereign-country visitor passing through
// (e.g. a Brit visiting Gibraltar). The territory keeps its own candidacy; the sovereign is ADDED
// alongside it, never substituted -- Gibraltar residents get no UK tax deduction.
const TERRITORY_VISITOR_HINT = {
  GI: ["GB"],
  JE: ["GB"], GG: ["GB"], IM: ["GB"],
};

// IANA timezone -> plausible countries. Keep small: only zones relevant to the countries we target.
const TZ_TO_COUNTRIES = {
  "America/New_York": ["US"], "America/Chicago": ["US"], "America/Los_Angeles": ["US"],
  "America/Toronto": ["CA"], "America/Vancouver": ["CA"],
  "Europe/London": ["GB"],
  "Asia/Jerusalem": ["IL"],
};

const toSovereign = (code) => TERRITORY_TO_SOVEREIGN[code] || code;

const candidatesFromIp = (ipCountry) => {
  if (!ipCountry) return [];
  const upperIpCountry = ipCountry.toUpperCase();
  return [toSovereign(upperIpCountry), ...(TERRITORY_VISITOR_HINT[upperIpCountry] || [])];
};

const candidatesFromTimezone = (timezone) => (TZ_TO_COUNTRIES[timezone] || []).map(toSovereign);

const candidatesFromLocale = (localeTag) => {
  const [lang, region] = (localeTag || "").split("-");
  // The BCP-47 region subtag is itself an ISO-3166 country code when the browser supplies one --
  // a stronger, more direct signal than guessing from language alone (distinguishes en-US/en-GB/en-CA).
  if (region) return [toSovereign(region.toUpperCase())];
  if (lang === "he") return ["IL"]; // Hebrew with no region -- Israel is the only plausible entity
  // Weakest signal: bare French could be France, Belgium, etc. Kept only because there's currently
  // no France-specific modal to prefer instead.
  if (lang === "fr") return ["CA"];
  return [];
};

const candidateCountries = ({ ipCountry, timezone, localeTag } = {}) => {
  const allCandidates = [
    ...candidatesFromIp(ipCountry),
    ...candidatesFromTimezone(timezone),
    ...candidatesFromLocale(localeTag),
  ];
  return new Set(allCandidates.map((country) => country.toLowerCase()));
};

// Reads the live browser/session signals and builds the candidate set from them. Kept separate from
// candidateCountries() so that function can stay a pure, fully unit-testable transform.
const getViewerCountryCandidates = () => candidateCountries({
  ipCountry: Sefaria.countryCode,
  timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
  localeTag: navigator.language,
});

export { candidateCountries, getViewerCountryCandidates };
