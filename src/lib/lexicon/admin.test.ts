import { describe, expect, it } from "vitest";
import { assignAt, contentDraft, lexiconIdentity, lexiconNameOf } from "./admin";

const section = { indexTitle: "Jastrow", sectionRef: "Jastrow, אב I", categories: ["Reference", "Dictionary"] };

// @feature CON-072
describe("lexicon admin (the old LexiconEntryEditBox)", () => {
  it("finds the lexicon on the index or on its DictionaryNode", () => {
    expect(lexiconNameOf({ lexiconName: "Jastrow Dictionary" })).toBe("Jastrow Dictionary");
    expect(lexiconNameOf({ schema: { nodes: [{ nodes: [{ lexiconName: "BDB Dictionary" }] }] } })).toBe("BDB Dictionary");
    expect(lexiconNameOf({})).toBeUndefined();
  });

  it("reads the headword after '<index title>, ' and refuses anything else", () => {
    expect(lexiconIdentity(section, "Jastrow Dictionary")).toEqual({ lexiconName: "Jastrow Dictionary", headword: "אב I" });
    expect(lexiconIdentity({ ...section, categories: ["Tanakh"] }, "Jastrow Dictionary")).toBeNull();
    expect(lexiconIdentity({ ...section, sectionRef: "Other, אב" }, "Jastrow Dictionary")).toBeNull();
    expect(lexiconIdentity(section, undefined)).toBeNull();
  });

  it("drafts only the content fields, and sets a nested string without touching the rest", () => {
    const draft = contentDraft({ entry: { headword: "אב", content: { senses: [{ definition: "father" }] }, notes: "n" }, content_attr_names: ["content", "notes", "missing"] });
    expect(draft).toEqual({ content: { senses: [{ definition: "father" }] }, notes: "n" });
    const next = assignAt(draft, ["content", "senses", 0, "definition"], "<b>father</b>");
    expect(next).toEqual({ content: { senses: [{ definition: "<b>father</b>" }] }, notes: "n" });
    expect(draft.content).toEqual({ senses: [{ definition: "father" }] });
  });
});
