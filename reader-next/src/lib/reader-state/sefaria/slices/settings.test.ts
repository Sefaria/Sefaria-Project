import { describe, expect, it, vi } from "vitest";
import { DEFAULT_SETTINGS, MAX_FONT_SIZE } from "~/lib/reader/settings";
import { createSettingsSlice, isReaderSettings, pickSettings } from "./settings";

describe("sefaria.settings", () => {
  it("accepts complete settings with allowed values", () => {
    expect(isReaderSettings(DEFAULT_SETTINGS)).toBe(true);
    expect(isReaderSettings({ ...DEFAULT_SETTINGS, fontSize: MAX_FONT_SIZE, color: "dark" })).toBe(true);
  });

  it("rejects missing keys, wrong types and values outside the choices", () => {
    const { vowels: _v, ...missing } = DEFAULT_SETTINGS;
    expect(isReaderSettings(missing)).toBe(false);
    expect(isReaderSettings({ ...DEFAULT_SETTINGS, color: "neon" })).toBe(false);
    expect(isReaderSettings({ ...DEFAULT_SETTINGS, aliyotTorah: "yes" })).toBe(false);
    expect(isReaderSettings({ ...DEFAULT_SETTINGS, fontSize: 1e6 })).toBe(false);
    expect(isReaderSettings({ ...DEFAULT_SETTINGS, fontSize: Number.NaN })).toBe(false);
    expect(isReaderSettings(null)).toBe(false);
    expect(isReaderSettings([])).toBe(false);
  });

  it("drops unknown keys before applying", () => {
    const apply = vi.fn();
    const slice = createSettingsSlice({ get: () => DEFAULT_SETTINGS, apply, subscribe: () => () => {} });
    const extra = { ...DEFAULT_SETTINGS, evil: 1 } as typeof DEFAULT_SETTINGS;
    expect(slice.validate!(extra)).toBe(true);
    void slice.apply(extra, { origin: "playback", persist: false });
    expect(apply).toHaveBeenCalledWith(DEFAULT_SETTINGS, { origin: "playback", persist: false });
    expect(Object.keys(pickSettings(extra))).not.toContain("evil");
  });

  it("is a personal slice, version 1", () => {
    const slice = createSettingsSlice({ get: () => DEFAULT_SETTINGS, apply: () => {}, subscribe: () => () => {} });
    expect(slice).toMatchObject({ id: "sefaria.settings", version: 1, scope: "personal" });
  });
});
