import { describe, expect, it } from "vitest";
import { toRouterLocation } from "./RouterLink";

// @feature RTE-056 In-app link interception
describe("toRouterLocation", () => {
  it("sends refs as their written path (the $ route matches it)", () => {
    expect(toRouterLocation("/Genesis.1.1")).toEqual({ to: "/Genesis.1.1" });
  });
  // #3790: a splat param is encoded again by the router (%3F → %253F) and a %2F in it became a real slash
  it("keeps escaped title characters escaped", () => {
    expect(toRouterLocation("/Book%2FPart%5CObject.1").to).toBe("/Book%2FPart%5CObject.1");
    expect(toRouterLocation("/What%3F.1").to).toBe("/What%3F.1");
  });
  it("carries the query string as search", () => {
    expect(toRouterLocation("/Genesis.1.1?with=Commentary+ConnectionsList&lang=en")).toEqual({
      to: "/Genesis.1.1",
      search: { with: "Commentary ConnectionsList", lang: "en" },
    });
  });
  it("Hebrew stays as the browser encodes it (the router decodes it for display)", () => {
    expect(toRouterLocation("/Jastrow,_%D7%90_I.1").to).toBe("/Jastrow,_%D7%90_I.1");
  });
  it("keeps the home page as a static route", () => {
    expect(toRouterLocation("/")).toEqual({ to: "/" });
  });
  it("preserves an escaped pipe in a filter", () => {
    expect(toRouterLocation("/Genesis.1.1?with=Sforno+on+Genesis%7CQuoting").search).toEqual({ with: "Sforno on Genesis|Quoting" });
  });
});
