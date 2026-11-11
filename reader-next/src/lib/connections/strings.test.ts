import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { CONNECTION_PANEL_SECTION } from "./strings";

// the old client's interface strings, in this repository (static/js/sefaria/i18n/interface)
const legacy = (lang: "en" | "he") =>
  JSON.parse(readFileSync(resolve(__dirname, `../../../../static/js/sefaria/i18n/interface/${lang}.json`), "utf8")) as Record<string, unknown>;
const flat = (o: Record<string, unknown>): Record<string, string> => {
  const out: Record<string, string> = {};
  const walk = (v: unknown) => {
    if (v && typeof v === "object") for (const [k, x] of Object.entries(v)) (typeof x === "string" ? (out[k] = x) : walk(x));
  };
  walk(o);
  return out;
};

describe("the sidebar's section headings", () => {
  it("are legacy's connection_panel_section strings, word for word", () => {
    const en = flat(legacy("en"));
    const he = flat(legacy("he"));
    for (const [key, s] of Object.entries(CONNECTION_PANEL_SECTION)) {
      expect(s.en, key).toBe(en[`connection_panel_section.${key}`]);
      expect(s.he, key).toBe(he[`connection_panel_section.${key}`]);
    }
  });
});
