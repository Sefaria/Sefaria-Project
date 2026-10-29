import { describe, expect, it } from "vitest";
import { SefariaApiError } from "~/lib/api/client";
import { shouldRetry } from "./query-client";

// CODE_REVIEW R-17: every 404 was retried (≈ +1 s on every bad or old link)
describe("shouldRetry", () => {
  it("never retries an answer that will not change", () => {
    expect(shouldRetry(0, new SefariaApiError("no", 404))).toBe(false);
    expect(shouldRetry(0, new SefariaApiError("bad", 400))).toBe(false);
    const contract = Object.assign(new Error("shape"), { name: "SefariaContractError" });
    expect(shouldRetry(0, contract)).toBe(false);
  });
  it("retries the API's trouble once, in the browser", () => {
    expect(shouldRetry(0, new SefariaApiError("busy", 503))).toBe(true);
    expect(shouldRetry(0, new SefariaApiError("slow down", 429))).toBe(true);
    expect(shouldRetry(0, new TypeError("network"))).toBe(true);
    expect(shouldRetry(1, new SefariaApiError("busy", 503))).toBe(false);
  });
});

// CODE_REVIEW R-39: an observer unmounting mid-fetch cancelled the fetch a route loader was awaiting ("CancelledError" page)
describe("a fetch cancelled under its callers", () => {
  it("is fetched again for a caller that was waiting on it (fetchQuery and ensureQueryData)", async () => {
    const { makeQueryClient } = await import("./query-client");
    const qc = makeQueryClient();
    let calls = 0;
    const options = {
      queryKey: ["text", "Genesis 1"],
      queryFn: ({ signal }: { signal: AbortSignal }) =>
        new Promise<string>((resolve, reject) => {
          calls++;
          const t = setTimeout(() => resolve("data"), 20);
          signal.addEventListener("abort", () => (clearTimeout(t), reject(new Error("aborted"))));
        }),
    };
    const waiting = qc.ensureQueryData(options);
    await new Promise((r) => setTimeout(r, 0));
    // what an unmounting observer does when the fetch read its signal
    await qc.getQueryCache().find({ queryKey: ["text", "Genesis 1"] })!.cancel({ revert: true });
    await expect(waiting).resolves.toBe("data");
    expect(calls).toBe(2);
  });
});
