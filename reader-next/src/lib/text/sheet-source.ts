/**
 * The image guard of Add to Sheet (old AddToSourceSheetBox.checkContentForImages, run before every add): a verse that is only an image
 * is not added — sheets do not take images.
 *
 * Words selected inside the text are NOT used: the whole verse is added, as on sefaria.org (owner decision 2026-11-10). Legacy's
 * handleSelectedWords (English/Hebrew-only trimming) is not ported; its quirks (one verse never trimmed at the end, the start found only
 * when the selection reaches the verse's end) are moot.
 *
 * @feature CON-056 Add to sheet: version and partial-selection handling
 */
import type { TextPassage } from "./model";
import { isFullSegmentImage } from "./prepare";

export const IMAGE_NOT_SUPPORTED = { en: "We do not currently support adding images to source sheets.", he: "לא ניתן כרגע להוסיף תמונות לדפי מקורות." };

/** True when any of these segments (either side) is only an image. */
export const anyFullImage = (htmls: readonly (string | undefined)[]): boolean => htmls.some((h) => isFullSegmentImage(h));

/** True when any of `refs` is, in this section, a verse that is only an image (either side). */
export function refsHaveImage(section: Pick<TextPassage, "segments"> | undefined, refs: readonly string[]): boolean {
  const segs = refs.map((r) => section?.segments.find((s) => s.ref === r));
  return anyFullImage(segs.flatMap((s) => [s?.primary, s?.translation]));
}
