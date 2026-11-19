import { describe, expect, it } from "vitest";
import type { VersionMeta } from "~/lib/text/model";
import { versionDraft, versionFlagsPayload } from "./admin";

const v = { versionTitle: "The Koren Jerusalem Bible", language: "en", license: "CC-BY", priority: 2, versionNotes: "", isPrimary: false, status: undefined } as unknown as VersionMeta;

// @feature VER-030
describe("version flags payload (the old saveVersionUpdate)", () => {
  it("sends every field with a value or that changed, never versionTitle itself", () => {
    const draft = { ...versionDraft(v), versionNotes: "", license: "", status: "locked" };
    expect(versionFlagsPayload(v, draft)).toEqual({ license: "", priority: 2, status: "locked" });
  });

  it("sends a changed title as newVersionTitle", () => {
    const p = versionFlagsPayload(v, { ...versionDraft(v), versionTitle: "Koren" });
    expect(p.newVersionTitle).toBe("Koren");
    expect(p).not.toHaveProperty("versionTitle");
  });
});
