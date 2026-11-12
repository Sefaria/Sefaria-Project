import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { InterfaceLangProvider } from "~/lib/i18n/interface-lang";
import { aboutVersions } from "~/lib/versions/about";
import { AboutView } from "./AboutView";
import { BERAKHOT, GENESIS, RASHI } from "./story-data";

// @feature CON-039 @feature VER-006 @feature VER-016 @feature VER-008 @feature BOK-022
describe("AboutView (real Genesis / Berakhot / Rashi data, compared with sefaria.org)", () => {
  it("Genesis: title, category, description and composition", () => {
    render(<AboutView {...GENESIS} />);
    const about = within(screen.getByRole("region", { name: "About This Text" }));
    expect(about.getByRole("link", { name: "Genesis" })).toHaveAttribute("href", "/Genesis");
    expect(about.getByText("Tanakh")).toBeInTheDocument();
    expect(about.getByText(/is the first book of the Torah/)).toBeInTheDocument();
    expect(about.getByText("Composed: Sinai/Canaan (c.1400 – c.400 BCE)")).toBeInTheDocument();
    expect(about.queryByText(/Author/)).toBeNull(); // no English authors
  });

  it("Rashi: the author links to their topic", () => {
    render(<AboutView {...RASHI} />);
    const author = screen.getByText("Author:").parentElement!;
    expect(within(author).getByRole("link", { name: "Rashi" })).toHaveAttribute("href", "https://www.sefaria.org/topics/rashi");
  });

  it("the current translation leads in English, with its notes (links from the library) and facts", () => {
    render(<AboutView {...GENESIS} />);
    const sections = screen.getAllByRole("region").map((r) => r.getAttribute("aria-label"));
    expect(sections.indexOf("Current Translation")).toBeLessThan(sections.indexOf("Source Versions"));
    const current = within(screen.getByRole("region", { name: "Current Translation" }));
    expect(current.getByRole("heading", { name: /THE JPS TANAKH/ })).toBeInTheDocument();
    const preface = current.getByRole("link", { name: "Preface" });
    expect(preface).toHaveAttribute("href", "https://purl.org/jps/rjps-preface");
    expect(preface).toHaveAttribute("rel", "noopener noreferrer");
    expect(current.getByRole("link", { name: "jps.org" })).toBeInTheDocument();
    expect(current.getByRole("link", { name: "CC-BY-NC" })).toBeInTheDocument();
    expect(current.getByRole("img", { name: "Buy now" })).toBeInTheDocument(); // the edition's picture
    expect(current.queryByRole("link", { name: /Select/ })).toBeNull(); // the current one is not selectable
  });

  it("source versions: each with a Select Version link; none is 'Current' until the URL names one", async () => {
    const onSelectSource = vi.fn();
    render(<AboutView {...BERAKHOT} onSelectSource={onSelectSource} />);
    const sources = within(screen.getByRole("region", { name: "Source Versions" }));
    expect(sources.getAllByRole("heading", { level: 3 }).filter((h) => h.closest("article")).map((h) => h.textContent)).toEqual(["William Davidson Edition - Vocalized Aramaic", "William Davidson Edition - Aramaic", "Wikisource Talmud Bavli"]);
    expect(screen.queryByRole("region", { name: "Current Version" })).toBeNull();
    await userEvent.click(sources.getByRole("link", { name: "Select William Davidson Edition - Aramaic" }));
    expect(onSelectSource).toHaveBeenCalledWith(expect.objectContaining({ versionTitle: "William Davidson Edition - Aramaic" }), expect.anything());
  });

  it("a current source version gets its own section, and the list becomes 'Alternate Source Versions'", () => {
    const versions = aboutVersions(
      (BERAKHOT.versions.alternates as unknown as never[]).concat(BERAKHOT.versions.translation as never),
      { translationTitle: "William Davidson Edition - English", sourceTitle: "William Davidson Edition - Aramaic" },
    );
    render(<AboutView {...BERAKHOT} versions={versions} order={["source", "translation"]} />);
    expect(screen.getByRole("region", { name: "Current Version" })).toBeInTheDocument();
    expect(screen.getByRole("region", { name: "Source Versions" })).toBeInTheDocument();
    expect(within(screen.getByRole("region", { name: "Source Versions" })).getByText("Alternate Source Versions")).toBeInTheDocument();
  });

  it("Berakhot: related topics (five, then More) and a download form", () => {
    render(<AboutView {...BERAKHOT} />);
    const topics = within(screen.getByRole("region", { name: "Related Topics" }));
    expect(topics.getAllByRole("listitem")).toHaveLength(5);
    expect(topics.getByRole("button", { name: "More" })).toBeInTheDocument();
    expect(screen.getByRole("region", { name: "Download Text" })).toBeInTheDocument();
  });

  it("no download form for dictionaries; a loading state while the details arrive", () => {
    const { rerender } = render(<AboutView {...GENESIS} isDictionary />);
    expect(screen.queryByRole("region", { name: "Download Text" })).toBeNull();
    rerender(<AboutView {...GENESIS} details={undefined} loading />);
    expect(screen.getByRole("status")).toBeInTheDocument();
  });

  it("Hebrew interface uses the old site's strings", () => {
    render(<InterfaceLangProvider lang="hebrew"><AboutView {...RASHI} lang="he" /></InterfaceLangProvider>);
    expect(screen.getByText("אודות ספר זה")).toBeInTheDocument();
    expect(screen.getByText("תרגום נוכחי")).toBeInTheDocument();
    expect(screen.getByText("מחבר:")).toBeInTheDocument();
    expect(screen.getAllByText("בחירת מהדורה").length).toBeGreaterThan(0);
  });
});
