import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { InterfaceLangProvider } from "~/lib/i18n/interface-lang";
import { BookPage } from "./BookPage";

const base = {
  title: { en: "Genesis", he: "בראשית" },
  category: { en: "Tanakh", he: "תנ״ך", href: "https://www.sefaria.org/texts/Tanakh" },
  readHref: "/Genesis.1",
  tab: "contents" as const,
  tabHref: (t: string) => `/Genesis?tab=${t}`,
  contents: <div>the contents</div>,
  versionHref: (v: { versionTitle: string }) => `/Genesis.1?ven=english|${v.versionTitle}`,
};
const version = (versionTitle: string, priority: number) => ({ versionTitle, priority, language: "en", languageFamilyName: "english", actualLanguage: "en", direction: "ltr", isSource: false, isPrimary: false }) as never;

// @feature BOK-001 @feature BOK-002 @feature BOK-003 @feature BOK-005 @feature BOK-006 @feature BOK-007
describe("BookPage", () => {
  it("title (h1), category link, Start Reading to the first section", () => {
    render(<BookPage {...base} />);
    expect(screen.getByRole("heading", { level: 1, name: "Genesis" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Tanakh" })).toHaveAttribute("href", "https://www.sefaria.org/texts/Tanakh");
    expect(screen.getByRole("link", { name: "Start Reading" })).toHaveAttribute("href", "/Genesis.1");
  });
  it("Continue Reading when the reader has a place", () => {
    render(<BookPage {...base} continueReading readHref="/Genesis.12.3" />);
    expect(screen.getByRole("link", { name: "Continue Reading" })).toHaveAttribute("href", "/Genesis.12.3");
  });
  it("tabs are real links, the current one marked; a plain click goes through onTab", async () => {
    const onTab = vi.fn();
    render(<BookPage {...base} onTab={onTab} />);
    const nav = screen.getByRole("navigation", { name: "Book sections" });
    expect(within(nav).getByRole("link", { name: "Contents" })).toHaveAttribute("data-current", "true");
    expect(within(nav).getByRole("link", { name: "Versions" })).toHaveAttribute("href", "/Genesis?tab=versions");
    await userEvent.click(within(nav).getByRole("link", { name: "Versions" }));
    expect(onTab).toHaveBeenCalledWith("versions");
  });
  it("the versions tab lists them by priority, each with Select Version", () => {
    render(<BookPage {...base} tab="versions" versions={[version("B edition", 1), version("A edition", 5), version("C edition", 5)]} />);
    const titles = screen.getAllByRole("heading", { level: 3 }).map((h) => h.textContent);
    expect(titles).toEqual(["A edition", "C edition", "B edition"]);
    expect(screen.getAllByRole("link", { name: /Select/ })[0]).toHaveAttribute("href", "/Genesis.1?ven=english|A edition");
  });
  it("the sidebar: the description as markdown, and what the caller adds", () => {
    render(<BookPage {...base} description={{ en: "A **great** book" }} sidebar={<div>related topics here</div>} />);
    const side = screen.getByRole("complementary");
    expect(within(side).getByText("great").tagName).toBe("STRONG");
    expect(within(side).getByText("related topics here")).toBeInTheDocument();
  });
  it("shows the edition credit and the dedication when there are some", () => {
    render(<BookPage {...base} attribution={{ en: "The William Davidson Edition", he: "x", href: "/wd" }} dedication={{ en: "<b>In memory of</b> X" }} />);
    expect(screen.getByRole("link", { name: "The William Davidson Edition" })).toHaveAttribute("href", "/wd");
    expect(screen.getByText("In memory of")).toBeInTheDocument();
  });
  it("Hebrew interface: Hebrew title, labels and direction", () => {
    render(<InterfaceLangProvider lang="hebrew"><BookPage {...base} /></InterfaceLangProvider>);
    expect(screen.getByRole("heading", { level: 1, name: "בראשית" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "התחלת קריאה" })).toBeInTheDocument();
  });
});
