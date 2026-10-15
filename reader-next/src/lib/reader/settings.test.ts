import { describe, expect, it } from "vitest";
import {
  DEFAULT_SETTINGS,
  biLayoutForDirections,
  displayMenuAvailability,
  effectiveBiLayout,
  effectiveLayout,
  fontScale,
  layoutKeyFor,
  parseCookieHeader,
  parseCookieSettings,
  stepFontSize,
  supportsAliyot,
  toCookie,
  vocalizationMode,
} from "./settings";

// @feature SHL-007 @feature SHL-008 @feature TXD-031 @feature TXD-033 @feature TXD-034 @feature TXD-035 @feature TXD-036 @feature TXD-037 @feature TXD-038 @feature SHL-009 @feature SHL-011 @feature SHL-019 @feature SHL-020 @feature TXT-003 @feature TXT-005
describe("defaults match the old client", () => {
  it("has the documented defaults", () => {
    expect(DEFAULT_SETTINGS).toMatchObject({
      language: "bilingual",
      layoutDefault: "segmented",
      layoutTalmud: "continuous",
      layoutTanakh: "segmented",
      aliyotTorah: false,
      vowels: "all",
      punctuationTalmud: true,
      biLayout: "stacked",
      color: "light",
      fontSize: 62.5,
    });
  });
});

describe("old-cookie compatibility", () => {
  it("reads values the old client wrote", () => {
    const s = parseCookieSettings({
      language: "hebrew",
      layoutTalmud: "segmented",
      aliyotTorah: "aliyotOn",
      punctuationTalmud: "punctuationOff",
      vowels: "partial",
      fontSize: "71.875",
      biLayout: "heRight",
    });
    expect(s).toMatchObject({ language: "hebrew", layoutTalmud: "segmented", aliyotTorah: true, punctuationTalmud: false, vowels: "partial", fontSize: 71.875, biLayout: "heRight" });
  });

  it("falls back to defaults for corrupt values instead of breaking", () => {
    const s = parseCookieSettings({ language: "klingon", fontSize: "NaN", vowels: "???", aliyotTorah: undefined });
    expect(s).toEqual(DEFAULT_SETTINGS);
  });

  it("rejects out-of-range font sizes", () => {
    expect(parseCookieSettings({ fontSize: "9999" }).fontSize).toBe(62.5);
    expect(parseCookieSettings({ fontSize: "1" }).fontSize).toBe(62.5);
  });

  it("falls back to the contentLang cookie for language", () => {
    expect(parseCookieSettings({ contentLang: "english" }).language).toBe("english");
  });

  it("writes cookies in the old format", () => {
    expect(toCookie("punctuationTalmud", false)).toEqual(["punctuationTalmud", "punctuationOff"]);
    expect(toCookie("aliyotTorah", true)).toEqual(["aliyotTorah", "aliyotOn"]);
    expect(toCookie("vowels", "none")).toEqual(["vowels", "none"]);
    expect(toCookie("fontSize", 71.875)).toEqual(["fontSize", "71.875"]);
  });

  it("parses a cookie header", () => {
    expect(parseCookieHeader("a=1; language=hebrew; x=%E2%9C%93; bad")).toEqual({ a: "1", language: "hebrew", x: "✓" });
  });
});

describe("category-specific layout", () => {
  it("maps Tanakh and Talmud to their own key, everything else to default", () => {
    expect(layoutKeyFor("Tanakh")).toBe("layoutTanakh");
    expect(layoutKeyFor("Talmud")).toBe("layoutTalmud");
    expect(layoutKeyFor("Mishnah")).toBe("layoutDefault");
    expect(layoutKeyFor(undefined)).toBe("layoutDefault");
  });

  const hebrew = { ...DEFAULT_SETTINGS, language: "hebrew" as const };
  it("Talmud is continuous by default in a single language, Tanakh segmented", () => {
    expect(effectiveLayout(hebrew, { primaryCategory: "Talmud" })).toBe("continuous");
    expect(effectiveLayout(hebrew, { primaryCategory: "Tanakh" })).toBe("segmented");
  });

  it("bilingual display is never continuous (biLayout applies instead)", () => {
    expect(effectiveLayout(DEFAULT_SETTINGS, { primaryCategory: "Talmud" })).toBe("segmented");
  });

  it("sidebar panels are never continuous", () => {
    expect(effectiveLayout(hebrew, { primaryCategory: "Talmud", inSidebar: true })).toBe("segmented");
  });
});

describe("bilingual layout", () => {
  const s = { ...DEFAULT_SETTINGS, biLayout: "heRight" as const };
  it("narrow panels fall back to stacked", () => {
    expect(effectiveBiLayout(s, { panelWidth: 480 })).toBe("stacked");
    expect(effectiveBiLayout(s, { panelWidth: 500 })).toBe("stacked");
  });
  it("wide panels honour the setting", () => {
    expect(effectiveBiLayout(s, { panelWidth: 501 })).toBe("heRight");
  });
  it("unmeasured panels (server render) honour the setting", () => {
    expect(effectiveBiLayout(s, {})).toBe("heRight");
  });
  it("flips side-by-side when both versions share a direction", () => {
    expect(biLayoutForDirections("heLeft", "rtl", "rtl")).toBe("heRight");
    expect(biLayoutForDirections("heRight", "ltr", "ltr")).toBe("heLeft");
    expect(biLayoutForDirections("heRight", "rtl", "rtl")).toBeUndefined();
    expect(biLayoutForDirections("heRight", "rtl", "ltr")).toBeUndefined();
    expect(biLayoutForDirections("stacked", "rtl", "rtl")).toBeUndefined();
  });
});

describe("font size", () => {
  it("steps geometrically by 1.15", () => {
    expect(stepFontSize(62.5, "larger")).toBeCloseTo(71.875, 3);
    expect(stepFontSize(71.875, "smaller")).toBeCloseTo(62.5, 3);
  });
  it("is clamped", () => {
    let s = 62.5;
    for (let i = 0; i < 30; i++) s = stepFontSize(s, "larger");
    expect(s).toBeLessThan(200);
    for (let i = 0; i < 60; i++) s = stepFontSize(s, "smaller");
    expect(s).toBeGreaterThan(10);
  });
  it("scale is 1 at the default", () => {
    expect(fontScale(62.5)).toBe(1);
    expect(fontScale(71.875)).toBeCloseTo(1.15, 5);
  });
});

describe("vowels", () => {
  it("maps the three states to vocalization modes", () => {
    expect(vocalizationMode("all")).toBe("taamim_and_nikkud");
    expect(vocalizationMode("partial")).toBe("nikkud");
    expect(vocalizationMode("none")).toBe("none");
  });
});

describe("aliyot support", () => {
  it.each(["Genesis", "Exodus", "Leviticus", "Numbers", "Deuteronomy", "Onkelos Genesis", "Onkelos Deuteronomy"])("%s", (b) => {
    expect(supportsAliyot(b)).toBe(true);
  });
  it.each(["Isaiah", "Rashi on Genesis", "Onkelos Isaiah", "Berakhot", undefined])("not %s", (b) => {
    expect(supportsAliyot(b)).toBe(false);
  });
});

describe("display menu availability (inv_02 §7)", () => {
  const base = { settings: DEFAULT_SETTINGS, showsSource: true, primaryCategory: "Tanakh", book: "Genesis", hebrewSample: "בְּרֵאשִׁ֖ית" };

  it("sidebar panels show only the language control", () => {
    const a = displayMenuAvailability({ ...base, inSidebar: true });
    expect(a).toMatchObject({ language: true, layout: false, fontSize: false, vowels: false, aliyot: false, punctuation: false });
  });
  it("offers vowels and cantillation only when the text has them", () => {
    expect(displayMenuAvailability(base)).toMatchObject({ vowels: true, cantillation: true });
    expect(displayMenuAvailability({ ...base, hebrewSample: "בראשית" })).toMatchObject({ vowels: false, cantillation: false });
    expect(displayMenuAvailability({ ...base, hebrewSample: "בְּרֵאשִׁית" })).toMatchObject({ vowels: true, cantillation: false });
  });
  it("disables cantillation when vowels are off", () => {
    const a = displayMenuAvailability({ ...base, settings: { ...DEFAULT_SETTINGS, vowels: "none" } });
    expect(a.cantillationEnabled).toBe(false);
  });
  it("hides source-text options when only the translation is visible", () => {
    expect(displayMenuAvailability({ ...base, showsSource: false })).toMatchObject({ vowels: false, cantillation: false, punctuation: false });
  });
  it("shows punctuation only for Talmud", () => {
    expect(displayMenuAvailability({ ...base, primaryCategory: "Talmud", book: "Berakhot" }).punctuation).toBe(true);
    expect(displayMenuAvailability(base).punctuation).toBe(false);
  });
  it("shows aliyot only for Torah and not on sheets", () => {
    expect(displayMenuAvailability(base).aliyot).toBe(true);
    expect(displayMenuAvailability({ ...base, isSheet: true }).aliyot).toBe(false);
    expect(displayMenuAvailability({ ...base, book: "Isaiah" }).aliyot).toBe(false);
  });
  it("hides layout buttons on narrow bilingual panels", () => {
    expect(displayMenuAvailability({ ...base, panelWidth: 600 }).layout).toBe(false);
    expect(displayMenuAvailability({ ...base, panelWidth: 601 }).layout).toBe(true);
    expect(displayMenuAvailability({ ...base, panelWidth: 400, settings: { ...DEFAULT_SETTINGS, language: "hebrew" } }).layout).toBe(true);
  });
});
