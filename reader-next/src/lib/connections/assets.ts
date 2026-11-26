/**
 * Interactive pages (Claude assets) on a passage, for the sidebar: Sefaria Social's public read, one request per section
 * (`GET {social api}/api/v1/claude-assets/ref/<section>`, Social spec 062 AC-004). Only published assets of verified authors come
 * back (owner decision D6). Never waited for: a short timeout, and any failure is simply none (the findings row's pattern).
 *
 * @feature CON-075 Interactive pages on a passage
 */
import { queryOptions } from "@tanstack/react-query";
import { z } from "zod";
import { PUBLIC_CONFIG } from "~/lib/config";

const assetSchema = z.object({
  id: z.string().min(1),
  title: z.string(),
  description: z.string().nullish(),
  author: z.object({ name: z.string(), profileId: z.union([z.string(), z.number()]).nullish(), verified: z.boolean().nullish() }).nullish(),
  anchorRefs: z.array(z.string()),
  refs: z.array(z.string()).default([]),
  versionId: z.string().nullish(),
  contentUrl: z.string().nullish(),
});
const answerSchema = z.object({ ref: z.string().optional(), assets: z.array(assetSchema) });
export type PassageAsset = z.infer<typeof assetSchema>;

/** How long the sidebar waits for Social before showing nothing. */
export const ASSETS_TIMEOUT_MS = 4000;

/** Where Social answers, if this deployment has one. */
export const assetsApiOrigin = (): string | undefined => PUBLIC_CONFIG.social?.apiOrigin || undefined;

export async function fetchPassageAssets(sectionRef: string, signal?: AbortSignal): Promise<PassageAsset[]> {
  const origin = assetsApiOrigin();
  if (!origin) return [];
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), ASSETS_TIMEOUT_MS);
  signal?.addEventListener("abort", () => ctl.abort());
  try {
    const res = await fetch(`${origin}/api/v1/claude-assets/ref/${encodeURIComponent(sectionRef)}`, { signal: ctl.signal, headers: { accept: "application/json" } });
    if (!res.ok) return [];
    const parsed = answerSchema.safeParse(await res.json());
    return parsed.success ? parsed.data.assets : [];
  } catch {
    return [];
  } finally {
    clearTimeout(timer);
  }
}

export const assetsQueryOptions = (sectionRef: string) =>
  queryOptions({
    queryKey: ["claude-assets", "ref", sectionRef] as const,
    queryFn: ({ signal }) => fetchPassageAssets(sectionRef, signal),
    staleTime: 60_000,
    retry: false,
  });

/** The assets that cover any of the selected segments (all of the section's when nothing is selected). */
export function assetsForRefs(assets: readonly PassageAsset[] | undefined, segmentRefs: readonly string[]): PassageAsset[] {
  if (!assets?.length) return [];
  const wanted = new Set(segmentRefs);
  return assets.filter((a) => a.anchorRefs.some((r) => wanted.has(r)));
}
