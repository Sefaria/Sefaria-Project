import { describe, expect, it } from "vitest";
import type { AssistantEnv } from "~/lib/config";
import { assistantAttributes, assistantBuild, versionCookie, versionFromCookie, versionFromQuery } from "./config";

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
