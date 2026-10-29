import { describe, expect, it } from "vitest";
import { isMisnested, repairHtml } from "./repair";

// @feature TXD-025
describe("repairHtml", () => {
  it("leaves well-formed text alone (same string)", () => {
    const s = 'a <i>b</i> <a href="x">c <b>d</b></a><br>e';
    expect(isMisnested(s)).toBe(false);
    expect(repairHtml(s)).toBe(s);
  });
  it("repairs Ramban's mis-nested anchor so a footnote stays whole", () => {
    const s = 'x<i class="footnote">(See <a href="r">Rashi, <i>ibid.</a></i>) It was thus.</i> [Here again]';
    expect(isMisnested(s)).toBe(true);
    const out = repairHtml(s);
    // the footnote ends where the source ends it: after "It was thus."
    expect(out.indexOf("It was thus.")).toBeLessThan(out.lastIndexOf("</i> [Here again]"));
    expect(out).toContain("[Here again]");
  });
  it("closes what was left open", () => {
    expect(repairHtml("a <i>b</i> <b>c")).toBe("a <i>b</i> <b>c</b>");
  });
  it("ignores void tags and plain text", () => {
    expect(isMisnested("a<br>b<img src=x>c")).toBe(false);
    expect(isMisnested("no tags")).toBe(false);
  });
});
