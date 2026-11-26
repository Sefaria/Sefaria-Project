/**
 * A Claude asset is one self-contained HTML file whose manifest is inside it (LINKED_PANELS_AND_ASSETS_PLAN.md §5.1):
 *
 *   <script type="application/json" id="sefaria-asset">
 *   { "v": 1, "title": "The Seven Days", "description": "…", "lang": "en",
 *     "refs": [ { "ref": "Genesis 1:1-5", "label": "Day one" }, … ] }
 *   </script>
 *
 * `refs` is what the asset covers: the panel's title and, once stored, the sidebar's index (the server validates and expands them).
 * Parsed with a regular expression, not a DOM, so it runs on the server and in workers too; the block must be the one script with that id.
 *
 * @feature SHL-094 Asset protocol
 */
import { z } from "zod";

export const ASSET_MANIFEST_VERSION = 1;
/** The largest asset the reader opens from a file (the server's limit is the same: plan P5). */
export const MAX_ASSET_BYTES = 5 * 1024 * 1024;

export const assetManifestSchema = z.object({
  v: z.literal(ASSET_MANIFEST_VERSION),
  title: z.string().trim().min(1).max(200),
  description: z.string().max(2000).optional(),
  lang: z.enum(["en", "he"]).optional(),
  refs: z
    .array(z.object({ ref: z.string().trim().min(1).max(300), label: z.string().max(200).optional() }))
    .min(1)
    .max(500),
});
export type AssetManifest = z.infer<typeof assetManifestSchema>;

const BLOCK = /<script\b[^>]*\bid\s*=\s*["']sefaria-asset["'][^>]*>([\s\S]*?)<\/script\s*>/gi;

export type ManifestResult = { ok: true; manifest: AssetManifest } | { ok: false; error: string };

/** The asset's manifest, or why there is none, in words an author (or the model that wrote it) can act on. */
export function readManifest(html: string): ManifestResult {
  const blocks = [...html.matchAll(BLOCK)];
  if (!blocks.length) return { ok: false, error: 'No manifest: add <script type="application/json" id="sefaria-asset"> with v, title and refs.' };
  if (blocks.length > 1) return { ok: false, error: "More than one sefaria-asset manifest block: keep exactly one." };
  let json: unknown;
  try {
    json = JSON.parse(blocks[0]![1]!);
  } catch (e) {
    return { ok: false, error: `The manifest is not valid JSON (${(e as Error).message}).` };
  }
  const parsed = assetManifestSchema.safeParse(json);
  if (!parsed.success) {
    const issue = parsed.error.issues[0]!;
    return { ok: false, error: `Manifest field "${issue.path.join(".") || "(root)"}": ${issue.message}.` };
  }
  return { ok: true, manifest: parsed.data };
}

/** The page's <title>, for an asset without a manifest title (never happens for a valid one; used while loading). */
export function htmlTitle(html: string): string | undefined {
  return /<title[^>]*>([\s\S]*?)<\/title>/i.exec(html)?.[1]?.trim() || undefined;
}
