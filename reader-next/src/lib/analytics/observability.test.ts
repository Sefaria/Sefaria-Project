import { beforeEach, describe, expect, it, vi } from "vitest";
import { analyticsLog } from "./core";
import { keywordTargets, readerAnalytics } from "./reader";
import { clsOf, describeTarget, inpOf, rate, sendVital, vitalsEnabled } from "./web-vitals";

beforeEach(() => {
  analyticsLog.length = 0;
  delete (window as { ga?: unknown }).ga;
  delete (window as { gtag?: unknown }).gtag;
});

// @feature ANL-009
describe("display options click (onclick_ToolTipped)", () => {
  it("sends the old ToolTipped event with ReaderApp's keywordTargets", () => {
    const gtag = vi.fn();
    Object.assign(window, { gtag });
    // the legacy page sent exactly these on Genesis 1 with the sidebar on 1:1 (parity diff, 2026-11-10)
    readerAnalytics.displayOptionsClicked({ categories: ["Tanakh", "Torah"], book: "Genesis", refs: ["Genesis 1", "Genesis 1:1"], interfaceLang: "english" });
    expect(gtag).toHaveBeenCalledWith("event", "onclick_ToolTipped", { classes: "readerOptionsTooltip tooltip-toggle", keywordTargets: ["tanakh", "torah", "genesis", "genesis 1", "genesis 1:1"], interfaceLang: "english" });
    expect(keywordTargets({ categories: ["Tanakh"], book: "Genesis", refs: ["Genesis 1"] })).toEqual(["tanakh", "genesis", "genesis 1"]);
  });
  it("sends no Universal Analytics hit for a ua event (owner decision 2026-11-10)", () => {
    const ga = Object.assign(vi.fn(), { getAll: () => [{ get: () => "gtm1" }] });
    Object.assign(window, { ga });
    readerAnalytics.segmentClicked("Genesis 1:1", true);
    expect(ga).not.toHaveBeenCalled();
    expect(analyticsLog.map((e) => e.name)).toEqual(["Reader|Text Segment Click", "Reader|Open Connections Panel"]);
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
