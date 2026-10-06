import { describe, expect, it } from "vitest";
import berakhotDetails from "../../../fixtures/api/berakhot-2a/index-contracted.json";
import genesisDetails from "../../../fixtures/api/genesis-1/index-contracted.json";
import rashiDetails from "../../../fixtures/api/rashi-on-genesis-1/index-contracted.json";
import rashiText from "../../../fixtures/api/rashi-on-genesis-1/v3-texts.json";
import genesisText from "../../../fixtures/api/genesis-1/v3-texts.json";
import berakhotText from "../../../fixtures/api/berakhot-2a/v3-texts.json";
import type { IndexDetails } from "~/lib/catalog/index-details";
import type { VersionMeta } from "~/lib/text/model";
import { aboutVersions, authorsFor, composedLine, descriptionFor, showsAuthors, versionSectionOrder } from "./about";

const G = genesisDetails as unknown as IndexDetails;
const B = berakhotDetails as unknown as IndexDetails;
const R = rashiDetails as unknown as IndexDetails;
const available = (t: unknown) => (t as { available_versions: VersionMeta[] }).available_versions;

// @feature CON-039 @feature VER-006
describe("About box content (strings read off sefaria.org, 2026-10-05)", () => {
  it("composition line", () => {
    expect(composedLine(G, "en")).toBe("Composed: Sinai/Canaan (c.1400 – c.400 BCE)");
    expect(composedLine(B, "en")).toBe("Composed: Talmudic Babylon (c.450 – c.550 CE)");
    expect(composedLine(R, "en")).toBe("Composed: Middle-Age France (c.1075 – c.1105 CE)");
    expect(composedLine(R, "he")).toMatch(/^נוצר\/נערך: צרפת של ימי הביניים/);
  });
  it("falls back to the publication place and date, then to nothing", () => {
    expect(composedLine({ ...G, compPlaceString: undefined, compPlace: undefined, compDateString: undefined, pubPlace: "Venice", pubDateString: { en: "(1523 CE)" } }, "en")).toBe("Composed: Venice (1523 CE)");
    expect(composedLine({ ...G, compPlaceString: undefined, compDateString: undefined, compPlace: undefined, pubPlace: undefined, pubDateString: undefined }, "en")).toBeUndefined();
  });
  it("authors: only when English names exist, per language", () => {
    expect(showsAuthors(G)).toBe(false);
    expect(showsAuthors(R)).toBe(true);
    expect(authorsFor(R, "en").map((a) => a.slug)).toEqual(["rashi"]);
    expect(authorsFor(R, "he")[0]!.he).toBe("רש״י");
    expect(authorsFor({ authors: [{ slug: "x", he: "א" }] }, "en")).toEqual([]);
  });
  it("description: English, or Hebrew falling back to the short one", () => {
    expect(descriptionFor(G, "en")).toMatch(/^Genesis \(“Bereshit”\) is the first book of the Torah/);
    expect(descriptionFor({ ...G, heDesc: null, heShortDesc: "קצר" }, "he")).toBe("קצר");
    expect(descriptionFor({ ...G, enDesc: null }, "en")).toBeUndefined();
  });
  it("sections: translation first in English, source first otherwise", () => {
    expect(versionSectionOrder("english")).toEqual(["translation", "source"]);
    expect(versionSectionOrder("bilingual")).toEqual(["source", "translation"]);
    expect(versionSectionOrder("hebrew")).toEqual(["source", "translation"]);
  });
  it("Berakhot: the current translation, then the other source versions (no current source: 'Source Versions')", () => {
    const v = aboutVersions(available(berakhotText), { translationTitle: "William Davidson Edition - English" });
    expect(v.translation?.versionTitle).toBe("William Davidson Edition - English");
    expect(v.alternatesAreAll).toBe(true);
    expect(v.alternates.map((x) => x.versionTitle)).toEqual(["William Davidson Edition - Vocalized Aramaic", "William Davidson Edition - Aramaic", "Wikisource Talmud Bavli"]);
  });
  it("a source version named in the URL becomes the current one and leaves the list", () => {
    const v = aboutVersions(available(berakhotText), { translationTitle: "William Davidson Edition - English", sourceTitle: "William Davidson Edition - Aramaic" });
    expect(v.source?.versionTitle).toBe("William Davidson Edition - Aramaic");
    expect(v.alternatesAreAll).toBe(false);
    expect(v.alternates.map((x) => x.versionTitle)).not.toContain("William Davidson Edition - Aramaic");
  });
  it("Rashi: the English edition is the translation AND a source version (a separate version object), as on sefaria.org", () => {
    const v = aboutVersions(available(rashiText), { translationTitle: "Pentateuch with Rashi's commentary by M. Rosenbaum and A.M. Silbermann, 1929-1934" });
    expect(v.translation?.language).toBe("en");
    expect(v.alternates.map((x) => x.versionTitle)).toEqual([
      "Pentateuch with Rashi's commentary by M. Rosenbaum and A.M. Silbermann, 1929-1934",
      "Rashi Chumash, Metsudah Publications, 2009",
      "On Your Way",
    ]);
    expect(v.alternates[0]!.language).toBe("he");
  });
  it("Genesis: the Masorah text is listed among the source versions", () => {
    const v = aboutVersions(available(genesisText), { translationTitle: "THE JPS TANAKH: Gender-Sensitive Edition" });
    expect(v.alternates[0]!.versionTitle).toBe("Miqra according to the Masorah");
  });
});
