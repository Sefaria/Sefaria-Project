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
    expect(leavesClient("/topics")).toBe(true);
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
