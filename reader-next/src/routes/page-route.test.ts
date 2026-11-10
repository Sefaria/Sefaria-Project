// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";

const loadStaticPage = vi.fn();
vi.mock("~/lib/static-page/load", () => ({ loadStaticPage: (...a: unknown[]) => loadStaticPage(...a) }));
vi.mock("~/lib/routing/canonical", () => ({ pageCanonicalOrigin: async () => "https://www.sefaria.org" }));

const { Route } = await import("./$page");
type Loader = (ctx: { params: { page: string }; context: { interfaceLang: string }; location: { href: string } }) => Promise<{ model: { page: string; title: string }; owner: string }>;
const load = (page: string, interfaceLang = "english") => (Route.options.loader as unknown as Loader)({ params: { page }, context: { interfaceLang }, location: { href: `/${page}` } });

// @feature STA-008 — v-exits F-9: the ports are rendered without Django, even when Django has no content mode
describe("the static pages' route", () => {
  beforeEach(() => {
    loadStaticPage.mockReset();
    loadStaticPage.mockResolvedValue({ kind: "unsupported" });
  });
  it("/mobile, /educators and the English /ways-to-give: this client's port, Django not asked", async () => {
    for (const [page, lang] of [["mobile", "english"], ["mobile", "hebrew"], ["educators", "english"], ["educators", "hebrew"], ["ways-to-give", "english"]]) {
      const d = await load(page!, lang);
      expect(d.owner).toBe("port");
      expect(d.model.page).toBe(page);
    }
    expect(loadStaticPage).not.toHaveBeenCalled();
  });
  it("a content page still asks Django, and goes to Django's own page when it has no content mode", async () => {
    await expect(load("about")).rejects.toBeTruthy();
    expect(loadStaticPage).toHaveBeenCalledTimes(1);
  });
});
