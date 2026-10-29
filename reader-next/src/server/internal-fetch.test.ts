// @vitest-environment node
import { afterEach, describe, expect, it, vi } from "vitest";

// CODE_REVIEW R-05: a hung API used to hold page renders open until nginx gave up; a failed upstream made the page a 500
describe("server-side fetch: read deadline and upstream health", () => {
  const original = globalThis.fetch;
  afterEach(() => {
    globalThis.fetch = original;
    delete (globalThis as { __sefariaFetchPatched?: boolean }).__sefariaFetchPatched;
    vi.unstubAllEnvs();
    vi.resetModules();
  });

  async function install(fake: typeof fetch) {
    vi.stubEnv("SEFARIA_API_TIMEOUT_MS", "40");
    vi.resetModules();
    delete (globalThis as { __sefariaFetchPatched?: boolean }).__sefariaFetchPatched;
    globalThis.fetch = fake;
    const mod = await import("./internal-fetch");
    mod.installInternalApiFetch();
    return mod;
  }

  /** An upstream that never answers, but stops when aborted (as fetch does). */
  const hanging = vi.fn((_: unknown, init?: RequestInit) => new Promise<Response>((_r, reject) => init?.signal?.addEventListener("abort", () => reject(init.signal!.reason))));

  it("a read without its own signal is cut off at the deadline, and the request is marked as failed upstream", async () => {
    const { withUpstreamHealth } = await install(hanging as unknown as typeof fetch);
    const health = { failed: false };
    const t0 = Date.now();
    await expect(withUpstreamHealth(health, () => fetch("https://www.sefaria.org/api/v3/texts/Genesis%201"))).rejects.toBeTruthy();
    expect(Date.now() - t0).toBeLessThan(2000);
    expect(health.failed).toBe(true);
  });

  it("a read that brings its own signal (the query client always does) still gets the deadline", async () => {
    const { withUpstreamHealth } = await install(hanging as unknown as typeof fetch);
    const health = { failed: false };
    const own = new AbortController().signal;
    const t0 = Date.now();
    await expect(withUpstreamHealth(health, () => fetch("https://www.sefaria.org/api/v3/texts/Genesis%201", { signal: own }))).rejects.toBeTruthy();
    expect(Date.now() - t0).toBeLessThan(2000);
    expect(health.failed).toBe(true);
  });

  it("a caller can ask for a longer deadline (the pass-through to Django's pages)", async () => {
    const seen: AbortSignal[] = [];
    await install((async (_: unknown, init?: RequestInit) => (seen.push(init!.signal!), new Response("ok"))) as typeof fetch);
    await fetch("https://www.sefaria.org/topics", { deadlineMs: 60_000 } as RequestInit);
    await new Promise((r) => setTimeout(r, 80)); // past the 40 ms API deadline
    expect(seen[0]!.aborted).toBe(false);
  });

  it("a write is never given a deadline", async () => {
    const ok = vi.fn(async () => new Response("{}", { status: 200 }));
    await install(ok as unknown as typeof fetch);
    await fetch("https://www.sefaria.org/api/notes", { method: "POST", body: "x" });
    expect((ok.mock.calls[0] as unknown as [string, RequestInit])[1]?.signal).toBeUndefined();
  });

  it("an upstream 5xx marks the request; a 404 does not", async () => {
    let status = 502;
    const { withUpstreamHealth } = await install((async () => new Response("x", { status })) as typeof fetch);
    const bad = { failed: false };
    await withUpstreamHealth(bad, () => fetch("https://www.sefaria.org/api/x"));
    expect(bad.failed).toBe(true);
    status = 404;
    const fine = { failed: false };
    await withUpstreamHealth(fine, () => fetch("https://www.sefaria.org/api/x"));
    expect(fine.failed).toBe(false);
  });
});
