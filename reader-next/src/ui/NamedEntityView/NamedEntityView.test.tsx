import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { entitiesOf, entitySourceNote } from "~/lib/connections/entity";
import { InterfaceLangProvider } from "~/lib/i18n/interface-lang";
import { NamedEntityView } from "./NamedEntityView";

const person = {
  slug: "rabbi-eliezer-b-hyrcanus",
  primaryTitle: { en: "Rabbi Eliezer b. Hyrcanus", he: "רבי אליעזר" },
  timePeriod: { name: { en: "Tannaim - Third Generation", he: "תנאים - דור שלישי" }, yearRange: { en: " c.80 – c.110 CE", he: " 80 – 110" } },
  description: { en: "A **rabbinic sage**.", he: "חכם" },
};
const props = { text: "Rabbi Eliezer", topicHref: (s: string) => `https://www.sefaria.org/topics/${s}`, sourceNote: "note" };

// @feature CON-045 @feature TXD-022
describe("NamedEntityView", () => {
  it("title links to the topic page in a new tab; period, years and markdown description", () => {
    render(<NamedEntityView {...props} answer={person} />);
    const link = screen.getByRole("link", { name: "Rabbi Eliezer b. Hyrcanus" });
    expect(link).toHaveAttribute("href", "https://www.sefaria.org/topics/rabbi-eliezer-b-hyrcanus");
    expect(link).toHaveAttribute("target", "_blank");
    expect(screen.getByText("Tannaim - Third Generation")).toBeInTheDocument();
    expect(screen.getByText("c.80 – c.110 CE")).toBeInTheDocument();
    expect(screen.getByText("rabbinic sage").tagName).toBe("STRONG");
  });
  it("no description: says so", () => {
    render(<NamedEntityView {...props} answer={{ ...person, description: null }} />);
    expect(screen.getByText("No description known for 'Rabbi Eliezer b. Hyrcanus'")).toBeInTheDocument();
  });
  it("ambiguous names list every possibility after the intro", () => {
    render(<NamedEntityView {...props} text="Rabban Gamliel" answer={{ slug: "x-(ambiguous)", possibilities: [person, { ...person, slug: "rg", primaryTitle: { en: "Rabban Gamliel II", he: "ר״ג" } }] }} />);
    expect(screen.getByText('"Rabban Gamliel" could refer to one of the following:')).toBeInTheDocument();
    expect(screen.getAllByRole("link")).toHaveLength(2);
  });
  it("loads, and speaks Hebrew in a Hebrew interface", () => {
    const { rerender } = render(<NamedEntityView {...props} answer={undefined} />);
    expect(screen.getByRole("status")).toBeInTheDocument();
    rerender(<InterfaceLangProvider lang="hebrew"><NamedEntityView {...props} answer={person} /></InterfaceLangProvider>);
    expect(screen.getByRole("link", { name: "רבי אליעזר" })).toBeInTheDocument();
  });
  it("entities of an answer; the source note by text", () => {
    expect(entitiesOf({ slug: "a", possibilities: [person] })).toHaveLength(1);
    expect(entitySourceNote("Jerusalem Talmud Berakhot 1:1", { en: "JT", he: "ירושלמי" }).en).toContain("by Sefaria");
    expect(entitySourceNote("Berakhot 2a:1", { en: "B", he: "ב" }).en).toContain("Michael Sperling");
  });
});
