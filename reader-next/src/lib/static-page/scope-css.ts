/**
 * Scopes a legacy stylesheet to one element (`#staticContentWrapper`): every rule's selectors are put under it, so the old site's
 * static-page CSS (static/css/static.css, common.css…) styles the content block in this client's shell and nothing else (T-F31). Rules
 * for the document (`html`, `body`, `:root`) apply to the wrapper itself (`body.interface-hebrew .x` → `#staticContentWrapper.interface-hebrew .x`).
 *
 * Every legacy rule gains the same one id of specificity, so the legacy rules keep their order among themselves; inside @media and
 * @supports the rules are scoped the same way; @font-face and @keyframes are kept; every other at-rule, @import included, is dropped.
 * A small parser for the site's own, well-formed stylesheets: comments are dropped, strings and parentheses respected.
 */

/**
 * The selector, put under `scope`; "" (the selector is dropped) when it would still reach outside it: a sibling combinator straight
 * after the document or the wrapper (`:root ~ *`, `body + div`, `html ~ footer`, `#staticContentWrapper ~ footer`).
 */
export function scopeSelector(selector: string, scope: string): string {
  let s = selector.trim();
  if (!s) return s;
  const outward = (rest: string) => /^\s*[~+]/.test(rest);
  if (s === scope || s.startsWith(`${scope} `) || s.startsWith(`${scope}.`) || s.startsWith(`${scope}:`) || s.startsWith(`${scope}[`) || s.startsWith(`${scope}>`) || s.startsWith(`${scope}~`) || s.startsWith(`${scope}+`)) {
    return outward(s.slice(scope.length).replace(/^(?:[.:[#][^\s>+~]*)*/, "")) ? "" : s;
  }
  if (/^html(?=$|[\s>+~])\s*[~+]/i.test(s)) return "";
  s = s.replace(/^html(?=$|[\s>+~])\s*(?:>\s*)?/i, "");
  if (!s) return scope;
  const doc = /^(?:body|:root|html)(?=$|[.#:[\s>+~])/i.exec(s);
  if (doc) {
    const rest = s.slice(doc[0].length);
    // the document's own classes/states (`body.interface-hebrew`) stay on the wrapper; a sibling of it is outside
    if (outward(rest.replace(/^(?:[.:[#][^\s>+~]*)*/, ""))) return "";
    return `${scope}${rest}`;
  }
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

/** The family an @font-face block declares, lower-cased and unquoted ("" when none). */
export const fontFaceFamily = (body: string) => (/font-family\s*:\s*(['"]?)([^;'"]+)\1/i.exec(body)?.[2] ?? "").trim().toLowerCase();

export interface ScopeOptions {
  /** The stylesheet's own address, for its relative url()s. */
  baseUrl?: string;
  /**
   * Font families whose @font-face rules are dropped (lower case): the ones this client's shell declares itself
   * (src/ui/tokens/fonts.css). Font faces are global; the legacy ones would win on a static page and load the old files again.
   */
  dropFontFaces?: ReadonlySet<string>;
}

/**
 * The at-rules kept (explicitly allowed): grouping rules, scoped inside (@media, @supports), and @keyframes and @font-face (filtered by
 * `dropFontFaces`). Everything else — @import, @charset, @scope, @starting-style, @layer, @container, @property, @page, anything new —
 * is dropped with its block: a rule this scoper does not understand could style outside the wrapper.
 */
const SCOPED_GROUPS = /^@(?:media|supports)\b/i;
const KEPT_AS_IS = /^@(?:-[a-z]+-)?keyframes\b/i;

/** A declaration that runs or binds code (old IE expressions and behaviours, XBL bindings, script addresses): removed. */
const UNSAFE_DECLARATION = /[^;{}]*(?:url\(\s*['"]?\s*(?:javascript|vbscript):|expression\s*\(|behavior\s*:|-moz-binding)[^;{}]*;?/gi;
export const stripUnsafeDeclarations = (body: string) => body.replace(UNSAFE_DECLARATION, "");

export function scopeCss(input: string, scope: string, options: string | ScopeOptions = {}): string {
  const { baseUrl, dropFontFaces } = typeof options === "string" ? { baseUrl: options, dropFontFaces: undefined } : options;
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
      // @import, @charset, @namespace, @layer a;: never kept
      i = j + 1;
      continue;
    }
    const end = blockEnd(css, j + 1);
    const body = css.slice(j + 1, end < 0 ? css.length : end);
    i = end < 0 ? css.length : end + 1;
    if (!prelude) continue;
    if (prelude.startsWith("@")) {
      if (/^@font-face\b/i.test(prelude)) {
        if (!dropFontFaces?.has(fontFaceFamily(body))) out += `${prelude} {${stripUnsafeDeclarations(body)}}\n`;
      } else if (SCOPED_GROUPS.test(prelude)) out += `${prelude} {\n${scopeCss(body, scope, { dropFontFaces })}}\n`;
      else if (KEPT_AS_IS.test(prelude)) out += `${prelude} {${stripUnsafeDeclarations(body)}}\n`;
      continue;
    }
    const selectors = splitSelectors(prelude).map((s) => scopeSelector(s, scope)).filter(Boolean);
    // a rule's block is declarations only: a nested rule (CSS nesting) would not be scoped, so such a block is dropped
    const nested = body.replace(/"(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*'/g, "").includes("{");
    if (selectors.length && !nested) out += `${selectors.join(",\n")} {${stripUnsafeDeclarations(body)}}\n`;
  }
  return out;
}
