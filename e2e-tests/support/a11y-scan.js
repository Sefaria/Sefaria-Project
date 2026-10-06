/*
 * In-page accessibility probes for the dark-mode work (WCAG 2.1: 1.4.1, 1.4.3, 1.4.11, 2.4.1,
 * 2.4.3, 2.4.7, 4.1.1). Shared by the Playwright specs (e2e-tests/library/theme-a11y.spec.ts,
 * "e2e-tests/mobile web/theme-a11y.spec.ts", through pages/themeTogglePage.ts) and by the
 * live-HTML audit harness (scripts/darkmode/a11y-audit.js).
 *
 * Every probe is passed to `page.evaluate`, which serialises the function's source, so each one
 * is self-contained: no references to anything outside its own body. Plain CommonJS on purpose,
 * so the Node harness can `require` it and the TypeScript specs can `import` it.
 *
 * Colour maths follows WCAG 2.x: relative luminance of sRGB, ratio (L1 + .05) / (L2 + .05).
 * Semi-transparent colours are composited over what is behind them. "Large text" is at least
 * 24px, or at least 18.66px (14pt) at weight 700 or more.
 */
'use strict';

/**
 * Contrast of every visible text node's element against its effective background.
 *
 * Background: the element's and its ancestors' background colours, composited from the first
 * opaque one down; with none, <html>'s canvas (#121212 under `color-scheme: dark`, else white).
 * A background image or gradient on the way up means the text sits over an image: it is skipped
 * (reason "over-image"), because its contrast cannot be computed from colours.
 *
 * Skipped, with a reason, rather than measured: text that is visually hidden (a 1px box), off
 * the page (for example a skip link before it is focused), inside a disabled control (WCAG 1.4.3
 * exempts inactive components), under a CSS filter or blend mode, or transparent.
 *
 * @param {object} [opts]
 * @param {string[]} [opts.roots]    selectors to scan (default ['body'])
 * @param {string[]} [opts.exclude]  selectors whose subtrees are not scanned
 * @param {number} [opts.minNormal]  default 4.5
 * @param {number} [opts.minLarge]   default 3
 * @returns {{rows: object[], shadowHosts: string[]}}
 */
function scanTextContrast(opts) {
  const o = Object.assign({ roots: ['body'], exclude: [], minNormal: 4.5, minLarge: 3 }, opts || {});
  const parse = (c) => {
    if (!c) return null;
    let m = /^rgba?\(([^)]+)\)$/.exec(c.trim());
    if (m) {
      const p = m[1].split(/[\s,/]+/).filter(Boolean).map((v) => (v.endsWith('%') ? parseFloat(v) / 100 : parseFloat(v)));
      return { r: p[0], g: p[1], b: p[2], a: p.length > 3 ? p[3] : 1 };
    }
    m = /^color\(srgb\s+([^)]+)\)$/.exec(c.trim());
    if (m) {
      const p = m[1].split(/[\s/]+/).filter(Boolean).map(parseFloat);
      return { r: p[0] * 255, g: p[1] * 255, b: p[2] * 255, a: p.length > 3 ? p[3] : 1 };
    }
    return null;
  };
  const over = (fg, bg) => ({
    r: fg.r * fg.a + bg.r * (1 - fg.a), g: fg.g * fg.a + bg.g * (1 - fg.a), b: fg.b * fg.a + bg.b * (1 - fg.a), a: 1,
  });
  const lum = (c) => {
    const f = (v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); };
    return 0.2126 * f(c.r) + 0.7152 * f(c.g) + 0.0722 * f(c.b);
  };
  const ratio = (a, b) => { const x = lum(a), y = lum(b); return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05); };
  const hex = (c) => '#' + [c.r, c.g, c.b].map((v) => Math.round(v).toString(16).padStart(2, '0')).join('').toUpperCase();
  const canvas = () => (/dark/.test(getComputedStyle(document.documentElement).colorScheme || '')
    ? { r: 18, g: 18, b: 18, a: 1 } : { r: 255, g: 255, b: 255, a: 1 });
  const describe = (el) => {
    const parts = [];
    for (let n = el; n && n.nodeType === 1 && parts.length < 4; n = n.parentElement) {
      let s = n.tagName.toLowerCase();
      if (n.id) { parts.unshift(`${s}#${n.id}`); break; }
      const cls = Array.from(n.classList).filter((c) => !/^(int-en|int-he|en|he)$/.test(c)).slice(0, 2);
      if (cls.length) s += '.' + cls.join('.');
      parts.unshift(s);
    }
    return parts.join(' > ');
  };
  const excluded = (el) => o.exclude.some((sel) => { try { return !!el.closest(sel); } catch (e) { return false; } });

  const rows = [];
  const seen = new Set();
  const shadowHosts = [];
  const docW = Math.max(document.documentElement.scrollWidth, window.innerWidth);
  for (const rootSel of o.roots) {
    for (const root of document.querySelectorAll(rootSel)) {
      root.querySelectorAll('*').forEach((n) => { if (n.shadowRoot) shadowHosts.push(describe(n)); });
      const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
      for (let t = walker.nextNode(); t; t = walker.nextNode()) {
        if (!t.nodeValue || !t.nodeValue.trim()) continue;
        const el = t.parentElement;
        if (!el || seen.has(el)) continue;
        seen.add(el);
        if (el.closest('script, style, noscript, template, title, option, svg title') || excluded(el)) continue;
        const cs = getComputedStyle(el);
        if (cs.display === 'none' || cs.visibility !== 'visible') continue;
        if (typeof el.checkVisibility === 'function' && !el.checkVisibility({ opacityProperty: true, visibilityProperty: true })) continue;
        const range = document.createRange();
        range.selectNodeContents(t);
        const rects = Array.from(range.getClientRects()).filter((r) => r.width > 0 && r.height > 0);
        if (!rects.length) continue;
        const box = rects.reduce((a, r) => ({
          left: Math.min(a.left, r.left), top: Math.min(a.top, r.top), right: Math.max(a.right, r.right), bottom: Math.max(a.bottom, r.bottom),
        }), { left: Infinity, top: Infinity, right: -Infinity, bottom: -Infinity });
        const text = t.nodeValue.trim().replace(/\s+/g, ' ').slice(0, 60);
        const row = { selector: describe(el), text, fontSize: parseFloat(cs.fontSize), fontWeight: parseInt(cs.fontWeight, 10) || 400 };
        row.large = row.fontSize >= 24 || (row.fontSize >= 18.66 && row.fontWeight >= 700);
        row.min = row.large ? o.minLarge : o.minNormal;
        const skip = (reason) => { rows.push(Object.assign(row, { status: 'skip', reason })); };
        if (box.right - box.left <= 1.5 || box.bottom - box.top <= 1.5) { skip('visually-hidden'); continue; }
        const absRight = box.right + window.scrollX, absBottom = box.bottom + window.scrollY, absLeft = box.left + window.scrollX;
        if (absRight <= 0 || absBottom <= 0 || absLeft >= docW) { skip('offscreen'); continue; }
        if (el.closest(':disabled, [aria-disabled="true"]')) { skip('inactive-control'); continue; }
        let fg = parse(cs.webkitTextFillColor && cs.webkitTextFillColor !== cs.color ? cs.webkitTextFillColor : cs.color);
        if (!fg) { skip('unparsed-colour:' + cs.color); continue; }
        if (fg.a === 0) { skip('transparent-text'); continue; }
        // Walk up for backgrounds, opacity and effects.
        const layers = [];
        let image = false, effect = null, opacity = 1;
        for (let n = el; n && n.nodeType === 1; n = n.parentElement) {
          const ncs = n === el ? cs : getComputedStyle(n);
          opacity *= parseFloat(ncs.opacity);
          if (ncs.filter && ncs.filter !== 'none') effect = effect || `filter on ${describe(n)}`;
          if (ncs.mixBlendMode && ncs.mixBlendMode !== 'normal') effect = effect || `blend on ${describe(n)}`;
          // A background image paints above the element's own background colour.
          if (ncs.backgroundImage && ncs.backgroundImage !== 'none') { image = true; break; }
          const c = parse(ncs.backgroundColor);
          if (c && c.a > 0) layers.push(c);
          if (c && c.a >= 1) break;
        }
        if (image) { skip('over-image'); continue; }
        if (effect) { skip(effect); continue; }
        let bg = layers.length && layers[layers.length - 1].a >= 1 ? layers.pop() : canvas();
        while (layers.length) bg = over(layers.pop(), bg);
        fg = Object.assign({}, fg, { a: fg.a * opacity });
        const fgC = over(fg, bg);
        row.fg = hex(fgC);
        row.bg = hex(bg);
        row.ratio = Math.round(ratio(fgC, bg) * 100) / 100;
        row.status = row.ratio + 1e-9 >= row.min ? 'pass' : 'fail';
        rows.push(row);
      }
    }
  }
  return { rows, shadowHosts };
}

/**
 * WCAG 1.4.1: links inside running text must be distinguishable from the surrounding text by
 * more than colour: an underline (or bottom border), or at least 3:1 contrast against the
 * surrounding text colour (the G183 technique, which also needs a non-colour cue on hover/focus).
 * Only links that sit in a block with other visible text of their own are "in running text".
 * @returns {object[]} one row per such link
 */
function scanInlineLinks(opts) {
  const o = Object.assign({ roots: ['body'], minDistinct: 3 }, opts || {});
  const parse = (c) => {
    const m = /^rgba?\(([^)]+)\)$/.exec((c || '').trim());
    if (!m) return null;
    const p = m[1].split(/[\s,/]+/).filter(Boolean).map(parseFloat);
    return { r: p[0], g: p[1], b: p[2], a: p.length > 3 ? p[3] : 1 };
  };
  const lum = (c) => {
    const f = (v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); };
    return 0.2126 * f(c.r) + 0.7152 * f(c.g) + 0.0722 * f(c.b);
  };
  const ratio = (a, b) => { const x = lum(a), y = lum(b); return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05); };
  const hex = (c) => '#' + [c.r, c.g, c.b].map((v) => Math.round(v).toString(16).padStart(2, '0')).join('').toUpperCase();
  const rows = [];
  for (const rootSel of o.roots) {
    for (const a of document.querySelectorAll(`${rootSel} a[href]`)) {
      if (!a.textContent.trim() || !a.getClientRects().length) continue;
      const parent = a.parentElement;
      if (!parent) continue;
      const ownText = Array.from(parent.childNodes).some((n) => n.nodeType === 3 && n.nodeValue.trim().length > 1);
      if (!ownText) continue;
      const acs = getComputedStyle(a);
      if (acs.display !== 'inline' || acs.visibility !== 'visible') continue;
      const lc = parse(acs.color), pc = parse(getComputedStyle(parent).color);
      if (!lc || !pc) continue;
      const underline = /underline/.test(acs.textDecorationLine) || (parseFloat(acs.borderBottomWidth) > 0 && acs.borderBottomStyle !== 'none');
      const r = Math.round(ratio(lc, pc) * 100) / 100;
      rows.push({
        text: a.textContent.trim().slice(0, 40), href: a.getAttribute('href').slice(0, 60), link: hex(lc), surrounding: hex(pc),
        ratioToText: r, underline, status: underline || r >= o.minDistinct ? 'pass' : 'fail',
      });
    }
  }
  return rows;
}

/**
 * What has focus, and whether a keyboard user can see it (WCAG 2.4.7) with enough contrast
 * (3:1, the 1.4.11 / 2.4.11 bar). The ring colour is the outline colour (or the first colour
 * of a box-shadow). It is measured against the background it is drawn on: the parent's
 * effective background for an outline drawn outside the box, the element's own for an inset one.
 */
function describeFocus() {
  const el = document.activeElement;
  if (!el || el === document.body || el === document.documentElement) return { focused: false };
  const parse = (c) => {
    const m = /rgba?\(([^)]+)\)/.exec(c || '');
    if (!m) return null;
    const p = m[1].split(/[\s,/]+/).filter(Boolean).map(parseFloat);
    return { r: p[0], g: p[1], b: p[2], a: p.length > 3 ? p[3] : 1 };
  };
  const over = (fg, bg) => ({
    r: fg.r * fg.a + bg.r * (1 - fg.a), g: fg.g * fg.a + bg.g * (1 - fg.a), b: fg.b * fg.a + bg.b * (1 - fg.a), a: 1,
  });
  const lum = (c) => {
    const f = (v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); };
    return 0.2126 * f(c.r) + 0.7152 * f(c.g) + 0.0722 * f(c.b);
  };
  const ratio = (a, b) => { const x = lum(a), y = lum(b); return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05); };
  const hex = (c) => '#' + [c.r, c.g, c.b].map((v) => Math.round(v).toString(16).padStart(2, '0')).join('').toUpperCase();
  const canvas = () => (/dark/.test(getComputedStyle(document.documentElement).colorScheme || '')
    ? { r: 18, g: 18, b: 18, a: 1 } : { r: 255, g: 255, b: 255, a: 1 });
  const effectiveBg = (start) => {
    const layers = [];
    for (let n = start; n && n.nodeType === 1; n = n.parentElement) {
      const c = parse(getComputedStyle(n).backgroundColor);
      if (c && c.a > 0) { layers.push(c); if (c.a >= 1) break; }
    }
    let bg = layers.length && layers[layers.length - 1].a >= 1 ? layers.pop() : canvas();
    while (layers.length) bg = over(layers.pop(), bg);
    return bg;
  };
  const cs = getComputedStyle(el);
  const r = el.getBoundingClientRect();
  const outlineW = cs.outlineStyle !== 'none' ? parseFloat(cs.outlineWidth) || 0 : 0;
  const offset = parseFloat(cs.outlineOffset) || 0;
  const shadowColour = cs.boxShadow && cs.boxShadow !== 'none' ? parse(cs.boxShadow) : null;
  let ringColour = outlineW > 0 ? parse(cs.outlineColor) : shadowColour;
  const ringSource = outlineW > 0 ? 'outline' : shadowColour ? 'box-shadow' : 'none';
  const inset = ringSource === 'outline' ? offset + outlineW <= 0 : /inset/.test(cs.boxShadow || '');
  const ringBg = effectiveBg(inset ? el : el.parentElement);
  let ringContrast = null;
  if (ringColour) {
    ringColour = over(ringColour, ringBg);
    ringContrast = Math.round(ratio(ringColour, ringBg) * 100) / 100;
  }
  const name = (el.getAttribute('aria-label') || el.textContent || el.getAttribute('title') || el.getAttribute('alt') || '').trim().replace(/\s+/g, ' ').slice(0, 50);
  return {
    focused: true,
    tag: el.tagName.toLowerCase(),
    id: el.id || null,
    className: typeof el.className === 'string' ? el.className.trim().slice(0, 80) : '',
    role: el.getAttribute('role'),
    name,
    href: el.getAttribute('href'),
    inViewport: r.bottom > 0 && r.right > 0 && r.top < window.innerHeight && r.left < window.innerWidth && r.width > 0 && r.height > 0,
    rect: { x: Math.round(r.left), y: Math.round(r.top), w: Math.round(r.width), h: Math.round(r.height) },
    ring: {
      source: ringSource, width: outlineW, offset, style: cs.outlineStyle,
      colour: ringColour ? hex(ringColour) : null, background: hex(ringBg), contrast: ringContrast,
    },
    tabbing: document.body.classList.contains('user-is-tabbing'),
  };
}

/**
 * WCAG 4.1.1: ids used more than once. With `scope`, only ids inside that subtree count
 * (each still checked against the whole document).
 */
function duplicateIds(scope) {
  const all = Array.from(document.querySelectorAll('[id]')).map((e) => e.id).filter(Boolean);
  const counts = all.reduce((m, id) => { m[id] = (m[id] || 0) + 1; return m; }, {});
  const inScope = scope
    ? new Set(Array.from(document.querySelectorAll(`${scope} [id], ${scope}[id]`)).map((e) => e.id))
    : new Set(all);
  return Object.keys(counts).filter((id) => counts[id] > 1 && inScope.has(id)).map((id) => ({ id, count: counts[id] }));
}

/**
 * Pixel measurement of a focus indicator, for rings the computed style cannot describe (the
 * browser's `outline: auto` ring is two-tone). Takes two same-size PNG screenshots (base64) of
 * the same box, focused and unfocused, and compares them pixel by pixel, the way WCAG 2.2's
 * 2.4.11 / 2.4.13 measure a focus indicator: the contrast of each changed pixel between its
 * focused and unfocused colour. Runs in the page (it needs createImageBitmap).
 * @returns {Promise<{changed:number, atLeast3:number, maxContrast:number, p90Contrast:number}>}
 */
async function compareFocusPixels({ focused, unfocused }) {
  const load = async (b64) => {
    const bin = atob(b64); const u = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) u[i] = bin.charCodeAt(i);
    return createImageBitmap(new Blob([u], { type: 'image/png' }));
  };
  const [a, b] = await Promise.all([load(focused), load(unfocused)]);
  const W = Math.min(a.width, b.width), H = Math.min(a.height, b.height);
  const px = (img) => { const c = new OffscreenCanvas(W, H); const g = c.getContext('2d'); g.drawImage(img, 0, 0); return g.getImageData(0, 0, W, H).data; };
  const da = px(a), db = px(b);
  const lum = (r, g, bl) => {
    const f = (v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); };
    return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(bl);
  };
  const ratios = [];
  for (let i = 0; i < da.length; i += 4) {
    if (Math.abs(da[i] - db[i]) + Math.abs(da[i + 1] - db[i + 1]) + Math.abs(da[i + 2] - db[i + 2]) < 24) continue;
    const x = lum(da[i], da[i + 1], da[i + 2]), y = lum(db[i], db[i + 1], db[i + 2]);
    ratios.push((Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05));
  }
  ratios.sort((p, q) => q - p);
  const round = (v) => Math.round(v * 100) / 100;
  return {
    changed: ratios.length,
    atLeast3: ratios.filter((r) => r >= 3).length,
    maxContrast: ratios.length ? round(ratios[0]) : 0,
    p90Contrast: ratios.length ? round(ratios[Math.floor(ratios.length * 0.1)]) : 0,
  };
}

/** WCAG relative-luminance contrast of two #RRGGBB colours, for Node-side assertions. */
function contrastOfHex(a, b) {
  const rgb = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
  const lum = (h) => {
    const f = (v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); };
    const [r, g, b2] = rgb(h);
    return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b2);
  };
  const x = lum(a), y = lum(b);
  return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05);
}

/** axe-core tags for WCAG 2.0/2.1 Level A and AA. */
const AXE_TAGS = ['wcag2a', 'wcag21a', 'wcag2aa', 'wcag21aa'];

/**
 * The axe-core source, if the package can be found: AXE_CORE_PATH (a path to axe.min.js), or
 * `axe-core` resolvable from the repo. axe-core is NOT a dependency of this repo; the specs that
 * use it skip themselves when it is missing (see theme-a11y.spec.ts).
 */
function axeSource() {
  const fs = require('fs');
  const candidates = [];
  if (process.env.AXE_CORE_PATH) candidates.push(process.env.AXE_CORE_PATH);
  try { candidates.push(require.resolve('axe-core/axe.min.js')); } catch (e) { /* not installed */ }
  for (const p of candidates) {
    try { if (fs.statSync(p).isFile()) return { path: p, source: fs.readFileSync(p, 'utf8') }; } catch (e) { /* next */ }
  }
  return null;
}

module.exports = { scanTextContrast, scanInlineLinks, describeFocus, duplicateIds, compareFocusPixels, contrastOfHex, AXE_TAGS, axeSource };
