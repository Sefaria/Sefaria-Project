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

/**
 * Markdown as the old InterfaceText `markdown` rendered it (ReactMarkdown with `p` unwrapped): inline HTML without paragraphs, every
 * link opened with rel="noopener noreferrer"; `noLinks` drops the links but keeps their text (the Voices cards, a card's bottom link);
 * `opts` go to the sanitizer (`newTab: false`: links open in the same tab, as the old InterfaceText's did).
 */
export function inlineMarkdownToHtml(md: string | null | undefined, noLinks = false, opts: SanitizeOptions = {}): string {
  let html = markdownToHtml(md, opts).replace(/<\/?p>/g, "").trim();
  if (noLinks) html = html.replace(/<\/?a\b[^>]*>/g, "");
  return html.replace(/<a (?![^>]*\brel=)/g, '<a rel="noopener noreferrer" ');
}
