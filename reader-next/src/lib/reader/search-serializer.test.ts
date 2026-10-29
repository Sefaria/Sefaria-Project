import { describe, expect, it } from "vitest";
import { parseSearch, stringifySearch } from "./search-serializer";

// @feature RTE-043 @feature RTE-044 @feature SHL-066
describe("query strings in the old site's format", () => {
  it("reads plain values; + is a space, as the old server reads it", () => {
    expect(parseSearch("?lang=en&with=Commentary+ConnectionsList&aliyot=0&ven=english|The_Koren_Jerusalem_Bible&w2=Rashi%2BRamban")).toEqual({
      lang: "en", with: "Commentary ConnectionsList", aliyot: "0", ven: "english|The_Koren_Jerusalem_Bible", w2: "Rashi+Ramban",
    });
  });
  it("decodes percent escapes and tolerates bad ones", () => {
    expect(parseSearch("w2=Commentary%20ConnectionsList&x=%E0%A4%A")).toEqual({ w2: "Commentary ConnectionsList", x: "%E0%A4%A" });
  });
  it("first value wins for repeated keys; empty and bare keys are kept", () => {
    expect(parseSearch("a=1&a=2&b=&c")).toEqual({ a: "1", b: "", c: "" });
  });
  it("writes without JSON quoting", () => {
    expect(stringifySearch({ lang: "en", aliyot: 0, p2: "Exodus.1", aliyot2: "1", with: "Rashi+Ramban", vhe3: "hebrew|Miqra_according_to_the_Masorah", skip: undefined })).toBe(
      "?lang=en&aliyot=0&p2=Exodus.1&aliyot2=1&with=Rashi%2BRamban&vhe3=hebrew|Miqra_according_to_the_Masorah",
    );
    expect(stringifySearch({ w: "Commentary ConnectionsList" })).toBe("?w=Commentary+ConnectionsList");
    expect(stringifySearch({})).toBe("");
  });
  it("round-trips", () => {
    const s = { lang: "bi", with: "WebPage:www.example.com", w2: "Commentary ConnectionsList", w3: "a+b", p2: "Berakhot.2a.3-5" };
    expect(parseSearch(stringifySearch(s))).toEqual(s);
  });
});
