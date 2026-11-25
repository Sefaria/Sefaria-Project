import { afterEach, describe, expect, it, vi } from "vitest";
import type { SocialEnv } from "~/lib/config";
import { asSurface, getSurface, loadSurfaceOnce, resetSurfaceLoader, SurfaceLoadError, type LoadDeps } from "./load";

const H = `sha384-${"A".repeat(64)}`;
const ORIGIN = "https://social.example.org";
const ENV: SocialEnv = { manifestUrl: `${ORIGIN}/manifest.json`, allowedOrigins: [ORIGIN], apiOrigin: "", relayOrigin: "", environment: "local" };
const MANIFEST = { version: "r1", contract: 1, entry: "entry.js", integrity: H, files: [{ path: "chunk.js", integrity: H }, { path: "s.css", integrity: H }], css: ["s.css"] };
const SURFACE = { id: "social", contract: 1, mountPage: () => () => {}, mountPersistent: () => () => {} };

/** Links "load" (or "error" for the URLs listed) as soon as they are added to the head. */
function fakeDeps(opts: { manifest?: unknown; status?: number; failLinks?: string[]; mod?: unknown; importError?: Error; timeoutMs?: number; hang?: boolean } = {}) {
  const added: HTMLLinkElement[] = [];
  const observer = new MutationObserver((records) => {
    for (const r of records)
      for (const n of r.addedNodes) {
        if (!(n instanceof HTMLLinkElement)) continue;
        added.push(n);
        const fail = opts.failLinks?.some((u) => n.href.endsWith(u));
        queueMicrotask(() => n.dispatchEvent(new Event(fail ? "error" : "load")));
      }
  });
  observer.observe(document.head, { childList: true });
  const fetchMock = vi.fn(async () => (opts.hang ? new Promise<Response>(() => {}) : new Response(JSON.stringify(opts.manifest ?? MANIFEST), { status: opts.status ?? 200 })));
  const importModule = vi.fn(async () => {
    if (opts.importError) throw opts.importError;
    return opts.mod ?? { default: SURFACE };
  });
  const deps: LoadDeps = { fetch: fetchMock as unknown as typeof fetch, doc: document, importModule, timeoutMs: opts.timeoutMs ?? 2000 };
  return { deps, added, fetchMock, importModule, stop: () => observer.disconnect() };
}

afterEach(() => {
  resetSurfaceLoader();
  document.head.querySelectorAll("link[data-surface]").forEach((l) => l.remove());
});

// @feature SHL-077
describe("loading a surface", () => {
  it("fetches the manifest without credentials, links every file with its hash, then imports the entry", async () => {
    const f = fakeDeps();
    const loaded = await loadSurfaceOnce(ENV, f.deps);
    f.stop();
    expect(loaded.version).toBe("r1");
    expect(loaded.surface.id).toBe("social");
    expect(f.fetchMock).toHaveBeenCalledWith(ENV.manifestUrl, expect.objectContaining({ credentials: "omit" }));
    expect(f.added.map((l) => [l.rel, l.href, l.integrity, l.crossOrigin])).toEqual([
      ["stylesheet", `${ORIGIN}/s.css`, H, "anonymous"],
      ["modulepreload", `${ORIGIN}/entry.js`, H, "anonymous"],
      ["modulepreload", `${ORIGIN}/chunk.js`, H, "anonymous"],
    ]);
    expect(f.importModule).toHaveBeenCalledWith(`${ORIGIN}/entry.js`);
  });

  const failures: [string, Parameters<typeof fakeDeps>[0], SocialEnv | undefined, string][] = [
    ["no configuration", {}, undefined, "config"],
    ["a manifest URL on an origin that is not allowed", {}, { ...ENV, allowedOrigins: ["https://other.example.org"] }, "origin"],
    ["a 404", { status: 404 }, ENV, "manifest"],
    ["a malformed manifest", { manifest: { version: "r1" } }, ENV, "manifest"],
    ["an unserved contract major", { manifest: { ...MANIFEST, contract: 2 } }, ENV, "contract"],
    ["a file on another origin", { manifest: { ...MANIFEST, entry: "https://evil.example/e.js" } }, ENV, "origin"],
    ["the entry failing its integrity check", { failLinks: ["/entry.js"] }, ENV, "integrity"],
    ["an entry that throws", { importError: new Error("boom") }, ENV, "module"],
    ["an entry that is not a Surface", { mod: { default: { id: "other" } } }, ENV, "contract"],
    ["a manifest that never answers", { hang: true, timeoutMs: 20 }, ENV, "timeout"],
  ];
  for (const [name, opts, env, reason] of failures)
    it(`fails cleanly on ${name}, leaving no link behind`, async () => {
      const f = fakeDeps(opts);
      const err = await loadSurfaceOnce(env, f.deps).catch((e: unknown) => e);
      f.stop();
      expect(err).toBeInstanceOf(SurfaceLoadError);
      expect((err as SurfaceLoadError).reason).toBe(reason);
      expect(document.head.querySelectorAll("link[data-surface]")).toHaveLength(0);
    });

  it("a development entry is imported directly, with no manifest", async () => {
    const f = fakeDeps();
    const loaded = await loadSurfaceOnce({ ...ENV, devEntry: "http://localhost:3200/src/surface/entry.ts" }, f.deps);
    f.stop();
    expect(loaded.version).toBe("dev");
    expect(f.fetchMock).not.toHaveBeenCalled();
    expect(f.importModule).toHaveBeenCalledWith("http://localhost:3200/src/surface/entry.ts");
  });

  it("asSurface checks the default export's shape", () => {
    expect(asSurface({ default: SURFACE })).toBe(SURFACE);
    expect(asSurface({ default: { ...SURFACE, contract: 2 } })).toBeNull();
    expect(asSurface({ default: { ...SURFACE, mountPage: "x" } })).toBeNull();
    expect(asSurface(null)).toBeNull();
  });
});

// @feature SHL-077
describe("once per document, one retry on a later page", () => {
  it("shares one load between mounts", async () => {
    const f = fakeDeps();
    const [a, b] = await Promise.all([getSurface(ENV, "/social", f.deps), getSurface(ENV, "/social", f.deps)]);
    f.stop();
    expect(a).toBe(b);
    expect(f.fetchMock).toHaveBeenCalledTimes(1);
  });

  it("after a failure: the same page does not retry, the next page retries once, then no more", async () => {
    const f = fakeDeps({ status: 503 });
    await expect(getSurface(ENV, "/a", f.deps)).rejects.toThrow();
    await expect(getSurface(ENV, "/a", f.deps)).rejects.toThrow();
    expect(f.fetchMock).toHaveBeenCalledTimes(1);
    await expect(getSurface(ENV, "/b", f.deps)).rejects.toThrow();
    expect(f.fetchMock).toHaveBeenCalledTimes(2);
    await expect(getSurface(ENV, "/c", f.deps)).rejects.toThrow();
    expect(f.fetchMock).toHaveBeenCalledTimes(2);
    f.stop();
  });

  it("a retry that succeeds is kept", async () => {
    const bad = fakeDeps({ status: 503 });
    await expect(getSurface(ENV, "/a", bad.deps)).rejects.toThrow();
    bad.stop();
    const good = fakeDeps();
    const loaded = await getSurface(ENV, "/b", good.deps);
    expect(await getSurface(ENV, "/c", good.deps)).toBe(loaded);
    expect(good.fetchMock).toHaveBeenCalledTimes(1);
    good.stop();
  });
});
