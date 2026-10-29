// @feature SHL-035
import { afterEach, describe, expect, it, vi } from "vitest";
import { index } from "@vendor/sefaria-toolkit/client/runtime";
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

// CODE_REVIEW low: direct fetches (calendars, name, topics-toc, search, completion) bypassed the error model
describe("apiJson", () => {
  it("returns the JSON of a good answer", async () => {
    const { apiJson } = await import("./client");
    expect(await apiJson(new Response('{"a":1}', { status: 200 }), "X")).toEqual({ a: 1 });
    expect(await apiJson(new Response("[1,2]", { status: 200 }), "X")).toEqual([1, 2]);
  });
  it("throws SefariaApiError for an HTTP error, a non-JSON body and a 200 {error}", async () => {
    const { apiJson, SefariaApiError } = await import("./client");
    await expect(apiJson(new Response("nope", { status: 404 }), "Name x")).rejects.toMatchObject({ name: "SefariaApiError", status: 404, message: "Name x: HTTP 404" });
    await expect(apiJson(new Response("<html>bad gateway</html>", { status: 200 }), "Search")).rejects.toBeInstanceOf(SefariaApiError);
    await expect(apiJson(new Response('{"error":"No such topic"}', { status: 200 }), "Topic t")).rejects.toMatchObject({ message: "Topic t: No such topic", status: 200 });
  });
});
