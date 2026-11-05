/**
 * Shared colour-literal parser for the dark-mode codemod (tokenize-css.js) and the Jest ratchet
 * (static/js/tests/cssColorLiterals.test.js). Plain Node, no dependencies.
 *
 * What counts as a "colour literal":
 *   - hex: #rgb, #rgba, #rrggbb, #rrggbbaa
 *   - functions: rgb() rgba() hsl() hsla() (comma or space syntax, % or / alpha)
 *   - CSS named colours (white, black, red, ...) but only inside colour-bearing properties,
 *     custom-property definitions and Sass variable definitions
 * What never counts: transparent, currentColor, inherit/initial/unset, anything inside a comment,
 * a string or url(...) (so data: URIs are ignored), and colours in selectors.
 */
'use strict';

const NAMED_COLORS = {
  aliceblue: '#f0f8ff', antiquewhite: '#faebd7', aqua: '#00ffff', aquamarine: '#7fffd4',
  azure: '#f0ffff', beige: '#f5f5dc', bisque: '#ffe4c4', black: '#000000',
  blanchedalmond: '#ffebcd', blue: '#0000ff', blueviolet: '#8a2be2', brown: '#a52a2a',
  burlywood: '#deb887', cadetblue: '#5f9ea0', chartreuse: '#7fff00', chocolate: '#d2691e',
  coral: '#ff7f50', cornflowerblue: '#6495ed', cornsilk: '#fff8dc', crimson: '#dc143c',
  cyan: '#00ffff', darkblue: '#00008b', darkcyan: '#008b8b', darkgoldenrod: '#b8860b',
  darkgray: '#a9a9a9', darkgreen: '#006400', darkgrey: '#a9a9a9', darkkhaki: '#bdb76b',
  darkmagenta: '#8b008b', darkolivegreen: '#556b2f', darkorange: '#ff8c00', darkorchid: '#9932cc',
  darkred: '#8b0000', darksalmon: '#e9967a', darkseagreen: '#8fbc8f', darkslateblue: '#483d8b',
  darkslategray: '#2f4f4f', darkslategrey: '#2f4f4f', darkturquoise: '#00ced1',
  darkviolet: '#9400d3', deeppink: '#ff1493', deepskyblue: '#00bfff', dimgray: '#696969',
  dimgrey: '#696969', dodgerblue: '#1e90ff', firebrick: '#b22222', floralwhite: '#fffaf0',
  forestgreen: '#228b22', fuchsia: '#ff00ff', gainsboro: '#dcdcdc', ghostwhite: '#f8f8ff',
  gold: '#ffd700', goldenrod: '#daa520', gray: '#808080', green: '#008000',
  greenyellow: '#adff2f', grey: '#808080', honeydew: '#f0fff0', hotpink: '#ff69b4',
  indianred: '#cd5c5c', indigo: '#4b0082', ivory: '#fffff0', khaki: '#f0e68c',
  lavender: '#e6e6fa', lavenderblush: '#fff0f5', lawngreen: '#7cfc00', lemonchiffon: '#fffacd',
  lightblue: '#add8e6', lightcoral: '#f08080', lightcyan: '#e0ffff',
  lightgoldenrodyellow: '#fafad2', lightgray: '#d3d3d3', lightgreen: '#90ee90',
  lightgrey: '#d3d3d3', lightpink: '#ffb6c1', lightsalmon: '#ffa07a', lightseagreen: '#20b2aa',
  lightskyblue: '#87cefa', lightslategray: '#778899', lightslategrey: '#778899',
  lightsteelblue: '#b0c4de', lightyellow: '#ffffe0', lime: '#00ff00', limegreen: '#32cd32',
  linen: '#faf0e6', magenta: '#ff00ff', maroon: '#800000', mediumaquamarine: '#66cdaa',
  mediumblue: '#0000cd', mediumorchid: '#ba55d3', mediumpurple: '#9370db',
  mediumseagreen: '#3cb371', mediumslateblue: '#7b68ee', mediumspringgreen: '#00fa9a',
  mediumturquoise: '#48d1cc', mediumvioletred: '#c71585', midnightblue: '#191970',
  mintcream: '#f5fffa', mistyrose: '#ffe4e1', moccasin: '#ffe4b5', navajowhite: '#ffdead',
  navy: '#000080', oldlace: '#fdf5e6', olive: '#808000', olivedrab: '#6b8e23', orange: '#ffa500',
  orangered: '#ff4500', orchid: '#da70d6', palegoldenrod: '#eee8aa', palegreen: '#98fb98',
  paleturquoise: '#afeeee', palevioletred: '#db7093', papayawhip: '#ffefd5',
  peachpuff: '#ffdab9', peru: '#cd853f', pink: '#ffc0cb', plum: '#dda0dd',
  powderblue: '#b0e0e6', purple: '#800080', rebeccapurple: '#663399', red: '#ff0000',
  rosybrown: '#bc8f8f', royalblue: '#4169e1', saddlebrown: '#8b4513', salmon: '#fa8072',
  sandybrown: '#f4a460', seagreen: '#2e8b57', seashell: '#fff5ee', sienna: '#a0522d',
  silver: '#c0c0c0', skyblue: '#87ceeb', slateblue: '#6a5acd', slategray: '#708090',
  slategrey: '#708090', snow: '#fffafa', springgreen: '#00ff7f', steelblue: '#4682b4',
  tan: '#d2b48c', teal: '#008080', thistle: '#d8bfd8', tomato: '#ff6347',
  turquoise: '#40e0d0', violet: '#ee82ee', wheat: '#f5deb3', white: '#ffffff',
  whitesmoke: '#f5f5f5', yellow: '#ffff00', yellowgreen: '#9acd32',
};

/* Property -> class. Classes: text, bg, border, shadow, svg, other, def (custom property / Sass var). */
function propClass(prop) {
  const p = prop.toLowerCase();
  if (p.startsWith('--') || p.startsWith('$')) return 'def';
  if (/^(color|caret-color|text-decoration(-color)?|-webkit-text-fill-color|-webkit-text-stroke(-color)?|text-emphasis(-color)?)$/.test(p)) return 'text';
  if (/^background(-color|-image)?$/.test(p)) return 'bg';
  if (/^(border|outline|column-rule)(-(top|right|bottom|left|block|inline)(-(start|end))?)?(-color)?$/.test(p)) return 'border';
  if (/^(box-shadow|text-shadow|-webkit-box-shadow|-moz-box-shadow|filter|-webkit-filter)$/.test(p)) return 'shadow';
  if (/^(fill|stroke|stop-color|flood-color|lighting-color)$/.test(p)) return 'svg';
  if (/^(scrollbar-color|accent-color)$/.test(p)) return 'other';
  return null;
}
/* Named colours count only where a colour is expected. */
function namedAllowed(prop) { return propClass(prop) !== null; }

/**
 * Replace comments, strings and url(...) bodies with spaces (newlines kept) so offsets are preserved
 * and nothing inside them is ever treated as CSS.
 */
function maskText(src, { scss = false, onlyComments = false } = {}) {
  const out = src.split('');
  const n = src.length;
  let i = 0;
  const blank = (a, b) => { for (let k = a; k < b; k++) if (out[k] !== '\n') out[k] = ' '; };
  while (i < n) {
    const c = src[i];
    if (c === '/' && src[i + 1] === '*') {
      const e = src.indexOf('*/', i + 2); const end = e === -1 ? n : e + 2;
      blank(i, end); i = end; continue;
    }
    if (scss && c === '/' && src[i + 1] === '/' && src[i - 1] !== ':') {
      let e = src.indexOf('\n', i); if (e === -1) e = n;
      blank(i, e); i = e; continue;
    }
    if (c === '"' || c === "'") {
      let j = i + 1;
      while (j < n && src[j] !== c && src[j] !== '\n') { if (src[j] === '\\') j++; j++; }
      if (!onlyComments) blank(i + 1, j);
      i = j + 1; continue;
    }
    if ((c === 'u' || c === 'U') && /^url\(/i.test(src.slice(i, i + 4)) && !/[\w-]/.test(src[i - 1] || '')) {
      let j = i + 4, depth = 1;
      while (j < n && depth) { if (src[j] === '(') depth++; else if (src[j] === ')') depth--; if (depth) j++; }
      if (!onlyComments) blank(i + 4, j);
      i = j + 1; continue;
    }
    i++;
  }
  return out.join('');
}

function lineOf(src, idx) {
  let line = 1; for (let k = 0; k < idx; k++) if (src.charCodeAt(k) === 10) line++; return line;
}

/**
 * Walk the (masked) stylesheet and return every declaration with its enclosing selector and
 * at-rule chain. Works for flat CSS and nested SCSS.
 */
function findDeclarations(src, opts = {}) {
  const scss = opts.scss !== undefined ? opts.scss : false;
  const m = maskText(src, { scss });
  const mc = maskText(src, { scss, onlyComments: true });
  const decls = [];
  const stack = []; // {prelude}
  let segStart = 0; // start of current statement
  const n = m.length;
  // precompute line starts for fast line lookup
  const lineStarts = [0];
  for (let k = 0; k < n; k++) if (m.charCodeAt(k) === 10) lineStarts.push(k + 1);
  const lineAt = (idx) => { let lo = 0, hi = lineStarts.length - 1; while (lo < hi) { const mid = (lo + hi + 1) >> 1; if (lineStarts[mid] <= idx) lo = mid; else hi = mid - 1; } return lo + 1; };
  let parenDepth = 0, blockSeq = 0;
  const handleStatement = (a, b) => {
    // statement text m[a..b) ; it's a declaration if it matches prop: value
    const seg = m.slice(a, b);
    const mm = /^(\s*)((?:--|\$)?[A-Za-z_-][\w-]*|--[\w-]+)(\s*):/.exec(seg);
    if (!mm) return;
    const prop = mm[2];
    if (prop.startsWith('@')) return;
    let vStart = a + mm[0].length;
    while (vStart < b && /\s/.test(m[vStart])) vStart++;
    let vEnd = b;
    while (vEnd > vStart && /\s/.test(m[vEnd - 1])) vEnd--;
    const selectors = stack.filter(s => !s.prelude.trim().startsWith('@')).map(s => s.prelude.trim());
    const atRules = stack.filter(s => s.prelude.trim().startsWith('@')).map(s => s.prelude.trim());
    decls.push({
      prop, propStart: a + mm[1].length, valueStart: vStart, valueEnd: vEnd,
      value: src.slice(vStart, vEnd), masked: m.slice(vStart, vEnd),
      selector: selectors.join(' '), selectors, atRules, line: lineAt(a + mm[1].length),
      blockId: stack.length ? stack[stack.length - 1].id : 0,
    });
  };
  for (let i = 0; i < n; i++) {
    const c = m[i];
    if (c === '(') parenDepth++;
    else if (c === ')') parenDepth = Math.max(0, parenDepth - 1);
    else if (parenDepth === 0 && c === '#' && m[i + 1] === '{') {
      // scss interpolation #{...}: skip to matching brace
      let depth = 0, j = i + 1;
      for (; j < n; j++) { if (m[j] === '{') depth++; else if (m[j] === '}') { depth--; if (!depth) break; } }
      i = j; continue;
    }
    else if (parenDepth === 0 && c === '{') {
      const prelude = m.slice(segStart, i);
      stack.push({ id: ++blockSeq, prelude: mc.slice(segStart, i).replace(/\s+/g, ' '), maskedPrelude: prelude });
      segStart = i + 1;
    } else if (parenDepth === 0 && c === ';') {
      handleStatement(segStart, i); segStart = i + 1;
    } else if (parenDepth === 0 && c === '}') {
      handleStatement(segStart, i); stack.pop(); segStart = i + 1;
    }
  }
  return decls;
}

const HEX_RE = /#(?:[0-9a-fA-F]{8}|[0-9a-fA-F]{6}|[0-9a-fA-F]{3,4})(?![\w-])/g;
const FUNC_RE = /\b(?:rgba?|hsla?)\(\s*[^()]*\)/gi;
const NAMED_RE = new RegExp('(?<![\\w$#.-])(' + Object.keys(NAMED_COLORS).join('|') + ')(?![\\w-])', 'gi');

/** Colour literals within a declaration value. Offsets are relative to the value. */
function findColorsInValue(decl) {
  const { masked, prop } = decl;
  const found = [];
  // ignore anything inside var(...) fallbacks? No: a literal fallback is still a literal.
  let mm;
  HEX_RE.lastIndex = 0;
  while ((mm = HEX_RE.exec(masked))) {
    if (masked[mm.index + 1] === '{') continue;
    found.push({ start: mm.index, end: mm.index + mm[0].length, text: mm[0], kind: 'hex' });
  }
  FUNC_RE.lastIndex = 0;
  while ((mm = FUNC_RE.exec(masked))) {
    found.push({ start: mm.index, end: mm.index + mm[0].length, text: mm[0], kind: 'func' });
  }
  if (namedAllowed(prop)) {
    // strip var(--name) identifiers so --white etc are not matched
    const noVars = masked.replace(/var\(\s*--[\w-]+/g, s => ' '.repeat(s.length));
    NAMED_RE.lastIndex = 0;
    while ((mm = NAMED_RE.exec(noVars))) {
      const inFunc = found.some(f => mm.index >= f.start && mm.index < f.end);
      if (!inFunc) found.push({ start: mm.index, end: mm.index + mm[0].length, text: mm[0], kind: 'named' });
    }
  }
  found.sort((a, b) => a.start - b.start);
  // only keep literals that parse as a colour
  return found.filter(f => parseColor(f.text));
}

const PALETTE_VAR_RE = /var\(\s*(--[\w-]+)\s*(?=[,)])/g;
/** var(--x) usages in a declaration value. Offsets relative to value; start/end cover "var(--x". */
function findVarsInValue(decl) {
  const out = []; let mm;
  const inert = tokenFallbackRanges(decl.masked);
  PALETTE_VAR_RE.lastIndex = 0;
  while ((mm = PALETTE_VAR_RE.exec(decl.masked))) {
    const nameStart = mm.index + mm[0].indexOf('--');
    out.push({ name: mm[1], start: nameStart, end: nameStart + mm[1].length, inert: inert.some(([a, b]) => nameStart > a && nameStart < b) });
  }
  return out;
}

/**
 * Ranges covered by the fallback of a token reference, e.g. the `var(--dark-grey)` in
 * `var(--color-text-secondary, var(--dark-grey))`. Tokens are always defined, so a raw palette
 * var there never applies and is not counted.
 */
function tokenFallbackRanges(masked) {
  const ranges = []; const re = /var\(\s*--color-[\w-]+\s*,/g; let m;
  while ((m = re.exec(masked))) {
    let depth = 1, j = m.index + 4;
    for (; j < masked.length && depth; j++) { if (masked[j] === '(') depth++; else if (masked[j] === ')') depth--; }
    ranges.push([m.index + m[0].length - 1, j]);
  }
  return ranges;
}

function clamp(x, lo, hi) { return Math.min(hi, Math.max(lo, x)); }
function hslToRgb(h, s, l) {
  h = ((h % 360) + 360) % 360 / 360; s = clamp(s, 0, 1); l = clamp(l, 0, 1);
  if (s === 0) return [l * 255, l * 255, l * 255];
  const q = l < 0.5 ? l * (1 + s) : l + s - l * s, p = 2 * l - q;
  const f = t => { if (t < 0) t += 1; if (t > 1) t -= 1; if (t < 1 / 6) return p + (q - p) * 6 * t; if (t < 1 / 2) return q; if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6; return p; };
  return [f(h + 1 / 3) * 255, f(h) * 255, f(h - 1 / 3) * 255];
}

/** Parse a colour literal into {r,g,b,a} (0-255, alpha 0-1) or null. */
function parseColor(text) {
  if (!text) return null;
  const t = text.trim().toLowerCase();
  if (NAMED_COLORS[t]) return parseColor(NAMED_COLORS[t]);
  let m = /^#([0-9a-f]{3,8})$/.exec(t);
  if (m) {
    let h = m[1];
    if (h.length === 3 || h.length === 4) h = h.split('').map(x => x + x).join('');
    if (h.length !== 6 && h.length !== 8) return null;
    return { r: parseInt(h.slice(0, 2), 16), g: parseInt(h.slice(2, 4), 16), b: parseInt(h.slice(4, 6), 16), a: h.length === 8 ? Math.round(parseInt(h.slice(6, 8), 16) / 255 * 1000) / 1000 : 1 };
  }
  m = /^(rgba?|hsla?)\(\s*([^)]*)\)$/.exec(t);
  if (!m) return null;
  const parts = m[2].replace(/\s*\/\s*/, ' / ').split(/\s*,\s*|\s+/).filter(Boolean);
  let alpha = 1;
  const slash = parts.indexOf('/');
  let chans = parts;
  if (slash !== -1) { alpha = parts[slash + 1]; chans = parts.slice(0, slash); }
  else if (parts.length === 4) { alpha = parts[3]; chans = parts.slice(0, 3); }
  if (chans.length !== 3) return null;
  const num = v => { const f = parseFloat(v); return isNaN(f) ? null : f; };
  const a = typeof alpha === 'string' ? (alpha.endsWith('%') ? num(alpha) / 100 : num(alpha)) : alpha;
  if (a === null) return null;
  let r, g, b;
  if (m[1].startsWith('rgb')) {
    const ch = v => v.endsWith('%') ? num(v) * 2.55 : num(v);
    [r, g, b] = chans.map(ch);
  } else {
    const h = num(chans[0].replace(/deg$/, '')), s = num(chans[1]) / 100, l = num(chans[2]) / 100;
    if ([h, s, l].some(x => x === null || isNaN(x))) return null;
    [r, g, b] = hslToRgb(h, s, l);
  }
  if ([r, g, b].some(x => x === null)) return null;
  return { r: Math.round(clamp(r, 0, 255)), g: Math.round(clamp(g, 0, 255)), b: Math.round(clamp(b, 0, 255)), a: Math.round(clamp(a, 0, 1) * 1000) / 1000 };
}

const hex2 = x => x.toString(16).padStart(2, '0');
/** Canonical string for a colour: #rrggbb when opaque, else rgba(r,g,b,a). */
function normColor(text) {
  const c = typeof text === 'string' ? parseColor(text) : text;
  if (!c) return null;
  if (c.a === 1) return '#' + hex2(c.r) + hex2(c.g) + hex2(c.b);
  return `rgba(${c.r},${c.g},${c.b},${+c.a.toFixed(3)})`;
}

/* WCAG 2.x relative luminance / contrast. Semi-transparent fg is composited over bg. */
function composite(fg, bg) {
  const a = fg.a;
  return { r: fg.r * a + bg.r * (1 - a), g: fg.g * a + bg.g * (1 - a), b: fg.b * a + bg.b * (1 - a), a: 1 };
}
function luminance(c) {
  const f = v => { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); };
  return 0.2126 * f(c.r) + 0.7152 * f(c.g) + 0.0722 * f(c.b);
}
function contrast(fgText, bgText, baseText = '#ffffff') {
  const base = parseColor(baseText);
  let bg = parseColor(bgText); if (bg.a < 1) bg = composite(bg, base);
  let fg = parseColor(fgText); if (fg.a < 1) fg = composite(fg, bg);
  const [l1, l2] = [luminance(fg), luminance(bg)].sort((x, y) => y - x);
  return (l1 + 0.05) / (l2 + 0.05);
}

/* ---------- custom-property blocks (for theme-tokens.css / color-palette.css) ---------- */

/** Return [{selector, atRules, name, value}] for every custom-property definition in a sheet. */
function customPropertyDefs(src, opts = {}) {
  return findDeclarations(src, opts).filter(d => d.prop.startsWith('--')).map(d => ({
    selector: d.selector, atRules: d.atRules, name: d.prop, value: d.value.trim(), line: d.line,
  }));
}

/**
 * Resolve a value that is either a colour literal or a var() chain, against a map name->value.
 * Returns the canonical colour string or null (for non-colour values like filters/shadows).
 */
function resolveColor(value, env, seen = new Set()) {
  const v = value.trim().replace(/\s*!important$/, '');
  const m = /^var\(\s*(--[\w-]+)\s*(?:,\s*(.*))?\)$/.exec(v);
  if (m) {
    if (seen.has(m[1])) return null;
    seen.add(m[1]);
    if (env[m[1]] !== undefined) return resolveColor(env[m[1]], env, seen);
    return m[2] ? resolveColor(m[2], env, seen) : null;
  }
  return normColor(v);
}

/** Resolve a whole value (e.g. a shadow list) by substituting var() and normalising colours. */
function resolveValue(value, env, depth = 0) {
  if (depth > 10) return value;
  let v = value.replace(/var\(\s*(--[\w-]+)\s*\)/g, (s, name) => env[name] !== undefined ? resolveValue(env[name], env, depth + 1) : s);
  v = v.replace(/#(?:[0-9a-fA-F]{8}|[0-9a-fA-F]{6}|[0-9a-fA-F]{3,4})(?![\w-])|\b(?:rgba?|hsla?)\([^()]*\)/gi, s => normColor(s) || s);
  v = v.replace(new RegExp('(?<![\\w-])(' + Object.keys(NAMED_COLORS).join('|') + ')(?![\\w-])', 'gi'), s => normColor(s));
  return v.replace(/\s+/g, ' ').replace(/\s*,\s*/g, ',').replace(/(^|[\s,(])0(?:\.0+)?px/g, '$10').trim().toLowerCase();
}

/**
 * Count literal colours and raw palette var() uses per file (what the ratchet enforces).
 * Skipped: declarations on a line marked theme-exempt, url(...) contents (data: URIs), comments,
 * and palette vars that are only the fallback of a var(--color-*) token.
 */
function countFile(src, { scss = false, paletteNames = new Set() } = {}) {
  const decls = findDeclarations(src, { scss });
  const lines = src.split('\n');
  let literals = 0, paletteVars = 0;
  const items = [];
  for (const d of decls) {
    // a declaration whose line carries a /* theme-exempt */ comment is deliberately literal
    if (/theme-exempt/.test(lines[d.line - 1] || '')) continue;
    for (const c of findColorsInValue(d)) { literals++; items.push({ kind: 'literal', text: c.text, prop: d.prop, line: d.line }); }
    for (const v of findVarsInValue(d)) if (paletteNames.has(v.name) && !v.inert) { paletteVars++; items.push({ kind: 'palette', text: v.name, prop: d.prop, line: d.line }); }
  }
  return { literals, paletteVars, items };
}

module.exports = {
  NAMED_COLORS, propClass, maskText, findDeclarations, findColorsInValue, findVarsInValue,
  parseColor, normColor, contrast, luminance, composite, customPropertyDefs, resolveColor,
  resolveValue, countFile, lineOf,
};
