import { describe, expect, it } from "vitest";
import { makeQueryClient } from "~/lib/cache/query-client";
import { webPagesQueryOptions } from "./webpages";

// @feature CON-052
describe("loading web pages through the typed client", () => {
  it("accepts the live response, which sends null authors and article sources (recorded: Berakhot 2a:1)", async () => {
    const pages = await makeQueryClient().fetchQuery(webPagesQueryOptions("Berakhot 2a:1"));
    expect(pages).toHaveLength(516);
    expect(pages[0]!.authors ?? null).toBeNull();
  });
});
