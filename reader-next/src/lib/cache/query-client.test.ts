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
