import { describe, expect, it } from "vitest";
import { interfaceCookieDomain, interfaceLanguageResponse, safeNext } from "./interface-language";

// @feature RTE-034 @feature I18-007
describe("interface language switch", () => {
  it("sets the cookie and goes back to next", () => {
    const r = interfaceLanguageResponse("hebrew", "/Genesis.1?lang=he");
    expect(r.status).toBe(302);
    expect(r.headers.get("Location")).toBe("/Genesis.1?lang=he");
    expect(r.headers.get("Set-Cookie")).toBe("interfaceLang=hebrew; Path=/");
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
  it("a DEL or C1 character never turns next into another site or a scheme in the Location (/interface/english?next=%7F//evil.example)", () => {
    for (const bad of ["\x7f//evil.example", "\u0085//evil.example", "\x7fhttps://evil.example", "java\x7fscript:alert(1)", "/..//evil.example"]) {
      expect(interfaceLanguageResponse("english", bad).headers.get("Location"), JSON.stringify(bad)).toBe("/");
    }
  });
  it("only the two languages exist", () => {
    expect(interfaceLanguageResponse("klingon", "/").status).toBe(404);
  });
});

const PROD = {
  en: { library: "https://www.sefaria.org", voices: "https://voices.sefaria.org" },
  he: { library: "https://www.sefaria.org.il", voices: "https://chiburim.sefaria.org.il" },
};
const STAGE = {
  en: { library: "https://www.sefariastaging.org", voices: "https://voices.sefariastaging.org" },
  he: { library: "https://www.sefariastaging-il.org", voices: "https://chiburim.sefariastaging-il.org" },
};
const CAULDRON = {
  en: { library: "https://reader.cauldron.sefaria.org", voices: "https://voices.reader.cauldron.sefaria.org" },
  he: { library: "https://reader.cauldron.sefaria.org", voices: "https://voices.reader.cauldron.sefaria.org" },
};
const LOCAL = { en: { library: "http://localhost:8000", voices: "http://voices.localhost:8000" }, he: { library: "http://localhost:8000", voices: "http://voices.localhost:8000" } };
const cookies = (r: Response) => r.headers.getSetCookie();

// v-security nit 5, owner decision 2026-11-10: the cookie exactly as reader/views.py interface_language_redirect sets it
// (curl https://www.sefaria.org/interface/english: "interfaceLang=english; Domain=.sefaria.org; Path=/")
describe("the interfaceLang cookie, as legacy sets it", () => {
  it("www.sefaria.org: on .sefaria.org, a session cookie, after expiring a host-only one that would shadow it", () => {
    const r = interfaceLanguageResponse("english", "/texts", { host: "www.sefaria.org", modules: PROD });
    expect(cookies(r)).toEqual(["interfaceLang=; Max-Age=0; Path=/", "interfaceLang=english; Domain=.sefaria.org; Path=/"]);
    expect(r.headers.get("Location")).toBe("/texts");
  });
  it("the .il hosts use .sefaria.org.il; the Voices host shares its language's domain", () => {
    expect(interfaceCookieDomain("www.sefaria.org.il", PROD)).toBe(".sefaria.org.il");
    expect(interfaceCookieDomain("chiburim.sefaria.org.il", PROD)).toBe(".sefaria.org.il");
    expect(interfaceCookieDomain("voices.sefaria.org", PROD)).toBe(".sefaria.org");
  });
  it("staging-style hosts: their own suffix; a cauldron (not pinned) the suffix common to every language", () => {
    expect(cookies(interfaceLanguageResponse("english", "/", { host: "www.sefariastaging.org", modules: STAGE }))[1]).toBe("interfaceLang=english; Domain=.sefariastaging.org; Path=/");
    expect(interfaceCookieDomain("www.sefariastaging-il.org", STAGE)).toBe(".sefariastaging-il.org");
    expect(cookies(interfaceLanguageResponse("hebrew", "/", { host: "reader.cauldron.sefaria.org", modules: CAULDRON }))[1]).toBe("interfaceLang=hebrew; Domain=.reader.cauldron.sefaria.org; Path=/");
  });
  it("localhost, or no DOMAIN_MODULES: host-only, and nothing to expire", () => {
    expect(cookies(interfaceLanguageResponse("hebrew", "/", { host: "localhost:3000", modules: LOCAL }))).toEqual(["interfaceLang=hebrew; Path=/"]);
    expect(cookies(interfaceLanguageResponse("hebrew", "/", { host: "localhost:3000", modules: null }))).toEqual(["interfaceLang=hebrew; Path=/"]);
  });
  it("a language on another domain: next goes there with set-language-cookie (the cookie is still set here)", () => {
    const r = interfaceLanguageResponse("hebrew", "/Genesis.1?lang=he", { host: "www.sefaria.org", modules: PROD });
    expect(r.headers.get("Location")).toBe("https://www.sefaria.org.il/Genesis.1?lang=he&set-language-cookie=");
    expect(cookies(r)[1]).toBe("interfaceLang=hebrew; Domain=.sefaria.org; Path=/");
    expect(interfaceLanguageResponse("english", "/texts", { host: "www.sefaria.org.il", modules: PROD }).headers.get("Location")).toBe("https://www.sefaria.org/texts?set-language-cookie=");
    // the module is kept: Voices goes to the other language's Voices host
    expect(interfaceLanguageResponse("hebrew", "/sheets/1", { host: "voices.sefaria.org", modules: PROD }).headers.get("Location")).toBe("https://chiburim.sefaria.org.il/sheets/1?set-language-cookie=");
    // same host for both languages: no switch
    expect(interfaceLanguageResponse("hebrew", "/texts", { host: "localhost:8000", modules: LOCAL }).headers.get("Location")).toBe("/texts");
  });
});
