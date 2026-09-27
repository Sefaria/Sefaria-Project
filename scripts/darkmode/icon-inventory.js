/**
 * Dark-mode icon inventory (chunk D).
 *
 * Classifies every SVG under static/icons and static/img, plus a hand-reviewed list of PNG UI icons:
 *   mono-dark  one dark ink (grey ramp or the brand navy), optionally with light knockouts. Drawn as an
 *              <img>, it is invisible on a dark surface, so theme-dark-overrides.css inverts it.
 *              tone "strong"    = black / #121212 / #333 / navy  -> var(--color-icon-filter)
 *              tone "secondary" = #575757 / #666 / #6f6f6f        -> the lighter "secondary" filter
 *   coloured   brand art, multi-colour or saturated icons. Never inverted.
 *   light      already >= 4.5:1 on the dark surfaces (e.g. #999 icons). Never inverted (it would darken them).
 *
 * Usage:  node scripts/darkmode/icon-inventory.js          # rewrite icon-inventory.json + the generated
 *                                                           # selector blocks in static/css/theme-dark-overrides.css
 *         node scripts/darkmode/icon-inventory.js --print  # also print the table
 * static/js/tests/themeDarkOverrides.test.js fails when the JSON or the CSS blocks are stale.
 */
const fs = require('fs');
const path = require('path');
const REPO = path.resolve(__dirname, '../..');
const JSON_OUT = path.join(__dirname, 'icon-inventory.json');
const CSS_FILE = path.join(REPO, 'static/css/theme-dark-overrides.css');

function walk(dir) {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap(d => {
    const p = path.join(dir, d.name);
    return d.isDirectory() ? walk(p) : [p];
  });
}

const NAMED = { black: '#000000', white: '#ffffff', red: '#ff0000', grey: '#808080', gray: '#808080',
  green: '#008000', blue: '#0000ff', currentcolor: '#000000' /* inside <img>, currentColor is black */ };

function toRgb(c) {
  c = c.trim().toLowerCase();
  if (NAMED[c]) c = NAMED[c];
  let m;
  if ((m = c.match(/^#([0-9a-f]{3,8})$/))) {
    let h = m[1];
    if (h.length === 3 || h.length === 4) h = h.split('').map(x => x + x).join('');
    return [0, 2, 4].map(i => parseInt(h.slice(i, i + 2), 16));
  }
  if ((m = c.match(/^rgba?\(([^)]+)\)$/))) return m[1].split(',').slice(0, 3).map(x => parseFloat(x));
  return null;
}
const lin = v => { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); };
const lum = ([r, g, b]) => 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
function sat([r, g, b]) {
  const mx = Math.max(r, g, b) / 255, mn = Math.min(r, g, b) / 255, l = (mx + mn) / 2;
  if (mx === mn) return 0;
  return l > 0.5 ? (mx - mn) / (2 - mx - mn) : (mx - mn) / (mx + mn);
}
const hex = rgb => '#' + rgb.map(v => Math.round(v).toString(16).padStart(2, '0')).join('');

function colorsOf(svg) {
  const found = new Set();
  const add = v => { v = v.replace(/!important/, '').trim(); if (!v || /^(none|transparent|inherit|url\()/i.test(v)) return; const rgb = toRgb(v); if (rgb) found.add(hex(rgb)); };
  const re = /(?:\b(?:fill|stroke|stop-color|color|flood-color)\s*[=:]\s*["']?)([^"';}>\s]+(?:\([^)]*\))?)/gi;
  let m;
  const svgNoComments = svg.replace(/<!--[\s\S]*?-->/g, '');
  while ((m = re.exec(svgNoComments))) add(m[1]);
  // Default black fill: a painted shape with no fill of its own, no class, and no ancestor fill.
  const rootFill = /<svg[^>]*\sfill=/.test(svgNoComments) || /<g[^>]*\sfill=/.test(svgNoComments) || /(^|[\s{;])svg\s*\{[^}]*fill/.test(svgNoComments) || /\*\s*\{[^}]*fill/.test(svgNoComments);
  const shapes = svgNoComments.match(/<(path|circle|rect|polygon|ellipse|polyline|text|use)\b[^>]*>/g) || [];
  const unfilled = shapes.filter(s => !/\sfill=|fill\s*:|\sclass=/.test(s));
  if (unfilled.length && !rootFill) found.add('#000000');
  return [...found];
}

function hue([r, g, b]) {
  r /= 255; g /= 255; b /= 255;
  const mx = Math.max(r, g, b), mn = Math.min(r, g, b), d = mx - mn;
  if (!d) return null;
  let h = mx === r ? ((g - b) / d) % 6 : mx === g ? (b - r) / d + 2 : (r - g) / d + 4;
  return (h * 60 + 360) % 360;
}
// Hand-reviewed decisions that the colour heuristic cannot make on its own.
const OVERRIDES = {
  'static/icons/notifications-1_mdl.svg': ['mono-dark', '#666 bell with a small red unread dot; invert+hue-rotate(180) keeps the dot red'],
  'static/img/icon.svg': ['coloured', 'Sefaria app tile (navy square, white samekh): brand art, never invert'],
  'static/img/logo/icon.svg': ['coloured', 'Sefaria app tile (navy square, white samekh): brand art, never invert'],
  'static/icons/library/favicon.svg': ['coloured', 'favicon: has its own prefers-color-scheme handling'],
  'static/icons/voices/favicon.svg': ['coloured', 'favicon: has its own prefers-color-scheme handling'],
  'static/img/library-logo-english.svg': ['coloured', 'header wordmark: swapped to -white.png by background-image, never filtered'],
  'static/img/library-logo-hebrew.svg': ['coloured', 'header wordmark: swapped to -white.png by background-image, never filtered'],
  'static/img/voices-logo-english.svg': ['coloured', 'header wordmark: swapped to -white.png by background-image, never filtered'],
  'static/img/voices-logo-hebrew.svg': ['coloured', 'header wordmark: swapped to -white.png by background-image, never filtered'],
  'static/img/samech-logo.svg': ['coloured', 'used only as a CSS mask filled with --theme-primary; never filtered'],
  'static/img/topics-launch-banner-close-button-final.svg': ['coloured', 'dead TopicsLaunchBanner art'],
};
function classify(colors, rel) {
  if (OVERRIDES[rel]) return { cls: OVERRIDES[rel][0], why: OVERRIDES[rel][1] };
  if (!colors.length) return { cls: 'mono-dark', why: 'no explicit colour: default black fill (or 40%-black embedded raster)' };
  const info = colors.map(c => { const rgb = toRgb(c); return { c, L: lum(rgb), S: sat(rgb), H: hue(rgb) }; });
  const isNavy = i => i.H !== null && i.H >= 195 && i.H <= 235;   // brand #18345D / #0b3560 family
  const chromatic = info.filter(i => i.S > 0.2 && i.L > 0.004 && i.L < 0.9);
  const nonNavy = chromatic.filter(i => !isNavy(i) || i.L >= 0.2);
  if (nonNavy.length) return { cls: 'coloured', why: 'saturated colour(s) ' + nonNavy.map(i => i.c).join(',') };
  const dark = info.filter(i => i.L < 0.2), light = info.filter(i => i.L >= 0.2);
  if (dark.length) return { cls: 'mono-dark', why: 'dark: ' + dark.map(i => i.c).join(',') + (light.length ? ' (+light knockout ' + light.map(i => i.c).join(',') + ')' : '') };
  return { cls: 'light', why: 'all colours already >= 4.5:1 on #181818: ' + light.map(i => i.c).join(',') };
}

// PNG UI icons, reviewed by eye (the colour heuristic only reads SVG source).
const PNG_ICONS = [
  ['static/img/arrow-up.png', 'mono-dark', 'strong', 'black chevron (collapse toggle, category editor)'],
  ['static/img/arrow-down.png', 'mono-dark', 'strong', 'black chevron (expand toggle, category editor)'],
  ['static/img/logo-hebrew.png', 'mono-dark', 'strong', 'black Hebrew wordmark (module-switcher dropdown)'],
  ['static/img/heart.png', 'mono-dark', 'context', 'black outline heart; only on donate buttons, recoloured by context rules, never by src'],
  ['static/img/copy.png', 'light', null, 'light-grey glyph'],
  ['static/img/icon.png', 'coloured', null, 'Sefaria app tile'],
  ['static/img/googledrivecolor.png', 'coloured', null, 'Google Drive brand mark'],
];

function toneOf(colors) {
  const darks = colors.map(c => lum(toRgb(c))).filter(L => L < 0.2);
  return darks.length && Math.max(...darks) >= 0.06 ? 'secondary' : 'strong';
}

function scanRefs(rel, corpus) {
  const base = path.basename(rel).replace(/\.(svg|png)$/, '');
  const ext = path.extname(rel);
  const dir = path.basename(path.dirname(rel));
  const esc = s => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const direct = new RegExp(esc(rel.replace(/^static\//, '')) + '|' + esc(dir + '/' + base + ext));
  const byName = new RegExp('["\'`/]' + esc(base) + '(' + esc(ext) + ')?["\'`]');
  return corpus.filter(({ f: cf, s }) => direct.test(s) || (/\.(jsx?)$/.test(cf) && byName.test(s))).map(x => x.f);
}

function buildInventory() {
  const jsFiles = walk(path.join(REPO, 'static/js')).filter(f => /\.(jsx?|tsx?)$/.test(f) && !/(\/tests?\/|\.test\.|\/lib\/|TopicsLaunchBanner)/.test(f));
  const cssFiles = ['s2.css', 'common.css', 'header.scss', 'popover.scss', 'common-component.scss', 'common-components.css',
    'themes/library-theme.css', 'themes/sheets-theme.css', 'auth.scss', 'fonts.scss', 'keyboard.css', 'static.css', 'unbounce-banner.css']
    .map(f => path.join(REPO, 'static/css', f)).filter(f => fs.existsSync(f));
  const tplFiles = walk(path.join(REPO, 'templates')).filter(f => f.endsWith('.html'));
  const corpus = [...jsFiles, ...cssFiles, ...tplFiles].map(f => ({ f: path.relative(REPO, f), s: fs.readFileSync(f, 'utf8') }));

  const icons = [];
  const svgs = [...walk(path.join(REPO, 'static/icons')), ...walk(path.join(REPO, 'static/img'))].filter(f => f.endsWith('.svg'));
  for (const f of svgs) {
    const rel = path.relative(REPO, f).split(path.sep).join('/');
    const colors = colorsOf(fs.readFileSync(f, 'utf8'));
    const { cls, why } = classify(colors, rel);
    icons.push({ path: rel, class: cls, tone: cls === 'mono-dark' ? toneOf(colors) : null, colors, why, refs: scanRefs(rel, corpus) });
  }
  for (const [rel, cls, tone, why] of PNG_ICONS) icons.push({ path: rel, class: cls, tone, colors: [], why, refs: scanRefs(rel, corpus) });
  icons.sort((a, b) => a.path.localeCompare(b.path));
  const counts = {};
  for (const i of icons) {
    const k = i.class + (i.refs.length ? '' : ' (unreferenced)');
    counts[k] = (counts[k] || 0) + 1;
  }
  return { about: 'Generated by scripts/darkmode/icon-inventory.js. Do not edit by hand.', counts, icons };
}

/** The selector lists theme-dark-overrides.css carries between its @generated markers. */
function generatedBlocks(inv) {
  const block = tone => inv.icons.filter(i => i.class === 'mono-dark' && i.tone === tone)
    .map(i => `  :root[data-theme="dark"] img[src$="${i.path}"]`).join(',\n');
  return { strong: block('strong'), secondary: block('secondary') };
}

function replaceBlock(css, name, body) {
  const re = new RegExp(`(/\\* @generated icons:${name} start[^*]*\\*/)[\\s\\S]*?(\\n\\s*/\\* @generated icons:${name} end \\*/)`);
  if (!re.test(css)) throw new Error(`marker for ${name} not found in ${CSS_FILE}`);
  return css.replace(re, (_, a, b) => a + '\n' + body + b);
}

function renderCss(css, inv) {
  const blocks = generatedBlocks(inv);
  return replaceBlock(replaceBlock(css, 'strong', blocks.strong), 'secondary', blocks.secondary);
}

module.exports = { buildInventory, generatedBlocks, renderCss, classify, colorsOf, JSON_OUT, CSS_FILE };

if (require.main === module) {
  const inv = buildInventory();
  fs.writeFileSync(JSON_OUT, JSON.stringify(inv, null, 1) + '\n');
  if (fs.existsSync(CSS_FILE)) fs.writeFileSync(CSS_FILE, renderCss(fs.readFileSync(CSS_FILE, 'utf8'), inv));
  console.log(inv.counts);
  if (process.argv.includes('--print')) {
    for (const i of inv.icons) console.log(i.class.padEnd(9), (i.tone || '').padEnd(9), i.refs.length ? 'U' : '-', i.path.padEnd(60), i.colors.join(' '));
  }
}
