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
    for (const bad of ["https://evil.example/", "//evil.example", "/\\evil.example", "javascript:alert(1)", "", null]) expect(safeNext(bad as string)).toBe("/");
    // CODE_REVIEW R-03: browsers drop tabs and newlines while parsing, so these are //evil.example
    for (const bad of ["/\t/evil.example", "/\n/evil.example", "/\r\n/evil.example", "\t//evil.example"]) expect(safeNext(bad)).toBe("/");
    expect(interfaceLanguageResponse("english", "/\t/evil.example").headers.get("Location")).toBe("/");
    // a control character inside an allowed path never reaches the Location header
    expect(interfaceLanguageResponse("english", "/a\r\nSet-Cookie: x=1").headers.get("Location")).not.toMatch(/[\r\n]/);
    expect(safeNext("/Berakhot.2a?lang=bi&with=all")).toBe("/Berakhot.2a?lang=bi&with=all");
  });
  it("only the two languages exist", () => {
    expect(interfaceLanguageResponse("klingon", "/").status).toBe(404);
  });
});
