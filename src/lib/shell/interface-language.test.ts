import { describe, expect, it } from "vitest";
import { interfaceLanguageResponse, safeNext } from "./interface-language";

// @feature RTE-034 @feature I18-007
describe("interface language switch", () => {
  it("sets the cookie and goes back to next", () => {
    const r = interfaceLanguageResponse("hebrew", "/Genesis.1?lang=he");
    expect(r.status).toBe(302);
    expect(r.headers.get("Location")).toBe("/Genesis.1?lang=he");
    expect(r.headers.get("Set-Cookie")).toMatch(/^interfaceLang=hebrew; Path=\//);
  });
  it("only a path on this site is ever followed", () => {
    for (const bad of ["https://evil.example/", "//evil.example", "/\\evil.example", "javascript:alert(1)", "/a\r\nSet-Cookie: x=1", "", null]) expect(safeNext(bad as string)).toBe("/");
    expect(safeNext("/Berakhot.2a?lang=bi&with=all")).toBe("/Berakhot.2a?lang=bi&with=all");
  });
  it("only the two languages exist", () => {
    expect(interfaceLanguageResponse("klingon", "/").status).toBe(404);
  });
});
