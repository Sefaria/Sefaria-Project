/**
 * Guards for static/css/theme-dark-overrides.css (dark-mode fixes that tokens can't reach) and the icon
 * inventory it is generated from (scripts/darkmode/icon-inventory.{js,json}).
 */
const fs = require('fs');
const path = require('path');
const inventoryTool = require('../../../scripts/darkmode/icon-inventory');

const REPO = path.resolve(__dirname, '../../..');
const CSS_PATH = path.join(REPO, 'static/css/theme-dark-overrides.css');
const css = fs.readFileSync(CSS_PATH, 'utf8');
const inventory = JSON.parse(fs.readFileSync(inventoryTool.JSON_OUT, 'utf8'));
const DARK = ':root[data-theme="dark"]';
// jsdom's selector engine (nwsapi) mis-caches `:root[attr]` once the root attribute changes, so selectors
// are matched with the dark-scope prefix removed. The scope tests below prove every selector carries it.
const unscoped = sel => sel.slice(DARK.length).trim();
const matches = (el, sel) => !!unscoped(sel) && el.matches(unscoped(sel));

/* ---------- a tiny CSS parser: enough for this file (comments, strings, url(), nested @media) ---------- */
function stripComments(src) {
  return src.replace(/\/\*[\s\S]*?\*\//g, m => m.replace(/[^\n]/g, ' '));
}
function splitTopLevel(s, sep) {
  const out = []; let depth = 0, quote = null, cur = '';
  for (const ch of s) {
    if (quote) { if (ch === quote) quote = null; cur += ch; continue; }
    if (ch === '"' || ch === "'") { quote = ch; cur += ch; continue; }
    if (ch === '(' || ch === '[') depth++;
    if (ch === ')' || ch === ']') depth--;
    if (ch === sep && depth === 0) { out.push(cur); cur = ''; continue; }
    cur += ch;
  }
  if (cur.trim()) out.push(cur);
  return out.map(x => x.trim()).filter(Boolean);
}
/** Returns [{atRules: [...], selectors: [...], decls: [{prop, value}]}] plus top-level statements outside blocks. */
function parse(src) {
  const s = stripComments(src);
  const rules = []; const stray = [];
  function walk(start, end, atRules) {
    let i = start, segStart = start, quote = null, paren = 0;
    while (i < end) {
      const ch = s[i];
      if (quote) { if (ch === quote) quote = null; i++; continue; }
      if (ch === '"' || ch === "'") { quote = ch; i++; continue; }
      if (ch === '(') paren++; else if (ch === ')') paren--;
      else if (ch === '{' && paren === 0) {
        const prelude = s.slice(segStart, i).trim();
        let depth = 1, j = i + 1, q = null;
        for (; j < end && depth; j++) {
          const c = s[j];
          if (q) { if (c === q) q = null; continue; }
          if (c === '"' || c === "'") q = c;
          else if (c === '{') depth++; else if (c === '}') depth--;
        }
        const bodyStart = i + 1, bodyEnd = j - 1;
        if (prelude.startsWith('@')) walk(bodyStart, bodyEnd, [...atRules, prelude]);
        else {
          const decls = splitTopLevel(s.slice(bodyStart, bodyEnd), ';').map(d => {
            const k = d.indexOf(':');
            return { prop: d.slice(0, k).trim(), value: d.slice(k + 1).trim() };
          });
          rules.push({ atRules, selectors: splitTopLevel(prelude, ','), decls });
        }
        i = j; segStart = j; continue;
      } else if (ch === ';' && paren === 0) {
        if (s.slice(segStart, i).trim()) stray.push({ atRules, text: s.slice(segStart, i).trim() });
        segStart = i + 1;
      }
      i++;
    }
    if (s.slice(segStart, end).trim()) stray.push({ atRules, text: s.slice(segStart, end).trim() });
  }
  walk(0, s.length, []);
  return { rules, stray };
}

const { rules, stray } = parse(css);

describe('theme-dark-overrides.css scope', () => {
  test('parses into rules', () => {
    expect(rules.length).toBeGreaterThan(20);
    expect(stray).toEqual([]);
  });

  test('every rule sits inside a top-level @media screen block', () => {
    for (const r of rules) {
      expect(r.atRules.length).toBeGreaterThan(0);
      expect(r.atRules[0]).toMatch(/^@media\s+screen\s*$/);
      // nested at-rules may only narrow the viewport
      r.atRules.slice(1).forEach(a => expect(a).toMatch(/^@media\s/));
    }
  });

  test('every selector is anchored to :root[data-theme="dark"]', () => {
    for (const r of rules) for (const sel of r.selectors) {
      expect(sel.startsWith(DARK)).toBe(true);
    }
  });

  test('no colour literals outside theme-exempt lines (url() bodies excluded)', () => {
    const NAMED = /\b(white|black|red|green|blue|grey|gray|silver|navy|yellow|orange|purple|pink)\b/i;
    const offenders = [];
    const original = css.split('\n');
    stripComments(css).split('\n').forEach((line, n) => {
      if (/theme-exempt/.test(original[n])) return;
      const code = line.replace(/url\((["']?)[^)]*\1\)/g, 'url()').replace(/"[^"]*"/g, '""');
      const decl = /:\s*(.*)$/.exec(code);
      const value = decl ? decl[1] : '';
      if (/#[0-9a-f]{3,8}\b/i.test(value) || /\b(rgba?|hsla?)\(/i.test(value) || (/(^|\s)(color|background|border|fill|stroke)[\w-]*\s*:/.test(code) && NAMED.test(value))) {
        offenders.push(`${n + 1}: ${line.trim()}`);
      }
    });
    expect(offenders).toEqual([]);
  });

  test('theme-exempt literals are confined to custom-property aliases and data: URL icons', () => {
    const code = stripComments(css).split('\n');
    css.split('\n').forEach((line, n) => {
      if (!/theme-exempt/.test(line) || !code[n].trim()) return;   // mentions inside comments don't count
      expect(line).toMatch(/^\s*(--dm-[\w-]+:|background-image:\s*url\("data:image\/svg\+xml)/);
    });
  });

  test('every var() it reads is either an alias it defines or a token with a fallback', () => {
    const defined = new Set([...css.matchAll(/(--dm-[\w-]+)\s*:/g)].map(m => m[1]));
    for (const r of rules) for (const d of r.decls) {
      for (const m of d.value.matchAll(/var\((--[\w-]+)\s*(,)?/g)) {
        const [, name, hasFallback] = m;
        if (name.startsWith('--dm-')) expect(defined.has(name)).toBe(true);
        else if (!['--theme-button-icon-filter'].includes(name)) expect(hasFallback).toBe(',');
      }
    }
  });
});

describe('icon inventory', () => {
  test('icon-inventory.json is up to date (run: node scripts/darkmode/icon-inventory.js)', () => {
    const fresh = inventoryTool.buildInventory();
    const pick = inv => inv.icons.map(i => [i.path, i.class, i.tone]);
    expect(pick(inventory)).toEqual(pick(fresh));
  });

  test('the generated selector blocks in theme-dark-overrides.css match the inventory', () => {
    expect(inventoryTool.renderCss(css, inventory)).toBe(css);
  });

  test('has all three classes, with coloured brand art where expected', () => {
    const byPath = Object.fromEntries(inventory.icons.map(i => [i.path, i]));
    expect(byPath['static/icons/google.svg'].class).toBe('coloured');
    expect(byPath['static/icons/info-error.svg'].class).toBe('coloured');
    expect(byPath['static/img/icon.svg'].class).toBe('coloured');
    expect(byPath['static/icons/search_mdl.svg']).toMatchObject({ class: 'mono-dark', tone: 'secondary' });
    expect(byPath['static/icons/twitter.svg']).toMatchObject({ class: 'mono-dark', tone: 'strong' }); // brand navy
    expect(byPath['static/icons/book.svg'].class).toBe('light'); // #999 already readable on dark
  });
});

describe('icon filter selectors', () => {
  // Rules that recolour an <img> by src (the generated lists).
  const srcRules = rules.filter(r => r.decls.some(d => d.prop === 'filter') && r.selectors.every(s => /img\[src\$=/.test(s)));
  const toneOfRule = r => {
    const v = r.decls.find(d => d.prop === 'filter').value;
    return v === 'var(--dm-icon-filter)' ? 'strong' : v === 'var(--dm-icon-filter-secondary)' ? 'secondary' : 'other';
  };
  // Every rule that sets a filter other than `none`, minus pseudo-element selectors jsdom can't match.
  const invertingSelectors = rules
    .filter(r => r.decls.some(d => d.prop === 'filter' && d.value !== 'none'))
    .flatMap(r => r.selectors)
    .filter(s => !/::?(before|after)/.test(s));

  beforeAll(() => { document.documentElement.setAttribute('data-theme', 'dark'); });
  afterAll(() => { document.documentElement.removeAttribute('data-theme'); });

  function img(src, parentClass) {
    const parent = document.createElement('div');
    if (parentClass) parent.className = parentClass;
    const el = document.createElement('img');
    el.setAttribute('src', src);
    parent.appendChild(el);
    document.body.appendChild(parent);
    return el;
  }
  afterEach(() => { document.body.innerHTML = ''; });

  test('there is exactly one strong and one secondary src list', () => {
    expect(srcRules.map(toneOfRule).sort()).toEqual(['secondary', 'strong']);
  });

  test.each(['/', 'https://www.sefaria.org/'])('no coloured or light icon is ever inverted (src prefix %s)', prefix => {
    const bad = [];
    for (const icon of inventory.icons.filter(i => i.class !== 'mono-dark' || i.tone === 'context')) {
      const el = img(prefix + icon.path);
      const hit = invertingSelectors.find(sel => matches(el, sel));
      if (hit) bad.push(`${icon.path} (${icon.class}) matched ${hit}`);
    }
    expect(bad).toEqual([]);
  });

  test('every mono-dark icon is matched by the list for its tone, and only that one', () => {
    for (const icon of inventory.icons.filter(i => i.class === 'mono-dark' && i.tone !== 'context')) {
      const el = img('/' + icon.path);
      const tones = srcRules.filter(r => r.selectors.some(sel => matches(el, sel))).map(toneOfRule);
      expect([icon.path, tones]).toEqual([icon.path, [icon.tone]]);
    }
  });

  test('user and CMS images are never inverted', () => {
    const containers = ['sheetContent', 'editorContent', 'sourceContentText', 'contentSpan', 'aboutText', 'topicImage', 'profile-pic'];
    for (const c of containers) {
      for (const src of ['https://user-images.example.com/photo.jpg', 'https://storage.googleapis.com/sefaria-in-app-images/x.png',
        'https://cms.sefaria.org/uploads/art.svg', '/static/img/heart.png', '/static/img/sheets-landing-page/yoram.png']) {
        const el = img(src, c);
        expect([c, src, invertingSelectors.find(sel => matches(el, sel)) || null]).toEqual([c, src, null]);
      }
    }
  });

  test('module button icons keep their own --theme-button-icon-filter (restated after the src lists)', () => {
    const idx = rules.findIndex(r => r.decls.some(d => d.prop === 'filter' && d.value === 'var(--theme-button-icon-filter)'));
    const lastSrc = Math.max(...srcRules.map(r => rules.indexOf(r)));
    expect(idx).toBeGreaterThan(lastSrc);
    expect(rules[idx].selectors).toEqual([
      `${DARK} button.sefaria-common-button img.button-icon`,
      `${DARK} a.sefaria-common-button img.button-icon`,
    ]);
  });
});

describe('logos', () => {
  const logoRules = rules.filter(r => r.selectors.some(s => /\.home$/.test(s)));
  test.each([
    ['library', 'english'], ['library', 'hebrew'], ['voices', 'english'], ['voices', 'hebrew'],
  ])('%s/%s wordmark swaps to its existing white PNG at the header.scss breakpoints', (module, lang) => {
    const rule = logoRules.find(r => r.selectors[0].includes(`[data-active-module="${module}"] .interface-${lang} .home`));
    expect(rule).toBeTruthy();
    expect(rule.atRules[1]).toBe('@media (min-width: 1087px), (max-width: 842px)');
    const file = `static/img/${module}-logo-${lang}-white.png`;
    expect(rule.decls).toEqual([{ prop: 'background-image', value: `url("/${file}")` }]);
    expect(fs.existsSync(path.join(REPO, file))).toBe(true);
  });
});

describe('user-generated content', () => {
  beforeAll(() => { document.documentElement.setAttribute('data-theme', 'dark'); });
  const colorRule = rules.find(r => r.decls.some(d => d.prop === 'color' && d.value === 'var(--dm-ink-on-light) !important'));

  test('text on an editor highlight mark (Editor.jsx pastel background) gets dark ink, links included', () => {
    document.body.innerHTML = '<div class="sheetContent"><span style="background-color: rgb(230, 218, 188);">hi <a href="#">x</a></span></div>';
    const span = document.querySelector('span'), a = document.querySelector('a');
    expect(colorRule.selectors.some(s => matches(span, s))).toBe(true);
    expect(colorRule.selectors.some(s => matches(a, s))).toBe(true);
  });

  test('the same markup outside user content is untouched', () => {
    document.body.innerHTML = '<div class="header"><span style="background-color: var(--sheets-green);">dot</span></div>';
    const span = document.querySelector('span');
    const all = rules.flatMap(r => r.selectors);
    expect(all.filter(s => matches(span, s))).toEqual([]);
  });
});
