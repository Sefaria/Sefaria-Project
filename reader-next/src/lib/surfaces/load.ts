/**
 * Load the social surface's bundle into the page, once per document, in the browser only, and only while its lab is on (the caller
 * decides; src/features/surfaces).
 *
 *  1. Fetch the manifest from PUBLIC_SOCIAL_MANIFEST_URL, which must be on an allowed origin (PUBLIC_SOCIAL_ORIGINS), without
 *     credentials. Validate it (manifest.ts): shape, a contract major this reader serves, every file on an allowed origin.
 *  2. Link its stylesheets with their integrity hashes, and put a `<link rel="modulepreload" integrity crossorigin>` in the page for
 *     the entry and for every JS file it lists, all in the same task, before anything imports them.
 *  3. Once the entry's preload has loaded, `import()` the entry and check its default export is a Surface for this contract.
 *
 * Integrity: `import()` itself takes no integrity. What enforces it is the module map: a modulepreload fetches the module with its
 * integrity metadata and stores the result under its URL (HTML "fetch a modulepreload module script graph"); the later import of the
 * same URL, the entry's own static imports of its chunks included, takes the module from the map instead of fetching it again, and a
 * module whose hash did not match is stored as a failure, so importing it fails. A chunk the manifest does not list would be fetched
 * without a hash: the release must list every chunk (plan §7). e2e/social-surface.spec.ts proves a wrong hash keeps the surface out.
 *
 * Failure (network, a 404, a bad manifest, a wrong hash, a timeout, an entry that throws) never breaks the reader: the promise
 * rejects, the caller reports it and renders nothing. Like loadAssistantScript, a failure leaves no tag behind and the next page (a
 * different path) tries once more; after that the surface stays off until the page is reloaded. (A module that failed its hash stays
 * failed in this document's module map; a retry helps with a manifest that could not be fetched, or a new release.)
 *
 * PUBLIC_SOCIAL_DEV_ENTRY (development only) imports a local dev server's entry module directly, with no manifest or integrity.
 *
 * @feature SHL-077 Surface loader
 */
import type { SocialEnv } from "~/lib/config";
import type { Surface } from "../../../contract/surface-host.v1";
import { allowedUrl, ManifestError, resolveManifest, type ResolvedFile } from "./manifest";

export interface LoadedSurface {
  surface: Surface;
  /** The release's version (the manifest's), or "dev". */
  version: string;
}

export interface LoadDeps {
  fetch: typeof fetch;
  doc: Document;
  importModule: (url: string) => Promise<unknown>;
  timeoutMs: number;
}

/** How long a load may take, manifest to module, before it counts as failed. */
export const LOAD_TIMEOUT_MS = 15_000;
/** Loads per document: the first, and one more on a later page. */
export const MAX_ATTEMPTS = 2;

const LINK_ATTR = "data-surface";

export const defaultLoadDeps = (): LoadDeps => ({
  fetch: (...args) => fetch(...args),
  doc: document,
  // a URL only known at run time, from the manifest: the bundler must leave this import alone
  importModule: (url) => import(/* @vite-ignore */ url),
  timeoutMs: LOAD_TIMEOUT_MS,
});

export class SurfaceLoadError extends Error {
  constructor(
    message: string,
    readonly reason: "config" | "manifest" | "contract" | "origin" | "integrity" | "module" | "timeout",
  ) {
    super(message);
    this.name = "SurfaceLoadError";
  }
}

/** Is this module's default export a Surface for contract 1? */
export function asSurface(mod: unknown): Surface | null {
  const s = (mod as { default?: unknown } | null)?.default as Partial<Surface> | undefined;
  if (!s || typeof s !== "object") return null;
  if (s.id !== "social" || s.contract !== 1 || typeof s.mountPage !== "function" || typeof s.mountPersistent !== "function") return null;
  return s as Surface;
}

function linkOnce(doc: Document, rel: "stylesheet" | "modulepreload", file: ResolvedFile): { el: HTMLLinkElement; loaded: Promise<void> } {
  const el = doc.createElement("link");
  el.rel = rel;
  el.href = file.url;
  el.integrity = file.integrity;
  // integrity on another origin needs a CORS fetch; "anonymous" is also the credentials mode import() uses, so the preload is reused
  el.crossOrigin = "anonymous";
  el.setAttribute(LINK_ATTR, "social");
  const loaded = new Promise<void>((resolve, reject) => {
    el.addEventListener("load", () => resolve(), { once: true });
    el.addEventListener("error", () => reject(new SurfaceLoadError(`could not load ${file.url} (network, or its integrity did not match)`, "integrity")), { once: true });
  });
  doc.head.appendChild(el);
  return { el, loaded };
}

const isScript = (url: string) => !/\.css(?:[?#]|$)/i.test(url);

async function loadFromManifest(env: SocialEnv, deps: LoadDeps, signal: AbortSignal, links: HTMLLinkElement[]): Promise<LoadedSurface> {
  if (!env.manifestUrl || !allowedUrl(env.manifestUrl, env.allowedOrigins)) throw new SurfaceLoadError("the manifest URL is not on an allowed origin (PUBLIC_SOCIAL_ORIGINS)", "origin");
  const res = await deps.fetch(env.manifestUrl, { credentials: "omit", cache: "no-cache", signal, headers: { accept: "application/json" } });
  if (!res.ok) throw new SurfaceLoadError(`manifest: HTTP ${res.status}`, "manifest");
  let manifest;
  try {
    manifest = resolveManifest(await res.json(), res.url || env.manifestUrl, env.allowedOrigins);
  } catch (e) {
    if (e instanceof ManifestError) throw new SurfaceLoadError(e.message, e.reason === "shape" ? "manifest" : e.reason);
    throw new SurfaceLoadError("manifest: not JSON", "manifest");
  }
  const css = manifest.css.map((f) => linkOnce(deps.doc, "stylesheet", f));
  const entry = linkOnce(deps.doc, "modulepreload", manifest.entry);
  const chunks = manifest.files.filter((f) => isScript(f.url)).map((f) => linkOnce(deps.doc, "modulepreload", f));
  links.push(...css.map((c) => c.el), entry.el, ...chunks.map((c) => c.el));
  // a chunk's failure surfaces when the entry imports it; a stylesheet or the entry itself failing stops here
  chunks.forEach((c) => c.loaded.catch(() => undefined));
  await Promise.all([entry.loaded, ...css.map((c) => c.loaded)]);
  return { surface: await importSurface(manifest.entry.url, deps), version: manifest.version };
}

async function importSurface(url: string, deps: LoadDeps): Promise<Surface> {
  let mod: unknown;
  try {
    mod = await deps.importModule(url);
  } catch (e) {
    throw new SurfaceLoadError(`the entry module failed: ${e instanceof Error ? e.message : String(e)}`, "module");
  }
  const surface = asSurface(mod);
  if (!surface) throw new SurfaceLoadError("the entry's default export is not a Surface for contract 1", "contract");
  return surface;
}

/** One load, with its timeout; on failure the links it added are removed. */
export async function loadSurfaceOnce(env: SocialEnv | undefined, deps: LoadDeps = defaultLoadDeps()): Promise<LoadedSurface> {
  if (!env) throw new SurfaceLoadError("no social surface is configured (PUBLIC_SOCIAL_MANIFEST_URL)", "config");
  const ctl = new AbortController();
  const links: HTMLLinkElement[] = [];
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => {
      ctl.abort();
      reject(new SurfaceLoadError(`timed out after ${deps.timeoutMs}ms`, "timeout"));
    }, deps.timeoutMs);
  });
  try {
    const work = env.devEntry ? importSurface(env.devEntry, deps).then((surface) => ({ surface, version: "dev" })) : loadFromManifest(env, deps, ctl.signal, links);
    return await Promise.race([work, timeout]);
  } catch (e) {
    links.forEach((l) => l.remove());
    throw e;
  } finally {
    clearTimeout(timer);
  }
}

// ── Once per document, one retry on a later page ─────────────────────────────────────────────────────────────────────────

let current: { promise: Promise<LoadedSurface>; failed: boolean; failures: number; failedAt?: string } | undefined;

/**
 * The surface, loading it if needed: one load per document shared by every mount. After a failure the same page gets the same
 * rejection; a later page (another path) tries once more; then no more tries until a reload.
 */
export function getSurface(env: SocialEnv | undefined, pathname: string, deps?: LoadDeps): Promise<LoadedSurface> {
  if (current && (!current.failed || current.failures >= MAX_ATTEMPTS || current.failedAt === pathname)) return current.promise;
  const failures = current?.failures ?? 0;
  const entry: NonNullable<typeof current> = { promise: Promise.resolve() as unknown as Promise<LoadedSurface>, failed: false, failures };
  entry.promise = loadSurfaceOnce(env, deps).catch((e: unknown) => {
    entry.failed = true;
    entry.failures = failures + 1;
    entry.failedAt = pathname;
    throw e;
  });
  current = entry;
  return entry.promise;
}

/** Test helper. */
export function resetSurfaceLoader(): void {
  current = undefined;
}
