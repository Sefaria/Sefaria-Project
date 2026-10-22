import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { InterfaceLangProvider } from "~/lib/i18n/interface-lang";
import { TopicsView } from "./TopicsView";
import { GENESIS_1_1 } from "./story-data";

const props = { topics: GENESIS_1_1, refLabel: "Genesis 1:1", topicHref: (s: string) => `https://www.sefaria.org/topics/${s}`, lang: "en" as const };

// @feature CON-046
describe("TopicsView (Genesis 1:1, compared with sefaria.org)", () => {
  it("lists the seven topics as links to their pages (new tab), most prominent first", () => {
    render(<TopicsView {...props} />);
    const items = screen.getAllByRole("listitem");
    expect(items).toHaveLength(7);
    const first = within(items[0]!).getByRole("link", { name: "Creation" });
    expect(first).toHaveAttribute("href", "https://www.sefaria.org/topics/creation");
    expect(first).toHaveAttribute("target", "_blank");
    expect(items[2]).toHaveTextContent("Heavens");
  });
  it("shows the description, with its links, and the note about who connected it", () => {
    render(<TopicsView {...props} />);
    const creation = screen.getAllByRole("listitem")[0]!;
    expect(creation).toHaveTextContent("The opening two chapters of the Torah describe how God created the world");
    expect(within(creation).getByRole("link", { name: "chapters" })).toBeInTheDocument();
    const note = within(creation).getByRole("img");
    expect(note.getAttribute("aria-label")).toMatch(/^This topic is connected to "Genesis 1:1" by Curation of the Sefaria Learning Team/);
  });
  it("says so when there are none, and shows a loading state", () => {
    const { rerender } = render(<TopicsView {...props} topics={[]} />);
    expect(screen.getByText("No known Topics Here.")).toBeInTheDocument();
    rerender(<TopicsView {...props} loading />);
    expect(screen.getByRole("status")).toBeInTheDocument();
  });
  it("Hebrew: Hebrew titles and descriptions, the old Hebrew strings", () => {
    render(<InterfaceLangProvider lang="hebrew"><TopicsView {...props} lang="he" refLabel="בראשית א׳:א׳" /></InterfaceLangProvider>);
    expect(screen.getByRole("link", { name: "בריאה" })).toBeInTheDocument();
    expect(screen.getAllByRole("img")[0]!.getAttribute("aria-label")).toMatch(/^נושא הזה קשור ל-"בראשית א׳:א׳" על ידי /);
  });
});
