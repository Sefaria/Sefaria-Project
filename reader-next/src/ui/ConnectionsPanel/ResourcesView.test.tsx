import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { InterfaceLangProvider } from "~/lib/i18n/interface-lang";
import { linkSummary, topLevelSummary, type CategorySummary } from "~/lib/connections/summary";
import { linksForRefs } from "~/lib/connections/links";
import { ResourcesView } from "./ResourcesView";
import type { ResourceCounts } from "~/lib/connections/related";
import { STORY_CATALOG, STORY_LINKS } from "./story-data";

const cat = (category: string, count: number, hasEnglish = false): CategorySummary => ({ category, count, hasEnglish, books: [] });
const related = () => within(screen.getByRole("region", { name: "Related Texts" }));
const view = (summary: ReturnType<typeof topLevelSummary>, lang?: "hebrew") => {
  const ui = <ResourcesView summary={summary} catalog={STORY_CATALOG} basePath="/Genesis.1.1" />;
  return render(lang ? <InterfaceLangProvider lang={lang}>{ui}</InterfaceLangProvider> : ui);
};

// @feature CON-012 @feature CON-019 @feature CON-023 @feature CON-024
describe("ResourcesView", () => {
  it("lists categories with counts, each a link to its category view", () => {
    view(topLevelSummary([cat("Commentary", 58), cat("Talmud", 8)]));
    const link = screen.getByRole("link", { name: /Commentary/ });
    expect(link).toHaveTextContent("(58)");
    expect(link).toHaveAttribute("href", "/Genesis.1.1?with=Commentary+ConnectionsList");
  });

  it("carries display state on every link", () => {
    render(<ResourcesView summary={topLevelSummary([cat("Commentary", 1)])} catalog={STORY_CATALOG} basePath="/Genesis.1.1" search="&lang=en" />);
    expect(screen.getByRole("link", { name: /Commentary/ })).toHaveAttribute("href", "/Genesis.1.1?with=Commentary+ConnectionsList&lang=en");
  });

  it("folds Quoting Commentary into Commentary", () => {
    view(topLevelSummary([cat("Commentary", 10), cat("Quoting Commentary", 3)]));
    expect(screen.getByRole("link", { name: /Commentary/ })).toHaveTextContent("(13)");
    expect(screen.queryByRole("link", { name: /Quoting/ })).toBeNull();
  });

  it("shows four rows and expands with More / See Less", async () => {
    view(topLevelSummary(["Commentary", "Talmud", "Midrash", "Halakhah", "Kabbalah", "Musar"].map((c) => cat(c, 1))));
    expect(related().getAllByRole("link")).toHaveLength(4);
    const more = screen.getByRole("button", { name: "More" });
    expect(more).toHaveAttribute("aria-expanded", "false");
    await userEvent.click(more);
    expect(related().getAllByRole("link")).toHaveLength(6);
    expect(screen.getByRole("button", { name: "See Less" })).toHaveAttribute("aria-expanded", "true");
    await userEvent.click(screen.getByRole("button", { name: "See Less" }));
    expect(related().getAllByRole("link")).toHaveLength(4);
  });

  it("has no More button with four or fewer rows", () => {
    view(topLevelSummary([cat("Commentary", 1), cat("Talmud", 1)]));
    expect(screen.queryByRole("button", { name: "More" })).toBeNull();
  });

  it("lists essays first, as Essay filters", () => {
    const essays = [{ title: { en: "Fox on Genesis", he: "פוקס" }, sourceRef: "Fox 1" }];
    view(topLevelSummary([cat("Commentary", 1)], essays));
    const links = related().getAllByRole("link");
    expect(links[0]).toHaveTextContent("Fox on Genesis");
    expect(links[0]).toHaveAttribute("href", "/Genesis.1.1?with=Fox+on+Genesis%7CEssay");
  });

  it("says so when there are no connections", () => {
    view(topLevelSummary([]));
    expect(screen.getByText("No connections known here.")).toBeInTheDocument();
  });

  it("uses Hebrew labels in a Hebrew interface", () => {
    view(topLevelSummary([cat("Commentary", 2), cat("Talmud", 1)]), "hebrew");
    expect(screen.getByRole("link", { name: /מפרשים/ })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /תלמוד/ })).toBeInTheDocument();
    expect(screen.getByText("טקסטים קשורים")).toBeInTheDocument();
  });

  it("renders a summary built from real Genesis 1:1 links", () => {
    const verse = linksForRefs(STORY_LINKS, ["Genesis 1:1"]);
    const summary = topLevelSummary(linkSummary(verse, { catalog: STORY_CATALOG, baseCategory: "Tanakh" }));
    view(summary);
    expect(related().getAllByRole("link")[0]).toHaveTextContent("Commentary");
  });

  // @feature CON-013 @feature CON-014 @feature CON-015 @feature CON-017
  describe("tools and resources (old ConnectionsPanel rules)", () => {
    const counts: ResourceCounts = { sheets: 979, webpages: null, audio: 1, topics: 7, manuscripts: 0, guides: 0, translations: 46 };
    const withCounts = (c?: ResourceCounts) =>
      render(<ResourcesView summary={topLevelSummary([cat("Commentary", 1)])} catalog={STORY_CATALOG} basePath="/Genesis.1.1" counts={c} sheetsHref="https://voices.sefaria.org/sheets-with-ref/Genesis.1.1" />);

    it("top tools link to their sidebar views; Translations shows its count", () => {
      withCounts(counts);
      expect(screen.getByRole("link", { name: "About this Text" })).toHaveAttribute("href", "/Genesis.1.1?with=About");
      expect(screen.getByRole("link", { name: "Table of Contents" })).toHaveAttribute("href", "/Genesis.1.1?with=Navigation");
      expect(screen.getByRole("link", { name: "Search in this Text" })).toHaveAttribute("href", "/Genesis.1.1?with=SidebarSearch");
      expect(screen.getByRole("link", { name: /Translations/ })).toHaveTextContent("(46)");
    });

    it("resources: zero counts hide, unknown counts show without a number, Sheets opens Voices in a new tab", () => {
      withCounts(counts);
      const res = within(screen.getByRole("region", { name: "Resources" }));
      const sheets = res.getByRole("link", { name: /Sheets/ });
      expect(sheets).toHaveTextContent("(979)");
      expect(sheets).toHaveAttribute("href", "https://voices.sefaria.org/sheets-with-ref/Genesis.1.1");
      expect(sheets).toHaveAttribute("target", "_blank");
      expect(res.getByRole("link", { name: "Web Pages" })).toHaveAttribute("href", "/Genesis.1.1?with=WebPages");
      expect(res.getByRole("link", { name: /Topics/ })).toHaveTextContent("(7)");
      expect(res.queryByRole("link", { name: /Manuscripts/ })).toBeNull();
      expect(res.getByRole("link", { name: /Torah Readings/ })).toHaveTextContent("(1)");
    });

    it("no resources section until counts arrive, or when everything is zero", () => {
      withCounts(undefined);
      expect(screen.queryByRole("region", { name: "Resources" })).toBeNull();
      expect(screen.getByRole("link", { name: "Translations" })).toBeInTheDocument(); // count not known yet
    });

    it("tools: Notes always shows; no Compare Text unless panels can sit side by side", () => {
      withCounts({ ...counts, sheets: 0, webpages: 0, audio: 0, topics: 0, translations: 0 });
      expect(screen.queryByRole("region", { name: "Resources" })).toBeNull();
      expect(screen.queryByRole("link", { name: /Translations/ })).toBeNull();
      const tools = within(screen.getByRole("region", { name: "Tools" }));
      expect(tools.getAllByRole("link").map((l) => l.textContent)).toEqual(["Add to Sheet", "Dictionaries", "Notes", "Share", "Feedback", "Advanced"]);
    });
  });
});
