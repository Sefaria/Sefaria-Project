// @vitest-environment node
import { describe, expect, it } from "vitest";
import { serverCatalogTree } from "./toc";

// Regression: each server request (its own query client) fetched and parsed the 3.5 MB catalog again
describe("the server's shared catalog", () => {
  it("is fetched once for many requests, and again once it is old", async () => {
    const t0 = 1_000_000;
    const a = serverCatalogTree(t0);
    expect(serverCatalogTree(t0 + 1000)).toBe(a);
    expect((await a).length).toBeGreaterThan(5);
    const b = serverCatalogTree(t0 + 11 * 60_000);
    expect(b).not.toBe(a);
    // the test waits for what it started (a fetch still in flight when the file's server closed failed the run)
    expect((await b).length).toBeGreaterThan(5);
  });
});
