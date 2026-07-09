// Sefaria has or potentially will have nonprofit entities in US, Canada, Israel, UK, and Austrailia.

// Builds a SET of plausible countries for a viewer, not a single predicted country
// A modal/banner shows if its targets intersect this set
// Recall is maximized deliberately: better to catch everyone who might belong to a country than to miss someone
import Sefaria from "./sefaria";

// Territories whose residents receive a REAL, VERIFIED tax benefit from the sovereign entity
// (e.g. Puerto Rico residents are US federal taxpayers) -- rewrite the territory to its sovereign.
// Verify each entry against the actual entity before adding.
const TERRITORY_TO_SOVEREIGN = {
  PR: "US",
  GU: "US",
  VI: "US",
  AS: "US",
  MP: "US",
  UM: "US",
};

// Territories that are only a PLAUSIBLE stand-in for a sovereign-country visitor passing through (e.g. a Brit visiting Gibraltar).
// The territory keeps its own candidacy; the sovereign is ADDED alongside it, never substituted -- Gibraltar residents get no UK tax deduction.
const TERRITORY_VISITOR_HINT = {
  GI: ["GB"],
  JE: ["GB"],
  GG: ["GB"],
  IM: ["GB"],
};

const countryTimezones = (country, timezones) => Object.fromEntries(timezones.map((timezone) => [timezone, [country]]));

// IANA timezone -> plausible countries.
// Keep this broad enough for recall, but avoid extremely broad shared-zone1970 groupings that would create huge false positives.
const TZ_TO_COUNTRIES = {
  // United States
  ...countryTimezones("US", [
    "America/New_York",
    "America/Detroit",
    "America/Kentucky/Louisville",
    "America/Kentucky/Monticello",
    "America/Indiana/Indianapolis",
    "America/Indiana/Vincennes",
    "America/Indiana/Winamac",
    "America/Indiana/Marengo",
    "America/Indiana/Petersburg",
    "America/Indiana/Vevay",
    "America/Chicago",
    "America/Indiana/Tell_City",
    "America/Indiana/Knox",
    "America/Menominee",
    "America/North_Dakota/Center",
    "America/North_Dakota/New_Salem",
    "America/North_Dakota/Beulah",
    "America/Denver",
    "America/Boise",
    "America/Phoenix",
    "America/Los_Angeles",
    "America/Anchorage",
    "America/Juneau",
    "America/Sitka",
    "America/Metlakatla",
    "America/Yakutat",
    "America/Nome",
    "America/Adak",
    "Pacific/Honolulu",

    // Legacy aliases / defensive compatibility
    "US/Eastern",
    "US/Central",
    "US/Mountain",
    "US/Pacific",
    "US/Alaska",
    "US/Aleutian",
    "US/Arizona",
    "US/Hawaii",
    "US/East-Indiana",
    "US/Indiana-Starke",
    "US/Michigan",
  ]),

  // US territories / outlying areas whose country code is rewritten to US by toSovereign()
  "America/Puerto_Rico": ["PR"],
  "America/St_Thomas": ["VI"],
  "Pacific/Guam": ["GU"],
  "Pacific/Saipan": ["MP"],
  "Pacific/Pago_Pago": ["AS"],
  "Pacific/Midway": ["UM"],
  "Pacific/Wake": ["UM"],

  // Canada
  ...countryTimezones("CA", [
    "America/St_Johns",
    "America/Halifax",
    "America/Glace_Bay",
    "America/Moncton",
    "America/Goose_Bay",
    "America/Blanc-Sablon",
    "America/Toronto",
    "America/Iqaluit",
    "America/Atikokan",
    "America/Winnipeg",
    "America/Resolute",
    "America/Rankin_Inlet",
    "America/Regina",
    "America/Swift_Current",
    "America/Edmonton",
    "America/Cambridge_Bay",
    "America/Inuvik",
    "America/Creston",
    "America/Dawson_Creek",
    "America/Fort_Nelson",
    "America/Whitehorse",
    "America/Dawson",
    "America/Vancouver",

    // Legacy aliases / defensive compatibility
    "Canada/Newfoundland",
    "Canada/Atlantic",
    "Canada/Eastern",
    "Canada/Central",
    "Canada/Saskatchewan",
    "Canada/Mountain",
    "Canada/Pacific",
    "Canada/Yukon",
  ]),

  // Australia
  ...countryTimezones("AU", [
    "Australia/Lord_Howe",
    "Antarctica/Macquarie",
    "Australia/Hobart",
    "Australia/Currie",
    "Australia/Melbourne",
    "Australia/Sydney",
    "Australia/Broken_Hill",
    "Australia/Brisbane",
    "Australia/Lindeman",
    "Australia/Adelaide",
    "Australia/Darwin",
    "Australia/Perth",
    "Australia/Eucla",

    // Legacy aliases / defensive compatibility
    "Australia/ACT",
    "Australia/Canberra",
    "Australia/LHI",
    "Australia/NSW",
    "Australia/North",
    "Australia/Queensland",
    "Australia/South",
    "Australia/Tasmania",
    "Australia/Victoria",
    "Australia/West",
    "Australia/Yancowinna",
  ]),

  // United Kingdom
  "Europe/London": ["GB"],

  // Crown dependencies / Gibraltar as UK visitor hints, matching TERRITORY_VISITOR_HINT semantics.
  // They keep their own candidacy and add GB; they are not rewritten to GB.
  "Europe/Jersey": ["JE", "GB"],
  "Europe/Guernsey": ["GG", "GB"],
  "Europe/Isle_of_Man": ["IM", "GB"],
  "Europe/Gibraltar": ["GI", "GB"],

  // Existing Israel targeting
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
  // The BCP-47 region subtag is itself an ISO-3166 country code when the browser supplies one
  // That is a stronger, more direct signal than guessing from language alone (distinguishes en-US/en-GB/en-CA)
  if (region) return [toSovereign(region.toUpperCase())];
  if (lang === "he") return ["IL"]; // Hebrew with no region -- Israel is the only plausible entity
  // Weakest signal: bare French could be France, Belgium, etc. Kept only because there's currently no France-specific modal to prefer instead.
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

// Reads the live browser/session signals and builds the candidate set from them.
// Kept separate from candidateCountries() so that function can stay a pure, fully unit-testable transform.
const getViewerCountryCandidates = () =>
  candidateCountries({
    ipCountry: Sefaria.countryCode,
    timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
    localeTag: navigator.language,
  });

export { candidateCountries, getViewerCountryCandidates };
