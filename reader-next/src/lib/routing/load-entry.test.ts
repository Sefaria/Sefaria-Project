import { describe, expect, it, vi } from "vitest";

describe("load entry", () => {
  it("is the history index the document was loaded at, whatever its key", async () => {
    vi.resetModules();
    const { markLoadEntry, isLoadEntry } = await import("./load-entry");
    expect(isLoadEntry({ __TSR_index: 3 })).toBe(false);
    markLoadEntry({ __TSR_index: 3, __TSR_key: "a" });
    markLoadEntry({ __TSR_index: 4, __TSR_key: "b" }); // only the first call counts
    expect(isLoadEntry({ __TSR_index: 3, __TSR_key: "replaced" })).toBe(true);
    expect(isLoadEntry({ __TSR_index: 4, __TSR_key: "b" })).toBe(false);
    expect(isLoadEntry(undefined)).toBe(false);
  });
});
