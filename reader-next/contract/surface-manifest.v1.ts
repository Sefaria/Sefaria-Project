/**
 * The manifest a surface's release publishes next to its files (one `manifest.json` per release, at a stable URL the reader is
 * configured with). The reader validates it with this schema before loading anything; `surface-manifest.v1.schema.json` is
 * generated from it (z.toJSONSchema, checked by src/lib/surfaces/manifest-schema.test.ts) for the surface's release to validate
 * what it writes.
 *
 *   {
 *     "version": "2026.11.23-1",                       the release, reported with every error and event
 *     "contract": 1,                                   the SurfaceHost major the entry was built for
 *     "entry": "assets/entry-3f9a1c.js",               the entry module, relative to the manifest's URL (or absolute)
 *     "integrity": "sha384-…",                         the entry's Subresource Integrity hash
 *     "files": [{ "path": "assets/chunk-a1b2.js", "integrity": "sha384-…" }, …],   every other file the entry may load: each JS
 *                                                      chunk and stylesheet, with its hash
 *     "css": ["assets/social-77aa.css"]                optional: stylesheets to link before mounting (each must be in files)
 *   }
 *
 * Paths resolve against the manifest's URL. Every resolved URL must be on an origin the reader allows (PUBLIC_SOCIAL_ORIGINS).
 */
import { z } from "zod";

/** A Subresource Integrity value: one or more `sha256-`/`sha384-`/`sha512-` base64 digests, space separated. */
export const SRI_RE = /^(?:sha(?:256|384|512)-[A-Za-z0-9+/]+={0,2})(?: sha(?:256|384|512)-[A-Za-z0-9+/]+={0,2})*$/;

/** A file's path: relative ("assets/x.js", "./x.js") or an absolute https/http URL; never protocol-relative, never a scheme like javascript:. */
const filePath = z
  .string()
  .min(1)
  .max(1024)
  .regex(/^(?:https?:\/\/[^\s]+|(?!\/\/)(?![a-zA-Z][a-zA-Z0-9+.-]*:)[^\s\\]+)$/, "a relative path or an http(s) URL");

const integrity = z.string().regex(SRI_RE, "a Subresource Integrity value (sha256-, sha384- or sha512-)");

export const surfaceManifestSchema = z
  .object({
    version: z.string().regex(/^[A-Za-z0-9._+-]{1,64}$/),
    contract: z.number().int().positive(),
    entry: filePath,
    integrity,
    files: z.array(z.object({ path: filePath, integrity }).strict()).max(500),
    css: z.array(filePath).max(20).optional(),
  })
  .strict()
  .refine((m) => (m.css ?? []).every((c) => m.files.some((f) => f.path === c)), { message: "every css path must be listed in files", path: ["css"] });

export type SurfaceManifest = z.infer<typeof surfaceManifestSchema>;
