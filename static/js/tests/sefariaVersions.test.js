// Reader version-state helpers: the primary/translation pairing used when a texts response is adapted,
// the versions-key format used by the version filter, and the version URL-parameter encoding.
import Sefaria from "../sefaria/sefaria";

describe("getPrimaryAndTranslationFromVersions", () => {
  test("empty version list yields placeholder primary and translation without throwing", () => {
    const [primary, translation] = Sefaria.getPrimaryAndTranslationFromVersions([]);

    expect(primary).toEqual({ text: [] });
    expect(translation).toEqual({ text: [] });
  });

  test("single version is the primary, with an empty translation placeholder", () => {
    const only = { isPrimary: true, versionTitle: "Only", text: ["a"] };
    const [primary, translation] = Sefaria.getPrimaryAndTranslationFromVersions([only]);

    expect(primary).toBe(only);
    expect(translation).toEqual({ text: [] });
  });

  test("two versions with the primary first keep that order", () => {
    const first = { isPrimary: true, versionTitle: "Hebrew", text: ["א"] };
    const second = { isPrimary: false, versionTitle: "English", text: ["a"] };
    const [primary, translation] = Sefaria.getPrimaryAndTranslationFromVersions([first, second]);

    expect(primary).toBe(first);
    expect(translation).toBe(second);
  });

  test("two versions with the translation first are swapped into primary and translation", () => {
    const translationFirst = { isPrimary: false, versionTitle: "English", text: ["a"] };
    const primarySecond = { isPrimary: true, versionTitle: "Hebrew", text: ["א"] };
    const [primary, translation] = Sefaria.getPrimaryAndTranslationFromVersions([translationFirst, primarySecond]);

    expect(primary).toBe(primarySecond);
    expect(translation).toBe(translationFirst);
  });
});

describe("versions key", () => {
  test("splits a plain title and language", () => {
    expect(Sefaria.deconstructVersionsKey("Tanakh Translation|en")).toEqual(["Tanakh Translation", "en"]);
  });

  test("keeps a version title that contains the separator intact", () => {
    const key = Sefaria.getTranslateVersionsKey("Edition A|Part B", "he");

    expect(Sefaria.deconstructVersionsKey(key)).toEqual(["Edition A|Part B", "he"]);
  });

  test("round-trips titles with and without separators", () => {
    ["Plain Title", "Title|Variant", "A|B|C"].forEach((vTitle) => {
      const [title, lang] = Sefaria.deconstructVersionsKey(Sefaria.getTranslateVersionsKey(vTitle, "en"));

      expect(title).toBe(vTitle);
      expect(lang).toBe("en");
    });
  });
});

describe("version title URL encoding", () => {
  test("encoded title decodes back to the original with spaces as underscores", () => {
    const vtitle = "Version Name;Alt&Copy#1+2";
    const encoded = Sefaria.util.encodeVtitle(vtitle);

    expect(decodeURIComponent(encoded)).toBe("Version_Name;Alt&Copy#1+2");
    expect(encoded).not.toMatch(/[;&#+]/);
  });

  test("url version param parses back to the language family and the full title", () => {
    const vtitle = "Edition|Variant One";
    const param = `family|${Sefaria.util.encodeVtitle(vtitle)}`;

    expect(Sefaria.util.getObjectFromUrlParam(param)).toEqual({
      languageFamilyName: "family",
      versionTitle: "Edition|Variant_One",
    });
  });
});
