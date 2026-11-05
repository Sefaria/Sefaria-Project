import { existsSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { readFixture } from "../../../test/msw/fixtures";
import { normaliseTexts, type RawTextsResponse } from "./model";

interface ManifestEntry { slug: string; ref: string | null; bookType: string; why?: string }
const manifest = readFixture<{ entries: ManifestEntry[] }>("manifest.json").entries.filter(
  (e) => e.ref && existsSync(path.resolve(import.meta.dirname, `../../../fixtures/api/${e.slug}/v3-texts.json`)),
);

// @feature TXD-010 TXT-022 Every book type renders from one model
describe.each(manifest.map((e) => [e.slug, e] as const))("book-type matrix: %s", (_slug, entry) => {
  const raw = readFixture<RawTextsResponse & { error?: string }>(`${entry.slug}/v3-texts.json`);

  it("fixture is a real text response", () => {
    expect(raw.error).toBeUndefined();
    expect(Array.isArray(raw.versions)).toBe(true);
  });

  it("normalises without throwing and yields segments", () => {
    const p = normaliseTexts(raw);
    expect(p.segments.length).toBeGreaterThan(0);
  });

  it("gives every segment a unique ref", () => {
    const p = normaliseTexts(raw);
    const refs = p.segments.map((s) => s.ref);
    expect(new Set(refs).size).toBe(refs.length);
  });

  it("keeps segments inside the sections it reports", () => {
    const p = normaliseTexts(raw);
    for (const s of p.segments) expect(p.sectionRefs).toContain(s.sectionRef);
  });

  it("never loses text: every non-empty source string appears in a segment", () => {
    const p = normaliseTexts(raw);
    const count = (t: unknown): number => (Array.isArray(t) ? t.reduce((n: number, x) => n + count(x), 0) : typeof t === "string" && t.trim() ? 1 : 0);
    const primary = raw.versions.find((v) => v.isPrimary) ?? raw.versions.find((v) => v.isSource);
    const expected = primary ? count(primary.text) : 0;
    const got = p.segments.filter((s) => s.primary?.trim()).length;
    expect(got).toBe(expected);
  });
});
