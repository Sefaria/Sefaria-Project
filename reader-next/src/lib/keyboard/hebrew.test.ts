import { describe, expect, it } from "vitest";
import { HEBREW_ROWS, keyFace } from "./hebrew";

const none = { shift: false, caps: false, altGr: false };
const find = (face: string) => HEBREW_ROWS.flat().find((k) => k[0] === face)!;

// @feature SRC-017
describe("Hebrew keyboard layout", () => {
  it("five rows; the letter rows are the standard Israeli layout (קראטוןםפ on the QWERTY row)", () => {
    expect(HEBREW_ROWS).toHaveLength(5);
    expect(HEBREW_ROWS[1]!.slice(3, 11).map((k) => keyFace(k, none)).join("")).toBe("קראטוןםפ");
    expect(HEBREW_ROWS[2]!.slice(1, 11).map((k) => keyFace(k, none)).join("")).toBe("שדגכעיחלךף");
  });
  it("Shift gives the second face, Caps too, both cancel; Alt-Gr gives the third where there is one", () => {
    const k = find("ק");
    expect(keyFace(k, { ...none, shift: true })).toBe("E");
    expect(keyFace(k, { ...none, caps: true })).toBe("E");
    expect(keyFace(k, { shift: true, caps: true, altGr: false })).toBe("ק");
    expect(keyFace(k, { ...none, altGr: true })).toBe("€");
    expect(keyFace(find("ש"), { ...none, altGr: true })).toBe("ש");
  });
  it("controls keep their names", () => {
    expect(keyFace(["Shift", "Shift"], { ...none, shift: true })).toBe("Shift");
  });
});
