/**
 * @jest-environment node
 *
 * Dark-mode colour guard rails for static/css:
 *  1. Ratchet: no stylesheet may gain colour literals or raw palette var() uses beyond
 *     static/css/.color-literal-baseline.json, a stylesheet missing from the baseline must have
 *     none, and the baseline must be lowered when the counts go down.
 *  2. Every var(--color-*) used in static/css is defined in theme-tokens.css (light at least), and
 *     every dark override also exists in light.
 *  3. WCAG contrast of the key token pairs, computed here, in both themes.
 *  4. theme-tokens.css structure: dark values only under `@media screen { :root[data-theme="dark"] }`
 *     and no bare [data-theme] selector anywhere (reCAPTCHA renders data-theme="white").
 *
 * The parser is shared with the codemod (scripts/darkmode/css-colors.js). To fix a failure, use
 * a token from theme-tokens.css instead of a literal, or map the colour in
 * scripts/darkmode/color-map.json and run `node scripts/darkmode/tokenize-css.js`.
 */
const fs = require('fs');
const path = require('path');
const P = require('../../../scripts/darkmode/css-colors');
const codemod = require('../../../scripts/darkmode/tokenize-css');

const CSS_DIR = codemod.CSS_DIR;
const TOKENS_SRC = fs.readFileSync(codemod.TOKENS_FILE, 'utf8');
const MAP = JSON.parse(fs.readFileSync(codemod.MAP_FILE, 'utf8'));
const BASELINE = JSON.parse(fs.readFileSync(codemod.BASELINE_FILE, 'utf8')).files;

function stylesheets(dir = CSS_DIR) {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap(ent => {
    const abs = path.join(dir, ent.name);
    if (ent.isDirectory()) return stylesheets(abs);
    return /\.(css|scss)$/.test(ent.name) ? [abs] : [];
  });
}
const rel = abs => path.relative(CSS_DIR, abs).split(path.sep).join('/');

/* ---------- token environments for both themes ---------- */
const palette = codemod.paletteEnv();
const { light, dark } = codemod.tokenDefs(TOKENS_SRC);
const LIGHT = { ...palette, ...light };
const DARK = { ...LIGHT, ...dark };
const color = (env, name) => {
  const c = P.resolveColor(`var(${name})`, env);
  if (!c) throw new Error(`${name} does not resolve to a colour`);
  return c;
};

describe('colour-literal parser', () => {
  const count = (css, opts = {}) => P.countFile(css, { paletteNames: new Set(['--dark-grey']), ...opts });

  test('counts hex, functions and named colours in declarations only', () => {
    const css = `/* #fff red */ #id.red { color: #FFF; background: rgba(0,0,0, .2); border: 1px solid red; }
      .a { box-shadow: 0 0 1px rgb(0 0 0 / 20%), inset 0 0 2px #0000; background: url(data:image/svg+xml;utf8,<svg fill='%23000'/>) }
      .b { color: transparent; border-color: currentColor; background: inherit; content: "white"; white-space: nowrap; }
      .c { color: var(--dark-grey); border-color: var(--color-border, var(--dark-grey)); }`;
    const r = count(css);
    expect(r.items.filter(i => i.kind === 'literal').map(i => i.text)).toEqual(['#FFF', 'rgba(0,0,0, .2)', 'red', 'rgb(0 0 0 / 20%)', '#0000']);
    expect(r.paletteVars).toBe(1); // the fallback inside var(--color-border, ...) is inert
  });

  test('handles scss comments, nesting and interpolation', () => {
    const css = `$a: #121212; // comment #fff\n.x { &:hover { color: $a; border: 1px solid #ccc; } .y-#{$m} { fill: white } }`;
    expect(count(css, { scss: true }).literals).toBe(3);
  });

  test('parses and normalises colours', () => {
    expect(P.normColor('#FfF')).toBe('#ffffff');
    expect(P.normColor('white')).toBe('#ffffff');
    expect(P.normColor('#00000040')).toBe('rgba(0,0,0,0.251)');
    expect(P.normColor('rgba(0, 0, 0, .2)')).toBe('rgba(0,0,0,0.2)');
    expect(P.normColor('rgb(0 0 0 / 20%)')).toBe('rgba(0,0,0,0.2)');
    expect(P.normColor('hsl(0, 0%, 100%)')).toBe('#ffffff');
    expect(P.normColor('transparent')).toBeNull();
  });

  test('computes WCAG contrast', () => {
    expect(P.contrast('#000000', '#ffffff')).toBeCloseTo(21, 5);
    expect(P.contrast('#767676', '#ffffff')).toBeCloseTo(4.54, 2);
  });
});

describe('colour-literal ratchet', () => {
  const current = codemod.computeCounts();
  const regenerate = 'Regenerate with `node scripts/darkmode/tokenize-css.js --baseline` and commit it.';

  test.each(Object.keys(current).sort())('%s does not exceed its baseline', file => {
    const base = BASELINE[file] || { literals: 0, paletteVars: 0 };
    const got = current[file];
    if (!BASELINE[file]) {
      throw new Error(`${file} is not in the baseline, so it must not use colour literals or raw palette vars ` +
        `(found ${got.literals} literals, ${got.paletteVars} palette vars). Use var(--color-*) tokens from theme-tokens.css.`);
    }
    if (got.literals > base.literals || got.paletteVars > base.paletteVars) {
      throw new Error(`${file}: ${got.literals} colour literals / ${got.paletteVars} raw palette vars, baseline allows ` +
        `${base.literals} / ${base.paletteVars}. Use var(--color-*) tokens from theme-tokens.css instead.`);
    }
  });

  test('baseline is as low as the current counts', () => {
    const stale = Object.keys(BASELINE).filter(f => {
      const got = current[f] || { literals: 0, paletteVars: 0 };
      return got.literals < BASELINE[f].literals || got.paletteVars < BASELINE[f].paletteVars;
    });
    if (stale.length) throw new Error(`Counts went down for ${stale.join(', ')}. ${regenerate}`);
  });

  test('the token and palette files are the only exempt files', () => {
    expect(Object.keys(MAP.ratchetExempt).sort()).toEqual(['color-palette.css', 'theme-tokens.css']);
  });
});

describe('token definitions', () => {
  const used = new Map();
  for (const file of stylesheets()) {
    const src = fs.readFileSync(file, 'utf8');
    for (const m of src.matchAll(/var\(\s*(--color-[\w-]+)/g)) if (!used.has(m[1])) used.set(m[1], rel(file));
  }

  test('theme-tokens.css defines light values', () => {
    expect(Object.keys(light).length).toBeGreaterThan(50);
  });

  test('every var(--color-*) used in static/css has a light value', () => {
    const missing = [...used].filter(([name]) => !(name in light)).map(([n, f]) => `${n} (${f})`);
    expect(missing).toEqual([]);
  });

  test('every dark override also has a light value', () => {
    expect(Object.keys(dark).filter(n => !(n in light))).toEqual([]);
  });

  test('every colour token resolves in both themes', () => {
    const NON_COLOUR = ['--color-icon-filter']; // a filter() value, used by theme-dark-overrides.css
    const bad = Object.keys(light).filter(n => n.startsWith('--color-') && !NON_COLOUR.includes(n))
      .filter(n => !P.resolveColor(`var(${n})`, LIGHT) || !P.resolveColor(`var(${n})`, DARK));
    expect(bad).toEqual([]);
    expect(light['--color-icon-filter']).toBe('none');
  });

  test('the generated legacy section matches scripts/darkmode/color-map.json', () => {
    expect(codemod.renderTokens(TOKENS_SRC, MAP)).toBe(TOKENS_SRC);
    for (const [name, def] of Object.entries(MAP.legacy)) {
      expect(P.normColor(light[name])).toBe(P.normColor(def.light));
      expect(dark[name]).toBe(def.dark);
    }
  });

  test('every mapped token exists and every legacy token has a reviewed dark value', () => {
    const tokens = new Set();
    const collect = o => Object.values(o).forEach(v => typeof v === 'string' ? tokens.add(v) : collect(v));
    collect(MAP.colors); collect(MAP.palette); MAP.rules.forEach(r => tokens.add(r.token));
    tokens.delete('=keep');
    expect([...tokens].filter(t => !(t in light))).toEqual([]);
    expect(Object.keys(MAP.legacy).filter(n => !(n in dark))).toEqual([]);
  });
});

describe('WCAG contrast of key token pairs', () => {
  const both = ['light', 'dark'];
  const ENV = { light: LIGHT, dark: DARK };
  const BACKGROUNDS = ['--color-bg-page', '--color-bg-subtle', '--color-bg-surface', '--color-bg-raised'];

  // [foreground, backgrounds, minimum ratio, themes]
  const PAIRS = [
    ...['--color-text-strong', '--color-text-primary', '--color-text', '--color-text-emphasis',
      '--color-text-secondary', '--color-text-muted', '--color-text-caption', '--color-link', '--color-accent',
      '--color-danger'].map(t => [t, BACKGROUNDS, 4.5, both]),
    // pre-existing light-mode failures (e.g. #999 on white is 2.85:1) are not made worse; dark must pass
    ['--color-text-tertiary', BACKGROUNDS, 4.5, ['dark']],
    ['--color-link-commentary', BACKGROUNDS, 4.5, ['dark']],
    ['--color-voices-accent', ['--color-bg-page', '--color-bg-surface'], 4.5, ['dark']],
    ['--color-text-strong', ['--color-bg-muted', '--color-bg-hover', '--color-selection', '--color-highlight',
      '--color-highlight-light', '--color-bg-control'], 4.5, both],
    ['--color-text-secondary', ['--color-bg-muted', '--color-bg-control'], 4.5, both],
    ['--color-text-on-accent', ['--color-accent-fill', '--color-accent-fill-hover', '--color-fill-navy',
      '--color-voices-fill', '--color-bg-inverse'], 4.5, both],
    ['--color-text-on-accent', ['--color-danger-fill'], 4.5, ['dark']],
    ['--color-accent-fill', ['--color-bg-on-accent'], 4.5, both],
    // non-text: focus rings, input outlines, strong borders, category marks
    ['--color-focus-ring', BACKGROUNDS, 3, both],
    ['--color-border-strong', ['--color-bg-page', '--color-bg-surface'], 3, ['dark']],
    ['--color-border-input', ['--color-bg-control', '--color-bg-raised'], 3, ['dark']],
    ['--color-accent', ['--color-bg-control'], 3, both],
    ...Object.keys(light).filter(n => n.startsWith('--color-cat-'))
      .map(t => [t, ['--color-bg-page', '--color-bg-surface', '--color-bg-raised'], 3, ['dark']]),
  ];
  const cases = [];
  for (const [fg, bgs, min, themes] of PAIRS) for (const theme of themes) for (const bg of bgs) cases.push([theme, fg, bg, min]);

  test.each(cases)('%s: %s on %s >= %s:1', (theme, fg, bg, min) => {
    const env = ENV[theme];
    // semi-transparent backgrounds are composited over the page
    const ratio = P.contrast(color(env, fg), color(env, bg), color(env, '--color-bg-page'));
    if (ratio < min) throw new Error(`${theme}: ${fg} ${color(env, fg)} on ${bg} ${color(env, bg)} is ${ratio.toFixed(2)}:1, needs ${min}:1`);
  });

  test('dark surfaces get lighter as they rise (page < subtle < surface < raised)', () => {
    const lum = BACKGROUNDS.map(t => P.luminance(P.parseColor(color(DARK, t))));
    for (let i = 1; i < lum.length; i++) expect(lum[i]).toBeGreaterThan(lum[i - 1]);
  });

  test('dark reading text is off-white on near-black, not pure white on pure black', () => {
    expect(color(DARK, '--color-text-strong')).not.toBe('#ffffff');
    expect(color(DARK, '--color-bg-page')).not.toBe('#000000');
    expect(P.contrast(color(DARK, '--color-text-strong'), color(DARK, '--color-bg-page'))).toBeLessThan(17);
  });
});

describe('theme selector structure', () => {
  const tokenDecls = P.findDeclarations(TOKENS_SRC);

  test('dark values live only in :root[data-theme="dark"] inside @media screen', () => {
    const darkDecls = tokenDecls.filter(d => /data-theme/.test(d.selector));
    expect(darkDecls.length).toBeGreaterThan(0);
    for (const d of darkDecls) {
      expect(d.selector).toBe(':root[data-theme="dark"]');
      expect(d.atRules).toEqual(['@media screen']);
    }
    expect(darkDecls.find(d => d.prop === 'color-scheme').value).toBe('dark');
    expect(tokenDecls.find(d => d.selector === ':root' && d.prop === 'color-scheme').value).toBe('light');
  });

  test('theme-tokens.css defines nothing outside :root', () => {
    expect([...new Set(tokenDecls.map(d => d.selector))].sort()).toEqual([':root', ':root[data-theme="dark"]']);
  });

  test.each(stylesheets().map(rel))('%s has no bare [data-theme] selector', file => {
    const src = P.maskText(fs.readFileSync(path.join(CSS_DIR, file), 'utf8'), { scss: file.endsWith('.scss'), onlyComments: true });
    const bare = [...src.matchAll(/\[data-theme\b/g)].filter(m => !/:root$/.test(src.slice(Math.max(0, m.index - 5), m.index)));
    expect(bare.map(m => src.slice(Math.max(0, m.index - 30), m.index + 25))).toEqual([]);
  });
});
