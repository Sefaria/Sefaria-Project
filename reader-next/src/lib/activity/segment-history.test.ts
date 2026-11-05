import { describe, expect, it } from "vitest";
import { activityVerb, naturalTime, parseDiffHtml, parseSegmentHistoryPath, segmentHistoryHref } from "./segment-history";

// @feature LEG-019 @feature RTE-018
describe("segment history", () => {
  it("reads the address as urls_library.py does", () => {
    expect(parseSegmentHistoryPath("Genesis.1.1/en/The_Koren_Jerusalem_Bible")).toEqual({ ref: "Genesis.1.1", lang: "en", version: "The_Koren_Jerusalem_Bible", page: 1 });
    expect(parseSegmentHistoryPath("Genesis.1.1/en/The_Koren_Jerusalem_Bible/3")).toEqual({ ref: "Genesis.1.1", lang: "en", version: "The_Koren_Jerusalem_Bible", page: 3 });
    expect(parseSegmentHistoryPath("Rashi_on_Genesis.1.1.1/he/On_Your_Way")?.ref).toBe("Rashi_on_Genesis.1.1.1");
    expect(parseSegmentHistoryPath("leaderboard")).toBeNull();
    expect(parseSegmentHistoryPath("some-user/2")).toBeNull();
  });
  it("writes the next page's and a filter's address", () => {
    const h = { url: "/Genesis.1.1", lang: "en", version: "The Koren Jerusalem Bible" };
    expect(segmentHistoryHref(h, 2, null)).toBe("/activity/Genesis.1.1/en/The_Koren_Jerusalem_Bible/2");
    expect(segmentHistoryHref(h, 1, "edit_text")).toBe("/activity/Genesis.1.1/en/The_Koren_Jerusalem_Bible?type=edit_text");
  });
  it("reads diff_prettyHtml into parts, without its markup", () => {
    expect(parseDiffHtml('<span>In the </span><del style="background:#ffe6e6;">begining</del><ins style="background:#e6ffe6;">beginning &lt;b&gt;</ins><span>&para;<br>x</span>')).toEqual([
      { kind: "same", text: "In the " },
      { kind: "del", text: "begining" },
      { kind: "ins", text: "beginning <b>" },
      { kind: "same", text: "¶\nx" },
    ]);
  });
  it("chooses the verb as activity_feed.html", () => {
    expect(activityVerb({ rev_type: "add text", version: "Sefaria Community Translation" }).en).toBe("translated");
    expect(activityVerb({ rev_type: "edit text", version: "X" })).toEqual({ en: "edited", he: "נערך" });
  });
  it("says how long ago, as Django's naturaltime", () => {
    const now = new Date("2026-11-05T12:00:00Z");
    expect(naturalTime("2026-11-05T11:59:30", "en", now)).toBe("now");
    expect(naturalTime("2026-11-05T11:55:00", "en", now)).toBe("5 minutes ago");
    expect(naturalTime("2024-08-01T12:00:00", "en", now)).toBe("2 years, 3 months ago");
  });
});
