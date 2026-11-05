/* Testing done using Jest */
/*
 * The appearance contract (auto / light / dark) is spread over JS, a Python module and two
 * templates. These checks read the source files so that renaming the cookie, a value or a colour
 * in one place fails CI until the others follow. (Jest is the frontend gate that runs on every PR.)
 */
import fs from 'fs';
import path from 'path';
import {PREFERENCES, THEMES, COOKIE, THEME_COLORS} from '../sefaria/theme';

const ROOT = path.resolve(__dirname, '../../..');
const read = rel => fs.readFileSync(path.join(ROOT, rel), 'utf8');
const BASE = read('templates/base.html');
const PY_THEME = read('sefaria/system/theme.py');

const headOf = html => html.slice(0, html.indexOf('</head>'));

describe('sefaria/system/theme.py matches theme.js', () => {
  const pyTuple = name => {
    const m = PY_THEME.match(new RegExp(`^${name} = \\(([^)]*)\\)$`, 'm'));
    expect(m).not.toBeNull();
    return m[1].split(',').map(s => s.trim()).filter(Boolean).map(s => JSON.parse(s));
  };

  test('cookie name', () => {
    expect(PY_THEME).toMatch(new RegExp(`^THEME_COOKIE = "${COOKIE}"$`, 'm'));
  });

  test('stored preferences, in the same order', () => {
    expect(pyTuple('PREFERENCES')).toEqual([...PREFERENCES]);
  });

  test('themes the server can render, in the same order', () => {
    expect(pyTuple('THEMES')).toEqual([...THEMES]);
  });

  test('no server-side default theme: auto (unset) is left to the browser', () => {
    expect(PY_THEME).not.toMatch(/^DEFAULT_THEME\b/m);
    expect(PY_THEME).toMatch(/return value if isinstance\(value, str\) and value in PREFERENCES else None/);
    expect(PY_THEME).toMatch(/return stored if stored in THEMES else None/);
  });
});

describe('templates/base.html', () => {
  test('<html> carries the server-resolved theme only when there is one (light/dark; not auto)', () => {
    expect(BASE).toContain(
      '<html lang="{{ request.LANGUAGE_CODE }}"{% if resolved_theme %} data-theme="{{ resolved_theme }}"{% endif %}>');
  });

  test('theme-color uses the THEME_COLORS values', () => {
    const m = BASE.match(/<meta name="theme-color" content="\{% if resolved_theme == 'dark' %\}(#[0-9A-Fa-f]{6})\{% elif active_module == 'voices' %\}(#[0-9A-Fa-f]{6})\{% else %\}(#[0-9A-Fa-f]{6})\{% endif %\}">/);
    expect(m).not.toBeNull();
    expect(m[1]).toBe(THEME_COLORS.dark);
    expect(m[2]).toBe(THEME_COLORS.light.voices);
    expect(m[3]).toBe(THEME_COLORS.light.library);
    expect(BASE.match(/name="theme-color"/g)).toHaveLength(1);
  });

  test('includes the head script once, after the theme-color meta and before every stylesheet and script', () => {
    const head = headOf(BASE);
    const include = '{% include "elements/theme_head.html" %}';
    expect(BASE.split(include)).toHaveLength(2);
    const at = head.indexOf(include);
    expect(at).toBeGreaterThan(head.indexOf('name="theme-color"'));
    const before = head.slice(0, at);
    expect(before).not.toMatch(/rel="stylesheet"|<script|<style|\{% block head %\}/);
  });

  const links = () => [...headOf(BASE).matchAll(/<link rel="stylesheet"[^>]*href="\{%\s+static '([^']+)' %\}"[^>]*>/g)].map(m => m[1]);

  test('theme-tokens.css loads right after color-palette.css', () => {
    const l = links();
    expect(l.filter(h => h === 'css/theme-tokens.css')).toHaveLength(1);
    expect(l[l.indexOf('css/color-palette.css') + 1]).toBe('css/theme-tokens.css');
  });

  test('theme-dark-overrides.css loads right after s2.css, before the print sheet', () => {
    const l = links();
    expect(l.filter(h => h === 'css/theme-dark-overrides.css')).toHaveLength(1);
    expect(l[l.indexOf('css/s2.css') + 1]).toBe('css/theme-dark-overrides.css');
    expect(l.indexOf('css/theme-dark-overrides.css')).toBeLessThan(l.indexOf('css/s2-print.css'));
  });

  test('the linked theme stylesheets exist', () => {
    for (const f of ['css/theme-tokens.css', 'css/theme-dark-overrides.css']) {
      expect(fs.existsSync(path.join(ROOT, 'static', f))).toBe(true);
    }
  });

  test('does not reuse the legacy reader theme (color cookie / .dark class)', () => {
    expect(BASE).not.toMatch(/COOKIES\.color|class="[^"]*\bdark\b/);
  });
});

describe('templates that load s2.css without extending base.html', () => {
  test('also load theme-tokens.css, so tokenized s2.css resolves its colours', () => {
    const dir = path.join(ROOT, 'templates');
    const walk = d => fs.readdirSync(d, {withFileTypes: true}).flatMap(e =>
      e.isDirectory() ? walk(path.join(d, e.name)) : [path.join(d, e.name)]);
    const offenders = walk(dir)
      .filter(f => f.endsWith('.html'))
      .map(f => [path.relative(ROOT, f), fs.readFileSync(f, 'utf8')])
      .filter(([, src]) => /css\/s2\.css/.test(src) && !/css\/theme-tokens\.css/.test(src))
      .map(([rel]) => rel);
    expect(offenders).toEqual([]);
  });
});

describe('server wiring', () => {
  test('the context processor is registered', () => {
    expect(read('sefaria/settings.py')).toContain('"sefaria.system.context_processors.theme_context",');
  });

  test('the context processor sends the stored preference and what the server can render', () => {
    const src = read('sefaria/system/context_processors.py');
    expect(src).toMatch(/"theme": stored,\s*"resolved_theme": resolve_theme\(stored\),/);
  });

  test('base_props always sends theme', () => {
    expect(read('reader/views.py')).toMatch(/^\s+"theme": get_stored_theme\(request\),$/m);
  });
});

describe('client wiring', () => {
  test('client.jsx starts watchSystemTheme() exactly once, from theme.js', () => {
    const src = read('static/js/client.jsx');
    expect(src).toMatch(/^import \{ watchSystemTheme \} from '\.\/sefaria\/theme';$/m);
    expect(src.match(/watchSystemTheme\(\)/g)).toHaveLength(1);
  });

  test('sefaria.js keeps the validated preference (auto included) from base props', () => {
    const src = read('static/js/sefaria/sefaria.js');
    expect(src).toMatch(/^import \{ normalizePreference \} from '\.\/theme';$/m);
    expect(src).toMatch(/^\s+Sefaria\.theme = normalizePreference\(props\.theme\);$/m);
  });

  test('nothing imports the removed ThemeToggle or the two-state theme.js API', () => {
    const dir = path.join(ROOT, 'static/js');
    const walk = d => fs.readdirSync(d, {withFileTypes: true}).flatMap(e =>
      e.isDirectory() ? (e.name === 'node_modules' ? [] : walk(path.join(d, e.name))) : [path.join(d, e.name)]);
    const offenders = walk(dir)
      .filter(f => /\.jsx?$/.test(f) && !/[\\/]tests?[\\/]/.test(f))
      .filter(f => /ThemeToggle'|readStoredTheme|writeStoredTheme|getCurrentTheme|DEFAULT_THEME/.test(fs.readFileSync(f, 'utf8')))
      .map(f => path.relative(ROOT, f));
    expect(offenders).toEqual([]);
    expect(fs.existsSync(path.join(dir, 'ThemeToggle.jsx'))).toBe(false);
  });
});
