// @feature ANL-015 @feature ANL-016 @feature ANL-014 @feature ANL-011 @feature ANL-008
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { analyticsLog, bothEvent, gtagEvent, uaEvent } from "./core";
import { attachDeclarativeAnalytics, collectAnalytics, parseEventAttr } from "./declarative";
import { analyticsHeadScripts, saMetadataScript, simpleAnalyticsScript } from "./scripts";
import { copyEvents } from "./session";

const OFF = { gtm: null, gtag: null, sentryDsn: null, simpleAnalyticsHost: null, appVersion: null };

beforeEach(() => {
  analyticsLog.length = 0;
  window.gtag = vi.fn();
  window.sa_event = vi.fn();
});
afterEach(() => {
  delete window.gtag;
  delete window.sa_event;
  delete window.ga;
  document.body.innerHTML = "";
});

describe("core channels", () => {
  it("gtag events drop undefined parameters and are logged", () => {
    gtagEvent("search_submit", { project: "Global Search", text: "light", link_type: undefined });
    expect(window.gtag).toHaveBeenCalledWith("event", "search_submit", { project: "Global Search", text: "light" });
    expect(analyticsLog.at(-1)).toEqual({ channel: "gtag", name: "search_submit", params: { project: "Global Search", text: "light" } });
  });
  it("impressions go to Simple Analytics and GA4", () => {
    bothEvent("header_viewed", { impression_type: "regular_header" });
    expect(window.sa_event).toHaveBeenCalledWith("header_viewed", { impression_type: "regular_header" });
    expect(window.gtag).toHaveBeenCalledWith("event", "header_viewed", { impression_type: "regular_header" });
  });
  it("Track.event goes through GTM's ga shim with the tracker name, and is skipped without it", () => {
    uaEvent("Reader", "Change Language", "hebrew");
    const ga = Object.assign(vi.fn(), { getAll: () => [{ get: () => "gtm7" }] });
    window.ga = ga;
    uaEvent("Reader", "Change Language", "english");
    expect(ga).toHaveBeenCalledTimes(1);
    expect(ga).toHaveBeenCalledWith("gtm7.send", "event", "Reader", "Change Language", "english", undefined);
  });
  it("a vendor that throws never breaks the caller", () => {
    window.gtag = () => {
      throw new Error("blocked");
    };
    expect(() => gtagEvent("print")).not.toThrow();
  });
});

describe("declarative data-anl tracking (analyticsEventTracker.js)", () => {
  it("parses name:type pairs", () => {
    expect(parseEventAttr("select_promotion:click|view_promotion:scrollIntoView")).toEqual([
      { name: "select_promotion", type: "click" },
      { name: "view_promotion", type: "scrollIntoView" },
    ]);
  });
  it("collects fields from ancestors, closest wins, whitelist only", () => {
    document.body.innerHTML = `<div id="root"><section data-anl-batch='{"panel_type":"reader","panel_number":1}' data-anl-feature_name="outer" data-anl-bogus="x">
      <a id="a" data-anl-event="navto_topic:click" data-anl-feature_name="Trending" data-anl-text="Light" data-anl-link_type="topic">t</a></section></div>`;
    const root = document.getElementById("root")!;
    const ev = new MouseEvent("click", { bubbles: true });
    Object.defineProperty(ev, "target", { value: document.getElementById("a") });
    expect(collectAnalytics(ev, root)).toEqual([
      { name: "navto_topic", params: { feature_name: "Trending", text: "Light", link_type: "topic", panel_type: "reader", panel_number: 1 } },
    ]);
  });
  it("fires on click, on <details> toggle with from/to, and ignores unrelated types", async () => {
    document.body.innerHTML = `<div id="root"><button id="b" data-anl-event="sort_by:click" data-anl-text="Relevance">x</button>
      <details id="d" data-anl-event="faq_toggle:toggle"><summary>q</summary>a</details><span id="s" data-anl-event="x:mouseover">s</span></div>`;
    const root = document.getElementById("root")!;
    const detach = attachDeclarativeAnalytics(root);
    document.getElementById("b")!.click();
    document.getElementById("s")!.click();
    const d = document.getElementById("d") as HTMLDetailsElement;
    d.open = true;
    d.dispatchEvent(new Event("toggle"));
    detach();
    expect(window.gtag).toHaveBeenCalledWith("event", "sort_by", { text: "Relevance" });
    expect(window.gtag).toHaveBeenCalledWith("event", "faq_toggle", { from: "closed", to: "open" });
    expect(window.gtag).toHaveBeenCalledTimes(2);
  });
});

describe("head scripts (templates/base.html)", () => {
  it("nothing is loaded without settings", () => {
    expect(analyticsHeadScripts(OFF, "english")).toEqual([]);
    expect(simpleAnalyticsScript(OFF)).toBeNull();
    expect(saMetadataScript(OFF, { loggedIn: false, staff: false })).toBeNull();
  });
  it("gtag config carries the old parameters", () => {
    const s = analyticsHeadScripts({ ...OFF, gtm: "GTM-X", gtag: "G-5S6RP1RFZ2", appVersion: "v7.2.3" }, "english");
    expect(s[0]!.children).toContain(`'dataLayer',"GTM-X"`);
    expect(s[1]!.src).toBe("https://www.googletagmanager.com/gtag/js?id=G-5S6RP1RFZ2");
    expect(s[2]!.children).toContain(`gtag('config',"G-5S6RP1RFZ2",{"user_id":null,"traffic_type":null,"site_lang":"english","site_version":"v7.2.3"})`);
  });
  // CODE_REVIEW R-01: a second execution (a re-injected script) must not load GTM again or send another config (= page view)
  it("the GTM and gtag snippets run once per document, however often they execute", () => {
    const w = window as unknown as Record<string, unknown> & { dataLayer?: unknown[] };
    delete window.gtag;
    delete w.dataLayer;
    delete w.__sefariaGtm;
    delete w.__sefariaGtag;
    const inline = analyticsHeadScripts({ ...OFF, gtm: "GTM-X", gtag: "G-1" }, "english").filter((x) => x.children);
    document.head.appendChild(document.createElement("script")); // GTM inserts itself before the page's first script
    const before = document.querySelectorAll("script[src*='gtm.js']").length;
    for (let n = 0; n < 3; n++) for (const x of inline) new Function(x.children!)();
    const configs = (w.dataLayer ?? []).filter((e) => Array.from(e as ArrayLike<unknown>)[0] === "config");
    expect(configs).toHaveLength(1);
    expect(document.querySelectorAll("script[src*='gtm.js']").length - before).toBe(1);
  });
  it("Simple Analytics: queue stub in the head, metadata then the script with DNT collection", () => {
    const cfg = { ...OFF, simpleAnalyticsHost: "sefaria.org" };
    expect(analyticsHeadScripts(cfg, "english")[0]!.children).toContain("window.sa_event.q");
    expect(simpleAnalyticsScript(cfg)).toEqual({ src: "https://scripts.simpleanalyticscdn.com/latest.js", defer: true, "data-hostname": "sefaria.org", "data-collect-dnt": "true" });
    expect(saMetadataScript(cfg, { loggedIn: true, staff: true })).toContain("traffic_type:'sefaria_email'");
    expect(simpleAnalyticsScript({ ...OFF, simpleAnalyticsHost: "sa-dev.sefaria.org" })!.src).toBe("https://scripts.simpleanalyticscdn.com/latest.dev.js");
  });
});

describe("copy events (ReaderApp.handleGACopyEvents)", () => {
  const p = { length: 12, panelType: "Text", book: "Genesis", category: "Tanakh" };
  it("copy_text always; bilingual and spanning by selection", () => {
    copyEvents(p, { en: 2, he: 1 });
    expect(analyticsLog.map((e) => e.name)).toEqual(["copy_text", "bilingual_copy_text", "spanning_copy_text"]);
  });
  it("no book: only copy_text", () => {
    copyEvents({ ...p, book: null }, { en: 2, he: 2 });
    expect(analyticsLog.map((e) => e.name)).toEqual(["copy_text"]);
  });
});

describe("the signed-in user after load", () => {
  it("is set on the GA4 stream with gtag('set'), never a second config (which would send a second page_view)", async () => {
    const { PUBLIC_CONFIG } = await import("~/lib/config");
    const { setAnalyticsUser } = await import("./session");
    const was = PUBLIC_CONFIG.analytics.gtag;
    (PUBLIC_CONFIG.analytics as { gtag: string | null }).gtag = "G-TEST";
    try {
      setAnalyticsUser({ uid: 7, email: "x@sefaria.org" }, "english");
      expect(window.gtag).toHaveBeenCalledWith("set", expect.objectContaining({ user_id: 7, traffic_type: "sefariaemail", site_lang: "english" }));
      expect(window.gtag).not.toHaveBeenCalledWith("config", expect.anything(), expect.anything());
    } finally {
      (PUBLIC_CONFIG.analytics as { gtag: string | null }).gtag = was;
    }
  });
});
