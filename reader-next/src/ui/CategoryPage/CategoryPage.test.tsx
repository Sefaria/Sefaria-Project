import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { InterfaceLangProvider } from "~/lib/i18n/interface-lang";
import { LibraryHome } from "../LibraryHome/LibraryHome";
import { AboutTextCategory, LearningSchedules, SidebarFooter, Visualizations, visualizationsFor } from "../NavSidebar/NavSidebar";
import { CategoryPage } from "./CategoryPage";
import { TREE, contentsOf, he, withDefaultCorpus } from "./story-data";

// @feature LIB-001 @feature LIB-008 @feature LIB-009 @feature LIB-011 @feature LIB-012 @feature LIB-014
describe("library pages", () => {
  it("home: every top category a link to its page, with a short description", () => {
    render(<LibraryHome tree={TREE} />);
    expect(screen.getByRole("heading", { level: 1, name: "Browse the Library" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Tanakh" })).toHaveAttribute("href", "/texts/Tanakh");
    expect(screen.getByText(/Torah, Prophets, and Writings/)).toBeInTheDocument();
  });
  it("Torah: the books, each a link to its book page with its description", () => {
    render(<CategoryPage cats={["Tanakh", "Torah"]} contents={contentsOf(["Tanakh", "Torah"])} he={he} />);
    expect(screen.getByRole("heading", { level: 1, name: "Torah" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Genesis" })).toHaveAttribute("href", "/Genesis");
    expect(screen.getByText(/Creation, the beginning of mankind/)).toBeInTheDocument();
  });
  it("Tanakh: Torah, Prophets and Writings are sections with their books inline", () => {
    render(<CategoryPage cats={["Tanakh"]} contents={contentsOf(["Tanakh"])} he={he} />);
    expect(screen.getByRole("heading", { level: 2, name: /Torah/ })).toBeInTheDocument();
    expect(screen.getByText("(The Five Books of Moses)")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Exodus" })).toBeInTheDocument();
  });
  it("Talmud: the toggle between Babylonian and Jerusalem, the Davidson credit", () => {
    render(<CategoryPage cats={withDefaultCorpus(["Talmud"])} contents={contentsOf(["Talmud"])} he={he} />);
    expect(screen.getByRole("heading", { level: 1, name: "Talmud" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Babylonian" })).toHaveAttribute("data-current", "true");
    expect(screen.getByRole("link", { name: "Jerusalem" })).toHaveAttribute("href", "/texts/Talmud/Yerushalmi");
    expect(screen.getByRole("link", { name: "The William Davidson Edition" })).toBeInTheDocument();
  });
  it("Hebrew interface: Hebrew names", () => {
    render(<InterfaceLangProvider lang="hebrew"><LibraryHome tree={TREE} /></InterfaceLangProvider>);
    expect(screen.getByRole("link", { name: 'תנ"ך' })).toHaveAttribute("href", "/texts/Tanakh");
  });
});

// @feature LIB-023 @feature LIB-031 @feature LIB-035 @feature LIB-038 @feature LIB-041
describe("sidebar modules", () => {
  it("the footer links", () => {
    render(<SidebarFooter />);
    const nav = screen.getByRole("navigation", { name: "Footer links" });
    expect(within(nav).getAllByRole("link")).toHaveLength(13);
    expect(within(nav).getByRole("link", { name: "Donate" })).toHaveAttribute("href", expect.stringContaining("c_src=Footer"));
  });
  it("visualizations: the ones that mention the page's categories", () => {
    // VERIFIED on sefaria.org (/texts/Tanakh/Torah): six, "Torah" also matching "Mishneh Torah"
    expect(visualizationsFor(["Tanakh", "Torah"]).map((v) => v.en)).toEqual(["Tanakh & Talmud", "Talmud & Mishneh Torah", "Mishneh Torah & Shulchan Arukh", "Tanakh & Midrash Rabbah", "Tanakh & Mishneh Torah", "Tanakh & Shulchan Arukh"]);
    render(<Visualizations categories={["Liturgy"]} />);
    expect(screen.queryByRole("heading")).toBeNull();
  });
  it("about a category: its description, or nothing when the interface language has none", () => {
    const { container, rerender } = render(<AboutTextCategory category="Torah" heCategory="תורה" enDesc="Five Books of Moses" />);
    expect(screen.getByRole("heading", { name: "About Torah" })).toBeInTheDocument();
    rerender(<AboutTextCategory category="Torah" heCategory="תורה" />);
    expect(container).toBeEmptyDOMElement();
  });
  it("learning schedules while loading shows the frame and the link to all of them", () => {
    render(<LearningSchedules items={undefined} />);
    expect(screen.getByRole("link", { name: /All Learning Schedules/ })).toBeInTheDocument();
  });
});
