import { describe, expect, it } from "vitest";
import related from "../../../fixtures/api/genesis-1/related.json";
import { formatClipTime, manuscriptsForRefs, mediaForRefs } from "./media";
import { groupByRef } from "./related";

const manuscripts = groupByRef(related.manuscripts as never[]);
const media = groupByRef(related.media as never[]);

// @feature CON-060 @feature CON-059
describe("manuscripts and readings for a passage (Genesis 1:1, as on sefaria.org)", () => {
  it("the Leningrad Codex page that covers verse 1", () => {
    const m = manuscriptsForRefs(manuscripts, ["Genesis 1:1"]);
    expect(m).toHaveLength(1);
    expect(m[0]!.manuscript.title).toBe("Leningrad Codex (1008 CE)");
    expect(m[0]!.page_id).toBe("LC_Folio_1v");
  });
  it("a page covering several selected verses is listed once", () => {
    expect(manuscriptsForRefs(manuscripts, ["Genesis 1:1", "Genesis 1:2", "Genesis 1:3"])).toHaveLength(1);
  });
  it("the PocketTorah clip for verse 1, with its start and end", () => {
    const clips = mediaForRefs(media, ["Genesis 1:1"]);
    expect(clips).toHaveLength(1);
    expect(clips[0]!.source).toBe("PocketTorah");
    expect(Number(clips[0]!.end_time) - Number(clips[0]!.start_time)).toBeCloseTo(6.99, 1); // "0:06"
  });
  it("nothing for a verse without either", () => {
    expect(manuscriptsForRefs(manuscripts, ["Exodus 1:1"])).toEqual([]);
    expect(mediaForRefs(undefined, ["Genesis 1:1"])).toEqual([]);
  });
  it("clip times as the old player prints them", () => {
    expect(formatClipTime(0)).toBe("0:00");
    expect(formatClipTime(6.99)).toBe("0:06");
    expect(formatClipTime(65)).toBe("1:05");
    expect(formatClipTime(-3)).toBe("0:00");
    expect(formatClipTime(NaN)).toBe("0:00");
  });
});
