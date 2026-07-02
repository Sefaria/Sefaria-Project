/* Testing done using Jest */
import Sefaria from '../sefaria';
import { matchesCountryTarget } from '../strapiTargeting';

describe("matchesCountryTarget", function() {

  afterEach(() => {
    Sefaria.countryCode = undefined;
  });

  describe("countryMode: all", function() {

    it("matches regardless of the viewer's country", function() {
      Sefaria.countryCode = "us";
      expect(matchesCountryTarget({ countryMode: "all", countries: [] })).toBe(true);
    });

    it("matches even when countries is populated", function() {
      Sefaria.countryCode = "fr";
      expect(matchesCountryTarget({
        countryMode: "all",
        countries: [{ name: "United States", code: "US" }],
      })).toBe(true);
    });

  });

  describe("countryMode: include", function() {

    it("matches when the viewer's country is in the list", function() {
      Sefaria.countryCode = "us";
      expect(matchesCountryTarget({
        countryMode: "include",
        countries: [{ name: "United States", code: "US" }],
      })).toBe(true);
    });

    it("does not match when the viewer's country is not in the list", function() {
      Sefaria.countryCode = "fr";
      expect(matchesCountryTarget({
        countryMode: "include",
        countries: [{ name: "United States", code: "US" }],
      })).toBe(false);
    });

    it("does not match when the country list is empty", function() {
      Sefaria.countryCode = "us";
      expect(matchesCountryTarget({ countryMode: "include", countries: [] })).toBe(false);
    });

    it("does not match when countries is null", function() {
      Sefaria.countryCode = "us";
      expect(matchesCountryTarget({ countryMode: "include", countries: null })).toBe(false);
    });

    it("does not match when countries is undefined", function() {
      Sefaria.countryCode = "us";
      expect(matchesCountryTarget({ countryMode: "include", countries: undefined })).toBe(false);
    });

    it("matches when the viewer's country is anywhere in a multi-country list", function() {
      const countries = [
        { name: "United States", code: "US" },
        { name: "France", code: "FR" },
        { name: "Israel", code: "IL" },
      ];
      Sefaria.countryCode = "fr";
      expect(matchesCountryTarget({ countryMode: "include", countries })).toBe(true);
    });

    it("does not match when the viewer's country is absent from a multi-country list", function() {
      const countries = [
        { name: "United States", code: "US" },
        { name: "France", code: "FR" },
        { name: "Israel", code: "IL" },
      ];
      Sefaria.countryCode = "de";
      expect(matchesCountryTarget({ countryMode: "include", countries })).toBe(false);
    });

  });

  describe("countryMode: exclude", function() {

    it("does not match when the viewer's country is in the list", function() {
      Sefaria.countryCode = "us";
      expect(matchesCountryTarget({
        countryMode: "exclude",
        countries: [{ name: "United States", code: "US" }],
      })).toBe(false);
    });

    it("matches when the viewer's country is not in the list", function() {
      Sefaria.countryCode = "fr";
      expect(matchesCountryTarget({
        countryMode: "exclude",
        countries: [{ name: "United States", code: "US" }],
      })).toBe(true);
    });

    it("matches when the country list is empty", function() {
      Sefaria.countryCode = "us";
      expect(matchesCountryTarget({ countryMode: "exclude", countries: [] })).toBe(true);
    });

    it("matches when countries is null", function() {
      Sefaria.countryCode = "us";
      expect(matchesCountryTarget({ countryMode: "exclude", countries: null })).toBe(true);
    });

    it("matches when countries is undefined", function() {
      Sefaria.countryCode = "us";
      expect(matchesCountryTarget({ countryMode: "exclude", countries: undefined })).toBe(true);
    });

    it("does not match when the viewer's country is anywhere in a multi-country list", function() {
      const countries = [
        { name: "United States", code: "US" },
        { name: "France", code: "FR" },
        { name: "Israel", code: "IL" },
      ];
      Sefaria.countryCode = "fr";
      expect(matchesCountryTarget({ countryMode: "exclude", countries })).toBe(false);
    });

    it("matches when the viewer's country is absent from a multi-country list", function() {
      const countries = [
        { name: "United States", code: "US" },
        { name: "France", code: "FR" },
        { name: "Israel", code: "IL" },
      ];
      Sefaria.countryCode = "de";
      expect(matchesCountryTarget({ countryMode: "exclude", countries })).toBe(true);
    });

  });

  describe("country code casing", function() {

    it("matches regardless of the casing returned by Strapi", function() {
      Sefaria.countryCode = "us";
      expect(matchesCountryTarget({
        countryMode: "include",
        countries: [{ name: "United States", code: "Us" }],
      })).toBe(true);
    });

  });

  describe("missing countriesToTarget", function() {

    it("matches when countriesToTarget is undefined", function() {
      Sefaria.countryCode = "us";
      expect(matchesCountryTarget(undefined)).toBe(true);
    });

    it("matches when countriesToTarget is null", function() {
      Sefaria.countryCode = "us";
      expect(matchesCountryTarget(null)).toBe(true);
    });

  });

});
