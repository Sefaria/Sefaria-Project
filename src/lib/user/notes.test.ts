import { describe, expect, it } from "vitest";
import { refsForSave } from "./notes";

// review F01 (2026-10-29): editing a note while another verse was selected moved the note there
describe("refsForSave", () => {
  it("a new note goes on the selected verses", () => {
    expect(refsForSave(undefined, ["Genesis 1:2", "Genesis 1:3"])).toEqual(["Genesis 1:2", "Genesis 1:3"]);
  });
  it("an edited note stays on its own verses, whatever is selected now", () => {
    expect(refsForSave({ anchorRef: "Genesis 1:1" }, ["Genesis 1:5"])).toEqual(["Genesis 1:1"]);
  });
  it("an edited note whose place is unknown is not saved anywhere", () => {
    expect(refsForSave({}, ["Genesis 1:5"])).toBeNull();
  });
});
