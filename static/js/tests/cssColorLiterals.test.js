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
    // module switcher dots (Header.jsx)
    ...['--color-accent', '--color-voices-accent', '--color-developers-accent']
      .map(t => [t, ['--color-bg-surface', '--color-bg-raised'], 3, both]),
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

/* ---------- 5. WCAG 2.1 token audit (dark mode accessibility report) ----------
 * The contrast evidence for the dark-mode compliance report: WCAG 1.4.3 (text 4.5:1), 1.4.11
 * (control boundaries, focus rings, switch, icons 3:1) and 1.4.1 (links in running text told apart
 * by more than colour). Dark mode must pass everything enforced here. Light mode is unchanged by the
 * dark-mode work, so its pre-existing failures are pinned in KNOWN_LIGHT: a new light failure, or a
 * known one that starts passing (stale entry), fails the build. Pairs that are reported rather than
 * enforced are listed with their measured ratio and reason.
 */
describe('WCAG token audit', () => {
  const ENV = { light: LIGHT, dark: DARK };
  const THEMES = ['light', 'dark'];
  const ratio = (theme, fg, bg) => {
    const env = ENV[theme];
    return P.contrast(color(env, fg), color(env, bg), color(env, '--color-bg-page'));
  };
  const short = t => t.replace('--color-', '');
  const fmt = (theme, fg, bg) => `${theme}: ${short(fg)} ${color(ENV[theme], fg)} on ${short(bg)} ${color(ENV[theme], bg)} = ${ratio(theme, fg, bg).toFixed(2)}:1`;

  // Background levels text sits on by inheritance, and the fills that appear behind text on
  // hover, press, selection and search/segment highlight.
  const SURFACES = ['--color-bg-page', '--color-bg-subtle', '--color-bg-backdrop', '--color-bg-surface',
    '--color-bg-raised', '--color-bg-control', '--color-bg-muted'];
  const FILLS = ['--color-bg-muted-hover', '--color-bg-hover', '--color-bg-hover-strong', '--color-selection',
    '--color-highlight', '--color-highlight-light', '--color-highlight-green'];
  // Every text token that carries content. (--color-text-disabled marks inactive controls, which
  // 1.4.3 exempts; --color-text-faint is for decorative glyphs and dividers.)
  const TEXT = ['--color-text-strong', '--color-text-primary', '--color-text', '--color-text-emphasis',
    '--color-text-secondary', '--color-text-muted', '--color-text-caption', '--color-text-tertiary',
    '--color-link', '--color-link-commentary', '--color-accent', '--color-accent-hover', '--color-danger',
    '--color-voices-accent'];
  // Text that is expected on the hover and highlight fills (list rows, buttons, highlighted segments).
  const READING = ['--color-text-strong', '--color-text-primary', '--color-text', '--color-text-emphasis',
    '--color-accent', '--color-accent-hover'];

  // Measured light-mode failures that predate dark mode ("fg on bg"). Not made worse; not fixed here.
  const KNOWN_LIGHT = new Set([
    // #999 (--medium-grey-legacy) text: 2.85:1 on white and lower on greys
    ...SURFACES.map(b => `--color-text-tertiary on ${b}`),
    ...['--color-bg-muted'].flatMap(b => ['--color-text-muted', '--color-text-caption', '--color-link',
      '--color-link-commentary', '--color-voices-accent'].map(t => `${t} on ${b}`)),
    '--color-voices-accent on --color-bg-subtle', '--color-voices-accent on --color-bg-backdrop',
  ]);

  describe('1.4.3: text tokens on every surface level (inherited text)', () => {
    const cases = [];
    for (const theme of THEMES) for (const fg of TEXT) for (const bg of SURFACES) cases.push([theme, fg, bg]);
    test.each(cases)('%s: %s on %s', (theme, fg, bg) => {
      const r = ratio(theme, fg, bg);
      const known = theme === 'light' && KNOWN_LIGHT.has(`${fg} on ${bg}`);
      if (known) {
        if (r >= 4.5) throw new Error(`${fmt(theme, fg, bg)} now passes: remove it from KNOWN_LIGHT`);
        return;
      }
      if (r < 4.5) throw new Error(`${fmt(theme, fg, bg)}, needs 4.5:1`);
    });
  });

  describe('1.4.3: reading text on hover, selection and highlight fills', () => {
    const cases = [];
    for (const theme of THEMES) for (const fg of READING) for (const bg of FILLS) cases.push([theme, fg, bg]);
    // Light hover greys are darker than the dark-mode ones relative to their text; these light pairs predate dark mode.
    const KNOWN_LIGHT_FILLS = new Set([
      '--color-text-emphasis on --color-bg-hover-strong', // #555 on #CCC: 4.50 rounds up but is 4.497
    ]);
    test.each(cases)('%s: %s on %s', (theme, fg, bg) => {
      const r = ratio(theme, fg, bg);
      if (theme === 'light' && KNOWN_LIGHT_FILLS.has(`${fg} on ${bg}`)) return;
      if (r < 4.5) throw new Error(`${fmt(theme, fg, bg)}, needs 4.5:1`);
    });

    // Reported, not enforced: lighter greys and links on transient fills. Each entry records the
    // measured dark value so a change shows up in review; none may drop below 3:1 (never illegible).
    const REPORTED_DARK = [
      ['--color-text-secondary', '--color-selection', 3.89],
      ['--color-text-muted', '--color-selection', 3.43],
      ['--color-text-caption', '--color-selection', 3.31],
      ['--color-link', '--color-selection', 3.95],
      ['--color-link-commentary', '--color-selection', 3.71],
      ['--color-danger', '--color-selection', 3.29],
      ['--color-text-muted', '--color-bg-hover-strong', 4.47],
      ['--color-text-caption', '--color-bg-hover-strong', 4.32],
      ['--color-text-tertiary', '--color-bg-hover', 4.12],
      ['--color-text-tertiary', '--color-bg-hover-strong', 3.55],
    ];
    test.each(REPORTED_DARK)('dark (reported): %s on %s is %s:1 and at least 3:1', (fg, bg, measured) => {
      const r = ratio('dark', fg, bg);
      expect(Math.round(r * 100) / 100).toBeCloseTo(measured, 2);
      expect(r).toBeGreaterThanOrEqual(3);
    });
  });

  describe('1.4.3: colour and background set by the same rule (with the dark overrides applied)', () => {
    const OVERRIDES = fs.readFileSync(path.join(CSS_DIR, 'theme-dark-overrides.css'), 'utf8');
    const DARK_SCOPE = ':root[data-theme="dark"]';
    const overrideDecls = P.findDeclarations(OVERRIDES);
    const aliases = {};
    for (const d of overrideDecls) if (d.prop.startsWith('--dm-')) aliases[d.prop] = d.value.replace(/\s*\/\*.*$/, '');
    const DARK_OV = { ...DARK, ...aliases };
    const STATE = /:(hover|focus|focus-visible|focus-within|active)\b/g;
    const tokenIn = v => { const m = /^\s*var\(\s*(--(?:color|dm)-[\w-]+)/.exec(v); return m ? m[0].replace(/^\s*var\(\s*/, '') : null; };
    const role = prop => (prop === 'color' ? 'fg' : (prop === 'background' || prop === 'background-color') ? 'bg' : null);

    // selector -> { fg, bg } in source order (last one wins), from every stylesheet but the theme files
    const rules = new Map();
    for (const file of stylesheets().filter(f => /\.css$/.test(f) && !/theme-tokens|color-palette|theme-dark-overrides/.test(f))) {
      for (const d of P.findDeclarations(fs.readFileSync(file, 'utf8'))) {
        const side = role(d.prop);
        if (!side || d.atRules.some(a => /print/.test(a))) continue;
        const tok = tokenIn(d.value);
        if (!tok) continue;
        for (const raw of d.selector.split(',')) {
          const sel = raw.trim().replace(/\s+/g, ' ');
          const key = `${rel(file)}|${d.atRules.join(' ')}|${sel}`;
          if (!rules.has(key)) rules.set(key, { file: rel(file), sel, decl: {} });
          rules.get(key).decl[side] = tok;
        }
      }
    }
    const darkOverride = new Map();
    for (const d of overrideDecls) {
      const side = role(d.prop);
      if (!side) continue;
      for (const raw of d.selector.split(',')) {
        const sel = raw.trim().replace(/\s+/g, ' ');
        if (!sel.startsWith(DARK_SCOPE)) continue;
        const bare = sel.slice(DARK_SCOPE.length).trim();
        if (!darkOverride.has(bare)) darkOverride.set(bare, {});
        darkOverride.get(bare)[side] = d.value.trim();
      }
    }
    // base rule + its :hover/:focus/:active variants, which inherit the side they don't set
    const byBase = new Map();
    for (const r of rules.values()) {
      const base = r.sel.replace(STATE, '');
      const k = `${r.file}|${base}`;
      if (!byBase.has(k)) byBase.set(k, { file: r.file, base, variants: [] });
      byBase.get(k).variants.push(r);
    }
    const pairs = [];
    for (const g of byBase.values()) {
      const baseDecl = (g.variants.find(v => v.sel === g.base) || { decl: {} }).decl;
      for (const v of g.variants) {
        const fg = v.decl.fg || baseDecl.fg, bg = v.decl.bg || baseDecl.bg;
        if (!fg || !bg) continue;
        const ov = { ...(darkOverride.get(g.base) || {}), ...(darkOverride.get(v.sel) || {}) };
        pairs.push({ where: `${v.file} ${v.sel}`, sel: v.sel, fg, bg, darkFg: ov.fg || `var(${fg})`, darkBg: ov.bg || `var(${bg})` });
      }
    }
    const measure = (p, theme) => {
      const env = theme === 'dark' ? DARK_OV : LIGHT;
      const fg = P.resolveColor(theme === 'dark' ? p.darkFg : `var(${p.fg})`, env);
      const bg = P.resolveColor(theme === 'dark' ? p.darkBg : `var(${p.bg})`, env);
      if (!fg || !bg) return null;
      return { fg, bg, r: P.contrast(fg, bg, P.resolveColor('var(--color-bg-page)', env)) };
    };
    // Exempt with a reason (both themes).
    const EXEMPT = {
      '.sefaria-provider-button-shell.is-disabled .sefaria-provider-button': 'inactive control (1.4.3 exception)',
      '.sefaria-provider-button:disabled': 'inactive control (1.4.3 exception)',
      '.sefaria-input-control:disabled': 'inactive control (1.4.3 exception)',
      '.modTools .modtoolsButton': 'staff-only modtools UI (untokenized --mt-* system, out of scope); light 1.61:1 predates dark mode',
      '.bookPage .content .versionDownloadButton': 'no component renders it (dead CSS); light 1.61:1 predates dark mode',
    };
    // Light failures that predate dark mode.
    const KNOWN_LIGHT_RULES = new Set([
      '#alertMessage', '#globalWarning', '#globalWarningMessage',             // legacy alert pinks, 1.8-3.9:1
      '#interruptingMessage.beitMidrashModalContentBox button.red', '.toolsButtonContainer.highlighted',
      '.story-action-button', '#declineButton',                             // white on --responsa-red #CB6158, 3.9:1
      '.modTools .workflowy-tool .modtoolsButton:hover', '.dictionarySearchBox',
      '.editTextInfo #newIndex .remove', '#edPage #edCover',
      '.toggle-switch-inner:after',                                         // the site's existing switch: white knob on #CCC, 1.6:1
    ]);

    test('finds the colour/background pairs (sanity)', () => {
      expect(pairs.length).toBeGreaterThan(40);
    });

    test('dark: every pair passes 4.5:1 (inactive or out-of-scope UI excepted)', () => {
      const bad = pairs.filter(p => !EXEMPT[p.sel]).map(p => ({ p, m: measure(p, 'dark') }))
        .filter(({ m }) => m && m.r < 4.5)
        .map(({ p, m }) => `${p.where}: ${p.darkFg} ${m.fg} on ${p.darkBg} ${m.bg} = ${m.r.toFixed(2)}:1`);
      expect(bad).toEqual([]);
    });

    test('light: no pair fails that did not fail before dark mode', () => {
      const bad = pairs.filter(p => !EXEMPT[p.sel] && !KNOWN_LIGHT_RULES.has(p.sel)).map(p => ({ p, m: measure(p, 'light') }))
        .filter(({ m }) => m && m.r < 4.5)
        .map(({ p, m }) => `${p.where}: ${p.fg} ${m.fg} on ${p.bg} ${m.bg} = ${m.r.toFixed(2)}:1`);
      expect(bad).toEqual([]);
    });

    test('every exemption and known light failure still matches a rule', () => {
      const sels = new Set(pairs.map(p => p.sel));
      expect([...Object.keys(EXEMPT), ...KNOWN_LIGHT_RULES].filter(s => !sels.has(s))).toEqual([]);
    });
  });

  describe('1.4.1: links in running text are told apart by more than colour', () => {
    const S2 = fs.readFileSync(path.join(CSS_DIR, 's2.css'), 'utf8');
    const OVERRIDES = fs.readFileSync(path.join(CSS_DIR, 'theme-dark-overrides.css'), 'utf8');
    const LINK_TOKENS = ['--color-link', '--color-link-commentary'];
    // Links that sit inside sentences, with the text token around them.
    const RUNNING_TEXT = {
      '.ai-info-messages-box a': '--color-text-strong',
      '.topicPanel .topicDescription a': '--color-text-secondary',
      '.sheetContent .segment a': '--color-text-strong',
      '.reactMarkdown a': '--color-text-strong',
      '.feedbackOverlay a': '--color-text-secondary',
      '.inlineTextRef': '--color-text-strong',
    };
    // Link-coloured rules that are not links in running text, with why.
    const NOT_RUNNING_TEXT = {
      '.topic-landing-parasha .browse-all-parashot-prompt': 'stand-alone prompt link',
      '.topic-landing-seasonal .explore-calendar-prompt': 'stand-alone prompt link',
      '.sheetContent .successMessage': 'status message, not a link',
      '.segment sup.endFootnote': 'footnote marker, superscript',
      '.segment sup.footnote-marker': 'footnote marker, superscript',
      '.segment sup.itag': 'footnote marker, superscript',
      '.multiPanel .textRange .numberLabel.itag': 'footnote marker, superscript',
      '.collectionPage .collectionWebsite': 'stand-alone link on its own line',
      '.searchBox.TopicSearchBox input.selected': 'input text, not a link',
      '.topicSearch.addInterfaceInput input.selected': 'input text, not a link',
      '.productsHeader .cta .productsCTA': 'stand-alone call to action with a " ›" arrow',
      '.productsCTA::after': 'the arrow glyph',
      '.productsDevBox a': 'stand-alone links with a " ›" arrow',
      '.productsDevBox a::after': 'the arrow glyph',
    };
    const linkRules = [...new Set(stylesheets().filter(f => /\.css$/.test(f) && !/theme-/.test(f))
      .flatMap(f => P.findDeclarations(fs.readFileSync(f, 'utf8')))
      .filter(d => d.prop === 'color' && LINK_TOKENS.some(t => new RegExp(`var\\(\\s*${t}\\s*[,)]`).test(d.value) || d.value.includes(`, var(${t})`)))
      .flatMap(d => d.selector.split(',').map(s => s.trim().replace(/\s+/g, ' '))))];
    const darkUnderlined = new Set(P.findDeclarations(OVERRIDES)
      .filter(d => d.prop === 'text-decoration' && /underline/.test(d.value))
      .flatMap(d => d.selector.split(',').map(s => s.trim().replace(/^:root\[data-theme="dark"\]\s*/, '').replace(/:not\([^)]*\)/g, ''))));
    const baseUnderlined = sel => P.findDeclarations(S2).some(d => d.selector.split(',').map(s => s.trim()).includes(sel) &&
      /^text-decoration(-line)?$/.test(d.prop) && /underline/.test(d.value));

    test('every link-coloured rule is classified (running text or not)', () => {
      expect(linkRules.filter(s => !(s in RUNNING_TEXT) && !(s in NOT_RUNNING_TEXT))).toEqual([]);
      expect([...Object.keys(RUNNING_TEXT), ...Object.keys(NOT_RUNNING_TEXT)].filter(s => !linkRules.includes(s))).toEqual([]);
    });

    const tokenOf = sel => {
      const d = P.findDeclarations(S2).find(x => x.prop === 'color' && x.selector.split(',').map(s => s.trim()).includes(sel));
      return /var\(\s*(--color-[\w-]+)/.exec(d.value)[1];
    };
    test.each(Object.entries(RUNNING_TEXT))('dark: %s is underlined or 3:1 from the text around it', (sel, around) => {
      const r = ratio('dark', tokenOf(sel), around);
      if (!(r >= 3 || darkUnderlined.has(sel) || baseUnderlined(sel))) {
        throw new Error(`${sel}: ${fmt('dark', tokenOf(sel), around)} against the text, and not underlined in dark`);
      }
    });

    test('light baseline: links on black text differ by at least 3:1; on grey text they do not (pre-existing)', () => {
      for (const t of LINK_TOKENS) expect(ratio('light', t, '--color-text-strong')).toBeGreaterThanOrEqual(3);
      // topic descriptions and the feedback overlay: #4B71B7-family link on #666 text, about 1.2:1
      for (const t of LINK_TOKENS) expect(ratio('light', t, '--color-text-secondary')).toBeLessThan(3);
    });

    test('dark: link colours are below 3:1 from body text, which is why they are underlined', () => {
      for (const t of LINK_TOKENS) expect(ratio('dark', t, '--color-text-strong')).toBeLessThan(3);
    });
  });

  describe('1.4.11: focus ring, control boundaries and the mobile switch', () => {
    test.each(THEMES.flatMap(th => [...SURFACES, ...(th === 'dark' ? FILLS : [])].map(bg => [th, bg])))(
      '%s: focus ring on %s >= 3:1', (theme, bg) => {
        if (ratio(theme, '--color-focus-ring', bg) < 3) throw new Error(`${fmt(theme, '--color-focus-ring', bg)}, needs 3:1`);
      });

    const CONTROL_BG = ['--color-bg-page', '--color-bg-subtle', '--color-bg-surface', '--color-bg-raised', '--color-bg-control'];
    test.each(['--color-border-input', '--color-border-strong'].flatMap(b => CONTROL_BG.map(bg => [b, bg])))(
      'dark: %s on %s >= 3:1 (input and control outlines)', (b, bg) => {
        if (ratio('dark', b, bg) < 3) throw new Error(`${fmt('dark', b, bg)}, needs 3:1`);
      });

    test('light input outlines are below 3:1 (pre-existing design-system value #E6E6E6)', () => {
      expect(ratio('light', '--color-border-input', '--color-bg-control')).toBeLessThan(3);
    });

    // ThemeToggle.jsx MobileThemeToggle: the knob position shows the state; knob and track must
    // both stand out. Dark uses the section 7c overrides; light is the site's existing .toggle-switch look.
    const OVERRIDES = fs.readFileSync(path.join(CSS_DIR, 'theme-dark-overrides.css'), 'utf8');
    const aliases = {};
    for (const d of P.findDeclarations(OVERRIDES)) if (d.prop.startsWith('--dm-')) aliases[d.prop] = d.value;
    const env = { ...DARK, ...aliases };
    const c = v => P.resolveColor(v, env);
    const MENU_BG = ['--color-bg-page', '--color-bg-subtle'];
    // The switch is on whenever the page is dark and off whenever it is light (it IS the theme).
    test('dark (switch on): the track is >= 3:1 against the menu and the knob >= 3:1 against the track', () => {
      const on = c('var(--dm-switch-track-on)'), knob = c('var(--color-text-on-accent)');
      for (const bg of MENU_BG) expect(P.contrast(on, c(`var(${bg})`))).toBeGreaterThanOrEqual(3);
      expect(P.contrast(knob, on)).toBeGreaterThanOrEqual(3);
      // without the section 7c override the on track would be 2.6:1
      expect(P.contrast(color(DARK, '--color-accent-fill'), color(DARK, '--color-bg-subtle'))).toBeLessThan(3);
    });
    test('light (switch off): track and knob are below 3:1, the site\'s existing .toggle-switch look (reported); "on" passes', () => {
      const off = color(LIGHT, '--color-border'), on = color(LIGHT, '--color-accent-fill'), knob = color(LIGHT, '--color-text-on-accent');
      expect(P.contrast(on, color(LIGHT, '--color-bg-page'))).toBeGreaterThanOrEqual(3);
      expect(P.contrast(knob, on)).toBeGreaterThanOrEqual(3);
      expect(P.contrast(off, color(LIGHT, '--color-bg-page'))).toBeLessThan(3);   // #CCC on white, 1.61:1
      expect(P.contrast(knob, off)).toBeLessThan(3);
    });
    test('the desktop toggle glyph (currentColor = --color-text-secondary) is >= 3:1 on the header in both themes', () => {
      for (const th of THEMES) expect(ratio(th, '--color-text-secondary', '--color-bg-surface')).toBeGreaterThanOrEqual(3);
    });
  });

  describe('1.4.11: monochrome icons after the dark filter (theme-dark-overrides.css section 1)', () => {
    // CSS filter functions (Filter Effects 1), applied in sRGB with clamping after each function,
    // which is what Chromium does (fixture below measured in Chromium 1194).
    const clamp = v => Math.min(1, Math.max(0, v));
    const FN = {
      invert: (c, a) => c.map(v => clamp(a * (1 - v) + (1 - a) * v)),
      brightness: (c, a) => c.map(v => clamp(v * a)),
      contrast: (c, a) => c.map(v => clamp(a * v + 0.5 - 0.5 * a)),
      'hue-rotate': (c, deg) => {
        const t = deg * Math.PI / 180, cs = Math.cos(t), sn = Math.sin(t);
        const m = [
          [0.213 + cs * 0.787 - sn * 0.213, 0.715 - cs * 0.715 - sn * 0.715, 0.072 - cs * 0.072 + sn * 0.928],
          [0.213 - cs * 0.213 + sn * 0.143, 0.715 + cs * 0.285 + sn * 0.140, 0.072 - cs * 0.072 - sn * 0.283],
          [0.213 - cs * 0.213 - sn * 0.787, 0.715 - cs * 0.715 + sn * 0.715, 0.072 + cs * 0.928 + sn * 0.072],
        ];
        return m.map(row => clamp(row[0] * c[0] + row[1] * c[1] + row[2] * c[2]));
      },
    };
    const applyFilter = (hex, filter) => {
      let c = [1, 3, 5].map(i => parseInt(hex.slice(i, i + 2), 16) / 255);
      for (const [, name, arg] of filter.matchAll(/([a-z-]+)\(([^)]*)\)/g)) {
        const a = arg.endsWith('%') ? parseFloat(arg) / 100 : arg.endsWith('deg') ? parseFloat(arg) : parseFloat(arg);
        c = FN[name](c, a);
      }
      return '#' + c.map(v => Math.round(v * 255).toString(16).padStart(2, '0')).join('').toUpperCase();
    };
    const OVERRIDES = fs.readFileSync(path.join(CSS_DIR, 'theme-dark-overrides.css'), 'utf8');
    const alias = name => P.findDeclarations(OVERRIDES).find(d => d.prop === name).value;
    const STRONG = dark['--color-icon-filter'];
    const SECONDARY = alias('--dm-icon-filter-secondary');

    test('the filters are the documented ones', () => {
      expect(STRONG).toBe('invert(1) hue-rotate(180deg) brightness(.9)');
      expect(alias('--dm-icon-filter')).toBe('var(--color-icon-filter, invert(1) hue-rotate(180deg) brightness(.9))');
      expect(SECONDARY).toBe('invert(1) hue-rotate(180deg) brightness(1.18)');
    });

    // [ink, filter, colour Chromium paints]
    const MEASURED = [
      ['#000000', 'strong', '#E6E6E5'], ['#121212', 'strong', '#D5D5D5'], ['#333333', 'strong', '#B8B8B8'],
      ['#18345D', 'strong', '#A3BCE1'], ['#666666', 'secondary', '#B5B5B5'], ['#6F6F6F', 'secondary', '#AAAAAA'],
      ['#575757', 'secondary', '#C6C6C6'],
    ];
    const DARK_BG = [...SURFACES, '--color-bg-muted-hover', '--color-bg-hover', '--color-bg-hover-strong'];
    test.each(MEASURED)('%s through the %s filter paints about %s, >= 3:1 on every dark surface and hover fill', (ink, tone, painted) => {
      const out = applyFilter(ink, tone === 'strong' ? STRONG : SECONDARY);
      const ch = h => [1, 3, 5].map(i => parseInt(h.slice(i, i + 2), 16));
      ch(out).forEach((v, i) => expect(Math.abs(v - ch(painted)[i])).toBeLessThanOrEqual(2));
      const low = DARK_BG.map(bg => [bg, P.contrast(out, color(DARK, bg))]).filter(([, r]) => r < 3);
      expect(low).toEqual([]);
    });

    test('#999 "light" icons stay unfiltered: >= 3:1 on dark surfaces as they are, 2.6:1 if inverted', () => {
      for (const bg of DARK_BG) expect(P.contrast('#999999', color(DARK, bg))).toBeGreaterThanOrEqual(3);
      expect(P.contrast(applyFilter('#999999', STRONG), color(DARK, '--color-bg-page'))).toBeLessThan(3);
    });
  });
});
