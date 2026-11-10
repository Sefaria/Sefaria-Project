import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { InterfaceLangProvider } from "~/lib/i18n/interface-lang";
import { SiteHeader, leavesFrom } from "./SiteHeader";
import { SiteHostProvider, libraryHref } from "~/lib/routing/library-href";
import { STUB_SEARCH } from "./story-data";

// @feature GUI-002 @feature GUI-003 @feature GUI-009 @feature GUI-010 @feature GUI-011 @feature I18-008
describe("SiteHeader", () => {
  it("Texts and Topics stay in the app on the Library host; on the Voices host Topics is Django's and loads in full", () => {
    expect(leavesFrom("/topics", "https://www.sefaria.org/Genesis.1")).toBe(false);
    expect(leavesFrom("/texts", "https://www.sefaria.org/Genesis.1")).toBe(false);
    expect(leavesFrom("/topics", "https://voices.sefaria.org/sheets/1")).toBe(true);
    expect(leavesFrom("/topics", "https://chiburim.sefaria.org.il/sheets/1")).toBe(true);
  });
  it("on the Library host the logo, Texts, Topics and the switcher's Library are relative; on a Voices host they keep the Library's address", async () => {
    const links = (host: string) => {
      const { unmount } = render(<SiteHostProvider value={host}><SiteHeader next="/" search={STUB_SEARCH} /></SiteHostProvider>);
      const nav = screen.getByRole("navigation", { name: "Primary navigation" });
      const out = {
        logo: within(nav).getAllByRole("link")[0]!.getAttribute("href"),
        texts: within(nav).getByRole("link", { name: "Texts" }).getAttribute("href"),
        topics: within(nav).getByRole("link", { name: "Topics" }).getAttribute("href"),
        mobile: [...document.querySelectorAll("#mobile-nav a")].map((a) => a.getAttribute("href")).filter((h) => /\/(texts|topics)$/.test(h ?? "")),
      };
      unmount();
      return out;
    };
    expect(links("www.sefaria.org")).toEqual({ logo: "/", texts: "/texts", topics: "/topics", mobile: ["/texts", "/topics"] });
    const lib = libraryHref("/", "voices.sefaria.org").replace(/\/$/, "");
    expect(lib).toMatch(/^https?:\/\//); // the Library's origin in this environment (SITE_ORIGIN)
    for (const host of ["voices.sefaria.org", "chiburim.sefaria.org.il"])
      expect(links(host)).toEqual({ logo: `${lib}/`, texts: `${lib}/texts`, topics: `${lib}/topics`, mobile: [`${lib}/texts`, `${lib}/topics`] });
  });
  it("libraryHref: relative on the Library host (or unknown), the Library's address on Voices", () => {
    expect(libraryHref("/topics", "www.sefaria.org", "https://www.sefaria.org", "https://voices.sefaria.org")).toBe("/topics");
    expect(libraryHref("/topics", undefined, "https://www.sefaria.org", "https://voices.sefaria.org")).toBe("/topics");
    expect(libraryHref("/topics", "voices.sefaria.org", "https://www.sefaria.org", "https://voices.sefaria.org")).toBe("https://www.sefaria.org/topics");
    expect(libraryHref("/topics", "voices.x.cauldron.sefaria.org", "", "https://voices.x.cauldron.sefaria.org")).toBe("/topics"); // SITE_ORIGIN "" (production): as before, relative
  });
  it("primary links go to the library's pages", () => {
    render(<SiteHeader next="/Genesis.1" search={STUB_SEARCH} />);
    const nav = screen.getByRole("navigation", { name: "Primary navigation" });
    // relative: this client's own pages, navigated in the app (T-F02)
    expect(within(nav).getByRole("link", { name: "Texts" })).toHaveAttribute("href", "/texts");
    expect(within(nav).getByRole("link", { name: "Topics" })).toHaveAttribute("href", "/topics");
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
  it("Hebrew interface: Hebrew labels, right-to-left, and the phone menu's language row goes to English", () => {
    render(<InterfaceLangProvider lang="hebrew"><SiteHeader next="/" search={STUB_SEARCH} /></InterfaceLangProvider>);
    expect(screen.getAllByRole("banner")[0]).toHaveAttribute("dir", "rtl");
    // T-G02, VERIFIED on sefaria.org 2026-11-10 (Playwright, /interface/hebrew): the desktop bar says טקסטים, the phone menu מקורות,
    // and Donate goes to the Hebrew campaign (468442) from both
    const nav = within(screen.getByRole("navigation", { name: "ניווט ראשי" }));
    expect(nav.getByRole("link", { name: "טקסטים" })).toBeInTheDocument();
    expect(nav.getByRole("link", { name: "תרומה" })).toHaveAttribute("href", "https://donate.sefaria.org/give/468442/#!/donation/checkout?c_src=Header");
    const mobile = document.getElementById("mobile-nav")!;
    expect(within(mobile).getByRole("link", { name: "מקורות", hidden: true })).toHaveAttribute("href", "/texts");
    expect(within(mobile).getByRole("link", { name: "תרומה", hidden: true })).toHaveAttribute("href", "https://donate.sefaria.org/give/468442/#!/donation/checkout?c_src=MobileNavMenu");
    expect(within(mobile).getByRole("link", { name: "English", hidden: true })).toHaveAttribute("href", "/interface/english?next=%2F");
  });
  // @feature GUI-001 Mobile header bar
  it("phone bar: the menu button and the logo; the right-hand slot is empty until a library page puts its toggle there", () => {
    render(<SiteHeader next="/" search={STUB_SEARCH} />);
    expect(screen.getByRole("button", { name: "Menu" })).toHaveAttribute("aria-controls", "mobile-nav");
    expect(document.getElementById("header-page-action")).toBeEmptyDOMElement();
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
    expect(screen.getByRole("link", { name: "Saved items" })).toHaveAttribute("href", "/saved");
    await userEvent.click(screen.getByRole("button", { name: "Account menu" }));
    const menu = screen.getByRole("dialog", { name: "Account menu" });
    expect(menu).toHaveTextContent("Ada Lovelace");
    // the name row is data-prevent-close: clicking it keeps the menu open
    await userEvent.click(within(menu).getByText("Ada Lovelace"));
    expect(screen.getByRole("dialog", { name: "Account menu" })).toBeInTheDocument();
    expect(within(menu).getByRole("link", { name: "Account Settings" })).toHaveAttribute("href", "https://www.sefaria.org/settings/account");
    expect(within(menu).getByRole("link", { name: "Torah Tracker" })).toBeInTheDocument();
    expect(within(menu).getByRole("link", { name: "Log Out" })).toHaveAttribute("href", "https://www.sefaria.org/logout?next=/texts");
    const mobile = document.getElementById("mobile-nav")!;
    expect(within(mobile).getByRole("link", { name: "Logout", hidden: true })).toBeInTheDocument();
    expect(within(mobile).queryByRole("link", { name: "Log in", hidden: true })).toBeNull();
  });
});

// @feature ACC-003
describe("SiteHeader opt-in items", () => {
  it("absent without the opt-in; with it, both menus offer Report a problem and Back to the classic reader", async () => {
    const { rerender } = render(<SiteHeader next="/" search={STUB_SEARCH} viewer={{ name: "Ada" }} />);
    expect(screen.queryByTestId("back-to-classic-mobile")).toBeNull();
    const seen: string[] = [];
    const optIn = { onBackToClassic: (s: string) => seen.push(`back:${s}`), onReportProblem: (s: string) => seen.push(`report:${s}`) };
    rerender(<SiteHeader next="/" search={STUB_SEARCH} viewer={{ name: "Ada" }} optIn={optIn} />);
    await userEvent.click(screen.getByRole("button", { name: "Account menu" }));
    const dialog = screen.getByRole("dialog", { name: "Account menu" });
    await userEvent.click(within(dialog).getByRole("button", { name: "Report a problem" }));
    expect(screen.queryByRole("dialog", { name: "Account menu" })).toBeNull(); // the menu closed
    await userEvent.click(screen.getByRole("button", { name: "Menu" }));
    await userEvent.click(screen.getByTestId("back-to-classic-mobile"));
    expect(seen).toEqual(["report:account_menu", "back:mobile_menu"]);
    expect(document.getElementById("mobile-nav")).toHaveAttribute("hidden");
  });
});

// @feature AI-001 (sefaria.org #3934: the header pill replaced the stand-alone banner)
describe("SiteHeader Library Assistant pill", () => {
  it("only while the assistant is on the page; a click asks it to open", async () => {
    const { rerender } = render(<SiteHeader next="/" search={STUB_SEARCH} viewer={{ name: "Ada" }} />);
    expect(screen.queryByTestId("assistant-pill")).toBeNull();
    const opened = vi.fn();
    rerender(<SiteHeader next="/" search={STUB_SEARCH} viewer={{ name: "Ada" }} onOpenAssistant={opened} />);
    const pill = screen.getByTestId("assistant-pill");
    expect(pill).toHaveAttribute("role", "button");
    expect(pill).toHaveTextContent("Library Assistant");
    await userEvent.click(pill);
    expect(opened).toHaveBeenCalledTimes(1);
  });
});
