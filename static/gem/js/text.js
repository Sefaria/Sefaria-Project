// Text helpers: Hebrew numerals, nikud handling, safe HTML rendering, dibbur hamatchil.

const HEB_ONES = ["", "א", "ב", "ג", "ד", "ה", "ו", "ז", "ח", "ט"];
const HEB_TENS = ["", "י", "כ", "ל", "מ", "נ", "ס", "ע", "פ", "צ"];
const HEB_HUNDREDS = ["", "ק", "ר", "ש", "ת", "תק", "תר", "תש", "תת", "תתק"];

/** Hebrew numeral (gematria). punct=true adds geresh/gershayim (e.g. ט״ו, ב׳). */
export function hebNum(n, punct = false) {
  n = Math.floor(n);
  if (!n || n < 0) return "";
  let s = HEB_HUNDREDS[Math.floor(n / 100) % 10] || "";
  const rem = n % 100;
  if (rem === 15) s += "טו";
  else if (rem === 16) s += "טז";
  else s += HEB_TENS[Math.floor(rem / 10)] + HEB_ONES[rem % 10];
  if (!punct) return s;
  return s.length === 1 ? s + "׳" : s.slice(0, -1) + "״" + s.slice(-1);
}

const HEB_VALUES = { א: 1, ב: 2, ג: 3, ד: 4, ה: 5, ו: 6, ז: 7, ח: 8, ט: 9, י: 10, כ: 20, ך: 20, ל: 30, מ: 40, ם: 40, נ: 50, ן: 50, ס: 60, ע: 70, פ: 80, ף: 80, צ: 90, ץ: 90, ק: 100, ר: 200, ש: 300, ת: 400 };

/** Parses a Hebrew numeral ("לא", "ל״א", "ט״ו") to an integer, or null. */
export function parseHebNum(s) {
  const clean = (s || "").replace(/[׳״'"]/g, "");
  if (!clean || /[^א-ת]/.test(clean)) return null;
  let total = 0;
  for (const ch of clean) total += HEB_VALUES[ch] || 0;
  return total || null;
}

const ORDINALS_HE = ["", "ראשון", "שני", "שלישי", "רביעי", "חמישי", "שישי", "שביעי", "שמיני", "תשיעי", "עשירי"];
export function perekOrdinalHe(n) {
  return ORDINALS_HE[n] || hebNum(n, true);
}
const ORDINALS_EN = ["", "One", "Two", "Three", "Four", "Five", "Six", "Seven", "Eight", "Nine", "Ten", "Eleven", "Twelve", "Thirteen", "Fourteen", "Fifteen", "Sixteen", "Seventeen", "Eighteen", "Nineteen", "Twenty", "Twenty-One", "Twenty-Two", "Twenty-Three", "Twenty-Four"];
export function ordinalEn(n) {
  return ORDINALS_EN[n] || String(n);
}

/** "2a" -> "ב." and "2b" -> "ב:" — the way a daf is written in a beit midrash. */
export function amudLabelHe(amud) {
  const m = /^(\d+)([ab])$/.exec(amud || "");
  if (!m) return amud || "";
  return hebNum(+m[1]) + (m[2] === "a" ? "." : ":");
}

// Nikud & cantillation. Keep maqaf (05BE), paseq (05C0), sof pasuq (05C3), nun hafukha (05C6).
const NIKUD_RE = /[֑-ְ֯-ׇֽֿׁׂׅׄ]/g;
export function stripNikud(s) {
  return (s || "").replace(NIKUD_RE, "");
}

export function hasHebrew(s) {
  return /[֐-׿]/.test(s || "");
}

/** Normalises a Hebrew/Aramaic word or phrase for lexicon lookup. */
export function normalizeForLookup(s) {
  return stripNikud(s)
    .replace(/־/g, " ")
    .replace(/[^א-ת׳״'"\s]/g, " ")
    .replace(/^['"׳״]+|['"׳״]+$/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

const FINALS = { כ: "ך", מ: "ם", נ: "ן", פ: "ף", צ: "ץ" };
const UNFINALS = { ך: "כ", ם: "מ", ן: "נ", ף: "פ", ץ: "צ" };
function finalize(w) {
  if (!w) return w;
  const last = w.slice(-1);
  return FINALS[last] ? w.slice(0, -1) + FINALS[last] : w;
}
function unfinalize(w) {
  return w.replace(/[ךםןףץ](?=.)/g, (c) => UNFINALS[c]);
}

/**
 * Candidate dictionary forms for an inflected Talmudic word, most likely first.
 * The Sefaria lexicon lookup is exact-ish, so we peel common prefixes (ו, ד, ב, ל, מ, ה, כ, ש)
 * and a few frequent suffixes.
 */
export function lookupCandidates(word) {
  const w = normalizeForLookup(word);
  const out = [];
  const add = (x) => { x = finalize(unfinalize(x)); if (x && x.length >= 2 && !out.includes(x)) out.push(x); };
  add(w);
  if (/\s/.test(w)) return out; // phrases: the API splits them itself
  const bases = [w];
  const pre = /^(ו|ד|ב|ל|מ|ה|כ|ש)/;
  let cur = w;
  for (let i = 0; i < 2 && pre.test(cur) && cur.length > 3; i++) {
    cur = cur.slice(1);
    bases.push(cur);
    add(cur);
  }
  const suffixes = ["ייהו", "יהון", "יהו", "ינהו", "ותא", "יתא", "ותיה", "יה", "הון", "ין", "ים", "ות", "תא", "נא", "יך", "הו", "ן", "א", "ה", "ו", "י", "ת"];
  for (const b of bases) {
    for (const suf of suffixes) {
      const bb = unfinalize(b);
      const s = unfinalize(suf);
      if (bb.endsWith(s) && bb.length - s.length >= 2) {
        const stem = bb.slice(0, -s.length);
        add(stem);
        if (suf === "ת" || suf === "תא") add(stem + "ה");
        if (suf === "ין" || suf === "ים") { add(stem + "א"); add(stem + "ה"); }
      }
    }
  }
  return out.slice(0, 10);
}

// ---------------------------------------------------------------------------------------------
// Safe rich-text rendering. Sefaria text HTML is curated, but we still whitelist.

const ALLOWED_TAGS = new Set(["B", "STRONG", "I", "EM", "BIG", "SMALL", "BR", "SUP", "SUB", "SPAN", "A", "U", "P"]);
const parser = typeof DOMParser !== "undefined" ? new DOMParser() : null;

/**
 * Converts an HTML string into a sanitized DocumentFragment.
 * opts.nikud=false strips vowels; opts.literal wraps explanatory (non-bold) text for Steinsaltz
 * literal-translation modes; opts.onRef(a) is called for internal references.
 */
export function richFragment(html, opts = {}) {
  const doc = parser.parseFromString(`<div>${html || ""}</div>`, "text/html");
  const root = doc.body.firstChild;
  const frag = document.createDocumentFragment();
  for (const child of Array.from(root.childNodes)) {
    const n = cleanNode(child, opts, false);
    if (n) frag.appendChild(n);
  }
  return frag;
}

function cleanNode(node, opts, inBold) {
  if (node.nodeType === 3) {
    let t = node.nodeValue;
    if (opts.nikud === false) t = stripNikud(t);
    if (opts.literal && !inBold && t.trim()) {
      const span = document.createElement("span");
      span.className = "xp";
      const lead = /^\s/.test(t) ? " " : "";
      const trail = /\s$/.test(t) ? " " : "";
      span.textContent = t.trim();
      const f = document.createDocumentFragment();
      if (lead) f.appendChild(document.createTextNode(lead));
      f.appendChild(span);
      if (trail) f.appendChild(document.createTextNode(trail));
      return f;
    }
    return document.createTextNode(t);
  }
  if (node.nodeType !== 1) return null;
  const tag = node.tagName;
  // Sefaria inline markers
  if (tag === "I" && node.getAttribute("data-overlay") === "Vilna Pages") {
    const v = node.getAttribute("data-value") || "";
    const m = document.createElement("span");
    m.className = "vilna";
    m.setAttribute("aria-label", `Vilna page ${v}`);
    m.title = `Vilna ${v}`;
    m.textContent = amudLabelHe(v) || v;
    return m;
  }
  if (tag === "SUP" && node.classList.contains("footnote-marker")) {
    const b = document.createElement("button");
    b.type = "button";
    b.className = "fn-mark";
    b.textContent = node.textContent;
    b.setAttribute("aria-label", `Footnote ${node.textContent}`);
    b.setAttribute("aria-expanded", "false");
    return b;
  }
  if ((tag === "I" || tag === "SPAN") && node.classList.contains("footnote")) {
    const s = document.createElement("span");
    s.className = "fn";
    s.hidden = true;
    for (const c of Array.from(node.childNodes)) {
      const n = cleanNode(c, { ...opts, literal: false }, true);
      if (n) s.appendChild(n);
    }
    return s;
  }
  if (!ALLOWED_TAGS.has(tag)) {
    // unwrap
    const f = document.createDocumentFragment();
    for (const c of Array.from(node.childNodes)) {
      const n = cleanNode(c, opts, inBold);
      if (n) f.appendChild(n);
    }
    return f;
  }
  const el = document.createElement(tag === "P" ? "span" : tag.toLowerCase());
  if (tag === "A") {
    const ref = node.getAttribute("data-ref");
    if (ref) {
      el.className = "ref-link";
      el.dataset.ref = ref;
      el.href = "#";
    } else {
      const href = node.getAttribute("href") || "";
      if (/^https?:\/\//.test(href)) { el.href = href; el.target = "_blank"; el.rel = "noopener"; }
    }
  }
  if (tag === "SPAN") {
    const dir = node.getAttribute("dir");
    if (dir) el.setAttribute("dir", dir);
    if (node.classList.contains("mam-spi-pe") || node.classList.contains("mam-spi-samekh")) el.className = "gap";
  }
  if (tag === "BR" && opts.literal) el.className = "xp-br";
  const bold = inBold || tag === "B" || tag === "STRONG";
  for (const c of Array.from(node.childNodes)) {
    const n = cleanNode(c, opts, bold);
    if (n) el.appendChild(n);
  }
  return el;
}

export function plainText(html) {
  const doc = parser.parseFromString(`<div>${html || ""}</div>`, "text/html");
  doc.querySelectorAll(".footnote").forEach((n) => n.remove());
  return doc.body.textContent.replace(/\s+/g, " ").trim();
}

/**
 * Splits a commentary comment into dibbur hamatchil and body.
 * Handles "<b>DH.</b> body" (Penei Moshe, Korban HaEdah) and "DH – body" (Vilna Rashi/Tosafot).
 */
export function splitDH(html) {
  const s = (html || "").trim();
  const m = /^<(b|strong)>([\s\S]*?)<\/\1>\s*([\s\S]*)$/.exec(s);
  if (m && plainText(m[2]).length < 160) return { dh: m[2], body: m[3] };
  const lt = s.indexOf("<");
  const head = lt === -1 ? s : s.slice(0, lt);
  const sep = /\s[–—-]\s/.exec(head.slice(0, 220));
  if (sep) return { dh: head.slice(0, sep.index), body: s.slice(sep.index + sep[0].length), sep: " – " };
  return { dh: "", body: s };
}

/** Builds a regex that matches a query word regardless of nikud (and allows one-letter prefixes). */
export function markRegex(query) {
  const words = normalizeForLookup(query).split(" ").filter((w) => w.length > 1);
  const enWords = (query || "").replace(/[^\w\s'’-]/g, " ").split(/\s+/).filter((w) => w.length > 2 && !hasHebrew(w));
  const parts = [];
  for (const w of words) {
    parts.push(Array.from(w).map((ch) => ch.replace(/["'׳״]/g, "[\"'׳״]?") + "[\\u0591-\\u05C7]*").join(""));
  }
  for (const w of enWords) parts.push(w.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"));
  if (!parts.length) return null;
  return new RegExp(`(${parts.join("|")})`, "gi");
}

/** Wraps regex matches inside `el`'s text nodes with <mark class="hit">. */
export function markMatches(el, re) {
  if (!re || !el) return 0;
  let count = 0;
  const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
  const nodes = [];
  while (walker.nextNode()) nodes.push(walker.currentNode);
  for (const node of nodes) {
    const t = node.nodeValue;
    re.lastIndex = 0;
    if (!re.test(t)) continue;
    re.lastIndex = 0;
    const f = document.createDocumentFragment();
    let last = 0;
    t.replace(re, (m, _g, idx) => {
      if (idx > last) f.appendChild(document.createTextNode(t.slice(last, idx)));
      const mk = document.createElement("mark");
      mk.className = "hit";
      mk.textContent = m;
      f.appendChild(mk);
      last = idx + m.length;
      count++;
      return m;
    });
    if (last < t.length) f.appendChild(document.createTextNode(t.slice(last)));
    node.parentNode.replaceChild(f, node);
  }
  return count;
}
