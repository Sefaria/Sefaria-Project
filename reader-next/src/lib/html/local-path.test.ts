import { describe, expect, it } from "vitest";
import { isLocalPath } from "./local-path";

const BASE = "https://www.sefaria.org";

describe("isLocalPath", () => {
  it("passes a path of this site, with its query and fragment", () => {
    for (const ok of ["/", "/Genesis.1.1", "/II%20Chronicles%2031:8", "/search?q=a%5Cb&tab=text", "/texts#top", "/topics/רג-(ambiguous)", "/a/../b"]) {
      expect(isLocalPath(ok), ok).toBe(true);
      expect(new URL(ok, BASE).origin, ok).toBe(BASE);
    }
  });
  it("refuses every form a browser or a decoding router reads as another site", () => {
    const bad = [
      "//evil.org", "/\\evil.org", "\\\\evil.org", "\\/evil.org", "/\t/evil.org", "/\n/evil.org", "/\r/evil.org", " //evil.org", "\u0001//evil.org",
      "/\u0085/evil.org", "/%2F%2Fevil.org", "/%2fevil.org", "/%5Cevil.org", "/%5cevil.org", "/x/%5C../y", "/x\\y",
      "https://evil.org", "javascript:alert(1)", "evil.org", "./x", "#top", "", " /x", "/x ", "x".repeat(9000),
    ];
    for (const b of bad) expect(isLocalPath(b), JSON.stringify(b)).toBe(false);
    for (const b of [null, undefined, 7, ["/x"]]) expect(isLocalPath(b)).toBe(false);
  });
  it("refuses a dot segment that resolves into //host, and a lone surrogate", () => {
    for (const b of ["/..//evil.org", "/x/..//evil.org", "/.%2e//evil.org", "/%2e%2e/%2f%2fevil.org", "/./%2fevil.org", "/\ud800", "/x\udc00y"]) {
      expect(isLocalPath(b), JSON.stringify(b)).toBe(false);
    }
    expect(isLocalPath("/x/../Genesis.1")).toBe(true);
    expect(isLocalPath("/topics/\ud83d\ude00")).toBe(true);
  });
  it("what it refuses includes what the URL parser takes off this site", () => {
    for (const b of ["//evil.org", "/\\evil.org", "\\\\evil.org", "/\t/evil.org", " //evil.org", "\u0001//evil.org"]) expect(new URL(b, BASE).origin, JSON.stringify(b)).not.toBe(BASE);
  });
});
