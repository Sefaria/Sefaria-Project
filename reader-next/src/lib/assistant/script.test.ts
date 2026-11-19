import { afterEach, describe, expect, it, vi } from "vitest";
import { loadAssistantScript } from "./script";

const build = { scriptUrl: "https://chat.example.org/static/js/lc-chatbot.umd.cjs", apiBaseUrl: "https://chat.example.org/api" };

// @feature AI-011 — one script per page; a build that fails to load does not block a later try
describe("loadAssistantScript", () => {
  afterEach(() => {
    document.getElementById("sefaria-library-assistant")?.remove();
    vi.restoreAllMocks();
  });
  it("adds the build's script once, a module only for the dev server", () => {
    const a = loadAssistantScript(build);
    expect(loadAssistantScript({ ...build, scriptUrl: "https://other/x.js" })).toBe(a);
    expect(document.querySelectorAll("#sefaria-library-assistant")).toHaveLength(1);
    expect(a.src).toBe(build.scriptUrl);
    expect(a.type).toBe("");
    a.remove();
    expect(loadAssistantScript({ ...build, scriptType: "module" }).type).toBe("module");
  });
  it("removes a script that failed to load, so the next page can try again", () => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    const a = loadAssistantScript(build);
    a.dispatchEvent(new Event("error"));
    expect(document.getElementById("sefaria-library-assistant")).toBeNull();
    expect(loadAssistantScript(build)).not.toBe(a);
  });
});
