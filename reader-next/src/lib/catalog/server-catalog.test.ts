// @vitest-environment node
import { describe, expect, it } from "vitest";
import { serverCatalogTree } from "./toc";

// CODE_REVIEW R-14: each server request (its own query client) fetched and parsed the 3.5 MB catalog again
describe("the server's shared catalog", () => {
  it("is fetched once for many requests, and again once it is old", async () => {
    const t0 = 1_000_000;
    const a = serverCatalogTree(t0);
    expect(serverCatalogTree(t0 + 1000)).toBe(a);
    expect((await a).length).toBeGreaterThan(5);
    expect(serverCatalogTree(t0 + 11 * 60_000)).not.toBe(a);
  });
});
