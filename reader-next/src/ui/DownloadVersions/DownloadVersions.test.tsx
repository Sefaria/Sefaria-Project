import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import genesisVersions from "../../../fixtures/api/genesis-1/versions.json";
import { DownloadVersions, isDownloadable, type DownloadableVersion } from "./DownloadVersions";

const versions = genesisVersions as unknown as DownloadableVersion[];

// @feature VER-008 @feature LIB-060
describe("DownloadVersions (Genesis, recorded)", () => {
  it("does not offer copyrighted versions", () => {
    expect(isDownloadable({ license: "Copyright: JPS, 1985" })).toBe(false);
    expect(isDownloadable({ license: "CC-BY-NC" })).toBe(true);
    expect(isDownloadable({})).toBe(true);
    render(<DownloadVersions title="Genesis" versions={versions} />);
    const labels = screen.getAllByRole("option").map((o) => o.textContent);
    expect(labels.some((l) => /JPS, 1985/.test(l ?? ""))).toBe(false);
    const copyrighted = versions.filter((v) => !isDownloadable(v)).map((v) => v.versionTitle);
    for (const t of copyrighted) expect(labels.some((l) => l?.startsWith(t))).toBe(false);
  });

  it("offers a merged version per language", () => {
    render(<DownloadVersions title="Genesis" versions={versions} />);
    const labels = screen.getAllByRole("option").map((o) => o.textContent);
    expect(labels).toContain("Merged Version (English)");
    expect(labels).toContain("Merged Version (Hebrew)");
  });

  it("the Download button stays disabled until a version and a format are chosen, then links to the file", async () => {
    render(<DownloadVersions title="Genesis" versions={versions} />);
    expect(screen.getByRole("link", { name: "Download" })).toHaveAttribute("aria-disabled", "true");
    await userEvent.selectOptions(screen.getByRole("combobox", { name: "Select Version" }), "Merged Version (English)");
    expect(screen.getByRole("link", { name: "Download" })).toHaveAttribute("aria-disabled", "true");
    await userEvent.selectOptions(screen.getByRole("combobox", { name: "Select Format" }), "plain.txt");
    const link = screen.getByRole("link", { name: "Download" });
    expect(link).toHaveAttribute("href", "https://www.sefaria.org/download/version/Genesis - en - merged.plain.txt");
    expect(link).not.toHaveAttribute("aria-disabled");
  });

  it("a specific version links by its title and language", async () => {
    render(<DownloadVersions title="Genesis" versions={versions} />);
    await userEvent.selectOptions(screen.getByRole("combobox", { name: "Select Version" }), "Miqra according to the Masorah (Hebrew)");
    await userEvent.selectOptions(screen.getByRole("combobox", { name: "Select Format" }), "json");
    expect(screen.getByRole("link", { name: "Download" })).toHaveAttribute("href", "https://www.sefaria.org/download/version/Genesis - he - Miqra according to the Masorah.json");
  });
});
