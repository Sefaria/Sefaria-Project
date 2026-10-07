import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { InterfaceLangProvider } from "~/lib/i18n/interface-lang";
import { SiteHeader } from "./SiteHeader";
import { STUB_SEARCH } from "./story-data";

// @feature GUI-002 @feature GUI-003 @feature GUI-009 @feature GUI-010 @feature GUI-011 @feature I18-008
describe("SiteHeader", () => {
  it("primary links go to the library's pages", () => {
    render(<SiteHeader next="/Genesis.1" search={STUB_SEARCH} />);
    const nav = screen.getByRole("navigation", { name: "Primary navigation" });
    expect(within(nav).getByRole("link", { name: "Texts" })).toHaveAttribute("href", "https://www.sefaria.org/texts");
    expect(within(nav).getByRole("link", { name: "Donate" })).toHaveAttribute("href", expect.stringContaining("c_src=Header"));
  });
  it("Enter in the search box runs the smart submit with the trimmed words", async () => {
    const seen: string[] = [];
    render(<SiteHeader next="/" search={{ ...STUB_SEARCH, onSmartSubmit: (q) => seen.push(q) }} />);
    const box = screen.getAllByRole("combobox")[0]!;
    await userEvent.type(box, "  shema {Enter}");
    expect(seen).toEqual(["shema"]);
    expect(box).toHaveAttribute("maxlength", "75");
  });
  it("the language menu links to the interface route with where to come back to", async () => {
    render(<SiteHeader next="/Genesis.1?lang=bi" search={STUB_SEARCH} />);
    await userEvent.click(screen.getByRole("button", { name: "Toggle Interface Language Menu" }));
    const dialog = screen.getByRole("dialog", { name: "Toggle Interface Language Menu" });
    expect(within(dialog).getByRole("link", { name: "עברית" })).toHaveAttribute("href", "/interface/hebrew?next=%2FGenesis.1%3Flang%3Dbi");
    expect(within(dialog).getByRole("link", { name: "English" })).toHaveAttribute("aria-current", "true");
  });
  it("the module switcher offers Library, Voices and Developers", async () => {
    render(<SiteHeader next="/" search={STUB_SEARCH} />);
    await userEvent.click(screen.getByRole("button", { name: "Library" }));
    const dialog = screen.getByRole("dialog", { name: "Library" });
    expect(within(dialog).getByRole("link", { name: "Developers" })).toHaveAttribute("target", "_blank");
    expect(within(dialog).getByRole("link", { name: /More from Sefaria/ })).toBeInTheDocument();
  });
  it("the phone menu opens and closes with Escape", async () => {
    render(<SiteHeader next="/" search={STUB_SEARCH} />);
    const menu = document.getElementById("mobile-nav")!;
    expect(menu).toHaveAttribute("hidden");
    await userEvent.click(screen.getByRole("button", { name: "Menu" }));
    expect(menu).not.toHaveAttribute("hidden");
    await userEvent.keyboard("{Escape}");
    expect(menu).toHaveAttribute("hidden");
  });
  // @feature SRC-024
  it("the phone menu has its own search box, and a search closes the menu", async () => {
    const onSearch = vi.fn();
    render(<SiteHeader next="/" search={{ ...STUB_SEARCH, onSearch }} />);
    const menu = document.getElementById("mobile-nav")!;
    await userEvent.click(screen.getByRole("button", { name: "Menu" }));
    const box = within(menu).getByRole("combobox");
    await userEvent.type(box, "light{Enter}");
    expect(menu).toHaveAttribute("hidden");
  });
  it("Hebrew interface: Hebrew labels, right-to-left, and the toggle goes to English", () => {
    render(<InterfaceLangProvider lang="hebrew"><SiteHeader next="/" search={STUB_SEARCH} /></InterfaceLangProvider>);
    expect(screen.getAllByRole("banner")[0]).toHaveAttribute("dir", "rtl");
    expect(within(screen.getByRole("navigation", { name: "ניווט ראשי" })).getByRole("link", { name: "מקורות" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Switch to English" })).toHaveAttribute("href", "/interface/english?next=%2F");
  });
  // @feature GUI-010 @feature GUI-003 @feature ANL-002
  it("signed out: Sign Up and the account menu's Log in / Sign up are this client's pages, with next and nav_bar", async () => {
    render(<SiteHeader next="/Genesis.1?lang=bi" search={STUB_SEARCH} />);
    const signup = screen.getAllByRole("link", { name: "Sign Up" })[0]!;
    expect(signup).toHaveAttribute("href", "/register?next=%2FGenesis.1%3Flang%3Dbi");
    expect(signup).toHaveAttribute("data-signup-source", "nav_bar");
    await userEvent.click(screen.getByRole("button", { name: "Account menu" }));
    const menu = screen.getByRole("dialog", { name: "Account menu" });
    expect(within(menu).getByRole("link", { name: "Log in" })).toHaveAttribute("href", "/login?next=%2FGenesis.1%3Flang%3Dbi");
  });
  it("on the login page, Sign Up keeps that page's own next", () => {
    render(<SiteHeader next="/login?next=%2FGenesis.1" search={STUB_SEARCH} />);
    expect(screen.getAllByRole("link", { name: "Sign Up" })[0]).toHaveAttribute("href", "/register?next=%2FGenesis.1");
  });
  it("signed in: no Sign Up or language menu; Saved; the picture opens name, settings, language and Log Out", async () => {
    render(<SiteHeader next="/" search={STUB_SEARCH} viewer={{ name: "Ada Lovelace", profileUrl: "/profile/ada" }} />);
    expect(screen.queryByRole("link", { name: "Sign Up" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Toggle Interface Language Menu" })).toBeNull();
    expect(screen.getByRole("link", { name: "Saved items" })).toHaveAttribute("href", "https://www.sefaria.org/saved");
    await userEvent.click(screen.getByRole("button", { name: "Account menu" }));
    const menu = screen.getByRole("dialog", { name: "Account menu" });
    expect(menu).toHaveTextContent("Ada Lovelace");
    expect(within(menu).getByRole("link", { name: "Account Settings" })).toHaveAttribute("href", "https://www.sefaria.org/settings/account");
    expect(within(menu).getByRole("link", { name: "Torah Tracker" })).toBeInTheDocument();
    expect(within(menu).getByRole("link", { name: "Log Out" })).toHaveAttribute("href", "https://www.sefaria.org/logout?next=/texts");
    const mobile = document.getElementById("mobile-nav")!;
    expect(within(mobile).getByRole("link", { name: "Logout", hidden: true })).toBeInTheDocument();
    expect(within(mobile).queryByRole("link", { name: "Log in", hidden: true })).toBeNull();
  });
});
