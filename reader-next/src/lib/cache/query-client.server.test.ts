// @vitest-environment node
import { describe, expect, it } from "vitest";
import { makeQueryClient } from "./query-client";

// CODE_REVIEW low: a per-request client on the server kept each query's 6-hour gc timer, holding the request's data in memory for hours
describe("the server's per-request query client", () => {
  it("schedules no gc timer, whatever gcTime a query asks for", async () => {
    const client = makeQueryClient();
    await client.fetchQuery({ queryKey: ["text", "Genesis 1"], queryFn: async () => "data", gcTime: 6 * 60 * 60_000 });
    const query = client.getQueryCache().find({ queryKey: ["text", "Genesis 1"] })!;
    expect(query.gcTime).toBe(Infinity);
    expect((query as unknown as { gcTimeout?: unknown }).gcTimeout).toBeUndefined();
  });
});
