// @feature SHL-035
import { afterEach, describe, expect, it, vi } from "vitest";
import { index } from "@vendor/sefaria-toolkit/client/index";
import { getSefariaClient, SefariaApiError } from "./client";

afterEach(() => vi.unstubAllGlobals());

describe("the API client when the site is down or starting", () => {
  it("a 503 from Varnish becomes a plain 'temporarily unavailable' error, not a contract mismatch", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response("<html>503</html>", { status: 503, headers: { "content-type": "text/html" } })));
    const err = await index.getIndex({ client: getSefariaClient() }).then(() => null, (e: unknown) => e);
    expect(err).toBeInstanceOf(SefariaApiError);
    expect((err as SefariaApiError).status).toBe(503);
    expect((err as Error).message).toMatch(/temporarily unavailable \(HTTP 503\)/);
  });
});
