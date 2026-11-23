/**
 * A surface's manifest, checked before anything is loaded: its shape (contract/surface-manifest.v1.ts), the contract major this reader
 * serves, and that every URL it names resolves to an allowed origin over https (http only for localhost).
 *
 * @feature SHL-077 Surface loader
 */
import { surfaceManifestSchema, type SurfaceManifest } from "../../../contract/surface-manifest.v1";
import { SURFACE_HOST_CONTRACT } from "../../../contract/surface-host.v1";

/** The contract majors this reader can host. A minor version only adds optional members, so any minor of a served major works. */
export const SERVED_MAJORS: readonly number[] = [SURFACE_HOST_CONTRACT.major];

export interface ResolvedFile {
  url: string;
  integrity: string;
}
export interface ResolvedManifest {
  version: string;
  contract: number;
  entry: ResolvedFile;
  /** Every other file, JS chunks and stylesheets, by absolute URL. */
  files: ResolvedFile[];
  /** The stylesheets to link before mounting. */
  css: ResolvedFile[];
}

export class ManifestError extends Error {
  constructor(
    message: string,
    readonly reason: "shape" | "contract" | "origin",
  ) {
    super(message);
    this.name = "ManifestError";
  }
}

const isLocalhost = (u: URL) => u.hostname === "localhost" || u.hostname === "127.0.0.1";

/** Is this an absolute URL on one of the allowed origins, https (or http on localhost)? */
export function allowedUrl(url: string, allowedOrigins: readonly string[]): boolean {
  let u: URL;
  try {
    u = new URL(url);
  } catch {
    return false;
  }
  if (u.protocol !== "https:" && !(u.protocol === "http:" && isLocalhost(u))) return false;
  if (u.username || u.password) return false;
  return allowedOrigins.includes(u.origin);
}

/** Validate a fetched manifest and resolve its paths against the manifest's own URL. Throws a ManifestError. */
export function resolveManifest(raw: unknown, manifestUrl: string, allowedOrigins: readonly string[]): ResolvedManifest {
  const parsed = surfaceManifestSchema.safeParse(raw);
  if (!parsed.success) throw new ManifestError(`manifest: ${parsed.error.issues.map((i) => `${i.path.join(".") || "(root)"} ${i.message}`).join("; ")}`, "shape");
  const m: SurfaceManifest = parsed.data;
  if (!SERVED_MAJORS.includes(m.contract)) throw new ManifestError(`manifest: contract ${m.contract} is not served by this reader (serves ${SERVED_MAJORS.join(", ")})`, "contract");
  const resolve = (path: string): string => {
    const url = new URL(path, manifestUrl).href;
    if (!allowedUrl(url, allowedOrigins)) throw new ManifestError(`manifest: ${url} is not on an allowed origin`, "origin");
    return url;
  };
  const entry = { url: resolve(m.entry), integrity: m.integrity };
  const files = m.files.map((f) => ({ url: resolve(f.path), integrity: f.integrity })).filter((f) => f.url !== entry.url);
  const byUrl = new Map(files.map((f) => [f.url, f]));
  const css = (m.css ?? []).map((c) => byUrl.get(resolve(c))).filter((f): f is ResolvedFile => !!f);
  return { version: m.version, contract: m.contract, entry, files, css };
}
