import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { previewPolicy, withPolicy } from "~/features/assets/source";
import { htmlTitle, readManifest } from "./manifest";
import { fromAssetSchema, isReady, rateLimiter } from "./protocol";
import { SHIM_SOURCE } from "./shim";

const SAMPLE = readFileSync("public/assets/samples/seven-days.html", "utf8");
const page = (manifest: string) => `<!doctype html><html><head><title>T</title><script type="application/json" id="sefaria-asset">${manifest}</script></head><body></body></html>`;

// @feature SHL-094 Asset protocol
describe("the asset manifest", () => {
  it("reads the sample's manifest", () => {
    const r = readManifest(SAMPLE);
    expect(r.ok && r.manifest.title).toBe("The Seven Days");
    expect(r.ok && r.manifest.refs.map((x) => x.ref)).toEqual(["Genesis 1:1-5", "Genesis 1:6-8", "Genesis 1:9-13", "Genesis 1:14-19", "Genesis 1:20-23", "Genesis 1:24-31", "Genesis 2:1-3"]);
  });

  it("says what is wrong, in words an author can act on", () => {
    expect(readManifest("<html></html>")).toEqual({ ok: false, error: expect.stringContaining('id="sefaria-asset"') });
    expect(readManifest(page("{nope"))).toEqual({ ok: false, error: expect.stringContaining("not valid JSON") });
    expect(readManifest(page('{"v":1,"title":"x","refs":[]}'))).toEqual({ ok: false, error: expect.stringContaining('"refs"') });
    expect(readManifest(page('{"v":2,"title":"x","refs":[{"ref":"Genesis 1"}]}'))).toEqual({ ok: false, error: expect.stringContaining('"v"') });
    expect(readManifest(page('{"v":1,"title":"x","refs":[{"ref":"Genesis 1"}]}') + page('{"v":1,"title":"y","refs":[{"ref":"Genesis 2"}]}'))).toEqual({ ok: false, error: expect.stringContaining("More than one") });
  });

  it("falls back to the page's <title>", () => {
    expect(htmlTitle(page("{}"))).toBe("T");
  });
});

// @feature SHL-094 Asset protocol
describe("the asset's messages", () => {
  it("accepts only place and open with a ref, and a hello of this version", () => {
    expect(fromAssetSchema.safeParse({ type: "place", ref: "Genesis 1:3" }).success).toBe(true);
    expect(fromAssetSchema.safeParse({ type: "open", ref: "Psalms 104:19" }).success).toBe(true);
    expect(fromAssetSchema.safeParse({ type: "navigate", url: "https://evil.example" }).success).toBe(false);
    expect(fromAssetSchema.safeParse({ type: "place", ref: "" }).success).toBe(false);
    expect(isReady({ type: "sefaria:ready", v: 1 })).toBe(true);
    expect(isReady({ type: "sefaria:ready", v: 2 })).toBe(false);
  });

  it("drops an asset's messages beyond ten a second", () => {
    let t = 0;
    const allow = rateLimiter(10, () => t);
    const first = Array.from({ length: 15 }, () => allow()).filter(Boolean).length;
    expect(first).toBe(10);
    t = 500;
    expect(Array.from({ length: 10 }, () => allow()).filter(Boolean).length).toBe(5);
  });

  it("the sample inlines the reference shim, byte for byte", () => {
    expect(SAMPLE).toContain(SHIM_SOURCE);
  });
});

// @feature SHL-093 Asset panel
describe("a previewed page's policy", () => {
  it("is the first thing in the head: no network beyond the trusted CDNs, no forms, no frames", () => {
    const html = withPolicy("<!doctype html><html><head><title>x</title></head></html>");
    expect(html).toMatch(/^<!doctype html><html><head><meta http-equiv="Content-Security-Policy"/);
    const policy = previewPolicy();
    expect(policy).toContain("default-src 'none'");
    expect(policy).toContain("connect-src 'none'");
    expect(policy).toContain("form-action 'none'");
    expect(policy).toContain("https://cdnjs.cloudflare.com");
  });

  it("goes first in a page with no head too", () => {
    expect(withPolicy("<p>hi</p>")).toMatch(/^<meta http-equiv="Content-Security-Policy"[^>]*><p>hi<\/p>$/);
  });
});
