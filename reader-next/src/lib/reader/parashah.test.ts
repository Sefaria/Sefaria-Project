import { describe, expect, it } from "vitest";
import { readFixture } from "../../../test/msw/fixtures";
import { normaliseTexts, type RawTextsResponse } from "~/lib/text/model";
import { parashahHeader, showsParashahHeaders } from "./parashah";

const load = (slug: string) => normaliseTexts(readFixture<RawTextsResponse>(`${slug}/v3-texts.json`));

// @feature TXT-002 @feature TXT-003 @feature TXT-004
describe("Torah", () => {
  const p = load("genesis-1");
  it("shows headers for the Torah", () => expect(showsParashahHeaders(p)).toBe(true));

  it("attaches the parasha start to the first verse", () => {
    expect(p.segments[0]!.alt).toMatchObject({ whole: true, parasha_en: "Bereshit", aliyah_en: "First" });
    expect(p.segments[1]!.alt).toBeUndefined();
  });

  it("aliyot off: just the parasha name at its start", () => {
    expect(parashahHeader(p, p.segments[0]!, false)).toEqual({ en: "Bereshit", he: "בראשית", parashaTitle: true });
    expect(parashahHeader(p, p.segments[1]!, false)).toBeNull();
  });

  it("aliyot on: parasha and aliyah", () => {
    expect(parashahHeader(p, p.segments[0]!, true)).toEqual({ en: "Bereshit: First", he: "בראשית: ראשון", parashaTitle: false });
  });

  it("a verse range aligns the marker to the first requested verse", () => {
    const r = load("genesis-1-1-5");
    expect(r.segments[0]!.ref).toBe("Genesis 1:1");
    expect(parashahHeader(r, r.segments[0]!, false)?.en).toBe("Bereshit");
  });
});

describe("Onkelos", () => {
  it("is treated as Torah", () => {
    const p = load("onkelos-genesis-1");
    expect(showsParashahHeaders(p)).toBe(true);
    expect(parashahHeader(p, p.segments[0]!, true)?.en).toBe("Bereshit: First");
  });
});

describe("commentary and other alt structures", () => {
  it("Rashi on Genesis has alts but shows no parasha headers", () => {
    const p = load("rashi-on-genesis-1");
    expect(showsParashahHeaders(p)).toBe(false);
    for (const s of p.segments) expect(parashahHeader(p, s, true)).toBeNull();
  });

  it("Psalms (daily division, no aliyah keys) never produces a header or crashes", () => {
    const p = load("psalms-23");
    expect(p.segments.some((s) => s.alt)).toBe(true);
    for (const s of p.segments) expect(parashahHeader(p, s, true)).toBeNull();
  });

  it("Isaiah (empty alts) is fine", () => {
    const p = load("isaiah-40");
    expect(p.segments.every((s) => !s.alt)).toBe(true);
  });

  it("Talmud chapter markers attach to segments but are not parasha headers", () => {
    const p = load("berakhot-2a");
    expect(p.segments[0]!.alt?.en?.[0]).toMatch(/Chapter 1/);
    expect(parashahHeader(p, p.segments[0]!, true)).toBeNull();
  });
});
