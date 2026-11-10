// @feature NTF-002
import { describe, expect, it } from "vitest";
import { humanizeSeconds, timeAgo } from "./natural-time";

const DAY = 86400;

// Expected strings are humanize-duration 3.28's (the old site's), checked against it on 200,000 random spans while porting.
describe("the old naturalTime (humanize-duration, largest unit, rounded)", () => {
  it("names the largest unit, rounded, in English and Hebrew", () => {
    expect(humanizeSeconds(21 * DAY, "en")).toBe("3 weeks");
    expect(humanizeSeconds(21 * DAY, "he")).toBe("3 שבועות");
    expect(humanizeSeconds(DAY, "en")).toBe("1 day");
    expect(humanizeSeconds(DAY, "he")).toBe("1 יום");
    expect(humanizeSeconds(65 * DAY, "en")).toBe("2 months");
    expect(humanizeSeconds(400 * DAY, "he")).toBe("1 שנה");
    expect(humanizeSeconds(45, "en")).toBe("45 seconds");
  });
  it("rounds the largest unit by what is below it; a whole number of the next unit up becomes that unit", () => {
    expect(humanizeSeconds(3 * 7 * DAY + 5 * DAY, "en")).toBe("4 weeks");
    expect(humanizeSeconds(6.6 * DAY, "en")).toBe("1 week");
    expect(humanizeSeconds(29.9 * DAY, "en")).toBe("4 weeks");
    expect(humanizeSeconds(3599.7, "en")).toBe("1 hour");
    expect(humanizeSeconds(0.4, "en")).toBe("0 seconds");
  });
  it('"<time> ago" and "לפני <time>"', () => {
    const now = 2_000_000_000;
    expect(timeAgo(now - 21 * DAY, "en", now)).toBe("3 weeks ago");
    expect(timeAgo(now - 21 * DAY, "he", now)).toBe("לפני 3 שבועות");
  });
});
