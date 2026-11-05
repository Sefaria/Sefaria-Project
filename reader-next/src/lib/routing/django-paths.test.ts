import { describe, expect, it } from "vitest";
import { isDjangoPage, isLibraryOnlyPage, isServerRedirect, isVoicesHost, leavesClient } from "./django-paths";

// @feature CAL-001 @feature CAL-003 @feature RTE-010
describe("the calendars port's paths", () => {
  it("/calendars and the shortcuts are no longer Django's on the Library host", () => {
    for (const p of ["/calendars", "/calendars/", "/parashat-hashavua", "/todays-daf-yomi"]) expect(isDjangoPage(p), p).toBe(false);
    for (const p of ["/calendars", "/calendars/", "/parashat-hashavua", "/todays-daf-yomi/"]) expect(isLibraryOnlyPage(p), p).toBe(true);
    expect(isLibraryOnlyPage("/calendarsx")).toBe(false);
  });
  it("the browser loads the shortcuts (a server redirect), and still routes /calendars itself", () => {
    expect(isServerRedirect("/parashat-hashavua")).toBe(true);
    expect(leavesClient("/todays-daf-yomi")).toBe(true);
    expect(leavesClient("/calendars")).toBe(false);
    expect(leavesClient("/sheets/1")).toBe(true);
    // /topics is this client's since the topics port (Library host)
    expect(leavesClient("/topics")).toBe(false);
  });
  it("on the Voices host the browser leaves the app for /calendars too (Django answers it there, Q-E1)", () => {
    expect(leavesClient("/calendars", "voices.sefaria.org")).toBe(true);
    expect(leavesClient("/calendars/", "voices.localhost:3335")).toBe(true);
    expect(leavesClient("/calendars", "sheets.example.org", "https://sheets.example.org")).toBe(true);
    expect(leavesClient("/calendars", "www.sefaria.org", "https://voices.sefaria.org")).toBe(false);
    expect(leavesClient("/Genesis.1", "voices.sefaria.org")).toBe(false);
  });
  it("knows the Voices host by the configured origin or its first label", () => {
    expect(isVoicesHost("voices.sefaria.org")).toBe(true);
    expect(isVoicesHost("voices.localhost:8000")).toBe(true);
    expect(isVoicesHost("chiburim.sefaria.org.il")).toBe(true);
    expect(isVoicesHost("sheets.example.org", "https://sheets.example.org")).toBe(true);
    expect(isVoicesHost("www.sefaria.org", "https://voices.sefaria.org")).toBe(false);
    expect(isVoicesHost("localhost:3100")).toBe(false);
    expect(isVoicesHost(undefined)).toBe(false);
  });
});

// @feature RTE-065
describe("the ported pages together (integration of the 2026-11-04 ports)", () => {
  const pages = ["/translations/de", "/calendars", "/parashat-hashavua", "/compare/Genesis.1/he/a/b", "/topics", "/topics/moses", "/topics/category/authors", "/topics/all/a"];
  it("are this client's on the Library host", () => {
    for (const p of pages) expect(isDjangoPage(p, "www.sefaria.org"), p).toBe(false);
  });
  it("stay Django's on either Voices host", () => {
    for (const p of pages) {
      expect(isDjangoPage(p, "voices.sefaria.org"), p).toBe(true);
      expect(isDjangoPage(p, "chiburim.sefaria.org.il"), p).toBe(true);
    }
  });
  it("only translations keeps Django's 404 for a trailing slash; /calendars/ is a page", () => {
    expect(isDjangoPage("/translations/")).toBe(true);
    expect(isDjangoPage("/translations/de/")).toBe(true);
    expect(isDjangoPage("/calendars/")).toBe(false);
  });
});

// @feature LEG-019 @feature RTE-018
describe("revision history under /activity", () => {
  it("a text's history is this client's on the Library host; the rest of /activity stays Django's", () => {
    expect(isDjangoPage("/activity/Genesis.1.1/en/The_Koren_Jerusalem_Bible")).toBe(false);
    expect(isDjangoPage("/activity/Genesis.1.1/en/The_Koren_Jerusalem_Bible/2")).toBe(false);
    for (const p of ["/activity", "/activity/", "/activity/2", "/activity/leaderboard", "/activity/some-user/2"]) expect(isDjangoPage(p), p).toBe(true);
  });
  it("is Django's on the Voices host", () => {
    expect(isDjangoPage("/activity/Genesis.1.1/en/The_Koren_Jerusalem_Bible", "voices.sefaria.org")).toBe(true);
  });
});
