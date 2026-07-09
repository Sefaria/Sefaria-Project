/* Testing done using Jest */
import { matchesCountryTarget } from "../strapiTargeting";

describe("matchesCountryTarget", function () {
  describe("countryMode: all", function () {
    it("matches regardless of the candidate set", function () {
      expect(matchesCountryTarget({ countryMode: "all", countries: [] }, new Set(["us"]))).toBe(true);
    });

    it("matches even when countries is populated", function () {
      expect(
        matchesCountryTarget(
          {
            countryMode: "all",
            countries: [{ name: "United States", code: "US" }],
          },
          new Set(["fr"]),
        ),
      ).toBe(true);
    });
  });

  describe("countryMode: include", function () {
    it("matches when a candidate is in the list", function () {
      expect(
        matchesCountryTarget(
          {
            countryMode: "include",
            countries: [{ name: "United States", code: "US" }],
          },
          new Set(["us"]),
        ),
      ).toBe(true);
    });

    it("does not match when no candidate is in the list", function () {
      expect(
        matchesCountryTarget(
          {
            countryMode: "include",
            countries: [{ name: "United States", code: "US" }],
          },
          new Set(["fr"]),
        ),
      ).toBe(false);
    });

    it("does not match when the country list is empty", function () {
      expect(matchesCountryTarget({ countryMode: "include", countries: [] }, new Set(["us"]))).toBe(false);
    });

    it("does not match when countries is null", function () {
      expect(matchesCountryTarget({ countryMode: "include", countries: null }, new Set(["us"]))).toBe(false);
    });

    it("does not match when countries is undefined", function () {
      expect(matchesCountryTarget({ countryMode: "include", countries: undefined }, new Set(["us"]))).toBe(false);
    });

    it("matches when a candidate is anywhere in a multi-country list", function () {
      const countries = [
        { name: "United States", code: "US" },
        { name: "France", code: "FR" },
        { name: "Israel", code: "IL" },
      ];
      expect(matchesCountryTarget({ countryMode: "include", countries }, new Set(["fr"]))).toBe(true);
    });

    it("does not match when no candidate is in a multi-country list", function () {
      const countries = [
        { name: "United States", code: "US" },
        { name: "France", code: "FR" },
        { name: "Israel", code: "IL" },
      ];
      expect(matchesCountryTarget({ countryMode: "include", countries }, new Set(["de"]))).toBe(false);
    });

    it("matches when only one of several candidates is in the list", function () {
      // e.g. a Gibraltar visitor: candidate set is {gi, gb}, target list only has gb
      const countries = [{ name: "United Kingdom", code: "GB" }];
      expect(matchesCountryTarget({ countryMode: "include", countries }, new Set(["gi", "gb"]))).toBe(true);
    });
  });

  describe("countryMode: exclude", function () {
    it("does not match when the only candidate is in the list", function () {
      expect(
        matchesCountryTarget(
          {
            countryMode: "exclude",
            countries: [{ name: "United States", code: "US" }],
          },
          new Set(["us"]),
        ),
      ).toBe(false);
    });

    it("matches when the only candidate is not in the list", function () {
      expect(
        matchesCountryTarget(
          {
            countryMode: "exclude",
            countries: [{ name: "United States", code: "US" }],
          },
          new Set(["fr"]),
        ),
      ).toBe(true);
    });

    it("matches when the country list is empty", function () {
      expect(matchesCountryTarget({ countryMode: "exclude", countries: [] }, new Set(["us"]))).toBe(true);
    });

    it("matches when countries is null", function () {
      expect(matchesCountryTarget({ countryMode: "exclude", countries: null }, new Set(["us"]))).toBe(true);
    });

    it("matches when countries is undefined", function () {
      expect(matchesCountryTarget({ countryMode: "exclude", countries: undefined }, new Set(["us"]))).toBe(true);
    });

    it("does not match when the only candidate is anywhere in a multi-country list", function () {
      const countries = [
        { name: "United States", code: "US" },
        { name: "France", code: "FR" },
        { name: "Israel", code: "IL" },
      ];
      expect(matchesCountryTarget({ countryMode: "exclude", countries }, new Set(["fr"]))).toBe(false);
    });

    it("matches when the only candidate is absent from a multi-country list", function () {
      const countries = [
        { name: "United States", code: "US" },
        { name: "France", code: "FR" },
        { name: "Israel", code: "IL" },
      ];
      expect(matchesCountryTarget({ countryMode: "exclude", countries }, new Set(["de"]))).toBe(true);
    });

    it("matches when any one of several candidates escapes the list", function () {
      // e.g. a Gibraltar visitor: candidate set is {gi, gb}, only gb is excluded -- gi still escapes
      const countries = [{ name: "United Kingdom", code: "GB" }];
      expect(matchesCountryTarget({ countryMode: "exclude", countries }, new Set(["gi", "gb"]))).toBe(true);
    });

    it("does not match when every candidate is in the list", function () {
      const countries = [
        { name: "United Kingdom", code: "GB" },
        { name: "Gibraltar", code: "GI" },
      ];
      expect(matchesCountryTarget({ countryMode: "exclude", countries }, new Set(["gi", "gb"]))).toBe(false);
    });
  });

  describe("country code casing", function () {
    it("matches regardless of the casing returned by Strapi", function () {
      expect(
        matchesCountryTarget(
          {
            countryMode: "include",
            countries: [{ name: "United States", code: "Us" }],
          },
          new Set(["us"]),
        ),
      ).toBe(true);
    });
  });

  describe("missing countriesToTarget", function () {
    it("matches when countriesToTarget is undefined", function () {
      expect(matchesCountryTarget(undefined, new Set(["us"]))).toBe(true);
    });

    it("matches when countriesToTarget is null", function () {
      expect(matchesCountryTarget(null, new Set(["us"]))).toBe(true);
    });
  });
});
