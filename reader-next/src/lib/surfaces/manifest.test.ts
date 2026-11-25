import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { z } from "zod";
import { surfaceManifestSchema } from "../../../contract/surface-manifest.v1";
import { allowedUrl, ManifestError, resolveManifest } from "./manifest";

const H = `sha384-${"A".repeat(64)}`;
const ORIGIN = "https://social.example.org";
const URL0 = `${ORIGIN}/releases/manifest.json`;
const good = { version: "2026.11.23-1", contract: 1, entry: "v1/entry.js", integrity: H, files: [{ path: "v1/chunk.js", integrity: H }, { path: "v1/s.css", integrity: H }], css: ["v1/s.css"] };

// @feature SHL-077
describe("the surface manifest", () => {
  it("resolves every path against the manifest's URL", () => {
    const m = resolveManifest(good, URL0, [ORIGIN]);
    expect(m.entry).toEqual({ url: `${ORIGIN}/releases/v1/entry.js`, integrity: H });
    expect(m.files.map((f) => f.url)).toEqual([`${ORIGIN}/releases/v1/chunk.js`, `${ORIGIN}/releases/v1/s.css`]);
    expect(m.css.map((f) => f.url)).toEqual([`${ORIGIN}/releases/v1/s.css`]);
  });

  it("refuses a malformed manifest", () => {
    const bad = [
      { ...good, integrity: "md5-abc" },
      { ...good, entry: "javascript:alert(1)" },
      { ...good, entry: "//evil.example/x.js" },
      { ...good, extra: 1 },
      { ...good, css: ["not-listed.css"] },
      { ...good, version: "has space" },
      { ...good, files: [{ path: "x.js" }] },
      null,
      "manifest",
    ];
    for (const b of bad) expect(() => resolveManifest(b, URL0, [ORIGIN]), JSON.stringify(b)).toThrow(ManifestError);
  });

  it("refuses a contract major this reader does not serve", () => {
    expect(() => resolveManifest({ ...good, contract: 2 }, URL0, [ORIGIN])).toThrow(/contract 2 is not served/);
  });

  it("refuses a file on an origin that is not allowed, or not https", () => {
    expect(() => resolveManifest({ ...good, entry: "https://cdn.evil.example/entry.js" }, URL0, [ORIGIN])).toThrow(/not on an allowed origin/);
    expect(() => resolveManifest(good, "http://social.example.org/manifest.json", ["http://social.example.org"])).toThrow(/not on an allowed origin/);
    expect(allowedUrl("http://localhost:3200/entry.js", ["http://localhost:3200"])).toBe(true);
    expect(allowedUrl("https://user:pw@social.example.org/x.js", [ORIGIN])).toBe(false);
    expect(allowedUrl("not a url", [ORIGIN])).toBe(false);
  });

  it("the committed JSON Schema is the zod schema's (node --experimental-strip-types scripts/surface-manifest-schema.mjs)", () => {
    const file = JSON.parse(readFileSync(join(__dirname, "../../../contract/surface-manifest.v1.schema.json"), "utf8"));
    const { $id: _id, title: _title, ...rest } = file;
    expect(rest).toEqual(JSON.parse(JSON.stringify(z.toJSONSchema(surfaceManifestSchema, { unrepresentable: "any" }))));
  });
});
