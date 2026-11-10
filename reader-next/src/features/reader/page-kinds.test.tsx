import { describe, expect, it } from "vitest";
import { isPageKindLoaded, loadPageKind, PAGE_KIND_META, renderedPageKind } from "./page-kinds";

// LAUNCH_PLAN T-H03: each page kind is its own chunk, loaded before the page renders (never behind a Suspense boundary)
describe("page kinds", () => {
  it("reads the kind the server rendered from its meta tag", () => {
    const doc = (content: string | null) => ({ querySelector: (sel: string) => (sel.includes(PAGE_KIND_META) && content !== null ? { getAttribute: () => content } : null) }) as unknown as Document;
    expect(renderedPageKind(doc("text"))).toBe("text");
    expect(renderedPageKind(doc("book"))).toBe("book");
    expect(renderedPageKind(doc("other"))).toBeUndefined();
    expect(renderedPageKind(doc(null))).toBeUndefined();
  });
  it("loads a kind's code once, and only that kind", async () => {
    expect(isPageKindLoaded("book")).toBe(false);
    const a = loadPageKind("book");
    expect(loadPageKind("book")).toBe(a); // one import in flight
    await a;
    expect(isPageKindLoaded("book")).toBe(true);
    expect(isPageKindLoaded("text")).toBe(false);
  }, 30_000);
});
