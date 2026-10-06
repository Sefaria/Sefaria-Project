import { QueryClient } from "@tanstack/react-query";
import { afterEach, describe, expect, it, vi } from "vitest";
import { lexiconCompletionQueryOptions } from "~/lib/lexicon/completion";
import { entitySearchQueryOptions } from "./entity-search";

// @feature SRC-109
describe("search caches", () => {
  afterEach(() => vi.unstubAllGlobals());
  it("the same entity search or dictionary completion twice asks the server once", async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({ hits: [], total: 0 })));
    vi.stubGlobal("fetch", fetchMock);
    const qc = new QueryClient();
    await qc.fetchQuery(entitySearchQueryOptions("light", "book"));
    await qc.fetchQuery(entitySearchQueryOptions("light", "book"));
    expect(fetchMock).toHaveBeenCalledTimes(1);
    await qc.fetchQuery(entitySearchQueryOptions("light", "topic"));
    expect(fetchMock).toHaveBeenCalledTimes(2);
    fetchMock.mockImplementation(async () => new Response("[]"));
    await qc.fetchQuery(lexiconCompletionQueryOptions("אור"));
    await qc.fetchQuery(lexiconCompletionQueryOptions("אור"));
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });
});
