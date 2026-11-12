import { describe, expect, it } from "vitest";
import { labelLanguage, passageLabelLanguage, type LabelLanguageInput } from "./label-language";
import { segmentNumberLang } from "./labels";

const he = { languageFamilyName: "hebrew" };
const en = { languageFamilyName: "english", versionTitle: "JPS", shortVersionTitle: "" };
const heTr = { languageFamilyName: "hebrew", versionTitle: "Hebrew Translation", shortVersionTitle: "" };
const fr = { languageFamilyName: "french", versionTitle: "Bible du Rabbinat", shortVersionTitle: "" };
const enSrc = { languageFamilyName: "english" };

const tanakh = (o: Partial<LabelLanguageInput>): LabelLanguageInput => ({
  language: "bilingual", interfaceLang: "english", primaryVersion: he, translationVersion: en, hasTranslation: true, ...o,
});

// @feature TXD-012 @feature TXD-045 @feature TXT-002 (legacy useContentLang(defaultToInterfaceOnBilingual = true))
describe("labelLanguage", () => {
  it("bilingual follows the interface", () => {
    expect(labelLanguage(tanakh({ interfaceLang: "english" }))).toBe("en");
    expect(labelLanguage(tanakh({ interfaceLang: "hebrew" }))).toBe("he");
  });
  it("bilingual follows the interface even when the section has no translation", () => {
    expect(labelLanguage(tanakh({ hasTranslation: false, interfaceLang: "english" }))).toBe("en");
  });
  it("Hebrew mode is Hebrew whatever the interface (book title, headers, numbers)", () => {
    expect(labelLanguage(tanakh({ language: "hebrew", interfaceLang: "english" }))).toBe("he");
  });
  it("English mode is English whatever the interface", () => {
    expect(labelLanguage(tanakh({ language: "english", interfaceLang: "hebrew" }))).toBe("en");
  });
  it("English mode with a Hebrew translation (Zohar) is Hebrew", () => {
    expect(labelLanguage(tanakh({ language: "english", primaryVersion: { languageFamilyName: "aramaic" }, translationVersion: heTr }))).toBe("he");
  });
  it("English mode with a French translation takes the interface language", () => {
    expect(labelLanguage(tanakh({ language: "english", translationVersion: fr, interfaceLang: "hebrew" }))).toBe("he");
    expect(labelLanguage(tanakh({ language: "english", translationVersion: fr, interfaceLang: "english" }))).toBe("en");
  });
  it("English mode with no translation text is labelled from the source", () => {
    expect(labelLanguage(tanakh({ language: "english", hasTranslation: false }))).toBe("he");
  });
  it("Hebrew mode with an English source (an English-original work) is English", () => {
    expect(labelLanguage(tanakh({ language: "hebrew", interfaceLang: "hebrew", primaryVersion: enSrc, translationVersion: undefined, hasTranslation: false }))).toBe("en");
  });
  it("nothing loaded yet: the mode's own language", () => {
    expect(labelLanguage({ language: "hebrew", interfaceLang: "english", hasTranslation: false })).toBe("he");
    expect(labelLanguage({ language: "english", interfaceLang: "hebrew", hasTranslation: false })).toBe("en");
  });
});

describe("passageLabelLanguage", () => {
  const seg = (translation?: unknown) => ({ translation }) as never;
  it("a section whose translation entries are all missing counts as having none", () => {
    const p = { primaryVersion: he, translationVersion: en, segments: [seg(), seg()] } as never;
    expect(passageLabelLanguage(p, "english", "english")).toBe("he");
  });
  it("a section with translation text uses the translation in English mode", () => {
    const p = { primaryVersion: he, translationVersion: en, segments: [seg(), seg({ html: "x" })] } as never;
    expect(passageLabelLanguage(p, "english", "hebrew")).toBe("en");
  });
});

describe("an English-only work in Hebrew mode", () => {
  it("labels in English and numbers its English text in digits", () => {
    const p = { primaryVersion: { languageFamilyName: "english" }, translationVersion: undefined, segments: [{ primary: "x" }] } as never;
    const lang = passageLabelLanguage(p, "hebrew", "hebrew");
    expect(lang).toBe("en");
    expect(segmentNumberLang("hebrew", lang, "ltr")).toBe("en");
  });
});
