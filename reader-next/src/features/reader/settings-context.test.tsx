import { act, render, renderHook } from "@testing-library/react";
import { describe, expect, it } from "vitest";
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

  it("throws outside a provider", () => {
    expect(() => render(<Bare />)).toThrow(/ReaderSettingsProvider/);
  });
});

function Bare() {
  useReaderSettings();
  return null;
}
