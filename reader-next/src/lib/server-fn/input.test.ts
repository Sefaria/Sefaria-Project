import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { describe, expect, it } from "vitest";
import { ServerInputError, intIn, isSafePath, isSafeSegment, isSafeText, oneOf, path, record, segment, text } from "./input";

const BAD_SEGMENTS = ["", ".", "..", "a/b", "a\\b", "\\", "/", "a\u0000", "a\tb", "a\nb", "\u007f", "\u0085x", "x".repeat(201)];

describe("server function input checks", () => {
  it("a segment: one non-empty, bounded piece with no dot segment, separator or control character", () => {
    for (const ok of ["Genesis.1.1", "The_Koren_Jerusalem_Bible", "...", ".hidden", "a..b", "רג-(ambiguous)", "x".repeat(200)]) expect(isSafeSegment(ok)).toBe(true);
    for (const bad of [...BAD_SEGMENTS, 7, null, undefined, {}, ["a"]]) expect(isSafeSegment(bad)).toBe(false);
    expect(() => segment("..", "slug")).toThrow(ServerInputError);
  });
  it("a path: every segment safe, so ../ never survives", () => {
    for (const ok of ["Genesis.1.1", "a/b/c", "Rashi on Genesis 1:1:1"]) expect(isSafePath(ok)).toBe(true);
    for (const bad of ["../../x/y", "a/../b", "./a", "a/.", "a//b", "/a", "a/", "a\\..\\b", "a/\u0000", "x".repeat(1001)]) expect(isSafePath(bad)).toBe(false);
    expect(() => path("../../api/x", "ref")).toThrow(/ref/);
  });
  it("text: bounded, no control characters", () => {
    expect(isSafeText("", 5)).toBe(true);
    expect(isSafeText("", 5, 1)).toBe(false);
    expect(isSafeText("abcdef", 5)).toBe(false);
    expect(isSafeText("a\rb", 5)).toBe(false);
    expect(() => text(3, "letter", 5)).toThrow(ServerInputError);
  });
  it("fixed values and numbers", () => {
    expect(oneOf("he", ["en", "he"] as const, "lang")).toBe("he");
    for (const bad of ["fr", "EN", "", undefined, ["en"]]) expect(() => oneOf(bad, ["en", "he"] as const, "lang")).toThrow(/lang/);
    expect(intIn(3, 1, 100, "page")).toBe(3);
    for (const bad of [0, 101, 1.5, "3", Number.NaN, Number.POSITIVE_INFINITY]) expect(() => intIn(bad, 1, 100, "page")).toThrow(/page/);
    expect(record({ a: 1 }, "x")).toEqual({ a: 1 });
    for (const bad of [null, "x", [], 3]) expect(() => record(bad, "x")).toThrow(ServerInputError);
  });
});

/** Every `createServerFn(...)` in the source, with the text up to its `.handler(`. */
function serverFns(): { file: string; chain: string }[] {
  const root = join(__dirname, "../..");
  const out: { file: string; chain: string }[] = [];
  const walk = (dir: string) => {
    for (const name of readdirSync(dir)) {
      const p = join(dir, name);
      if (statSync(p).isDirectory()) walk(p);
      else if (/\.tsx?$/.test(name) && !/\.(test|stories)\.tsx?$/.test(name)) {
        const src = readFileSync(p, "utf8");
        for (const m of src.matchAll(/createServerFn\(/g)) out.push({ file: relative(root, p), chain: src.slice(m.index, src.indexOf(".handler(", m.index)) });
      }
    }
  };
  walk(root);
  return out;
}

describe("every server function", () => {
  const fns = serverFns();
  it("is found", () => expect(fns.length).toBeGreaterThanOrEqual(15));
  it("checks its input at run time: a named validator, never a pass-through, and the current method name", () => {
    for (const { file, chain } of fns) {
      expect(chain, file).not.toMatch(/\.inputValidator\(/);
      const v = /\.validator\(([\s\S]*)\)\s*$/.exec(chain.trim())?.[1];
      if (v === undefined) continue; // takes no input
      expect(v.trim(), `${file}: ${v}`).toMatch(/^[A-Za-z_$][\w$]*$/);
    }
  });
});
