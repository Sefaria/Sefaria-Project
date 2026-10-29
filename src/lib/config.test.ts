import { describe, expect, it } from "vitest";
import { serverConfigProblems } from "./config";

// CODE_REVIEW R-35: a broken configuration fails at start, not on every request
describe("serverConfigProblems", () => {
  it("accepts local development (no settings) and the cluster's settings", () => {
    expect(serverConfigProblems({})).toEqual([]);
    expect(serverConfigProblems({ SEFARIA_API_ORIGIN: "http://varnish-prod:8040", SEFARIA_API_HOST: "www.sefaria.org", PUBLIC_API_ORIGIN: "", PUBLIC_SITE_ORIGIN: "" })).toEqual([]);
  });
  it("a server with only a same-origin API has nothing absolute to call", () => {
    expect(serverConfigProblems({ PUBLIC_API_ORIGIN: "" })[0]).toMatch(/no absolute API origin/);
    expect(serverConfigProblems({ SEFARIA_API_ORIGIN: "" })[0]).toMatch(/no absolute API origin/);
  });
  it("catches relative origins, a host without an origin, and bad timeouts", () => {
    expect(serverConfigProblems({ PUBLIC_SITE_ORIGIN: "/site" }).join()).toMatch(/PUBLIC_SITE_ORIGIN/);
    expect(serverConfigProblems({ SEFARIA_API_HOST: "www.sefaria.org" }).join()).toMatch(/SEFARIA_API_HOST/);
    expect(serverConfigProblems({ SEFARIA_API_TIMEOUT_MS: "soon" }).join()).toMatch(/SEFARIA_API_TIMEOUT_MS/);
  });
});
