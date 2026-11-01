import { describe, expect, it } from "vitest";
import { acceptsUrl } from "./safe-url";

describe("acceptsUrl", () => {
  it.each([
    "/Genesis.1",
    "/Genesis.1?lang=bi&aliyot=0",
    "/Genesis.1.1?with=Rashi&lang2=en",
    "/Mishneh_Torah,_Shabbat.1.1",
    "/%D7%91%D7%A8%D7%90%D7%A9%D7%99%D7%AA.1",
    "/בראשית.1",
    "/",
    "/texts",
    "/search?q=light",
    "/Genesis.1#top",
    "/Genesis.1?q=http://x", // a scheme in the query is only text
  ])("accepts the same-site path %s", (url) => expect(acceptsUrl(url)).toBe(true));

  it.each([
    ["protocol-relative", "//evil.com"],
    ["protocol-relative with path", "//evil.com/Genesis.1"],
    ["backslash", "/\\evil.com"],
    ["backslash later", "/Genesis\\1"],
    ["javascript:", "javascript:alert(1)"],
    ["data:", "data:text/html,<script>alert(1)</script>"],
    ["absolute", "https://evil.com/Genesis.1"],
    ["absolute same-looking", "https://www.sefaria.org/Genesis.1"],
    ["relative without slash", "Genesis.1"],
    ["empty", ""],
    ["encoded slashes", "/%2F%2Fevil.com"],
    ["encoded slash after slash", "/%2Fevil.com"],
    ["encoded backslash", "/%5Cevil.com"],
    ["scheme in path", "/x/https://evil.com"],
    ["tab", "/\t/evil.com"],
    ["newline", "/\n/evil.com"],
    ["null byte", "/Genesis.1\u0000"],
    ["malformed escape", "/%E0%A4%A"],
    ["Django page", "/api/texts/Genesis.1"],
    ["Django page: topics", "/topics/moses"],
    ["Django page: sheets", "/sheets/1"],
    ["Django page by dot segments", "/Genesis/../api/texts"],
    ["Django page by encoded dot segments", "/x/%2e%2e/admin"],
    ["Django page: admin", "/admin"],
  ])("refuses %s", (_name, url) => expect(acceptsUrl(url)).toBe(false));

  it("refuses non-strings and very long urls", () => {
    expect(acceptsUrl(undefined)).toBe(false);
    expect(acceptsUrl(null)).toBe(false);
    expect(acceptsUrl({ toString: () => "/Genesis.1" })).toBe(false);
    expect(acceptsUrl(`/${"a".repeat(5000)}`)).toBe(false);
  });
});
