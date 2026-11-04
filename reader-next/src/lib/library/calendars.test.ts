import { describe, expect, it } from "vitest";
import { calendarListings, calendarsUrl, iriToUri, sectionListings, shortcutLocation, type CalendarItem } from "./calendars";

const item = (en: string, url: string, extra: Partial<CalendarItem> = {}): CalendarItem => ({
  title: { en, he: `he:${en}` },
  displayValue: { en: `dv:${en}`, he: `hedv:${en}` },
  url,
  ref: url.replace(/_/g, " "),
  ...extra,
});

// A day of /api/calendars as sefaria.org answered it on 2026-11-04 (trimmed)
const DAY: CalendarItem[] = [
  item("Parashat Hashavua", "Genesis.23.1-25.18", { displayValue: { en: "Chayei Sara", he: "חיי שרה" }, ref: "Genesis 23:1-25:18", heRef: "בראשית כ״ג:א׳-כ״ה:י״ח", category: "Tanakh", description: { en: "Chayyei Sarah opens…", he: "פרשת חיי שרה…" } }),
  item("Haftarah (A)", "I_Kings.1.1-31", { category: "Tanakh" }),
  item("Haftarah (A)", "I_Kings.1.32-40", { category: "Tanakh" }),
  item("Haftarah (S)", "I_Kings.1.1-31", { category: "Tanakh" }),
  item("Daf Yomi", "Bekhorot.47", { category: "Talmud" }),
  item("929", "I_Kings.22", { category: "Tanakh" }),
  item("Daf a Week", "Nazir.16", { category: "Talmud" }),
  item("Yerushalmi Yomi", "Jerusalem_Talmud_Sanhedrin.3.5.7-6.3", { category: "Talmud" }),
  item("Chok LeYisrael", "collections/חק-לישראל?tag=Chayei%20Sara", { category: "Tanakh" }),
  item("Some New Schedule", "Genesis.1"),
];

// @feature CAL-002
describe("calendarListings (the old reformatCalendars)", () => {
  const l = calendarListings(DAY);
  const by = (k: string) => l.find((x) => x.key === k)!;
  it("titles the weekly portion's card by the portion, with its ref (Hebrew heRef) as the reading, and keeps the API's description", () => {
    expect(by("Parashat Hashavua")).toMatchObject({
      title: { en: "Chayei Sara", he: "חיי שרה" },
      href: "/Genesis.23.1-25.18",
      readings: [{ href: "/Genesis.23.1-25.18", text: { en: "Genesis 23:1-25:18", he: "בראשית כ״ג:א׳-כ״ה:י״ח" } }],
      description: { en: "Chayyei Sarah opens…", he: "פרשת חיי שרה…" },
    });
    expect(by("Parashat Hashavua").subtitle).toBeUndefined();
  });
  it("merges consecutive items of one schedule into one card with several readings; (A) and (S) stay apart, both described as Haftarah", () => {
    expect(by("Haftarah (A)").readings.map((r) => r.href)).toEqual(["/I_Kings.1.1-31", "/I_Kings.1.32-40"]);
    expect(by("Haftarah (A)").href).toBe("/I_Kings.1.1-31");
    expect(by("Haftarah (S)").readings).toHaveLength(1);
    expect(by("Haftarah (S)").description?.en).toMatch(/^The portion from Prophets/);
  });
  it("adds the old table's descriptions and Talmud/Tanakh subtitles; Yerushalmi Yomi has none", () => {
    expect(by("Daf Yomi")).toMatchObject({ subtitle: "Talmud", category: "Talmud", readings: [{ href: "/Bekhorot.47", text: { en: "dv:Daf Yomi" } }] });
    expect(by("929").subtitle).toBe("Tanakh");
    expect(by("Daf a Week").subtitle).toBe("Talmud");
    expect(by("Yerushalmi Yomi").description).toBeUndefined();
    expect(by("Yerushalmi Yomi").subtitle).toBeUndefined();
  });
  it("writes the url as the API gives it (a Hebrew collection path stays unencoded, as the old page)", () => {
    expect(by("Chok LeYisrael").href).toBe("/collections/חק-לישראל?tag=Chayei%20Sara");
  });
  it("sorts cards into the three sections in the API's order and drops schedules the page does not list", () => {
    expect(sectionListings(l, "weeklyPortion").map((x) => x.key)).toEqual(["Parashat Hashavua", "Haftarah (A)", "Haftarah (S)"]);
    expect(sectionListings(l, "daily").map((x) => x.key)).toEqual(["Daf Yomi", "929", "Yerushalmi Yomi", "Chok LeYisrael"]);
    expect(sectionListings(l, "weekly").map((x) => x.key)).toEqual(["Daf a Week"]);
    expect(l.some((x) => x.key === "Some New Schedule")).toBe(true);
    expect(["weeklyPortion", "daily", "weekly"].flatMap((s) => sectionListings(l, s as "daily")).some((x) => x.key === "Some New Schedule")).toBe(false);
  });
});

// @feature CAL-001
describe("calendarsUrl", () => {
  it("asks for Israel or the diaspora, and the custom only when given", () => {
    expect(calendarsUrl("https://x", true)).toBe("https://x/api/calendars?diaspora=1");
    expect(calendarsUrl("https://x", false, "sephardi")).toBe("https://x/api/calendars?diaspora=0&custom=sephardi");
  });
});

// @feature CAL-003 @feature RTE-010
describe("shortcutLocation (Django's redirect(iri_to_uri('/' + url)))", () => {
  it("goes to the schedule's url", () => {
    expect(shortcutLocation(DAY, "Parashat Hashavua")).toBe("/Genesis.23.1-25.18");
    expect(shortcutLocation(DAY, "Daf Yomi")).toBe("/Bekhorot.47");
  });
  it("a title the API repeats goes to its last item (the old views keyed the items by title)", () => {
    expect(shortcutLocation(DAY, "Haftarah (A)")).toBe("/I_Kings.1.32-40");
  });
  it("is null when today has no such schedule", () => {
    expect(shortcutLocation([], "Daf Yomi")).toBeNull();
  });
  it("encodes as iri_to_uri: UTF-8 percent-escapes, upper-case; its safe characters and existing escapes kept", () => {
    expect(iriToUri("/collections/חק-לישראל?tag=Chayei%20Sara")).toBe("/collections/%D7%97%D7%A7-%D7%9C%D7%99%D7%A9%D7%A8%D7%90%D7%9C?tag=Chayei%20Sara");
    expect(iriToUri("/Mishneh_Torah,_Shabbat.1.1;x=(a)+b!*@'~$&:#f")).toBe("/Mishneh_Torah,_Shabbat.1.1;x=(a)+b!*@'~$&:#f");
    expect(iriToUri('/a b"c<d>')).toBe("/a%20b%22c%3Cd%3E");
  });
});
