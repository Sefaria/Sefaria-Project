import { describe, expect, it } from "vitest";
import { toRouterLocation } from "./RouterLink";

// @feature RTE-056 In-app link interception
describe("toRouterLocation", () => {
  it("sends refs to the reader's splat route", () => {
    expect(toRouterLocation("/Genesis.1.1")).toEqual({ to: "/$", params: { _splat: "Genesis.1.1" } });
  });
  it("carries the query string as search", () => {
    expect(toRouterLocation("/Genesis.1.1?with=Commentary+ConnectionsList&lang=en")).toEqual({
      to: "/$",
      params: { _splat: "Genesis.1.1" },
      search: { with: "Commentary ConnectionsList", lang: "en" },
    });
  });
  it("decodes percent-encoded paths (Hebrew dictionary headwords)", () => {
    expect(toRouterLocation("/Jastrow,_%D7%90_I.1").params?._splat).toBe("Jastrow,_א_I.1");
  });
  it("keeps the home page as a static route", () => {
    expect(toRouterLocation("/")).toEqual({ to: "/" });
  });
  it("preserves an escaped pipe in a filter", () => {
    expect(toRouterLocation("/Genesis.1.1?with=Sforno+on+Genesis%7CQuoting").search).toEqual({ with: "Sforno on Genesis|Quoting" });
  });
});
