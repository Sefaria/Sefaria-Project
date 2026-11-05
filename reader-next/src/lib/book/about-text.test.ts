import { describe, expect, it } from "vitest";
import { aboutTextMeta } from "./about-text";

// @feature LIB-036
describe("About This Text metadata", () => {
  it("Berakhot: composed place and date, parentheses and the double space gone", () => {
    const m = aboutTextMeta({ categories: ["Talmud", "Bavli", "Seder Zeraim"], authors: [], compPlaceString: { en: "Talmudic Babylon", he: "בבל התלמודית" }, compDateString: { en: " (c.450  – c.550 CE)", he: " (450 – 550 לספירה בקירוב)" } });
    expect(m.composed?.en).toBe("Talmudic Babylon, c.450 – c.550 CE");
    expect(m.composed?.he).toBe("בבל התלמודית, 450 – 550 לספירה בקירוב");
    expect(m.authors).toEqual([]);
  });
  it("Jastrow: an author with a topic slug", () => {
    const m = aboutTextMeta({ categories: ["Reference", "Dictionary"], authors: [{ en: "Marcus Jastrow", he: "מרקוס (מרדכי) יסטרוב", slug: "marcus-jastrow" }], compPlaceString: { en: "Philadelphia", he: "פילדלפיה" }, compDateString: { en: " (c.1883  – c.1903 CE)", he: "" } });
    expect(m.authors[0]).toEqual({ slug: "marcus-jastrow", en: "Marcus Jastrow", he: "מרקוס (מרדכי) יסטרוב" });
    expect(m.composed?.en).toBe("Philadelphia, c.1883 – c.1903 CE");
  });
  it("Tanakh's own books show no composition", () => {
    expect(aboutTextMeta({ categories: ["Tanakh", "Torah"], authors: [], compPlaceString: { en: "Sinai", he: "" }, compDateString: { en: "(c.1400 BCE)", he: "" } }).composed).toBeUndefined();
  });
});
