import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { InterfaceLangProvider } from "~/lib/i18n/interface-lang";
import { LexiconView } from "./LexiconView";
import { BERESHIT } from "./story-data";

// @feature CON-042 @feature CON-043 @feature CON-044
describe("LexiconView (בְּרֵאשִׁ֖ית in Genesis 1:1, recorded; compared with sefaria.org)", () => {
  it("shows one entry per dictionary, with the old site's headlines and attribution", () => {
    render(<LexiconView words="בְּרֵאשִׁ֖ית" entries={BERESHIT} />);
    const entries = screen.getAllByRole("article");
    expect(entries).toHaveLength(3);
    // Strong's: headword, morphology, language, senses, then Source/Creator
    expect(entries[0]).toHaveTextContent("רֵאשִׁית (n-f) heb");
    expect(within(entries[0]!).getByText("first, beginning, best, chief")).toBeInTheDocument();
    expect(within(entries[0]!).getByText("beginning")).toBeInTheDocument();
    expect(entries[0]).toHaveTextContent("Source: Open Scriptures on GitHub");
    expect(entries[0]).toHaveTextContent("Creator: Based on the work of Larry Pierce at the Online Bible");
    expect(within(entries[0]!).getByRole("link", { name: /Source:/ })).toHaveAttribute("href", "https://github.com/openscriptures/strongs");
    // Jastrow
    expect(entries[1]).toHaveTextContent("בְּרֵאשִׁית");
    expect(entries[1]).toHaveTextContent("(b. h.) in the beginning, as a cosmological term");
    expect(entries[1]).toHaveTextContent("Creator: Rabbi Marcus Jastrow");
    // BDB: headword marked † (all cited)
    expect(entries[2]).toHaveTextContent("† רֵאשִׁית");
  });

  it("nested senses are nested numbered lists", () => {
    render(<LexiconView entries={BERESHIT} />);
    const strong = screen.getAllByRole("article")[0]!;
    expect(within(strong).getAllByRole("list")).toHaveLength(2); // the entry's, and its four sub-senses
    expect(within(strong).getAllByRole("listitem")).toHaveLength(5);
  });

  it("citations are clickable and keep their link", async () => {
    const onCitation = vi.fn();
    render(<LexiconView entries={BERESHIT} onCitation={onCitation} />);
    const cite = screen.getByRole("link", { name: "Gen. I, 1" });
    expect(cite).toHaveAttribute("href", "/Genesis.1.1");
    await userEvent.click(cite);
    expect(onCitation).toHaveBeenCalledWith("Genesis 1:1", expect.anything());
  });

  it("BDB citations without the refLink class work too", async () => {
    const onCitation = vi.fn();
    render(<LexiconView entries={BERESHIT} onCitation={onCitation} />);
    await userEvent.click(screen.getAllByRole("link", { name: "Dt 33:21" })[0]!);
    expect(onCitation).toHaveBeenCalledWith("Deuteronomy 33:21", expect.anything());
  });

  it("clicking an entry opens it as a text; the headword is a real link", async () => {
    const onEntry = vi.fn();
    render(<LexiconView entries={BERESHIT} onEntry={onEntry} />);
    const jastrow = screen.getAllByRole("article")[1]!;
    expect(within(jastrow).getByRole("link", { name: "בְּרֵאשִׁית" })).toHaveAttribute("href", expect.stringMatching(/^\/Jastrow,_/));
    await userEvent.click(within(jastrow).getByText(/as a cosmological term/));
    expect(onEntry).toHaveBeenCalledWith("Jastrow, בְּרֵאשִׁית", expect.anything());
  });

  it("states: loading, nothing found (naming the words), and the dictionary search box", async () => {
    const onSearch = vi.fn();
    const { rerender } = render(<LexiconView loading onSearch={onSearch} />);
    expect(screen.getByRole("status")).toHaveTextContent("Looking up words...");
    rerender(<LexiconView words="בראשית ברא" entries={[]} onSearch={onSearch} />);
    expect(screen.getByText('No definitions found for "בראשית ברא".')).toBeInTheDocument();
    await userEvent.type(screen.getByRole("combobox", { name: "Search Dictionary" }), "אבא{Enter}");
    expect(onSearch).toHaveBeenCalledWith("אבא");
  });

  it("Hebrew interface strings", () => {
    render(<InterfaceLangProvider lang="hebrew"><LexiconView words="x" entries={[]} /></InterfaceLangProvider>);
    expect(screen.getByText('לא נמצאו תוצאות "x".')).toBeInTheDocument();
    expect(screen.getByRole("combobox", { name: "חיפוש במילון" })).toBeInTheDocument();
  });
});
