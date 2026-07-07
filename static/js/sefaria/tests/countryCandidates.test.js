/* Testing done using Jest */
import Sefaria from '../sefaria';
import { candidateCountries, getViewerCountryCandidates } from '../countryCandidates';

describe("candidateCountries", function() {

  describe("no signals", function() {

    it("returns an empty set when nothing is provided", function() {
      expect(candidateCountries({})).toEqual(new Set());
    });

    it("returns an empty set when called with no arguments", function() {
      expect(candidateCountries()).toEqual(new Set());
    });

  });

  describe("IP country", function() {

    it("adds the IP country as a candidate", function() {
      expect(candidateCountries({ ipCountry: "US" })).toEqual(new Set(["us"]));
    });

    it("normalizes casing regardless of the case the IP header arrives in", function() {
      expect(candidateCountries({ ipCountry: "us" })).toEqual(new Set(["us"]));
    });

    it("rewrites a deduction-true territory to its sovereign", function() {
      expect(candidateCountries({ ipCountry: "PR" })).toEqual(new Set(["us"]));
    });

    it("adds a visitor-hint sovereign alongside the territory, without erasing it", function() {
      expect(candidateCountries({ ipCountry: "GI" })).toEqual(new Set(["gi", "gb"]));
    });

    it("does not add a hint for a territory with no visitor-hint mapping", function() {
      expect(candidateCountries({ ipCountry: "FR" })).toEqual(new Set(["fr"]));
    });

  });

  describe("timezone", function() {

    it("adds the country associated with an IANA timezone", function() {
      expect(candidateCountries({ timezone: "Asia/Jerusalem" })).toEqual(new Set(["il"]));
    });

    it("ignores an unrecognized timezone", function() {
      expect(candidateCountries({ timezone: "Antarctica/McMurdo" })).toEqual(new Set());
    });

  });

  describe("locale", function() {

    it("uses the region subtag directly when present", function() {
      expect(candidateCountries({ localeTag: "en-GB" })).toEqual(new Set(["gb"]));
    });

    it("distinguishes en-US from en-GB via the region subtag", function() {
      expect(candidateCountries({ localeTag: "en-US" })).toEqual(new Set(["us"]));
    });

    it("falls back to Israel for bare Hebrew with no region", function() {
      expect(candidateCountries({ localeTag: "he" })).toEqual(new Set(["il"]));
    });

    it("falls back to Canada for bare French with no region", function() {
      expect(candidateCountries({ localeTag: "fr" })).toEqual(new Set(["ca"]));
    });

    it("prefers the region subtag over the language fallback when both are present", function() {
      // fr-FR should not fall back to the bare-French -> CA heuristic once a region is present
      expect(candidateCountries({ localeTag: "fr-FR" })).toEqual(new Set(["fr"]));
    });

    it("adds nothing for a bare English tag with no region", function() {
      expect(candidateCountries({ localeTag: "en" })).toEqual(new Set());
    });

    it("adds nothing for an unrecognized bare language with no region", function() {
      expect(candidateCountries({ localeTag: "de" })).toEqual(new Set());
    });

  });

  describe("combined signals", function() {

    it("unions candidates from every signal without duplicates", function() {
      expect(candidateCountries({
        ipCountry: "GI",
        timezone: "Europe/London",
        localeTag: "en-GB",
      })).toEqual(new Set(["gi", "gb"]));
    });

    it("keeps distinct candidates from conflicting signals", function() {
      expect(candidateCountries({
        ipCountry: "FR",
        timezone: "America/New_York",
        localeTag: "he",
      })).toEqual(new Set(["fr", "us", "il"]));
    });

  });

  describe("getViewerCountryCandidates (live browser/session signals)", function() {

    const mockTimeZone = (timeZone) => {
      jest.spyOn(Intl, 'DateTimeFormat').mockReturnValue({ resolvedOptions: () => ({ timeZone }) });
    };

    const mockLocale = (locale) => {
      // navigator.language has no setter in jsdom -- direct assignment silently fails
      Object.defineProperty(window.navigator, 'language', { value: locale, configurable: true });
    };

    afterEach(() => {
      Sefaria.countryCode = undefined;
      jest.restoreAllMocks();
    });

    it("reads Sefaria.countryCode, the resolved timezone, and navigator.language together", function() {
      Sefaria.countryCode = "fr";
      mockTimeZone("America/New_York");
      mockLocale("he");
      expect(getViewerCountryCandidates()).toEqual(new Set(["fr", "us", "il"]));
    });

    it("reflects a change to Sefaria.countryCode alone", function() {
      Sefaria.countryCode = "gi";
      mockTimeZone("Antarctica/McMurdo");
      mockLocale("en");
      expect(getViewerCountryCandidates()).toEqual(new Set(["gi", "gb"]));
    });

    it("reflects a change to the resolved timezone alone", function() {
      Sefaria.countryCode = undefined;
      mockTimeZone("Asia/Jerusalem");
      mockLocale("en");
      expect(getViewerCountryCandidates()).toEqual(new Set(["il"]));
    });

    it("reflects a change to navigator.language alone", function() {
      Sefaria.countryCode = undefined;
      mockTimeZone("Antarctica/McMurdo");
      mockLocale("en-GB");
      expect(getViewerCountryCandidates()).toEqual(new Set(["gb"]));
    });

  });

});
