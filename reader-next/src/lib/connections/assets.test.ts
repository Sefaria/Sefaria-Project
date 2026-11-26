import { afterEach, describe, expect, it, vi } from "vitest";
import { assetsForRefs, fetchPassageAssets, type PassageAsset } from "./assets";

vi.mock("~/lib/config", () => ({ PUBLIC_CONFIG: { social: { apiOrigin: "https://social.example.org" } } }));

const asset = (id: string, anchorRefs: string[]): PassageAsset => ({ id, title: id, anchorRefs, refs: [] });

// @feature CON-075 Interactive pages on a passage
describe("interactive pages on a passage", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("keeps the pages that cover a selected segment", () => {
    const all = [asset("a", ["Genesis 1:1", "Genesis 1:2"]), asset("b", ["Genesis 1:20"])];
    expect(assetsForRefs(all, ["Genesis 1:2"]).map((a) => a.id)).toEqual(["a"]);
    expect(assetsForRefs(all, ["Genesis 1:5"])).toEqual([]);
    expect(assetsForRefs(undefined, ["Genesis 1:5"])).toEqual([]);
  });

  it("asks Social for the section, and validates the answer", async () => {
    const fetch = vi.fn(async () => new Response(JSON.stringify({ ref: "Genesis 1", assets: [asset("a", ["Genesis 1:1"])] })));
    vi.stubGlobal("fetch", fetch);
    expect((await fetchPassageAssets("Genesis 1")).map((a) => a.id)).toEqual(["a"]);
    expect(String((fetch.mock.calls[0] as unknown[])[0])).toBe("https://social.example.org/api/v1/claude-assets/ref/Genesis%201");
  });

  it("a failure, an error status or a malformed answer is simply none", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => { throw new TypeError("network"); }));
    expect(await fetchPassageAssets("Genesis 1")).toEqual([]);
    vi.stubGlobal("fetch", vi.fn(async () => new Response("", { status: 503 })));
    expect(await fetchPassageAssets("Genesis 1")).toEqual([]);
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ assets: [{ title: 3 }] }))));
    expect(await fetchPassageAssets("Genesis 1")).toEqual([]);
  });
});
