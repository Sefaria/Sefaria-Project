/**
 * Scopes a legacy stylesheet to one element (`#staticContentWrapper`): every rule's selectors are put under it, so the old site's
 * static-page CSS (static/css/static.css, common.css…) styles the content block in this client's shell and nothing else (T-F31). Rules
 * for the document (`html`, `body`, `:root`) apply to the wrapper itself (`body.interface-hebrew .x` → `#staticContentWrapper.interface-hebrew .x`).
 *
 * Every legacy rule gains the same one id of specificity, so the legacy rules keep their order among themselves; inside @media,
 * @supports, @layer and @container the rules are scoped the same way; @font-face, @keyframes and the like are kept as they are.
 * A small parser for the site's own, well-formed stylesheets: comments are dropped, strings and parentheses respected.
 */

/** The selector, put under `scope`. */
export function scopeSelector(selector: string, scope: string): string {
  let s = selector.trim();
  if (!s) return s;
  if (s === scope || s.startsWith(`${scope} `) || s.startsWith(`${scope}.`) || s.startsWith(`${scope}:`) || s.startsWith(`${scope}[`) || s.startsWith(`${scope}>`)) return s;
  s = s.replace(/^html(?=$|[\s>+~])\s*(?:>\s*)?/i, "");
  if (!s) return scope;
  const doc = /^(?:body|:root|html)(?=$|[.#:[\s>+~])/i.exec(s);
  if (doc) return `${scope}${s.slice(doc[0].length)}`;
  return `${scope} ${s}`;
}

/** Split at top-level commas (not inside parentheses, brackets or strings). */
function splitSelectors(list: string): string[] {
  const out: string[] = [];
  let depth = 0;
  let quote = "";
  let start = 0;
  for (let i = 0; i < list.length; i++) {
    const c = list[i]!;
    if (quote) {
      if (c === "\\") i++;
      else if (c === quote) quote = "";
    } else if (c === '"' || c === "'") quote = c;
    else if (c === "(" || c === "[") depth++;
    else if (c === ")" || c === "]") depth--;
    else if (c === "," && depth === 0) {
      out.push(list.slice(start, i));
      start = i + 1;
    }
  }
  out.push(list.slice(start));
  return out;
}

/** The CSS without its comments (strings kept as they are). */
export function stripComments(css: string): string {
  let out = "";
  let quote = "";
  for (let i = 0; i < css.length; i++) {
    const c = css[i]!;
    if (quote) {
      out += c;
      if (c === "\\") out += css[++i] ?? "";
      else if (c === quote) quote = "";
    } else if (c === '"' || c === "'") {
      quote = c;
      out += c;
    } else if (c === "/" && css[i + 1] === "*") {
      const end = css.indexOf("*/", i + 2);
      i = end < 0 ? css.length : end + 1;
    } else out += c;
  }
  return out;
}

/** Index of the "}" that closes the block opened just before `from` (strings and nested blocks respected); -1 if unclosed. */
function blockEnd(css: string, from: number): number {
  let depth = 1;
  let quote = "";
  for (let i = from; i < css.length; i++) {
    const c = css[i]!;
    if (quote) {
      if (c === "\\") i++;
      else if (c === quote) quote = "";
    } else if (c === '"' || c === "'") quote = c;
    else if (c === "{") depth++;
    else if (c === "}" && --depth === 0) return i;
  }
  return -1;
}

const GROUPING = /^@(?:-[a-z]+-)?(?:media|supports|layer|container|document)\b/i;

/**
 * Relative `url(…)`s made absolute paths against the stylesheet's own address (`baseUrl`, e.g. "/static/font-awesome/css/x.css"), as
 * the scoped copy is served from elsewhere. Absolute paths, other sites and data: addresses are left as they are.
 */
export function absoluteUrls(css: string, baseUrl: string): string {
  return css.replace(/url\(\s*(["']?)([^"')]+)\1\s*\)/g, (all, q: string, url: string) => {
    if (/^(?:[a-z][a-z0-9+.-]*:|\/|#)/i.test(url)) return all;
    const u = new URL(url, `http://x${baseUrl}`);
    return `url(${q}${u.pathname}${u.search}${u.hash}${q})`;
  });
}

export function scopeCss(input: string, scope: string, baseUrl?: string): string {
  const css = baseUrl ? absoluteUrls(stripComments(input), baseUrl) : stripComments(input);
  let out = "";
  let i = 0;
  while (i < css.length) {
    // the prelude: up to the next "{" or ";" at this level
    let j = i;
    let quote = "";
    let paren = 0;
    for (; j < css.length; j++) {
      const c = css[j]!;
      if (quote) {
        if (c === "\\") j++;
        else if (c === quote) quote = "";
      } else if (c === '"' || c === "'") quote = c;
      else if (c === "(") paren++;
      else if (c === ")") paren--;
      else if (paren === 0 && (c === "{" || c === ";" || c === "}")) break;
    }
    const prelude = css.slice(i, j).trim();
    if (j >= css.length) break;
    const c = css[j];
    if (c === "}") {
      // a stray closing brace: skip it
      i = j + 1;
      continue;
    }
    if (c === ";") {
      // @import, @charset, @namespace: only @import is worth keeping (none in the site's static CSS)
      if (/^@import\b/i.test(prelude)) out += `${prelude};\n`;
      i = j + 1;
      continue;
    }
    const end = blockEnd(css, j + 1);
    const body = css.slice(j + 1, end < 0 ? css.length : end);
    i = end < 0 ? css.length : end + 1;
    if (!prelude) continue;
    if (prelude.startsWith("@")) {
      out += GROUPING.test(prelude) ? `${prelude} {\n${scopeCss(body, scope)}}\n` : `${prelude} {${body}}\n`;
      continue;
    }
    const selectors = splitSelectors(prelude).map((s) => scopeSelector(s, scope)).filter(Boolean);
    if (selectors.length) out += `${selectors.join(",\n")} {${body}}\n`;
  }
  return out;
}
