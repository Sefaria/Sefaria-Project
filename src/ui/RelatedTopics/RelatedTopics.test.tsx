import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { InterfaceLangProvider } from "~/lib/i18n/interface-lang";
import { RelatedTopics } from "./RelatedTopics";

const topics = ["Prayer", "Shema", "Amidah", "Blessings (Halakhah)", "Women", "Eating", "Tefillin"].map((en, i) => ({ slug: en.toLowerCase().replace(/\W+/g, "-"), title: { en, he: `נושא ${i}` } }));

// @feature BOK-022 @feature LIB-046
describe("RelatedTopics (Berakhot on sefaria.org: five, then More)", () => {
  it("shows five topics as links, then More reveals the rest", async () => {
    render(<RelatedTopics topics={topics} topicHref={(s) => `/topics/${s}`} />);
    expect(screen.getAllByRole("listitem")).toHaveLength(5);
    expect(screen.getByRole("link", { name: "Prayer" })).toHaveAttribute("href", "/topics/prayer");
    await userEvent.click(screen.getByRole("button", { name: "More" }));
    expect(screen.getAllByRole("listitem")).toHaveLength(7);
    expect(screen.queryByRole("button", { name: "More" })).toBeNull();
  });
  it("no More button when five or fewer; nothing at all when there are none", () => {
    const { container, rerender } = render(<RelatedTopics topics={topics.slice(0, 5)} topicHref={(s) => s} />);
    expect(screen.queryByRole("button")).toBeNull();
    rerender(<RelatedTopics topics={[]} topicHref={(s) => s} />);
    expect(container).toBeEmptyDOMElement();
  });
  it("Hebrew interface", () => {
    render(<InterfaceLangProvider lang="hebrew"><RelatedTopics topics={topics} topicHref={(s) => s} /></InterfaceLangProvider>);
    expect(screen.getByText("נושאים קשורים")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "עוד" })).toBeInTheDocument();
  });
});
