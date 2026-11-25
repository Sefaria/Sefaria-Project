import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { InterfaceLangProvider } from "~/lib/i18n/interface-lang";
import { BookVersionRow } from "./BookVersionRow";
import type { BookVersion } from "./version-order";

const feuer = {
  versionTitle: "Rabbi Mike Feuer, Jerusalem Anthology",
  versionTitleInHebrew: "רבי מייק פוייר, לקט ירושלים",
  language: "en",
  actualLanguage: "en",
  languageFamilyName: "english",
  direction: "ltr",
  isSource: false,
  isPrimary: false,
  versionSource: "https://www.sefaria.org",
  license: "CC-BY",
  versionNotes: 'English <a href="/notes">notes</a>',
  versionNotesInHebrew: "הערות",
  firstSectionRef: "Sifrei Bamidbar 42",
} as BookVersion;
const props = { version: feuer, href: "/Sifrei_Bamidbar.42?ven=english|Rabbi_Mike_Feuer,_Jerusalem_Anthology", bookUrl: "Sifrei_Bamidbar" };

// @feature BOK-007 @feature VER-016
describe("BookVersionRow", () => {
  it("the title is the link to read the version; the language is a badge; no Select button", () => {
    render(<BookVersionRow {...props} />);
    expect(screen.getByRole("heading", { level: 2 })).toHaveTextContent("Rabbi Mike Feuer, Jerusalem Anthology");
    expect(screen.getByRole("link", { name: "Rabbi Mike Feuer, Jerusalem Anthology" })).toHaveAttribute("href", props.href);
    expect(screen.getByText("English", { selector: "[data-version-row-badge]" })).toBeInTheDocument();
    expect(screen.queryByText(/Select/)).toBeNull();
  });
  it("source host, licence and the book's revision history, each in a new tab", () => {
    render(<BookVersionRow {...props} />);
    expect(screen.getByRole("link", { name: "sefaria.org" })).toHaveAttribute("href", "https://www.sefaria.org");
    expect(screen.getByRole("link", { name: "CC-BY" })).toHaveAttribute("href", "https://creativecommons.org/licenses/by/3.0/");
    const history = screen.getByRole("link", { name: "Revision History" });
    expect(history).toHaveAttribute("href", "/activity/Sifrei_Bamidbar/en/Rabbi_Mike_Feuer,_Jerusalem_Anthology");
    expect(history).toHaveAttribute("target", "_blank");
    expect(screen.getByText("notes").closest("a")).toHaveAttribute("href", "/notes");
  });
  it("the pencil only for moderators, and it opens the editor", async () => {
    const { rerender } = render(<BookVersionRow {...props} />);
    expect(screen.queryByRole("button", { name: /Edit/ })).toBeNull();
    const onEdit = vi.fn();
    rerender(<BookVersionRow {...props} onEdit={onEdit} />);
    await userEvent.click(screen.getByRole("button", { name: "Edit Rabbi Mike Feuer, Jerusalem Anthology" }));
    expect(onEdit).toHaveBeenCalled();
  });
  it("Hebrew interface: the Hebrew title, Hebrew notes, the language named in Hebrew, Hebrew licence names", () => {
    render(
      <InterfaceLangProvider lang="hebrew">
        <BookVersionRow {...props} version={{ ...feuer, license: "Public Domain" }} />
      </InterfaceLangProvider>,
    );
    expect(screen.getByRole("link", { name: "רבי מייק פוייר, לקט ירושלים" })).toHaveAttribute("href", props.href);
    expect(screen.getByText("אנגלית", { selector: "[data-version-row-badge]" })).toBeInTheDocument();
    expect(screen.getByText("הערות")).toBeInTheDocument();
    expect(screen.queryByText(/English/)).toBeNull();
    expect(screen.getByRole("link", { name: "בנחלת הכלל" })).toBeInTheDocument();
  });
  it("Hebrew interface: the pencil's name is Hebrew", () => {
    render(
      <InterfaceLangProvider lang="hebrew">
        <BookVersionRow {...props} onEdit={() => undefined} />
      </InterfaceLangProvider>,
    );
    expect(screen.getByRole("button", { name: "עריכת רבי מייק פוייר, לקט ירושלים" })).toBeInTheDocument();
  });
  it("no notes paragraph when the interface language has none (no fallback to the other, as there)", () => {
    const { container } = render(
      <InterfaceLangProvider lang="hebrew">
        <BookVersionRow {...props} version={{ ...feuer, versionNotesInHebrew: "" }} />
      </InterfaceLangProvider>,
    );
    expect(container.querySelector("[data-version-row-notes]")).toBeNull();
  });
});
