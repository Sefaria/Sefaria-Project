import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { VersionInfo } from "./VersionInfo";

const base = { versionTitle: "THE JPS TANAKH: Gender-Sensitive Edition", language: "en" };

// @feature VER-017
describe("VersionInfo", () => {
  it("shows the rows the version has, with the old site's links", () => {
    render(<VersionInfo urlRef="Genesis.1.1" version={{ ...base, versionSource: "https://www.jps.org/books/x", license: "CC-BY-NC", digitizedBySefaria: true, purchaseInformationURL: "https://store.example/b" }} />);
    expect(screen.getByRole("link", { name: "jps.org" })).toHaveAttribute("href", "https://www.jps.org/books/x"); // www. stripped
    expect(screen.getByRole("link", { name: "CC-BY-NC" })).toHaveAttribute("href", "https://creativecommons.org/licenses/by-nc/4.0/");
    expect(screen.getByRole("link", { name: "Sefaria" })).toHaveAttribute("href", "https://www.sefaria.org/digitized-by-sefaria");
    expect(screen.getByRole("link", { name: "Revision History" })).toHaveAttribute("href", "/activity/Genesis.1.1/en/THE_JPS_TANAKH:_Gender-Sensitive_Edition");
    expect(screen.getByRole("link", { name: "Buy in Print" })).toHaveAttribute("href", "https://store.example/b");
  });
  it("hides rows the version lacks; revision history is always there", () => {
    render(<VersionInfo urlRef="Genesis.1.1" version={base} />);
    expect(screen.queryByText(/Source/)).toBeNull();
    expect(screen.queryByText(/License/)).toBeNull();
    expect(screen.queryByText(/Digitization/)).toBeNull();
    expect(screen.queryByRole("link", { name: "Buy in Print" })).toBeNull();
    expect(screen.getByRole("link", { name: "Revision History" })).toBeInTheDocument();
  });
  // Regression: a source that is a book's name, not an address, was a relative link to Django's 404 on the old site
  it("a source that is not an address is plain text; addresses stay links", () => {
    const { rerender } = render(<VersionInfo urlRef="x" version={{ ...base, versionSource: "Biblia Judaica Completa", purchaseInformationImage: "https://img.example/c.png" }} showImage />);
    expect(screen.getByText("Biblia Judaica Completa").closest("a")).toBeNull();
    expect(screen.queryByRole("img")).toBeNull(); // no "buy" picture linked to a name
    rerender(<VersionInfo urlRef="x" version={{ ...base, versionSource: "/shraga-silverstein" }} />);
    expect(screen.getByRole("link", { name: "/shraga-silverstein" })).toHaveAttribute("href", "/shraga-silverstein");
    rerender(<VersionInfo urlRef="x" version={{ ...base, versionSource: "www.example.org/b" }} />);
    expect(screen.getByRole("link", { name: "example.org" })).toHaveAttribute("href", "https://www.example.org/b");
  });
  it("an unknown licence is shown as text, not a dead link", () => {
    render(<VersionInfo urlRef="x" version={{ ...base, license: "Copyright: JPS, 1985" }} />);
    expect(screen.getByText("Copyright: JPS, 1985").closest("a")).toBeNull();
  });
  it("the edition's picture links to where to buy it, only when asked for and present", () => {
    const v = { ...base, purchaseInformationURL: "https://store.example/b", purchaseInformationImage: "https://img.example/cover.png" };
    const { rerender } = render(<VersionInfo urlRef="x" version={v} showImage />);
    expect(screen.getByRole("img", { name: "Buy now" }).closest("a")).toHaveAttribute("href", "https://store.example/b");
    rerender(<VersionInfo urlRef="x" version={v} />);
    expect(screen.queryByRole("img")).toBeNull();
  });
});
