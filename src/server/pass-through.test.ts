import { describe, expect, it } from "vitest";
import { isDjangoPath } from "./pass-through";

describe("isDjangoPath (PLT deployment: which requests go to Django)", () => {
  it("sends Django's own sections through", () => {
    for (const p of ["/api/texts/Genesis.1", "/login", "/login/", "/topics", "/topics/light", "/sheets/123", "/static/js/x.js", "/profile/me", "/admin/", "/sefaria.js"]) {
      expect(isDjangoPath(p, "GET"), p).toBe(true);
    }
  });
  it("keeps reader and library pages here", () => {
    for (const p of ["/", "/texts", "/texts/Tanakh", "/Genesis.1", "/Genesis.1.1-5", "/search", "/Rashi_on_Genesis.1.1", "/topicsfoo", "/apis"]) {
      expect(isDjangoPath(p, "GET"), p).toBe(false);
    }
  });
  it("sends every write through, whatever the path", () => {
    expect(isDjangoPath("/Genesis.1", "POST")).toBe(true);
    expect(isDjangoPath("/", "DELETE")).toBe(true);
    expect(isDjangoPath("/Genesis.1", "HEAD")).toBe(false);
  });
});
