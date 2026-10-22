import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import type { CategorySummary } from "~/lib/connections/summary";
import { CategoryView } from "./CategoryView";
import { STORY_CATALOG } from "./story-data";

const book = (name: string, count: number, hasEnglish = true) => ({ book: name, heBook: name + "-he", category: "Commentary", count, hasEnglish, enShortDesc: `${name} desc` });
const commentary: CategorySummary = { category: "Commentary", count: 4, hasEnglish: true, books: [book("Rashi", 3), book("Ramban", 1), book("Sforno", 0, false)] };
const quoting: CategorySummary = { category: "Quoting Commentary", count: 2, hasEnglish: false, books: [{ ...book("Sforno on Genesis", 2, false), category: "Quoting Commentary" }] };
const render_ = (categories: CategorySummary[], current?: string) => render(<CategoryView categories={categories} catalog={STORY_CATALOG} basePath="/Genesis.1.1" current={current} />);

// @feature CON-025 @feature CON-026
describe("CategoryView", () => {
  it("starts with an All row, then each book with its count", () => {
    render_([commentary]);
    const links = screen.getAllByRole("link");
    expect(links[0]).toHaveTextContent("All Commentary");
    expect(links[0]).toHaveTextContent("(4)");
    expect(links[0]).toHaveAttribute("href", "/Genesis.1.1?with=Commentary");
    expect(links[1]).toHaveTextContent("Rashi");
    expect(links[1]).toHaveTextContent("(3)");
    expect(links[1]).toHaveAttribute("href", "/Genesis.1.1?with=Rashi");
  });

  it("carries display state on every link", () => {
    render(<CategoryView categories={[commentary]} catalog={STORY_CATALOG} basePath="/Genesis.1.1" search="&lang=he" />);
    expect(screen.getByRole("link", { name: /Rashi/ })).toHaveAttribute("href", "/Genesis.1.1?with=Rashi&lang=he");
  });

  it("shows each book's short description", () => {
    render_([commentary]);
    expect(screen.getByText("Rashi desc")).toBeInTheDocument();
  });

  it("keeps books with no links listed, dimmed", () => {
    render_([commentary]);
    const sforno = screen.getByRole("link", { name: /Sforno/ });
    expect(sforno).toHaveTextContent("(0)");
  });

  it("filters quoting commentary with a suffix so it does not match the commentary itself", () => {
    render_([commentary, quoting]);
    expect(screen.getByRole("link", { name: /Sforno on Genesis/ })).toHaveAttribute("href", "/Genesis.1.1?with=Sforno+on+Genesis%7CQuoting");
  });

  it("marks the active filter", () => {
    render_([commentary], "Rashi");
    expect(screen.getByRole("link", { name: /Rashi/ })).toHaveAttribute("aria-current", "true");
    expect(screen.getByRole("link", { name: /Ramban/ })).not.toHaveAttribute("aria-current");
  });

  it("shows a zero placeholder for an empty category", () => {
    render_([{ category: "Midrash", count: 0, hasEnglish: false, books: [] }]);
    expect(screen.getByRole("link", { name: /All Midrash/ })).toHaveTextContent("(0)");
  });
});
