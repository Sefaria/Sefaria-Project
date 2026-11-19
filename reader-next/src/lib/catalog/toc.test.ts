import { describe, expect, it } from "vitest";
import { readFixture } from "../../../test/msw/fixtures";
import { buildCatalog, isCategory, type TocNode } from "./toc";

const catalog = buildCatalog(readFixture<TocNode[]>("_toc/toc.json"));

// @feature LIB-001
describe("catalog", () => {
  it("lists the top categories in library order", () => {
    expect(catalog.topCategories[0]).toBe("Tanakh");
    expect(catalog.topCategories).toContain("Talmud");
    expect(catalog.topCategories.length).toBeGreaterThan(8);
  });

  it("finds a book by title with its Hebrew title, categories and description", () => {
    const g = catalog.books.get("Genesis")!;
    expect(g.heTitle).toBe("בראשית");
    expect(g.categories).toEqual(["Tanakh", "Torah"]);
    expect(g.enShortDesc).toBeTruthy();
  });

  it("indexes books at every depth, including commentary", () => {
    expect(catalog.books.get("Rashi on Genesis")?.categories[0]).toBe("Tanakh");
    expect(catalog.books.get("Berakhot")?.categories[0]).toBe("Talmud");
    expect(catalog.books.size).toBeGreaterThan(3000);
  });

  it("flat lookups cover everything the tree contains", () => {
    let n = 0;
    const walk = (nodes: TocNode[]) => nodes.forEach((x) => (isCategory(x) ? walk(x.contents ?? []) : n++));
    walk(catalog.tree);
    expect(catalog.books.size).toBeLessThanOrEqual(n);
    expect(catalog.books.size).toBeGreaterThan(n * 0.95); // duplicate titles collapse, nothing else is lost
  });
});
