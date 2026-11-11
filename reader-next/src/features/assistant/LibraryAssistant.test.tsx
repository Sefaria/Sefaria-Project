import { render, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { InterfaceLangProvider } from "~/lib/i18n/interface-lang";
import { SiteHostProvider } from "~/lib/routing/library-href";
import { LibraryAssistant } from "./LibraryAssistant";

const ME = { id: 7, name: "Reader", email: "r@example.org" };

function setup(opts: { viewer?: typeof ME | null; access?: unknown; remote?: Record<string, unknown>; phone?: boolean; search?: string; pathname?: string; host?: string; lang?: "english" | "hebrew" } = {}) {
  window.matchMedia = vi.fn((q: string) => ({ matches: !!opts.phone && q.includes("max-width"), media: q, addEventListener: () => {}, removeEventListener: () => {} })) as unknown as typeof window.matchMedia;
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false, staleTime: Infinity } } });
  qc.setQueryData(["user", "viewer"], opts.viewer === undefined ? ME : opts.viewer);
  qc.setQueryData(["remote-config"], opts.remote ?? { "feature.chatbot.max_input_chars": 5000, "feature.chatbot.max_prompts": 50 });
  if (opts.viewer !== null) qc.setQueryData(["user", "library-assistant", ME.id], opts.access ?? { enabled: true, userToken: "tok", isModerator: false });
  return render(
    <QueryClientProvider client={qc}>
      <InterfaceLangProvider lang={opts.lang ?? "english"}>
        <SiteHostProvider value={opts.host ?? "www.sefaria.org"}>
          <LibraryAssistant search={opts.search ?? ""} pathname={opts.pathname ?? "/texts"} />
        </SiteHostProvider>
      </InterfaceLangProvider>
    </QueryClientProvider>,
  );
}
const script = () => document.getElementById("sefaria-library-assistant") as HTMLScriptElement | null;

// @feature AI-011 @feature AI-005 — sefaria.org's ReaderApp rule and attributes; its context processor's build choice
describe("LibraryAssistant", () => {
  beforeEach(() => {
    document.cookie = "chatbot_version=; path=/; max-age=0";
    script()?.remove();
  });
  afterEach(() => vi.restoreAllMocks());

  it("for a reader who has it: <lc-chatbot> with its attributes, and the build's script loaded once", async () => {
    const { container } = setup({ lang: "hebrew" });
    const el = await waitFor(() => container.querySelector("lc-chatbot")!);
    expect(el.getAttribute("user-id")).toBe("tok");
    expect(el.getAttribute("api-base-url")).toBe("https://chat-dev.sefaria.org/api");
    expect(el.getAttribute("mode")).toBe("floating");
    expect(el.getAttribute("default-open")).toBe("true");
    expect(el.getAttribute("max-input-chars")).toBe("5000");
    expect(el.getAttribute("max-prompts")).toBe("50");
    expect(el.getAttribute("interface-lang")).toBe("he");
    expect(el.hasAttribute("is-moderator")).toBe(false);
    expect(script()?.src).toBe("https://chat-dev.sefaria.org/static/js/lc-chatbot.umd.cjs");
  });

  it("?chatbot_version=<n> loads preview build n and talks to its API, remembered for the session", async () => {
    const { container } = setup({ search: "?chatbot_version=321" });
    const el = await waitFor(() => container.querySelector("lc-chatbot")!);
    expect(el.getAttribute("api-base-url")).toBe("https://321.ai-server.coolifydev.sefaria.org/api");
    expect(script()?.src).toBe("https://321.ai-server.coolifydev.sefaria.org/static/js/lc-chatbot.umd.cjs");
    expect(document.cookie).toContain("chatbot_version=321");
  });

  it("?chatbot_version=clear forgets it, and a later page does not bring it back", async () => {
    document.cookie = "chatbot_version=321; path=/";
    const first = setup({ search: "?chatbot_version=clear" });
    await waitFor(() => first.container.querySelector("lc-chatbot")!);
    expect(document.cookie).not.toContain("chatbot_version=321");
    first.unmount();
    const later = setup({ search: "?lang=en" });
    const el = await waitFor(() => later.container.querySelector("lc-chatbot")!);
    expect(el.getAttribute("api-base-url")).toBe("https://chat-dev.sefaria.org/api");
  });

  // parity S3: sefaria.org shows it to signed-out visitors unless remote config's feature.chatbot.anonymous_enabled is off
  it("for a signed-out visitor: <lc-chatbot> without a token, with the free answers and the sign-up prompt's options", async () => {
    const { container } = setup({ viewer: null, search: "?q=1", pathname: "/Genesis.1", remote: { "feature.chatbot.anonymous_free_answers": 3 } });
    const el = await waitFor(() => container.querySelector("lc-chatbot")!);
    expect(el.hasAttribute("user-id")).toBe(false);
    expect(el.getAttribute("anon-free-answers")).toBe("3");
    expect(el.getAttribute("api-base-url")).toBe("https://chat-dev.sefaria.org/api");
    const slot = el.querySelector('[slot="signup-options"]')!;
    expect(slot.getAttribute("data-signup-source")).toBe("rate_limit_login_button");
    expect([...slot.querySelectorAll("a")].map((a) => a.getAttribute("href"))).toEqual([
      `/register?next=${encodeURIComponent("/Genesis.1?q=1")}`,
      `/login?next=${encodeURIComponent("/Genesis.1?q=1")}`,
    ]);
    expect(script()?.src).toBe("https://chat-dev.sefaria.org/static/js/lc-chatbot.umd.cjs");
  });

  it("a signed-in reader gets no anonymous attributes and no sign-up options", async () => {
    const { container } = setup({ remote: { "feature.chatbot.anonymous_free_answers": 3 } });
    const el = await waitFor(() => container.querySelector("lc-chatbot")!);
    expect(el.hasAttribute("anon-free-answers")).toBe(false);
    expect(el.querySelector('[slot="signup-options"]')).toBeNull();
  });

  it("nothing for a guest when remote config turns it off, on the auth pages, for a reader without it, a phone, or when remote config hides it — and no script downloaded", async () => {
    for (const o of [
      { viewer: null, remote: { "feature.chatbot.anonymous_enabled": false } },
      { viewer: null, remote: { "feature.chatbot.anonymous_enabled": "off" } },
      { viewer: null, pathname: "/login" },
      { viewer: null, pathname: "/password/reset/confirm/MQ/set-password/" },
      { pathname: "/register" },
      // the old ReaderApp's isLibraryModule: never on the Voices host, signed in or out (rework item 4)
      { viewer: null, host: "voices.sefaria.org" },
      { host: "chiburim.sefaria.org.il" },
      { access: { enabled: false, userToken: null, isModerator: false } },
      { phone: true },
      { remote: { "feature.client.remote_config_json": { chatbot: { hide: 1 } } } },
    ]) {
      const { container, unmount } = setup(o);
      await new Promise((r) => setTimeout(r, 20));
      expect(container.querySelector("lc-chatbot")).toBeNull();
      unmount();
    }
    expect(script()).toBeNull();
  });
});
