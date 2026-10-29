import { describe, expect, it, vi } from "vitest";
import { bootstrapUrlAction, installLegacyEvents } from "./legacy-events";

const here = { href: "https://www.sefaria.org/Genesis.1?lang=bi", host: "www.sefaria.org" };

// @feature AI-011 — the Library Assistant's three kinds of link (from its build: lc-chatbot.umd.cjs)
describe("sefaria:bootstrap-url", () => {
  it("a page of this client: a navigation in the app, replacing the entry when asked (the assistant's source links)", () => {
    expect(bootstrapUrlAction({ url: "/Genesis.1.3?lang=bi#x", replaceHistory: true }, here)).toEqual({ kind: "navigate", pathname: "/Genesis.1.3", search: "?lang=bi", hash: "#x", replace: true });
    expect(bootstrapUrlAction("https://www.sefaria.org/search?q=light", here)).toEqual({ kind: "navigate", pathname: "/search", search: "?q=light", hash: "", replace: false });
  });
  it("a page Django serves (a topic) or another Sefaria site: loaded in full", () => {
    expect(bootstrapUrlAction({ url: "/topics/shabbat" }, here)).toEqual({ kind: "load", href: "https://www.sefaria.org/topics/shabbat", replace: false });
    expect(bootstrapUrlAction({ url: "https://voices.sefaria.org/sheets/1" }, here)).toEqual({ kind: "load", href: "https://voices.sefaria.org/sheets/1", replace: false });
  });
  it("any other site, another scheme, or no URL: nothing", () => {
    expect(bootstrapUrlAction({ url: "https://evil.example.com/x" }, here)).toBeNull();
    expect(bootstrapUrlAction({ url: "javascript:alert(1)" }, here)).toBeNull();
    expect(bootstrapUrlAction({}, here)).toBeNull();
    expect(bootstrapUrlAction(null, here)).toBeNull();
  });
  it("is received on the document, and stops when uninstalled", () => {
    const navigate = vi.fn(), load = vi.fn(), refreshReader = vi.fn();
    const stop = installLegacyEvents(document, { navigate, load, refreshReader });
    document.dispatchEvent(new CustomEvent("sefaria:bootstrap-url", { detail: { url: "/Exodus.3", replaceHistory: true } }));
    expect(navigate).toHaveBeenCalledWith({ pathname: "/Exodus.3", search: "", hash: "" }, { replace: true });
    document.dispatchEvent(new CustomEvent("sefaria:bootstrap-url", { detail: { url: "/topics/love" } }));
    expect(load).toHaveBeenCalledWith(expect.stringMatching(/\/topics\/love$/), { replace: false });
    document.dispatchEvent(new CustomEvent("sefaria:settings-updated", { detail: {} }));
    expect(refreshReader).toHaveBeenCalledTimes(1);
    stop();
    document.dispatchEvent(new CustomEvent("sefaria:bootstrap-url", { detail: { url: "/Exodus.4" } }));
    expect(navigate).toHaveBeenCalledTimes(1);
  });
});
