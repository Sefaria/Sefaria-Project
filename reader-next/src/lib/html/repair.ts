/**
 * Browsers repair mis-nested markup (`<a>Rashi, <i>ibid.</a></i>`) with the HTML5 "adoption agency" rules; a plain tag
 * parser does not, and ends an enclosing element early (a footnote's tail then leaks into the text). The library's
 * texts contain such markup (Ramban on Genesis 1:1:3), and the old site showed what the browser made of it.
 * So text with mis-nested inline tags goes through the HTML5 parser first. Anything well-formed is returned as is.
 *
 * @feature TXD-025 Footnotes toggle inline
 */
import { parseFragment, serialize } from "parse5";

const INLINE = /<\/?([a-z][a-z0-9]*)\b[^>]*?>/gi;
const VOID = new Set(["br", "img", "hr", "wbr"]);

/** True when a closing tag does not match the innermost open one (or something is left open). */
export function isMisnested(html: string): boolean {
  if (!html.includes("</")) return false;
  const stack: string[] = [];
  for (const m of html.matchAll(INLINE)) {
    const tag = m[1]!.toLowerCase();
    if (VOID.has(tag) || m[0].endsWith("/>")) continue;
    if (m[0][1] !== "/") stack.push(tag);
    else if (stack.at(-1) === tag) stack.pop();
    else return true;
  }
  return stack.length > 0;
}

export function repairHtml(html: string): string {
  return isMisnested(html) ? serialize(parseFragment(html)) : html;
}
