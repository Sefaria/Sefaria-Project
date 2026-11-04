import { describe, expect, it } from "vitest";
import type { TopicTocNode } from "~/lib/topics/topic-toc";
import { topicsOwnerFrom } from "./topics-owner";

const t = (slug: string, children?: TopicTocNode[]): TopicTocNode => ({ slug, primaryTitle: { en: slug, he: slug }, ...(children ? { children } : {}) });
const toc = [t("holidays", [t("shabbat", [t("kiddush")]), t("rosh-hashanah")]), t("biblical-figures", [t("moses")])];
const listed = new Set(["moses", "shabbat", "kiddush", "rosh-hashanah"]);
const owner = (path: string, search = "") => topicsOwnerFrom(path, new URLSearchParams(search), { toc, listed });

// @feature TOP-036
describe("topicsOwnerFrom: which /topics pages this client renders, before rendering", () => {
  it("renders the A–Z list's topics, also as the b test version", () => {
    expect(owner("/topics/moses")).toBe("client");
    expect(owner("/topics/b/moses")).toBe("client");
    expect(owner("/topics/Moses")).toBe("client"); // the slug as Django normalises it
  });
  it("hands Django a topic outside the A–Z list, and the editors", () => {
    expect(owner("/topics/aarons-staff")).toBe("django");
    expect(owner("/topics/moses", "editor=1&tab=sources")).toBe("django");
    expect(owner("/topics/moses", "editor=0")).toBe("client");
  });
  it("renders the TOC's categories and hands Django any other /topics/category/<slug>", () => {
    expect(owner("/topics/category/holidays")).toBe("client");
    expect(owner("/topics/category/shabbat")).toBe("client");
    expect(owner("/topics/category/moses")).toBe("django");
    expect(owner("/topics/category/kiddush")).toBe("django");
  });
  it("leaves the landing, A–Z and anything else to the routes, and decides nothing without the lists", () => {
    for (const p of ["/topics", "/topics/", "/topics/all/a", "/topics/all", "/topics/category", "/topics/moses/x", "/topics/%E0%A4%A"]) expect(owner(p), p).toBe("unknown");
    expect(topicsOwnerFrom("/topics/aarons-staff", new URLSearchParams(), {})).toBe("unknown");
    expect(topicsOwnerFrom("/topics/category/moses", new URLSearchParams(), { listed })).toBe("unknown");
  });
});
