import { describe, expect, it } from "vitest";
import { hebrewSiteOrigin } from "./site-origins";

// @feature CAL-001
describe("hebrewSiteOrigin", () => {
  it("www.sefaria.org's Hebrew twin is www.sefaria.org.il", () => {
    expect(hebrewSiteOrigin("https://www.sefaria.org")).toBe("https://www.sefaria.org.il");
    expect(hebrewSiteOrigin("https://www.sefaria.org/")).toBe("https://www.sefaria.org.il");
  });
  it("a host with no Hebrew twin is kept", () => {
    expect(hebrewSiteOrigin("http://localhost:3330")).toBe("http://localhost:3330");
    expect(hebrewSiteOrigin("https://notsefaria.org")).toBe("https://notsefaria.org");
    expect(hebrewSiteOrigin("https://x.cauldron.sefaria.org")).toBe("https://x.cauldron.sefaria.org");
  });
});
