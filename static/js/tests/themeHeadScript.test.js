/* Testing done using Jest */
/*
 * templates/elements/theme_head.html is an inline <head> script that re-applies the stored theme
 * before any stylesheet loads. These tests evaluate its exact bytes in jsdom and hold it to the
 * same rules as static/js/sefaria/theme.js, which it cannot import.
 */
import fs from 'fs';
import path from 'path';
import {THEMES, COOKIE, THEME_COLORS, parseThemeCookie, resolveTheme} from '../sefaria/theme';

const ROOT = path.resolve(__dirname, '../../..');
const PARTIAL = fs.readFileSync(path.join(ROOT, 'templates/elements/theme_head.html'), 'utf8');
const {cases: COOKIE_CASES} = require('../sefaria/tests/themeCookieCases.json');

const scriptElements = PARTIAL.match(/<script\b[^>]*>[\s\S]*?<\/script>/g) || [];
const SCRIPT_ELEMENT = scriptElements[0] || '';
const SCRIPT = SCRIPT_ELEMENT.replace(/^<script\b[^>]*>/, '').replace(/<\/script>$/, '');
const SIZE_BUDGET_BYTES = 512;   // the whole <script>…</script> element, as sent in every page

const html = document.documentElement;
let meta;

// Runs the head script with `document.cookie` returning exactly `cookie` (or throwing).
const run = ({cookie = '', serverTheme = null, throwOnCookie = false} = {}) => {
  if (serverTheme === null) { html.removeAttribute('data-theme'); } else { html.setAttribute('data-theme', serverTheme); }
  Object.defineProperty(document, 'cookie', {
    configurable: true,
    get() { if (throwOnCookie) { throw new Error('SecurityError'); } return cookie; },
    set() {},
  });
  try {
    (0, eval)(SCRIPT);  // indirect eval: global scope, like an inline <script>
  } finally {
    delete document.cookie;
  }
  return html.getAttribute('data-theme');
};

beforeEach(() => {
  document.head.innerHTML = '<meta name="theme-color" content="#18345D">';
  meta = document.head.querySelector('meta[name="theme-color"]');
});

afterEach(() => {
  html.removeAttribute('data-theme');
  delete window.matchMedia;
});

describe('the partial', () => {
  test('holds exactly one inline script, with no src or type', () => {
    expect(scriptElements).toHaveLength(1);
    expect(SCRIPT_ELEMENT.startsWith('<script>')).toBe(true);
    expect(SCRIPT.trim().length).toBeGreaterThan(0);
  });

  test(`stays within ${SIZE_BUDGET_BYTES} bytes`, () => {
    expect(Buffer.byteLength(SCRIPT_ELEMENT, 'utf8')).toBeLessThanOrEqual(SIZE_BUDGET_BYTES);
  });

  test('outside the script there is only a Django comment, so the rendered output is the script', () => {
    const outside = PARTIAL.replace(SCRIPT_ELEMENT, '').replace(/\{% comment %\}[\s\S]*?\{% endcomment %\}/, '');
    expect(outside.trim()).toBe('');
  });

  test('has no template tags or variables in the script (the same bytes can be injected anywhere)', () => {
    // Django only starts a tag at these openers; a closing "}}" on its own is literal text.
    // reader/tests/theme_context_test.py also checks that Django renders the script byte for byte.
    expect(SCRIPT).not.toMatch(/\{%|\{\{|\{#/);
  });

  test('has no external references or dependencies', () => {
    expect(SCRIPT).not.toMatch(/https?:|\/\/|src\s*=|href\s*=|url\(|@import/i);
    expect(SCRIPT).not.toMatch(/\b(Sefaria|jQuery|require|import|fetch|XMLHttpRequest|localStorage|sessionStorage|DJANGO_VARS)\b/);
    expect(SCRIPT).not.toMatch(/\$\s*[(.]/);   // no jQuery
    expect(SCRIPT).not.toMatch(/matchMedia|prefers-color-scheme/);   // light unless the cookie says dark
  });

  test('is wrapped in an IIFE with try/catch and leaks no globals', () => {
    expect(SCRIPT).toMatch(/^\(function\(\)\{try\{[\s\S]*\}catch\(\w+\)\{\}\}\)\(\);$/);
    const before = new Set(Object.keys(window));
    run({cookie: 'theme=dark'});
    expect(Object.keys(window).filter(k => !before.has(k))).toEqual([]);
  });

  test('is valid ES5 syntax (no arrow functions, let/const or template literals)', () => {
    expect(SCRIPT).not.toMatch(/=>|\blet\b|\bconst\b|`/);
    expect(() => new Function(SCRIPT)).not.toThrow();  // eslint-disable-line no-new-func
  });
});

describe('agrees with theme.js', () => {
  test('reads the same cookie name', () => {
    const names = [...SCRIPT.matchAll(/theme\\s\*=/g)];
    expect(COOKIE).toBe('theme');
    expect(names).toHaveLength(1);
    expect(SCRIPT).toContain(`\\s*${COOKIE}\\s*=`);
  });

  test('accepts exactly the stored values in THEMES and defaults to light', () => {
    const literals = new Set([...SCRIPT.matchAll(/"(light|dark)"/g)].map(m => m[1]));
    expect([...literals].sort()).toEqual([...THEMES].sort());
    expect(run({cookie: ''})).toBe(resolveTheme(null));
  });

  test('uses the same dark theme-color', () => {
    const colors = [...SCRIPT.matchAll(/#[0-9a-fA-F]{3,8}\b/g)].map(m => m[0]);
    expect(colors).toEqual([THEME_COLORS.dark]);
  });

  test.each(COOKIE_CASES.map(c => [c.cookie, c.expected]))(
    'cookie %p parses like parseThemeCookie (-> %p)', (cookie, expected) => {
      expect(parseThemeCookie(cookie)).toBe(expected);
      expect(run({cookie})).toBe(resolveTheme(expected));
    });
});

describe('resolution', () => {
  // [server-rendered data-theme, cookie, expected data-theme]
  test.each([
    [null, '', 'light'],
    [null, 'theme=light', 'light'],
    [null, 'theme=dark', 'dark'],
    [null, 'theme=garbage', 'light'],
    ['light', '', 'light'],
    ['light', 'theme=light', 'light'],
    ['light', 'theme=garbage', 'light'],
    ['dark', 'theme=dark', 'dark'],
    ['dark', 'theme=light', 'dark'],     // valid cookie: keep the server value (it read the same header)
    ['light', 'theme=dark', 'light'],
    ['dark', '', 'light'],               // no valid cookie: light
    ['dark', 'theme=garbage', 'light'],
    ['garbage', 'theme=dark', 'dark'],   // an invalid attribute is replaced
    ['garbage', '', 'light'],
    ['', 'theme=dark', 'dark'],
  ])('server %p + cookie %p -> %p', (serverTheme, cookie, expected) => {
    expect(run({serverTheme, cookie})).toBe(expected);
  });

  test('always leaves a valid data-theme', () => {
    for (const serverTheme of [null, '', 'light', 'dark', 'x']) {
      for (const {cookie} of COOKIE_CASES) {
        expect(THEMES).toContain(run({serverTheme, cookie}));
      }
    }
  });
});

describe('theme-color', () => {
  test('switching to dark sets the dark header colour', () => {
    run({cookie: 'theme=dark'});
    expect(meta.getAttribute('content')).toBe('#181818');
  });

  test('a server-rendered value that is kept leaves the meta alone', () => {
    meta.setAttribute('content', '#181818');
    run({serverTheme: 'dark', cookie: 'theme=dark'});
    expect(meta.getAttribute('content')).toBe('#181818');
    meta.setAttribute('content', '#518159');
    run({serverTheme: 'light', cookie: ''});
    expect(meta.getAttribute('content')).toBe('#518159');
  });

  test('light never changes the module colour', () => {
    meta.setAttribute('content', '#518159');
    run({cookie: 'theme=light'});
    expect(meta.getAttribute('content')).toBe('#518159');
  });

  test('works without a theme-color meta', () => {
    document.head.innerHTML = '';
    expect(run({cookie: 'theme=dark'})).toBe('dark');
  });
});

describe('robustness', () => {
  test('does not follow the OS, with or without matchMedia', () => {
    window.matchMedia = jest.fn(() => ({matches: true, media: '(prefers-color-scheme: dark)'}));
    expect(run({cookie: ''})).toBe('light');
    expect(window.matchMedia).not.toHaveBeenCalled();
    delete window.matchMedia;
    expect(typeof window.matchMedia).toBe('undefined');
    expect(run({cookie: ''})).toBe('light');
    expect(run({cookie: 'theme=dark'})).toBe('dark');
  });

  test('never throws when reading cookies throws, and keeps the server value', () => {
    expect(() => run({serverTheme: 'dark', throwOnCookie: true})).not.toThrow();
    expect(html.getAttribute('data-theme')).toBe('dark');
    expect(() => run({serverTheme: null, throwOnCookie: true})).not.toThrow();
  });

  test('never throws when <html> is unusual (no setAttribute)', () => {
    const spy = jest.spyOn(html, 'setAttribute').mockImplementation(() => { throw new Error('nope'); });
    try {
      expect(() => run({cookie: 'theme=dark'})).not.toThrow();
    } finally {
      spy.mockRestore();
    }
  });

  test.each([
    'theme=dark; ' + 'x'.repeat(4000) + '=1',
    Array.from({length: 200}, (_, i) => `c${i}=v${i}`).join('; ') + '; theme=dark',
  ])('handles long cookie headers (%#)', cookie => {
    expect(run({cookie})).toBe('dark');
  });

  test('only the data-theme attribute and the meta are touched', () => {
    const htmlBefore = [...html.attributes].map(a => a.name).filter(n => n !== 'data-theme');
    const headBefore = document.head.innerHTML;
    run({cookie: 'theme=light'});
    expect([...html.attributes].map(a => a.name).filter(n => n !== 'data-theme')).toEqual(htmlBefore);
    expect(document.head.innerHTML).toBe(headBefore);
  });
});
