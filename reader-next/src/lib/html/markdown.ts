import { marked } from "marked";
import { sanitizeHtml, type SanitizeOptions } from "./sanitize";

/**
 * Markdown from the library (book descriptions) as safe HTML: every markdown element is allowed, as the old About
 * box did, but what comes out is passed through the allowlist sanitizer (raw HTML in the source does not survive).
 */
export function markdownToHtml(md: string | null | undefined, opts: SanitizeOptions = {}): string {
  if (!md) return "";
  return sanitizeHtml(marked.parse(md, { async: false, gfm: true, breaks: false }) as string, opts);
}
