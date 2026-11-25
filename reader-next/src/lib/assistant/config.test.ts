import { describe, expect, it } from "vitest";
import type { AssistantEnv } from "~/lib/config";
import {
  assistantAttributes,
  assistantBuild,
  designSystemCookie,
  designSystemFromCookie,
  designSystemFromQuery,
  designSystemPreviewAllowed,
  isDesignSystemRef,
  versionCookie,
  versionFromCookie,
  versionFromQuery,
} from "./config";

const env: AssistantEnv = { apiBaseUrl: "https://chat.sefaria.org/api", version: null, useLocalScript: false, origin: "sefaria-prod" };

// @feature AI-005 @feature AI-012 — the old server's rules (context_processors._chatbot_script_url_and_type, base_props)
describe("which assistant build a page loads", () => {
  it("?chatbot_version=<n> picks preview build n; 'clear' forgets; anything else is ignored", () => {
    expect(versionFromQuery("?q=1&chatbot_version=123")).toEqual({ set: "123" });
    expect(versionFromQuery("?chatbot_version=clear")).toEqual({ clear: true });
    expect(versionFromQuery("?chatbot_version=evil.example.com/x")).toBeNull();
    expect(versionFromQuery("?lang=en")).toBeNull();
  });
  it("is remembered for the session in a cookie", () => {
    expect(versionCookie("123")).toBe("chatbot_version=123; path=/; SameSite=Lax");
    expect(versionFromCookie("a=1; chatbot_version=123; b=2")).toBe("123");
    expect(versionFromCookie("chatbot_version=x1")).toBeNull();
    expect(versionCookie(null)).toContain("max-age=0");
    expect(versionCookie("123", true)).toBe("chatbot_version=123; path=/; SameSite=Lax; Secure");
  });
  it("a reader's version, then CHATBOT_VERSION, then CHATBOT_USE_LOCAL_SCRIPT, then CHATBOT_API_BASE_URL", () => {
    expect(assistantBuild("123", { ...env, version: "456", useLocalScript: true })).toEqual({
      scriptUrl: "https://123.ai-server.coolifydev.sefaria.org/static/js/lc-chatbot.umd.cjs",
      apiBaseUrl: "https://123.ai-server.coolifydev.sefaria.org/api",
    });
    expect(assistantBuild(null, { ...env, version: "456" }).apiBaseUrl).toBe("https://456.ai-server.coolifydev.sefaria.org/api");
    expect(assistantBuild(null, { ...env, useLocalScript: true })).toEqual({ scriptUrl: "http://localhost:5173/src/main.js", scriptType: "module", apiBaseUrl: env.apiBaseUrl });
    expect(assistantBuild(null, env)).toEqual({ scriptUrl: "https://chat.sefaria.org/static/js/lc-chatbot.umd.cjs", apiBaseUrl: "https://chat.sefaria.org/api" });
  });
});

// @feature AI-011 — the attributes sefaria.org's ReaderApp gives <lc-chatbot>
describe("assistantAttributes", () => {
  it("token, API, origin, the floating window open on the right, limits from remote config, the interface language", () => {
    const a = assistantAttributes({ enabled: true, userToken: "tok", isModerator: false }, assistantBuild(null, env), env, { interfaceLang: "he", maxInputChars: 5000, maxPrompts: undefined });
    expect(a).toEqual({
      "user-id": "tok",
      "api-base-url": "https://chat.sefaria.org/api",
      origin: "sefaria-prod",
      placement: "right",
      "default-open": "true",
      mode: "floating",
      "max-input-chars": "5000",
      "max-prompts": "100",
      "interface-lang": "he",
    });
    expect(assistantAttributes({ enabled: true, userToken: "t", isModerator: true }, assistantBuild(null, env), env, { interfaceLang: "en" })["is-moderator"]).toBe("true");
  });
});

// sefaria/utils/design_system.py (master #4045), and its tests (sefaria/utils/tests/design_system_test.py)
describe("design-system previews", () => {
  it("are allowed on the old server's preview hosts only, never production", () => {
    for (const h of ["localhost:3000", "127.0.0.1", "www.reader-next.cauldron.sefaria.org", "sefariastaging.org", "www.sefariastaging.org", "www.sefariastaging-il.org"])
      expect(designSystemPreviewAllowed(h), h).toBe(true);
    for (const h of ["www.sefaria.org", "sefaria.org", "www.sefaria.org.il", "cauldron.sefaria.org.evil.com", "notsefariastaging.org"])
      expect(designSystemPreviewAllowed(h), h).toBe(false);
  });
  it("take a branch or commit, nothing else", () => {
    for (const r of ["main", "feature/new-blue", "v1.2.0", "a1b2c3d"]) expect(isDesignSystemRef(r), r).toBe(true);
    for (const r of ["", "../etc", "a..b", "a b", "a<b>", "x".repeat(101), "/lead"]) expect(isDesignSystemRef(r), r).toBe(false);
  });
  it("read ?design_system=, remember it in a session cookie, and forget it with clear", () => {
    expect(designSystemFromQuery("?design_system=feature/new-blue")).toEqual({ set: "feature/new-blue" });
    expect(designSystemFromQuery("?design_system=clear")).toEqual({ clear: true });
    expect(designSystemFromQuery("?design_system=a..b")).toBeNull();
    expect(designSystemFromQuery("?q=1")).toBeNull();
    const cookie = designSystemCookie("feature/new-blue").split(";")[0]!;
    expect(designSystemFromCookie(`a=1; ${cookie}; b=2`)).toBe("feature/new-blue");
    expect(designSystemCookie(null)).toContain("max-age=0");
    expect(designSystemFromCookie("design_system_preview=%E0%A4%A")).toBeNull();
  });
  it("reach the assistant as its design-system-preview attribute, only when there is one", () => {
    const access = { enabled: true, userToken: null, isModerator: false };
    const build = { scriptUrl: "s", apiBaseUrl: "https://ai.example/api" };
    const env = { origin: "sefaria-dev", apiBaseUrl: "https://ai.example/api", version: null, useLocalScript: false } as never;
    expect(assistantAttributes(access, build, env, { interfaceLang: "en", designSystemPreview: "v1.2.0" })["design-system-preview"]).toBe("v1.2.0");
    expect(assistantAttributes(access, build, env, { interfaceLang: "en" })).not.toHaveProperty("design-system-preview");
  });
});
