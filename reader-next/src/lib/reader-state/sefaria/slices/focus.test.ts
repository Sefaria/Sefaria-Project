import { describe, expect, it, vi } from "vitest";
import { createFocusSlice, isFocusValue } from "./focus";

describe("sefaria.focus", () => {
  it("validates", () => {
    expect(isFocusValue(null)).toBe(true);
    expect(isFocusValue({ panelKey: "k1" })).toBe(true);
    expect(isFocusValue({ panelKey: "" })).toBe(false);
    expect(isFocusValue({ panelKey: 3 })).toBe(false);
    expect(isFocusValue("k1")).toBe(false);
  });

  it("applies only the panel key", () => {
    const apply = vi.fn();
    const slice = createFocusSlice({ get: () => null, apply, subscribe: () => () => {} });
    void slice.apply({ panelKey: "k2", extra: 1 } as never, { origin: "follow", persist: false });
    expect(apply).toHaveBeenCalledWith({ panelKey: "k2" }, { origin: "follow", persist: false });
    expect(slice).toMatchObject({ id: "sefaria.focus", version: 1, scope: "moment" });
  });
});
