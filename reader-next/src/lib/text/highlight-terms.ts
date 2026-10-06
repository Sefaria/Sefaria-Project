/**
 * Wrap the words a search matched in a segment's HTML (the old TextRange.addHighlights).
 *
 * Matching is on the visible text: case-insensitive, Hebrew vowels and cantillation ignored, any run of whitespace
 * (and any tags between words) allowed between a phrase's words. A match is wrapped piece by piece — one span per
 * stretch of text — so the markup stays valid when a match spans inline tags.
 */
export const HIGHLIGHT_CLASS = "queryTextHighlight";

const MARK = /[֑-ׇ]/;
const ENTITY: Record<string, string> = { nbsp: " ", amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", thinsp: " ", ensp: " ", emsp: " " };

interface Unit {
  raw: string;
  /** The character it shows ("" for a tag). */
  ch: string;
}

function units(html: string): Unit[] {
  const out: Unit[] = [];
  const re = /<[^>]*>|&(#x?[0-9a-f]+|[a-z]+);|[\s\S]/gi;
  for (const m of html.matchAll(re)) {
    const raw = m[0];
    if (raw.startsWith("<") && raw.length > 1) out.push({ raw, ch: "" });
    else if (raw.length > 1 && m[1] !== undefined) {
      const name = m[1];
      const ch = name.startsWith("#") ? String.fromCodePoint(Number(name[1]!.toLowerCase() === "x" ? `0x${name.slice(2)}` : name.slice(1))) : (ENTITY[name.toLowerCase()] ?? "?");
      out.push({ raw, ch });
    } else out.push({ raw, ch: raw });
  }
  return out;
}

const norm = (s: string) => s.replace(/[֑-ׇ]/g, "").replace(/[־]/g, " ").toLowerCase();

export function highlightTerms(html: string, terms: readonly string[]): string {
  const wanted = terms.map((t) => norm(t).replace(/\s+/g, " ").trim()).filter(Boolean);
  if (!wanted.length || !html) return html;
  const us = units(html);
  // The visible text, normalised, with each character's unit index.
  let text = "";
  const at: number[] = [];
  let lastSpace = true;
  us.forEach((u, i) => {
    if (!u.ch) return;
    if (MARK.test(u.ch)) return;
    const c = /\s|־/.test(u.ch) ? " " : u.ch.toLowerCase();
    if (c === " " && lastSpace) return;
    text += c;
    at.push(i);
    lastSpace = c === " ";
  });
  const hit = new Array<boolean>(us.length).fill(false);
  for (const term of wanted) {
    let from = 0;
    for (;;) {
      const a = text.indexOf(term, from);
      if (a < 0) break;
      const b = a + term.length;
      for (let k = at[a]!; k <= at[b - 1]!; k++) hit[k] = true; // the units between, tags and vowel marks included
      from = b;
    }
  }
  // Wrap each stretch of text units that is hit; tags stay outside the spans.
  let out = "";
  let open = false;
  us.forEach((u, i) => {
    const inTag = u.ch === "" && u.raw.startsWith("<");
    const on = hit[i] && !inTag;
    if (on && !open) { out += `<span class="${HIGHLIGHT_CLASS}">`; open = true; }
    if (!on && open) { out += "</span>"; open = false; }
    out += u.raw;
  });
  if (open) out += "</span>";
  return out;
}
