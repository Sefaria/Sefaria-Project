import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { staticPageOwner } from "./pages";
import { portModel } from "./port-model";

const fixture = (page: string, lang: string) =>
  JSON.parse(readFileSync(join(__dirname, "..", "..", "..", "e2e", "fixtures", "static-pages", `${page}.${lang}.json`), "utf8")) as { title: string; description: string; bodyClass: string };

// @feature STA-008 — v-exits F-9: a port needs nothing from Django; its head is what Django renders from the template
describe("portModel", () => {
  for (const [page, lang] of [["mobile", "en"], ["mobile", "he"], ["educators", "en"], ["educators", "he"], ["ways-to-give", "en"]] as const) {
    it(`${page} (${lang}): every port has one, with Django's title, description and body class`, () => {
      expect(staticPageOwner(page, lang)).toBe("port");
      const m = portModel(page, lang)!;
      const d = fixture(page, lang);
      expect({ title: m.title, description: m.description, bodyClass: m.bodyClass }).toEqual({ title: d.title, description: d.description, bodyClass: d.bodyClass });
      expect(m.inlineCss).toBe(""); // build-time CSS only (DECISIONS 2026-11-10)
    });
  }
  it("none for a page Django renders", () => {
    expect(portModel("ways-to-give", "he")).toBeNull();
    expect(portModel("about", "en")).toBeNull();
  });
});
