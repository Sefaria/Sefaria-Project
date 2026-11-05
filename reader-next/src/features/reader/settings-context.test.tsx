import { act, render, renderHook } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { ReaderStateContext } from "~/features/reader-state/context";
import type { ReaderStateApi, SliceRegistry, StateSlice } from "~/lib/reader-state/core/types";
import { DEFAULT_SETTINGS, parseCookieHeader, parseCookieSettings } from "~/lib/reader/settings";
import { ReaderSettingsProvider, useReaderSettings } from "./settings-context";

const wrapper = ({ children }: { children: React.ReactNode }) => <ReaderSettingsProvider initial={DEFAULT_SETTINGS}>{children}</ReaderSettingsProvider>;

// @feature SHL-008
describe("ReaderSettingsProvider", () => {
  it("applies patches", () => {
    const { result } = renderHook(() => useReaderSettings(), { wrapper });
    act(() => result.current.update({ language: "hebrew", fontSize: 71.875 }));
    expect(result.current.settings).toMatchObject({ language: "hebrew", fontSize: 71.875, vowels: "all" });
  });

  it("writes the old cookie names and values so the legacy site and a reload agree", () => {
    const { result } = renderHook(() => useReaderSettings(), { wrapper });
    act(() => result.current.update({ language: "english", punctuationTalmud: false, aliyotTorah: true, layoutTalmud: "segmented" }));
    const cookies = parseCookieHeader(document.cookie);
    expect(cookies).toMatchObject({
      language: "english",
      contentLang: "english",
      punctuationTalmud: "punctuationOff",
      aliyotTorah: "aliyotOn",
      layoutTalmud: "segmented",
    });
    // Round trip: what we wrote parses back into the same settings.
    expect(parseCookieSettings(cookies)).toMatchObject({ language: "english", punctuationTalmud: false, aliyotTorah: true, layoutTalmud: "segmented" });
  });

  it("applies settings without writing cookies when not persisting", () => {
    document.cookie = "color=light; path=/";
    const { result } = renderHook(() => useReaderSettings(), { wrapper });
    act(() => result.current.apply({ ...DEFAULT_SETTINGS, color: "dark", fontSize: 71.875 }, { persist: false }));
    expect(result.current.settings).toMatchObject({ color: "dark", fontSize: 71.875 });
    expect(parseCookieHeader(document.cookie).color).toBe("light");
    act(() => result.current.apply({ ...DEFAULT_SETTINGS, color: "sepia" }, { persist: true }));
    expect(parseCookieHeader(document.cookie).color).toBe("sepia");
  });

  it("registers the sefaria.settings slice inside the reader state provider", () => {
    const slices = new Map<string, StateSlice>();
    const registry: SliceRegistry = {
      register: (s) => (slices.set(s.id, s), () => void slices.delete(s.id)),
      get: (id) => slices.get(id),
      list: () => [...slices.values()],
      onChange: () => () => {},
    };
    const stateWrapper = ({ children }: { children: React.ReactNode }) => (
      <ReaderStateContext.Provider value={{ registry, api: {} as ReaderStateApi }}>{wrapper({ children })}</ReaderStateContext.Provider>
    );
    document.cookie = "vowels=all; path=/";
    const { result, unmount } = renderHook(() => useReaderSettings(), { wrapper: stateWrapper });
    const slice = slices.get("sefaria.settings")!;
    expect(slice).toMatchObject({ scope: "personal", version: 1 });
    expect(slice.get()).toEqual(DEFAULT_SETTINGS);
    const onChange = vi.fn();
    slice.subscribe(onChange);
    act(() => result.current.update({ fontSize: 71.875 }));
    expect(onChange).toHaveBeenCalledTimes(1);
    act(() => void slice.apply({ ...DEFAULT_SETTINGS, vowels: "none" }, { origin: "playback", persist: false }));
    expect(onChange).toHaveBeenCalledTimes(2);
    expect(result.current.settings.vowels).toBe("none");
    expect(parseCookieHeader(document.cookie).vowels).toBe("all");
    unmount();
    expect(slices.has("sefaria.settings")).toBe(false);
  });

  it("throws outside a provider", () => {
    expect(() => render(<Bare />)).toThrow(/ReaderSettingsProvider/);
  });
});

function Bare() {
  useReaderSettings();
  return null;
}
