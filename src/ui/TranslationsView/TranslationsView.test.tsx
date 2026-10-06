import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { InterfaceLangProvider } from "~/lib/i18n/interface-lang";
import { TranslationsView } from "./TranslationsView";
import { CURRENT, storyLanguages } from "./story-data";

const href = (v: { languageFamilyName: string; versionTitle: string }) => `/Genesis.1.1?ven=${v.languageFamilyName}|${v.versionTitle.replace(/ /g, "_")}`;
const renderView = (props: Partial<Parameters<typeof TranslationsView>[0]> = {}) =>
  render(<TranslationsView languages={storyLanguages(CURRENT)} currentTitle={CURRENT} selectHref={href} openHref={href} urlRef="Genesis.1.1" {...props} />);

// @feature VER-009 @feature VER-010 @feature VER-011 @feature VER-012
describe("TranslationsView (Genesis 1:1, recorded)", () => {
  it("lists languages English first, with counts, as sefaria.org does", () => {
    renderView();
    const regions = screen.getAllByRole("region");
    expect(regions[0]).toHaveAccessibleName("English");
    expect(within(regions[0]!).getByText("(14)")).toBeInTheDocument();
    expect(regions.map((r) => r.getAttribute("aria-label")).slice(0, 4)).toEqual(["English", "German", "Esperanto", "Spanish"]);
  });

  it("puts the current translation first, marked Currently Selected; the others link to Select", () => {
    renderView();
    const english = within(screen.getByRole("region", { name: "English" }));
    const articles = english.getAllByRole("article");
    expect(articles[0]).toHaveTextContent("Revised JPS, 2023");
    expect(articles[0]).toHaveTextContent("Currently Selected");
    const select = english.getByRole("link", { name: "Select The Koren Jerusalem Bible" });
    expect(select).toHaveAttribute("href", "/Genesis.1.1?ven=english|The_Koren_Jerusalem_Bible");
  });

  it("shows a preview of the passage in each translation", () => {
    renderView();
    expect(screen.getAllByText(/IN THE BEGINNING God created the heaven and the earth/).length).toBeGreaterThan(0);
  });

  it("Select is handled in the app on a plain click", async () => {
    const onSelect = vi.fn();
    renderView({ onSelect });
    await userEvent.click(screen.getByRole("link", { name: "Select The Koren Jerusalem Bible" }));
    expect(onSelect).toHaveBeenCalledWith(expect.objectContaining({ versionTitle: "The Koren Jerusalem Bible" }), expect.anything());
  });

  it("each preview is a link that opens it in the sidebar (an overlay: previews may contain links)", async () => {
    const onPreview = vi.fn();
    renderView({ previewHref: (v) => `/Genesis.1.1?vside=${v.versionTitle.replace(/ /g, "_")}|en&with=Translation Open`, onPreview });
    const link = screen.getByRole("link", { name: "Preview The Koren Jerusalem Bible" });
    expect(link).toHaveAttribute("href", "/Genesis.1.1?vside=The_Koren_Jerusalem_Bible|en&with=Translation Open");
    await userEvent.click(link);
    expect(onPreview).toHaveBeenCalledWith(expect.objectContaining({ versionTitle: "The Koren Jerusalem Bible" }), expect.anything());
  });

  it("details: source, licence link, revision history and Open Text", async () => {
    renderView();
    const first = within(within(screen.getByRole("region", { name: "English" })).getAllByRole("article")[0]!);
    await userEvent.click(first.getByText("Revised JPS, 2023"));
    expect(first.getByRole("link", { name: "jps.org" })).toHaveAttribute("href", "https://jps.org/books/the-jps-tanakh-gender-sensitive-edition/");
    expect(first.getByRole("link", { name: "CC-BY-NC" })).toHaveAttribute("href", "https://creativecommons.org/licenses/by-nc/4.0/");
    expect(first.getByRole("link", { name: "Revision History" })).toHaveAttribute("href", "https://www.sefaria.org/activity/Genesis.1.1/en/THE_JPS_TANAKH:_Gender-Sensitive_Edition");
    expect(first.getByRole("link", { name: "Open Text" })).toBeInTheDocument();
  });

  it("speaks Hebrew in a Hebrew interface (old site's strings)", () => {
    render(<InterfaceLangProvider lang="hebrew"><TranslationsView languages={storyLanguages(CURRENT, "hebrew")} currentTitle={CURRENT} selectHref={href} openHref={href} urlRef="Genesis.1.1" /></InterfaceLangProvider>);
    expect(screen.getByRole("heading", { name: "תרגומים" })).toBeInTheDocument();
    expect(screen.getByText("נוכחי")).toBeInTheDocument();
    expect(screen.getAllByRole("region")[0]).toHaveAccessibleName("אנגלית");
  });
});
