import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { bannerDismissed, openTransBannerApplies } from "~/lib/reader/translations-banner";
import { TextColumnBanner } from "./TextColumnBanner";

// @feature TXD-064
describe("TextColumnBanner", () => {
  it("an action runs and closes the banner, telling the owner", async () => {
    const onClick = vi.fn(), onClose = vi.fn();
    render(<TextColumnBanner onClose={onClose} actions={[{ name: "Go to translations", label: "Go to translations", onClick }]}>Want to change the translation?</TextColumnBanner>);
    await userEvent.click(screen.getByRole("button", { name: "Go to translations" }));
    expect(onClick).toHaveBeenCalledOnce();
    expect(onClose).toHaveBeenCalledOnce();
    expect(screen.queryByText("Want to change the translation?")).toBeNull();
  });
  it("the close button closes it", async () => {
    const onClose = vi.fn();
    render(<TextColumnBanner onClose={onClose}>hello</TextColumnBanner>);
    await userEvent.click(screen.getByRole("button", { name: "Close suggestion" }));
    expect(onClose).toHaveBeenCalledOnce();
  });
});

// @feature TXD-064
describe("when the open-translations banner applies", () => {
  it("Tanakh, Mishnah and Bavli, unless the panel is Hebrew-only", () => {
    for (const c of ["Tanakh", "Mishnah", "Bavli"]) {
      expect(openTransBannerApplies(c, "english")).toBe(true);
      expect(openTransBannerApplies(c, "bilingual")).toBe(true);
      expect(openTransBannerApplies(c, "hebrew")).toBe(false);
    }
    expect(openTransBannerApplies("Yerushalmi", "english")).toBe(false);
    expect(openTransBannerApplies(undefined, "english")).toBe(false);
  });
  it("not again once dismissed in this session", () => {
    expect(bannerDismissed("a=1; open_trans_banner_shown=1")).toBe(true);
    expect(bannerDismissed("a=1")).toBe(false);
  });
});
