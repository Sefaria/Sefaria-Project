import { describe, expect, it, vi } from "vitest";
import { calendarShortcut, isCalendarShortcut } from "./calendar-shortcuts";

const api = (items: unknown[]) => vi.fn(async (_url: string) => new Response(JSON.stringify({ calendar_items: items }), { status: 200, headers: { "content-type": "application/json" } }));
const DAY = [
  { title: { en: "Parashat Hashavua", he: "" }, displayValue: { en: "Chayei Sara", he: "" }, url: "Genesis.23.1-25.18", ref: "Genesis 23:1-25:18" },
  { title: { en: "Daf Yomi", he: "" }, displayValue: { en: "Bekhorot 47", he: "" }, url: "Bekhorot.47", ref: "Bekhorot 47" },
];
const fallback = () => new Response("django", { status: 299 });

// @feature CAL-003 @feature RTE-010
describe("calendarShortcut (/parashat-hashavua, /todays-daf-yomi)", () => {
  it("answers 302 to '/' + the item's url, empty, text/html, asking the API with the old views' defaults (diaspora, no custom)", async () => {
    const f = api(DAY);
    const r = (await calendarShortcut("/parashat-hashavua", "GET", fallback, f as unknown as typeof fetch))!;
    expect(r.status).toBe(302);
    expect(r.headers.get("location")).toBe("/Genesis.23.1-25.18");
    expect(r.headers.get("content-type")).toBe("text/html; charset=utf-8");
    expect(await r.text()).toBe("");
    expect(f.mock.calls[0]![0]).toMatch(/\/api\/calendars\?diaspora=1$/);
    expect((await calendarShortcut("/todays-daf-yomi", "HEAD", fallback, api(DAY) as unknown as typeof fetch))!.headers.get("location")).toBe("/Bekhorot.47");
  });
  it("leaves other paths, the slashed shortcuts and writes alone", async () => {
    const f = api(DAY);
    for (const [p, m] of [["/parashat-hashavua/", "GET"], ["/calendars", "GET"], ["/parashat-hashavua", "POST"]]) expect(await calendarShortcut(p!, m!, fallback, f as unknown as typeof fetch)).toBeNull();
    expect(f).not.toHaveBeenCalled();
    expect(isCalendarShortcut("/todays-daf-yomi")).toBe(true);
    expect(isCalendarShortcut("/toString")).toBe(false);
  });
  it("hands over to the fallback (Django, or a 503) when the API fails or today has no such schedule", async () => {
    const down = vi.fn(async () => new Response("", { status: 503 }));
    expect((await calendarShortcut("/todays-daf-yomi", "GET", fallback, down as unknown as typeof fetch))!.status).toBe(299);
    expect((await calendarShortcut("/todays-daf-yomi", "GET", fallback, api([]) as unknown as typeof fetch))!.status).toBe(299);
    const thrown = vi.fn(async () => { throw new TypeError("network"); });
    expect((await calendarShortcut("/parashat-hashavua", "GET", fallback, thrown as unknown as typeof fetch))!.status).toBe(299);
  });
});

describe("voicesNotFound", () => {
  it("answers 404, as voices.sefaria.org does for the Library-only paths", async () => {
    const { voicesNotFound } = await import("./calendar-shortcuts");
    const r = voicesNotFound();
    expect(r.status).toBe(404);
    expect(r.headers.get("x-served-by")).toBe("reader-voices-404");
  });
});
