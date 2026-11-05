/**
 * Manuscript pages and Torah-reading audio clips for the selected passage, from the section's related data.
 * Ported from Sefaria.manuscriptsByRef / mediaByRef.
 *
 * @feature CON-060 Manuscripts for this ref
 * @feature CON-059 Torah Readings (audio clips)
 */
import type { ByRef, RelatedItem } from "./related";

export interface ManuscriptPage {
  manuscript_slug: string;
  page_id: string;
  image_url: string;
  thumbnail_url: string;
  manuscript: {
    title: string;
    he_title?: string;
    description?: string;
    he_description?: string;
    license?: string;
    source?: string;
  };
}

export interface MediaClip {
  media_url: string;
  /** Seconds, as strings in the API. */
  start_time: string;
  end_time: string;
  source: string;
  source_he?: string;
  source_site?: string;
  license?: string;
  description?: string;
  description_he?: string;
  anchorRef: string;
}

function collect<T>(byRef: ByRef<RelatedItem> | undefined, refs: readonly string[], key: (x: T) => string): T[] {
  const seen = new Set<string>();
  const out: T[] = [];
  for (const r of refs) {
    for (const item of (byRef?.[r] ?? []) as unknown as T[]) {
      const k = key(item);
      if (!seen.has(k)) {
        seen.add(k);
        out.push(item);
      }
    }
  }
  return out;
}

/** Each manuscript page once, however many of the selected verses it covers. */
export const manuscriptsForRefs = (byRef: ByRef<RelatedItem> | undefined, refs: readonly string[]): ManuscriptPage[] =>
  collect<ManuscriptPage>(byRef, refs, (m) => `${m.manuscript_slug}-${m.page_id}`);

export const mediaForRefs = (byRef: ByRef<RelatedItem> | undefined, refs: readonly string[]): MediaClip[] =>
  collect<MediaClip>(byRef, refs, (m) => `${m.media_url}#${m.start_time}-${m.end_time}`);

/** "0:06": minutes and zero-padded seconds, as the old player prints them (never negative). */
export function formatClipTime(totalSeconds: number): string {
  if (!Number.isFinite(totalSeconds) || totalSeconds < 0) return "0:00";
  const s = Math.floor(totalSeconds % 60);
  return `${Math.floor(totalSeconds / 60)}:${s < 10 ? "0" : ""}${s}`;
}
