/* Testing done using Jest */
/*
 * templates/elements/theme_head.html is an inline <head> script that sets <html data-theme> before
 * any stylesheet loads: the cookie's light or dark as is; otherwise (auto, no cookie, invalid) the
 * system setting, or light without one. These tests evaluate its exact bytes in jsdom and hold it
 * to the same rules as static/js/sefaria/theme.js, which it cannot import.
 */
import fs from 'fs';
import path from 'path';
import {THEMES, COOKIE, THEME_COLORS, SYSTEM_DARK_QUERY, parseThemeCookie, resolveTheme} from '../sefaria/theme';

const ROOT = path.resolve(__dirname, '../../..');
const PARTIAL = fs.readFileSync(path.join(ROOT, 'templates/elements/theme_head.html'), 'utf8');
const {cases: COOKIE_CASES} = require('../sefaria/tests/themeCookieCases.json');

const scriptElements = PARTIAL.match(/<script\b[^>]*>[\s\S]*?<\/script>/g) || [];
const SCRIPT_ELEMENT = scriptElements[0] || '';
const SCRIPT = SCRIPT_ELEMENT.replace(/^<script\b[^>]*>/, '').replace(/<\/script>$/, '');
const SIZE_BUDGET_BYTES = 512;   // the whole <script>…</script> element, as sent in every page

const html = document.documentElement;
let meta;

// The system setting as the browser reports it: 'dark' | 'light' (matchMedia present),
// 'absent' (no matchMedia) or 'throws' (matchMedia throws).
const setSystem = (system) => {
  delete window.matchMedia;
  if (system === 'absent') { return null; }
  const matchMedia = jest.fn(system === 'throws'
    ? () => { throw new Error('SyntaxError'); }
    : (q) => ({matches: system === 'dark' && q === SYSTEM_DARK_QUERY, media: q}));
  window.matchMedia = matchMedia;
  return matchMedia;
};

// Runs the head script with `document.cookie` returning exactly `cookie` (or throwing).
const run = ({cookie = '', serverTheme = null, system = 'absent', throwOnCookie = false} = {}) => {
  if (serverTheme === null) { html.removeAttribute('data-theme'); } else { html.setAttribute('data-theme', serverTheme); }
  setSystem(system);
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
  });

  test('guards matchMedia before calling it (older browsers have none)', () => {
    expect(SCRIPT).toMatch(/window\.matchMedia&&matchMedia\(/);
  });

  test('is wrapped in an IIFE with try/catch and leaks no globals', () => {
    expect(SCRIPT).toMatch(/^\(function\(\)\{try\{[\s\S]*\}catch\(\w+\)\{\}\}\)\(\);$/);
    const before = new Set(Object.keys(window));
    run({cookie: 'theme=dark'});
    run({cookie: 'theme=auto', system: 'dark'});
    expect(Object.keys(window).filter(k => !before.has(k) && k !== 'matchMedia')).toEqual([]);
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

  test('shows exactly the themes in THEMES and nothing else', () => {
    const literals = new Set([...SCRIPT.matchAll(/"(light|dark|auto|system|no-preference)"/g)].map(m => m[1]));
    expect([...literals].sort()).toEqual([...THEMES].sort());
    expect(SCRIPT).not.toMatch(/"auto"/);   // auto is the absence of light/dark, not a value it checks
  });

  test('asks for the same system query (SYSTEM_DARK_QUERY), and only that one', () => {
    const queries = [...SCRIPT.matchAll(/matchMedia\(("[^"]*")\)/g)].map(m => JSON.parse(m[1]));
    expect(queries).toEqual([SYSTEM_DARK_QUERY]);
  });

  test('calls matchMedia with exactly SYSTEM_DARK_QUERY', () => {
    html.removeAttribute('data-theme');
    const matchMedia = setSystem('dark');
    Object.defineProperty(document, 'cookie', {configurable: true, get: () => '', set() {}});
    try { (0, eval)(SCRIPT); } finally { delete document.cookie; }
    expect(matchMedia.mock.calls).toEqual([[SYSTEM_DARK_QUERY]]);
    expect(html.getAttribute('data-theme')).toBe('dark');
  });

  test('uses the same dark theme-color', () => {
    const colors = [...SCRIPT.matchAll(/#[0-9a-fA-F]{3,8}\b/g)].map(m => m[0]);
    expect(colors).toEqual([THEME_COLORS.dark]);
  });

  describe.each([['dark'], ['light'], ['absent']])('system %s', (system) => {
    const shownSystem = system === 'dark' ? 'dark' : 'light';
    test.each(COOKIE_CASES.map(c => [c.cookie, c.expected]))(
      'cookie %p parses like parseThemeCookie (-> %p) and shows resolveTheme()', (cookie, expected) => {
        expect(parseThemeCookie(cookie)).toBe(expected);
        expect(run({cookie, system})).toBe(resolveTheme(expected, shownSystem));
      });
  });
});

describe('resolution', () => {
  // [server-rendered data-theme, cookie, system, expected data-theme]
  test.each([
    // auto: no cookie, auto, or anything invalid follows the system, light without a signal
    [null, '', 'absent', 'light'],
    [null, '', 'light', 'light'],
    [null, '', 'dark', 'dark'],
    [null, 'theme=auto', 'absent', 'light'],
    [null, 'theme=auto', 'light', 'light'],
    [null, 'theme=auto', 'dark', 'dark'],
    [null, 'theme=garbage', 'dark', 'dark'],
    [null, 'theme=garbage', 'light', 'light'],
    [null, 'theme="auto"', 'dark', 'dark'],
    // an explicit cookie overrides the system setting
    [null, 'theme=light', 'dark', 'light'],
    [null, 'theme=light', 'absent', 'light'],
    [null, 'theme=dark', 'light', 'dark'],
    [null, 'theme=dark', 'absent', 'dark'],
    [null, 'theme=auto; theme=light', 'dark', 'light'],   // last cookie wins
    [null, 'theme=dark; theme=auto', 'light', 'light'],
    // what the server rendered for light/dark is confirmed, never second-guessed by the OS
    ['dark', 'theme=dark', 'light', 'dark'],
    ['light', 'theme=light', 'dark', 'light'],
    // the cookie, not a server-rendered value, decides
    ['dark', 'theme=light', 'dark', 'light'],
    ['light', 'theme=dark', 'light', 'dark'],
    ['light', '', 'dark', 'dark'],
    ['dark', '', 'light', 'light'],
    ['dark', 'theme=auto', 'absent', 'light'],
    // an invalid or empty attribute is replaced
    ['garbage', 'theme=dark', 'light', 'dark'],
    ['garbage', '', 'absent', 'light'],
    ['', 'theme=dark', 'absent', 'dark'],
    ['', 'theme=auto', 'dark', 'dark'],
  ])('server %p + cookie %p + system %s -> %p', (serverTheme, cookie, system, expected) => {
    expect(run({serverTheme, cookie, system})).toBe(expected);
  });

  test('always leaves a valid data-theme when the system setting can be read (or is absent)', () => {
    for (const system of ['dark', 'light', 'absent']) {
      for (const serverTheme of [null, '', 'light', 'dark', 'x']) {
        for (const {cookie} of COOKIE_CASES) {
          expect(THEMES).toContain(run({serverTheme, cookie, system}));
        }
      }
    }
  });

  test('an explicit cookie never consults the system setting', () => {
    for (const cookie of ['theme=light', 'theme=dark', 'a=1; theme="dark"']) {
      run({cookie, system: 'dark'});
      expect(window.matchMedia).not.toHaveBeenCalled();
    }
  });

  test('auto, no cookie and invalid cookies consult it exactly once', () => {
    for (const cookie of ['', 'theme=auto', 'theme=bogus']) {
      run({cookie, system: 'light'});
      expect(window.matchMedia).toHaveBeenCalledTimes(1);
    }
  });
});

describe('theme-color', () => {
  test('switching to dark by cookie sets the dark header colour', () => {
    run({cookie: 'theme=dark'});
    expect(meta.getAttribute('content')).toBe('#181818');
  });

  test('switching to dark by the system setting (auto) sets it too', () => {
    run({cookie: '', system: 'dark'});
    expect(meta.getAttribute('content')).toBe('#181818');
    meta.setAttribute('content', '#518159');
    run({cookie: 'theme=auto', system: 'dark'});
    expect(meta.getAttribute('content')).toBe('#181818');
  });

  test('a server-rendered value that is kept leaves the meta alone', () => {
    meta.setAttribute('content', '#181818');
    run({serverTheme: 'dark', cookie: 'theme=dark'});
    expect(meta.getAttribute('content')).toBe('#181818');
    meta.setAttribute('content', '#518159');
    run({serverTheme: 'light', cookie: 'theme=light', system: 'dark'});
    expect(meta.getAttribute('content')).toBe('#518159');
  });

  test('light never changes the module colour (the server already rendered it for auto)', () => {
    meta.setAttribute('content', '#518159');
    run({cookie: 'theme=light'});
    expect(meta.getAttribute('content')).toBe('#518159');
    run({cookie: 'theme=auto', system: 'light'});
    expect(meta.getAttribute('content')).toBe('#518159');
    run({cookie: '', system: 'absent'});
    expect(meta.getAttribute('content')).toBe('#518159');
  });

  test('works without a theme-color meta', () => {
    document.head.innerHTML = '';
    expect(run({cookie: 'theme=dark'})).toBe('dark');
    expect(run({cookie: '', system: 'dark'})).toBe('dark');
  });
});

describe('robustness', () => {
  test('never throws when matchMedia throws; an explicit cookie still applies', () => {
    expect(() => run({cookie: 'theme=dark', system: 'throws'})).not.toThrow();
    expect(html.getAttribute('data-theme')).toBe('dark');
    expect(() => run({cookie: 'theme=light', serverTheme: 'dark', system: 'throws'})).not.toThrow();
    expect(html.getAttribute('data-theme')).toBe('light');
  });

  test('when matchMedia throws under auto it changes nothing: the page stays as rendered (no data-theme = light CSS)', () => {
    meta.setAttribute('content', '#518159');
    for (const cookie of ['', 'theme=auto', 'theme=garbage']) {
      expect(() => run({cookie, system: 'throws'})).not.toThrow();
      expect(html.hasAttribute('data-theme')).toBe(false);
      expect(meta.getAttribute('content')).toBe('#518159');
    }
  });

  test('when matchMedia returns no MediaQueryList it does not throw', () => {
    window.matchMedia = jest.fn(() => null);
    Object.defineProperty(document, 'cookie', {configurable: true, get: () => 'theme=auto', set() {}});
    try {
      expect(() => (0, eval)(SCRIPT)).not.toThrow();
    } finally {
      delete document.cookie;
    }
  });

  test('never throws when reading cookies throws, and keeps the server value', () => {
    expect(() => run({serverTheme: 'dark', throwOnCookie: true, system: 'light'})).not.toThrow();
    expect(html.getAttribute('data-theme')).toBe('dark');
    expect(() => run({serverTheme: null, throwOnCookie: true})).not.toThrow();
  });

  test('never throws when <html> is unusual (no setAttribute)', () => {
    const spy = jest.spyOn(html, 'setAttribute').mockImplementation(() => { throw new Error('nope'); });
    try {
      expect(() => run({cookie: 'theme=dark'})).not.toThrow();
      expect(() => run({cookie: '', system: 'dark'})).not.toThrow();
    } finally {
      spy.mockRestore();
    }
  });

  test.each([
    'theme=dark; ' + 'x'.repeat(4000) + '=1',
    Array.from({length: 200}, (_, i) => `c${i}=v${i}`).join('; ') + '; theme=dark',
  ])('handles long cookie headers (%#)', cookie => {
    expect(run({cookie, system: 'light'})).toBe('dark');
  });

  test('only the data-theme attribute and the meta are touched', () => {
    const htmlBefore = [...html.attributes].map(a => a.name).filter(n => n !== 'data-theme');
    const headBefore = document.head.innerHTML;
    run({cookie: 'theme=light', system: 'dark'});
    run({cookie: '', system: 'light'});
    expect([...html.attributes].map(a => a.name).filter(n => n !== 'data-theme')).toEqual(htmlBefore);
    expect(document.head.innerHTML).toBe(headBefore);
  });

  test('installs no listener: live system changes are watchSystemTheme()\'s job', () => {
    const addEventListener = jest.fn();
    const addListener = jest.fn();
    window.matchMedia = jest.fn(() => ({matches: true, addEventListener, addListener}));
    Object.defineProperty(document, 'cookie', {configurable: true, get: () => '', set() {}});
    try { (0, eval)(SCRIPT); } finally { delete document.cookie; }
    expect(html.getAttribute('data-theme')).toBe('dark');
    expect(addEventListener).not.toHaveBeenCalled();
    expect(addListener).not.toHaveBeenCalled();
  });
});
