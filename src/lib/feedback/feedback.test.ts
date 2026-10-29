import { afterEach, describe, expect, it, vi } from "vitest";
import { sendFeedback } from "./feedback";

// @feature CON-067
describe("sendFeedback", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    document.cookie = "csrftoken=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/";
  });

  // CODE_REVIEW R-23: Django's send_feedback is CSRF-protected; without the header every submit was a 403
  it("posts the old form body to this site with the session cookie and the CSRF token", async () => {
    document.cookie = "csrftoken=tok123; path=/";
    const fetch = vi.fn(async () => new Response(JSON.stringify({ status: "ok" }), { status: 200 }));
    vi.stubGlobal("fetch", fetch);
    await sendFeedback({ refs: ["Genesis 1:1"], type: "bug_report", url: "https://x/Genesis.1.1", email: "a@b.c", msg: "hi", uid: null });
    const [url, init] = fetch.mock.calls[0] as unknown as [string, RequestInit];
    expect(new URL(url).pathname).toBe("/api/send_feedback");
    expect(new URL(url).origin).toBe(window.location.origin);
    expect(init.credentials).toBe("same-origin");
    expect((init.headers as Record<string, string>)["X-CSRFToken"]).toBe("tok123");
    expect(JSON.parse(new URLSearchParams(init.body as string).get("json")!)).toMatchObject({ type: "bug_report", msg: "hi" });
  });

  it("reports a refusal and an error answer", async () => {
    document.cookie = "csrftoken=tok123; path=/";
    vi.stubGlobal("fetch", vi.fn(async () => new Response("{}", { status: 403 })));
    await expect(sendFeedback({ refs: null, type: "other", url: null, msg: "x", uid: null } as never)).rejects.toThrow(/403/);
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ error: "Bad email" }), { status: 200 })));
    await expect(sendFeedback({ refs: null, type: "other", url: null, msg: "x", uid: null } as never)).rejects.toThrow("Bad email");
  });
});
