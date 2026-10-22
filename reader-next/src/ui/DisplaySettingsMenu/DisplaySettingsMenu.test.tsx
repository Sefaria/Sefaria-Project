import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { DEFAULT_SETTINGS, displayMenuAvailability, type ReaderSettings } from "~/lib/reader/settings";
import { DisplaySettingsMenu } from "./DisplaySettingsMenu";

const HE = "בְּרֵאשִׁ֖ית";
function setup(over: Partial<ReaderSettings> = {}, ctx: Partial<Parameters<typeof displayMenuAvailability>[0]> = {}, layoutKey: "layoutTanakh" | "layoutTalmud" | "layoutDefault" = "layoutTanakh") {
  const settings = { ...DEFAULT_SETTINGS, ...over };
  const onChange = vi.fn();
  const availability = displayMenuAvailability({ settings, showsSource: true, primaryCategory: "Tanakh", book: "Genesis", hebrewSample: HE, ...ctx });
  render(<DisplaySettingsMenu settings={settings} availability={availability} layoutKey={layoutKey} onChange={onChange} />);
  return { onChange };
}

// @feature SHL-017 @feature TXD-041 @feature SHL-020
describe("DisplaySettingsMenu: language", () => {
  it("shows Source / Translation / Source with Translation with the current one checked", () => {
    setup({ language: "english" });
    expect(screen.getByRole("radio", { name: "Translation" })).toBeChecked();
  });
  it("changing language reports the new content language", async () => {
    const { onChange } = setup();
    await userEvent.click(screen.getByRole("radio", { name: "Source" }));
    expect(onChange).toHaveBeenCalledWith({ language: "hebrew" });
  });
});

// @feature TXD-033 @feature TXD-034
describe("DisplaySettingsMenu: layout", () => {
  it("offers stacked / side-by-side layouts when bilingual and writes biLayout", async () => {
    const { onChange } = setup({ language: "bilingual" });
    expect(screen.getByRole("radio", { name: "Stacked" })).toBeChecked();
    await userEvent.click(screen.getByRole("radio", { name: "Hebrew on the right" }));
    expect(onChange).toHaveBeenCalledWith({ biLayout: "heRight" });
  });
  it("offers segmented / continuous for a single language and writes the book's own key", async () => {
    const { onChange } = setup({ language: "hebrew" }, { primaryCategory: "Talmud", book: "Berakhot" }, "layoutTalmud");
    expect(screen.getByRole("radio", { name: "Continuous" })).toBeChecked();
    await userEvent.click(screen.getByRole("radio", { name: "Verse by verse" }));
    expect(onChange).toHaveBeenCalledWith({ layoutTalmud: "segmented" });
  });
  it("hides layout on narrow bilingual panels", () => {
    setup({ language: "bilingual" }, { panelWidth: 500 });
    expect(screen.queryByRole("radiogroup", { name: "Layout" })).toBeNull();
  });
});

// @feature TXD-036
describe("DisplaySettingsMenu: font size", () => {
  it("steps by 1.15", async () => {
    const { onChange } = setup();
    await userEvent.click(screen.getByRole("button", { name: "Larger text" }));
    expect(onChange).toHaveBeenCalledWith({ fontSize: expect.closeTo(71.875, 3) });
  });
});

// @feature TXD-037 @feature TXD-038
describe("DisplaySettingsMenu: vowels and cantillation", () => {
  it("shows both switches for text with nikud and te'amim", () => {
    setup();
    expect(screen.getByRole("switch", { name: "Vowels" })).toBeChecked();
    expect(screen.getByRole("switch", { name: "Cantillation" })).toBeChecked();
  });
  it("vowels off → none; on → nikud only (old behaviour)", async () => {
    const { onChange } = setup({ vowels: "all" });
    await userEvent.click(screen.getByRole("switch", { name: "Vowels" }));
    expect(onChange).toHaveBeenCalledWith({ vowels: "none" });
  });
  it("turning vowels back on gives nikud without cantillation", async () => {
    const { onChange } = setup({ vowels: "none" });
    await userEvent.click(screen.getByRole("switch", { name: "Vowels" }));
    expect(onChange).toHaveBeenCalledWith({ vowels: "partial" });
  });
  it("cantillation is disabled, with a reason, while vowels are off", async () => {
    const { onChange } = setup({ vowels: "none" });
    const sw = screen.getByRole("switch", { name: /Cantillation/ });
    expect(sw).toHaveAttribute("aria-disabled", "true");
    expect(sw).toHaveAccessibleDescription("Turn on vowels first");
    await userEvent.click(sw);
    expect(onChange).not.toHaveBeenCalled();
  });
  it("cantillation toggles between nikud-only and everything", async () => {
    const { onChange } = setup({ vowels: "partial" });
    await userEvent.click(screen.getByRole("switch", { name: "Cantillation" }));
    expect(onChange).toHaveBeenCalledWith({ vowels: "all" });
  });
  it("offers neither for unvocalised text", () => {
    setup({}, { hebrewSample: "בראשית" });
    expect(screen.queryByRole("switch", { name: "Vowels" })).toBeNull();
    expect(screen.queryByRole("switch", { name: "Cantillation" })).toBeNull();
  });
});

// @feature TXT-003 @feature TXT-006
describe("DisplaySettingsMenu: aliyot and punctuation", () => {
  it("shows aliyot only for the Torah", async () => {
    const { onChange } = setup();
    await userEvent.click(screen.getByRole("switch", { name: "Aliyot" }));
    expect(onChange).toHaveBeenCalledWith({ aliyotTorah: true });
  });
  it("no aliyot elsewhere", () => {
    setup({}, { book: "Isaiah" });
    expect(screen.queryByRole("switch", { name: "Aliyot" })).toBeNull();
  });
  it("shows punctuation only for Talmud", async () => {
    const { onChange } = setup({}, { primaryCategory: "Talmud", book: "Berakhot" }, "layoutTalmud");
    await userEvent.click(screen.getByRole("switch", { name: "Punctuation" }));
    expect(onChange).toHaveBeenCalledWith({ punctuationTalmud: false });
  });
});

// @feature SHL-019
describe("DisplaySettingsMenu: side panel", () => {
  it("offers only the language control", () => {
    setup({}, { inSidebar: true });
    expect(screen.getByRole("radiogroup", { name: "Source-translation toggle" })).toBeInTheDocument();
    expect(screen.queryByRole("radiogroup", { name: "Layout" })).toBeNull();
    expect(screen.queryByRole("region", { name: "Font size" })).toBeNull();
    expect(screen.queryByRole("switch")).toBeNull();
  });
});
