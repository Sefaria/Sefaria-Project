import { beforeEach, describe, expect, it, vi } from "vitest";
import { analyticsLog } from "./core";
import { legacyPageType, resetPageTypeDimension, setPageTypeDimension } from "./page-dimensions";
import { clsOf, describeTarget, inpOf, rate, sendVital, vitalsEnabled } from "./web-vitals";

beforeEach(() => {
  analyticsLog.length = 0;
  resetPageTypeDimension();
  delete (window as { ga?: unknown }).ga;
  delete (window as { gtag?: unknown }).gtag;
});

// @feature ANL-010
describe("page-type dimension (dimension5)", () => {
  it("maps addresses onto the old ReaderApp's menuOpen || mode values", () => {
    const t = (p: string, c = {}) => legacyPageType(p, c);
    expect([t("/texts"), t("/texts/Tanakh/Torah"), t("/Genesis.1"), t("/Genesis", { book: true }), t("/Genesis.1", { phone: true, sidebar: true }), t("/Genesis.1", { sidebar: true })]).toEqual(["navigation", "navigation", "Text", "book toc", "TextAndConnections", "Text"]);
    expect([t("/search"), t("/topics"), t("/topics/moses"), t("/topics/all/a"), t("/calendars"), t("/saved"), t("/history"), t("/texts/notes"), t("/translations/he"), t("/login"), t("/activity")]).toEqual(["search", "topics", "topics", "allTopics", "calendars", "saved", "history", "notes", "translationsPage", "Static", "Static"]);
  });

  it("sets it on GTM's ga tracker, as Track.setPageType did, and never through gtag", () => {
    const ga = Object.assign(vi.fn(), { getAll: () => [{ get: () => "gtm1" }] });
    const gtag = vi.fn();
    Object.assign(window, { ga, gtag });
    setPageTypeDimension("Text");
    setPageTypeDimension("Text"); // unchanged: once
    setPageTypeDimension("search");
    expect(ga.mock.calls).toEqual([["gtm1.set", "dimension5", "Text"], ["gtm1.set", "dimension5", "search"]]);
    expect(gtag).not.toHaveBeenCalled();
    expect(analyticsLog).toEqual([{ channel: "ua-set", name: "dimension5", params: { value: "Text" } }, { channel: "ua-set", name: "dimension5", params: { value: "search" } }]);
  });
});

// @feature ANL-014
describe("web vitals", () => {
  it("is off unless remote config turns it on, and samples", () => {
    expect(vitalsEnabled(undefined)).toBe(false);
    expect(vitalsEnabled({ "feature.client.remote_config_json": { chatbot: { hide: 0 } } })).toBe(false);
    expect(vitalsEnabled({ "feature.client.remote_config_json": { webVitals: { enabled: 0 } } })).toBe(false);
    expect(vitalsEnabled({ "feature.client.remote_config_json": { webVitals: { enabled: 1 } } })).toBe(true);
    expect(vitalsEnabled({ "feature.client.remote_config_json": { webVitals: { enabled: 1, sampleRate: 0.1 } } }, () => 0.5)).toBe(false);
  });

  it("one web_vitals event per metric, with page type and reader_variant next, through gtag", () => {
    const gtag = vi.fn();
    Object.assign(window, { gtag });
    sendVital("LCP", 2710.4, "reader", "p.segment");
    sendVital("CLS", 0.01234, "reader", "");
    expect(gtag.mock.calls.map((c) => [c[0], c[1]])).toEqual([["event", "web_vitals"], ["event", "web_vitals"]]);
    expect(gtag.mock.calls[0]![2]).toMatchObject({ metric_name: "LCP", metric_value: 2710, metric_rating: "needs-improvement", page_type: "reader", debug_target: "p.segment", reader_variant: "next" });
    expect(gtag.mock.calls[1]![2]).toMatchObject({ metric_name: "CLS", metric_value: 0.012, metric_rating: "good" });
    expect(String(gtag.mock.calls[0]![2].metric_id)).toMatch(/^v1-/);
  });

  it("measures as the web-vitals package defines", () => {
    expect([rate("INP", 200), rate("INP", 201), rate("INP", 501)]).toEqual(["good", "needs-improvement", "poor"]);
    expect(inpOf([])).toBeNull();
    expect(inpOf([40, 300, 120])).toBe(300);
    expect(inpOf(Array.from({ length: 100 }, (_, i) => i))).toBe(97); // two skipped at 100 interactions
    // two windows: 0.1+0.05 then (gap > 1 s) 0.2
    expect(clsOf([{ value: 0.1, startTime: 0 }, { value: 0.05, startTime: 500 }, { value: 0.2, startTime: 3000 }])).toBeCloseTo(0.2);
    expect(clsOf([{ value: 0.1, startTime: 0 }, { value: 0.15, startTime: 500 }])).toBeCloseTo(0.25);
    const el = document.createElement("span");
    el.className = "seg x";
    el.textContent = "In the beginning";
    const p = document.createElement("div");
    p.id = "main";
    p.appendChild(el);
    expect(describeTarget(el)).toBe("div#main>span.seg");
  });
});
