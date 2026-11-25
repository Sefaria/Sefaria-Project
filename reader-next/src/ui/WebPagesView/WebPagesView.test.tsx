import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { WebPagesView } from "./WebPagesView";
import { ALL, HADRAN, SITES } from "./story-data";

const base = { pages: ALL, sites: SITES, siteHref: (n: string) => `?with=WebPage:${n}`, refLabel: (r: string) => r };

// @feature CON-052 @feature CON-053 @feature CON-054
describe("WebPagesView (Berakhot 2a:1; compared with sefaria.org)", () => {
  it("lists the sites with their counts, most pages first, each a link to its pages", async () => {
    const onSite = vi.fn();
    render(<WebPagesView {...base} onSite={onSite} />);
    const links = screen.getAllByRole("link").filter((l) => /\(\d+\)/.test(l.textContent ?? ""));
    expect(links).toHaveLength(31);
    expect(links[0]).toHaveTextContent("Halachipedia (145)");
    expect(links[0]).toHaveAttribute("href", "?with=WebPage:Halachipedia");
    await userEvent.click(links[1]!);
    expect(onSite).toHaveBeenCalledWith("Torat Har Etzion", expect.anything());
  });

  it("ends with the Linker promo", () => {
    render(<WebPagesView {...base} />);
    expect(screen.getByText(/Sites that are listed here use the/)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Sefaria Linker" })).toHaveAttribute("href", "https://www.sefaria.org/linker");
  });

  it("one site's pages: title (a new-tab link), domain, summary, source and the passage cited", () => {
    render(<WebPagesView {...base} site="Hadran" pages={HADRAN} />);
    const first = screen.getAllByRole("listitem")[0]!;
    const title = within(first).getByRole("link", { name: HADRAN[0]!.title });
    expect(title).toHaveAttribute("href", HADRAN[0]!.url);
    expect(title).toHaveAttribute("target", "_blank");
    expect(first).toHaveTextContent(HADRAN[0]!.domain);
    expect(first).toHaveTextContent(`Citing: ${HADRAN[0]!.anchorRef}`);
    expect(within(first).getByRole("img", { name: "Website icon" })).toBeInTheDocument();
  });

  it("authors ('First Last', joined) and the article source with its parts, when the page has them", () => {
    const page = { ...ALL[0]!, authors: ["Sacks, Jonathan", "Kook, Abraham Isaac"], articleSource: { title: "Covenant & Conversation", related_parts: "Bereshit" } };
    render(<WebPagesView {...base} site={page.siteName} pages={[page]} />);
    const line = (text: string) => screen.getByText((_, el) => el?.tagName === "DIV" && el.textContent === text);
    expect(line("Authors: Jonathan Sacks and Abraham Isaac Kook")).toBeInTheDocument();
    expect(line("Source: Covenant & Conversation Bereshit")).toBeInTheDocument();
  });

  it("states: loading, nothing known, nothing from this site", () => {
    const { rerender } = render(<WebPagesView {...base} loading pages={[]} sites={[]} />);
    expect(screen.getByText("Loading web pages...")).toBeInTheDocument();
    rerender(<WebPagesView {...base} pages={[]} sites={[]} />);
    expect(screen.getByText("No web pages known here.")).toBeInTheDocument();
    rerender(<WebPagesView {...base} site="Hadran" pages={[]} />);
    expect(screen.getByText("No web pages known from Hadran here.")).toBeInTheDocument();
  });
});
