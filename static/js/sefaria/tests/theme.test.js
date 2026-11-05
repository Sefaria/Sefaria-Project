/* Testing done using Jest */
import {JSDOM} from 'jsdom';
import * as themeModule from '../theme';
import {
  PREFERENCES, THEMES, COOKIE, DEFAULT_PREFERENCE, FALLBACK_THEME, SYSTEM_DARK_QUERY, COOKIE_MAX_AGE,
  THEME_COLORS, normalizePreference, normalizeTheme, getSystemTheme, resolveTheme, parseThemeCookie,
  readStoredPreference, writeStoredPreference, getThemeColor, applyTheme, getCurrentPreference,
  watchSystemTheme,
} from '../theme';

// theme.js looks `Sefaria` up lazily (theme / util.getCookieDomain). A light stand-in keeps this
// suite independent of the full library object.
jest.mock('../sefaria', () => ({
  __esModule: true,
  default: {theme: null, util: {getCookieDomain: jest.fn(() => null)}},
}));
import Sefaria from '../sefaria';

const {cases: COOKIE_CASES} = require('./themeCookieCases.json');

// A document stand-in that records every cookie assignment.
const recordingDoc = ({hostname = 'www.sefaria.org', protocol = 'https:', cookie = ''} = {}) => {
  const writes = [];
  return {
    writes,
    location: {hostname, protocol},
    get cookie() { return cookie; },
    set cookie(v) { writes.push(v); },
  };
};

// A real cookie jar: jsdom (Jest's own environment) at an arbitrary URL.
const realDoc = (url, cookieJar) => new JSDOM('', {url, cookieJar}).window.document;

/**
 * A MediaQueryList stand-in for (prefers-color-scheme: dark). `fire(matches)` plays an OS switch.
 * `legacy` gives only the pre-Safari-14 addListener/removeListener API.
 */
const fakeQuery = (matches, {legacy = false} = {}) => {
  const listeners = new Set();
  const query = {media: SYSTEM_DARK_QUERY, matches, listeners};
  if (legacy) {
    query.addListener = jest.fn(fn => listeners.add(fn));
    query.removeListener = jest.fn(fn => listeners.delete(fn));
  } else {
    query.addEventListener = jest.fn((type, fn) => { if (type === 'change') { listeners.add(fn); } });
    query.removeEventListener = jest.fn((type, fn) => { if (type === 'change') { listeners.delete(fn); } });
  }
  query.fire = (m, event = {matches: m, media: SYSTEM_DARK_QUERY}) => {
    query.matches = m;
    [...listeners].forEach(fn => fn(event));
  };
  return query;
};
const fakeWindow = query => ({matchMedia: jest.fn(() => query)});
const throwingWindow = () => ({matchMedia: jest.fn(() => { throw new Error('SyntaxError'); })});

const html = () => document.documentElement;
const setCookie = v => { document.cookie = `theme=${v}; path=/`; };

afterEach(() => {
  Sefaria.theme = null;
  Sefaria.util.getCookieDomain.mockReset();
  Sefaria.util.getCookieDomain.mockImplementation(() => null);
  html().removeAttribute('data-theme');
  document.head.innerHTML = '';
  document.body.removeAttribute('data-active-module');
  document.cookie.split(';').forEach(c => {
    const name = c.split('=')[0].trim();
    if (name) { document.cookie = `${name}=; path=/; max-age=0`; }
  });
  delete window.matchMedia;
});

describe('constants', () => {
  test('preferences, shown themes, cookie name and defaults', () => {
    expect(PREFERENCES).toEqual(['auto', 'light', 'dark']);
    expect(THEMES).toEqual(['light', 'dark']);
    expect(COOKIE).toBe('theme');
    expect(DEFAULT_PREFERENCE).toBe('auto');
    expect(FALLBACK_THEME).toBe('light');
    expect(SYSTEM_DARK_QUERY).toBe('(prefers-color-scheme: dark)');
    expect(COOKIE_MAX_AGE).toBe(20 * 365 * 24 * 60 * 60);
  });

  test('the default preference is a preference but not a theme; the fallback is a theme', () => {
    expect(PREFERENCES).toContain(DEFAULT_PREFERENCE);
    expect(THEMES).not.toContain(DEFAULT_PREFERENCE);
    expect(THEMES).toContain(FALLBACK_THEME);
    expect(THEMES.every(t => PREFERENCES.includes(t))).toBe(true);
  });

  test('PREFERENCES, THEMES and THEME_COLORS cannot be mutated by a consumer', () => {
    expect(Object.isFrozen(PREFERENCES)).toBe(true);
    expect(Object.isFrozen(THEMES)).toBe(true);
    expect(Object.isFrozen(THEME_COLORS)).toBe(true);
    expect(Object.isFrozen(THEME_COLORS.light)).toBe(true);
  });

  test('theme-color values: module colours in light, the header surface in dark', () => {
    expect(THEME_COLORS).toEqual({light: {library: '#18345D', voices: '#518159'}, dark: '#181818'});
  });

  test('the two-state API is gone (no stale imports can silently get undefined)', () => {
    for (const name of ['readStoredTheme', 'writeStoredTheme', 'getCurrentTheme', 'DEFAULT_THEME']) {
      expect(name in themeModule).toBe(false);
    }
  });
});

describe('normalizePreference', () => {
  test.each(['auto', 'light', 'dark'])('accepts %p', v => {
    expect(normalizePreference(v)).toBe(v);
  });

  test.each([
    'Auto', 'AUTO', 'Light', 'DARK', 'Dark', ' dark', 'dark ', 'auto ', 'dark\n', 'system', 'automatic',
    'sepia', '', 'null', 'undefined', 'darkish', '"dark"', '"auto"', '<script>', 'light;dark',
  ])('rejects the string %p (case-sensitive, like the server)', v => {
    expect(normalizePreference(v)).toBeNull();
  });

  test.each([null, undefined, 0, 1, true, false, NaN, {}, [], ['auto'], () => 'auto'])(
    'rejects the non-string %p', v => {
      expect(normalizePreference(v)).toBeNull();
    });

  test('rejects a boxed String', () => {
    expect(normalizePreference(new String('auto'))).toBeNull();  // eslint-disable-line no-new-wrappers
  });
});

describe('normalizeTheme (what the page can show)', () => {
  test.each(['light', 'dark'])('accepts %p', v => {
    expect(normalizeTheme(v)).toBe(v);
  });

  test('rejects "auto": a preference, never a shown theme', () => {
    expect(normalizeTheme('auto')).toBeNull();
  });

  test.each([
    'Light', 'DARK', 'Dark', ' dark', 'dark ', 'dark\n', 'system', 'sepia', '', 'null',
    'undefined', 'darkish', '"dark"', '<script>', 'light;dark',
  ])('rejects the string %p', v => {
    expect(normalizeTheme(v)).toBeNull();
  });

  test.each([null, undefined, 0, 1, true, false, NaN, {}, [], ['dark'], () => 'dark'])(
    'rejects the non-string %p', v => {
      expect(normalizeTheme(v)).toBeNull();
    });

  test('rejects a boxed String', () => {
    expect(normalizeTheme(new String('dark'))).toBeNull();  // eslint-disable-line no-new-wrappers
  });
});

describe('getSystemTheme', () => {
  test('dark when the browser reports a dark system setting, light when it does not', () => {
    expect(getSystemTheme(fakeWindow(fakeQuery(true)))).toBe('dark');
    expect(getSystemTheme(fakeWindow(fakeQuery(false)))).toBe('light');
  });

  test('asks for exactly the prefers-color-scheme: dark query', () => {
    const win = fakeWindow(fakeQuery(true));
    getSystemTheme(win);
    expect(win.matchMedia).toHaveBeenCalledWith('(prefers-color-scheme: dark)');
  });

  test.each([
    ['no window (SSR)', null],
    ['undefined window', undefined],
    ['no matchMedia (old browser)', {}],
    ['matchMedia that is not a function', {matchMedia: 'nope'}],
    ['matchMedia returning null', {matchMedia: () => null}],
    ['a result without matches', {matchMedia: () => ({})}],
  ])('light with %s', (name, win) => {
    expect(getSystemTheme(win)).toBe('light');
  });

  test('light when matchMedia throws', () => {
    const win = throwingWindow();
    expect(getSystemTheme(win)).toBe('light');
    expect(win.matchMedia).toHaveBeenCalled();
  });

  test('uses the global window by default (jsdom has no matchMedia: light)', () => {
    expect(typeof window.matchMedia).toBe('undefined');
    expect(getSystemTheme()).toBe('light');
    window.matchMedia = jest.fn(() => fakeQuery(true));
    expect(getSystemTheme()).toBe('dark');
    window.matchMedia = jest.fn(() => fakeQuery(false));
    expect(getSystemTheme()).toBe('light');
  });
});

describe('resolveTheme', () => {
  // [preference, system, shown]
  test.each([
    ['dark', 'light', 'dark'],      // an explicit choice overrides the system setting
    ['dark', 'dark', 'dark'],
    ['light', 'dark', 'light'],
    ['light', 'light', 'light'],
    ['auto', 'dark', 'dark'],       // auto follows the system
    ['auto', 'light', 'light'],
    [null, 'dark', 'dark'],         // no cookie means auto
    [undefined, 'dark', 'dark'],
    ['', 'dark', 'dark'],
    ['DARK', 'light', 'light'],     // anything invalid means auto
    ['system', 'dark', 'dark'],
    ['garbage', 'light', 'light'],
    [42, 'dark', 'dark'],
    ['auto', 'auto', 'light'],      // an invalid system value falls back to light
    ['auto', 'garbage', 'light'],
    ['auto', null, 'light'],
    [null, 'Dark', 'light'],
    ['light', 'garbage', 'light'],
    ['dark', null, 'dark'],
  ])('preference %p with system %p -> %p', (preference, system, expected) => {
    expect(resolveTheme(preference, system)).toBe(expected);
  });

  test('always returns a theme that can be shown', () => {
    for (const p of [...PREFERENCES, null, 'x']) {
      for (const s of [...THEMES, null, 'x']) {
        expect(THEMES).toContain(resolveTheme(p, s));
      }
    }
  });

  describe('the system defaults to the browser setting', () => {
    test.each([
      ['dark', () => fakeQuery(true), 'dark'],
      ['light', () => fakeQuery(false), 'light'],
      ['throwing', () => { throw new Error('nope'); }, 'light'],
    ])('matchMedia %s: auto -> %p', (name, impl, expected) => {
      window.matchMedia = jest.fn(impl);
      expect(resolveTheme('auto')).toBe(expected);
      expect(resolveTheme(null)).toBe(expected);
      expect(resolveTheme('garbage')).toBe(expected);
    });

    test('matchMedia absent: auto -> light', () => {
      expect(resolveTheme('auto')).toBe('light');
      expect(resolveTheme(undefined)).toBe('light');
    });

    test('an explicit preference ignores the system setting either way', () => {
      window.matchMedia = jest.fn(() => fakeQuery(true));
      expect(resolveTheme('light')).toBe('light');
      window.matchMedia = jest.fn(() => fakeQuery(false));
      expect(resolveTheme('dark')).toBe('dark');
    });
  });
});

describe('parseThemeCookie', () => {
  test.each(COOKIE_CASES.map(c => [c.cookie, c.expected]))('%p -> %p', (cookie, expected) => {
    expect(parseThemeCookie(cookie)).toBe(expected);
  });

  test('the shared fixture covers every preference and the no-cookie case', () => {
    const outcomes = new Set(COOKIE_CASES.map(c => c.expected));
    expect([...PREFERENCES, null].every(v => outcomes.has(v))).toBe(true);
    expect([...outcomes].every(v => v === null || PREFERENCES.includes(v))).toBe(true);
  });

  test.each([null, undefined, 1, {}])('non-string %p -> null', v => {
    expect(parseThemeCookie(v)).toBeNull();
  });
});

describe('readStoredPreference', () => {
  test('reads the global document by default', () => {
    expect(readStoredPreference()).toBeNull();
    setCookie('dark');
    expect(readStoredPreference()).toBe('dark');
    setCookie('light');
    expect(readStoredPreference()).toBe('light');
    setCookie('auto');
    expect(readStoredPreference()).toBe('auto');
  });

  test('ignores other cookies whose names contain "theme"', () => {
    document.cookie = 'xtheme=dark; path=/';
    document.cookie = 'theme_old=dark; path=/';
    expect(readStoredPreference()).toBeNull();
  });

  test('reads a given document', () => {
    expect(readStoredPreference(recordingDoc({cookie: 'a=1; theme=dark'}))).toBe('dark');
    expect(readStoredPreference(recordingDoc({cookie: 'a=1; theme=auto'}))).toBe('auto');
    expect(readStoredPreference(recordingDoc({cookie: 'theme=nope'}))).toBeNull();
  });

  test('returns null without a document (SSR) or a cookie string', () => {
    expect(readStoredPreference(null)).toBeNull();
    expect(readStoredPreference({})).toBeNull();
  });

  test('returns null when reading cookies throws (sandboxed frame)', () => {
    const doc = {get cookie() { throw new Error('SecurityError'); }};
    expect(readStoredPreference(doc)).toBeNull();
  });
});

describe('writeStoredPreference: the cookie strings', () => {
  const LIFETIME = `max-age=${20 * 365 * 24 * 60 * 60}`;

  test('with a domain: expires the host-only duplicate first, then writes the domain cookie', () => {
    const doc = recordingDoc();
    const written = writeStoredPreference('dark', {domain: '.sefaria.org', doc});
    expect(doc.writes).toEqual([
      'theme=; path=/; max-age=0; SameSite=Lax; Secure',
      `theme=dark; path=/; ${LIFETIME}; SameSite=Lax; domain=.sefaria.org; Secure`,
    ]);
    expect(written).toBe(doc.writes[1]);
  });

  test.each(['auto', 'light', 'dark'])('writes the preference %p as is (auto is stored, not resolved)', v => {
    const doc = recordingDoc();
    expect(writeStoredPreference(v, {domain: '.sefaria.org', doc}))
      .toBe(`theme=${v}; path=/; ${LIFETIME}; SameSite=Lax; domain=.sefaria.org; Secure`);
  });

  test('host-only (domain null): one write, nothing to expire', () => {
    const doc = recordingDoc({hostname: 'localhost', protocol: 'http:'});
    expect(writeStoredPreference('light', {domain: null, doc})).toBe(`theme=light; path=/; ${LIFETIME}; SameSite=Lax`);
    expect(doc.writes).toHaveLength(1);
  });

  test('Secure only on https', () => {
    const http = recordingDoc({protocol: 'http:'});
    writeStoredPreference('dark', {domain: '.sefaria.org', doc: http});
    http.writes.forEach(w => expect(w).not.toMatch(/Secure/));
    const https = recordingDoc({protocol: 'https:'});
    writeStoredPreference('dark', {domain: '.sefaria.org', doc: https});
    https.writes.forEach(w => expect(w).toMatch(/; Secure$/));
  });

  test('every write is path=/ and SameSite=Lax', () => {
    const doc = recordingDoc();
    writeStoredPreference('auto', {domain: '.sefaria.org', doc});
    doc.writes.forEach(w => {
      expect(w).toMatch(/; path=\/;/);
      expect(w).toMatch(/; SameSite=Lax/);
    });
  });

  test.each([
    ['www.sefaria.org', '.sefaria.org', '.sefaria.org'],
    ['voices.sefaria.org', '.sefaria.org', '.sefaria.org'],
    ['sefaria.org', '.sefaria.org', '.sefaria.org'],
    ['WWW.Sefaria.ORG', '.sefaria.org', '.sefaria.org'],
    ['www.sefaria.org', 'sefaria.org', 'sefaria.org'],
    ['www.sefaria.org.il', '.sefaria.org.il', '.sefaria.org.il'],
    ['www.sefaria.org.il', '.sefaria.org', null],        // other TLD: the browser would drop it
    ['evilsefaria.org', '.sefaria.org', null],           // suffix but not a subdomain
    ['localhost', '.sefaria.org', null],
    ['', '.sefaria.org', null],
  ])('host %p with domain %p uses domain %p', (hostname, domain, used) => {
    const doc = recordingDoc({hostname});
    const written = writeStoredPreference('dark', {domain, doc});
    if (used) {
      expect(written).toMatch(new RegExp(`; domain=${used.replace(/\./g, '\\.')}(;|$)`));
      expect(doc.writes).toHaveLength(2);
    } else {
      expect(written).not.toMatch(/domain=/);
      expect(doc.writes).toHaveLength(1);
    }
  });

  test('defaults the domain to Sefaria.util.getCookieDomain()', () => {
    Sefaria.util.getCookieDomain.mockImplementation(() => '.sefaria.org');
    const doc = recordingDoc();
    expect(writeStoredPreference('auto', {doc})).toMatch(/^theme=auto;.*; domain=\.sefaria\.org;/);
    expect(Sefaria.util.getCookieDomain).toHaveBeenCalled();
  });

  test('an explicit domain (even null) skips getCookieDomain()', () => {
    Sefaria.util.getCookieDomain.mockImplementation(() => '.sefaria.org');
    writeStoredPreference('dark', {domain: null, doc: recordingDoc()});
    expect(Sefaria.util.getCookieDomain).not.toHaveBeenCalled();
  });

  test('falls back to host-only when getCookieDomain() throws or returns nothing', () => {
    Sefaria.util.getCookieDomain.mockImplementation(() => { throw new Error('no domainModules'); });
    expect(writeStoredPreference('dark', {doc: recordingDoc()})).not.toMatch(/domain=/);
    Sefaria.util.getCookieDomain.mockImplementation(() => '');
    expect(writeStoredPreference('dark', {doc: recordingDoc()})).not.toMatch(/domain=/);
  });

  test.each([null, undefined, '', 'DARK', 'Auto', 'system', 'dark; domain=evil.com', 'auto; path=/x', '<script>'])(
    'writes nothing for the invalid value %p', v => {
      const doc = recordingDoc();
      expect(writeStoredPreference(v, {domain: '.sefaria.org', doc})).toBeNull();
      expect(doc.writes).toEqual([]);
    });

  test('writes nothing without a document (SSR)', () => {
    expect(writeStoredPreference('dark', {doc: null})).toBeNull();
  });

  test('returns null when cookies are unavailable (sandboxed frame)', () => {
    const doc = {location: {hostname: 'www.sefaria.org', protocol: 'https:'}, set cookie(v) { throw new Error('SecurityError'); }};
    expect(writeStoredPreference('dark', {domain: '.sefaria.org', doc})).toBeNull();
  });

  test('writes the global document by default', () => {
    expect(writeStoredPreference('dark', {domain: null})).toMatch(/^theme=dark;/);
    expect(document.cookie).toBe('theme=dark');
    expect(readStoredPreference()).toBe('dark');
    writeStoredPreference('auto', {domain: null});
    expect(document.cookie).toBe('theme=auto');
    expect(readStoredPreference()).toBe('auto');
  });
});

describe('writeStoredPreference: a real cookie jar', () => {
  test('replaces a host-only duplicate, so exactly one theme cookie remains', () => {
    const doc = realDoc('https://www.sefaria.org/texts');
    doc.cookie = 'theme=light; path=/';                       // host-only leftover
    expect(doc.cookie).toBe('theme=light');
    writeStoredPreference('dark', {domain: '.sefaria.org', doc});
    expect(doc.cookie).toBe('theme=dark');
    expect(readStoredPreference(doc)).toBe('dark');
  });

  test('the domain cookie is shared with the other module (Library -> Voices)', () => {
    const {CookieJar} = require('jsdom');
    const jar = new CookieJar();
    writeStoredPreference('dark', {domain: '.sefaria.org', doc: realDoc('https://www.sefaria.org/', jar)});
    expect(readStoredPreference(realDoc('https://voices.sefaria.org/', jar))).toBe('dark');
    expect(readStoredPreference(realDoc('https://www.sefaria.org.il/', jar))).toBeNull();  // .org.il is separate
    writeStoredPreference('auto', {domain: '.sefaria.org', doc: realDoc('https://voices.sefaria.org/', jar)});
    expect(readStoredPreference(realDoc('https://www.sefaria.org/', jar))).toBe('auto');
  });

  test('cycling through the three preferences never leaves two cookies', () => {
    const doc = realDoc('https://www.sefaria.org/');
    for (const p of ['dark', 'light', 'auto', 'dark', 'auto', 'light']) {
      writeStoredPreference(p, {domain: '.sefaria.org', doc});
      expect(doc.cookie).toBe(`theme=${p}`);
    }
  });

  test('on the bare host the domain cookie survives its own duplicate cleanup', () => {
    const doc = realDoc('https://sefaria.org/');
    writeStoredPreference('light', {domain: '.sefaria.org', doc});
    writeStoredPreference('dark', {domain: '.sefaria.org', doc});
    expect(doc.cookie).toBe('theme=dark');
  });

  test('host-only on localhost', () => {
    const doc = realDoc('http://localhost:8000/');
    writeStoredPreference('auto', {domain: null, doc});
    expect(doc.cookie).toBe('theme=auto');
  });

  test('a domain the host is not inside falls back to host-only instead of being dropped', () => {
    const doc = realDoc('https://www.sefaria.org.il/');
    writeStoredPreference('dark', {domain: '.sefaria.org', doc});
    expect(readStoredPreference(doc)).toBe('dark');
  });
});

describe('getThemeColor', () => {
  test.each([
    ['light', 'library', '#18345D'],
    ['light', 'voices', '#518159'],
    ['light', undefined, '#18345D'],
    ['light', 'unknown', '#18345D'],
    ['dark', 'library', '#181818'],
    ['dark', 'voices', '#181818'],
    ['auto', 'voices', '#518159'],     // a preference is not a theme: resolve it first
    ['garbage', 'voices', '#518159'],
    [null, null, '#18345D'],
  ])('%p on %p -> %p', (theme, module, color) => {
    expect(getThemeColor(theme, module)).toBe(color);
  });
});

describe('applyTheme', () => {
  const addMeta = (content = '#18345D') => {
    const meta = document.createElement('meta');
    meta.setAttribute('name', 'theme-color');
    meta.setAttribute('content', content);
    document.head.appendChild(meta);
    return meta;
  };

  test('sets data-theme on <html> and returns the theme', () => {
    expect(applyTheme('dark')).toBe('dark');
    expect(html().getAttribute('data-theme')).toBe('dark');
    expect(html().dataset.theme).toBe('dark');
    expect(applyTheme('light')).toBe('light');
    expect(html().getAttribute('data-theme')).toBe('light');
  });

  test.each([null, undefined, 'DARK', 'system', '"><script>'])('applies light for the invalid value %p', v => {
    html().setAttribute('data-theme', 'dark');
    expect(applyTheme(v)).toBe('light');
    expect(html().getAttribute('data-theme')).toBe('light');
  });

  test('"auto" is a preference, not a theme: it applies light (callers pass resolveTheme(preference))', () => {
    window.matchMedia = jest.fn(() => fakeQuery(true));
    html().setAttribute('data-theme', 'dark');
    expect(applyTheme('auto')).toBe('light');
    expect(html().getAttribute('data-theme')).toBe('light');
    expect(window.matchMedia).not.toHaveBeenCalled();     // it never looks at the system itself
    expect(applyTheme(resolveTheme('auto'))).toBe('dark');
    expect(html().getAttribute('data-theme')).toBe('dark');
  });

  test.each([
    ['library', 'dark', '#181818'],
    ['library', 'light', '#18345D'],
    ['voices', 'dark', '#181818'],
    ['voices', 'light', '#518159'],
  ])('on %p, %p sets theme-color %p', (module, theme, color) => {
    document.body.setAttribute('data-active-module', module);
    const meta = addMeta();
    applyTheme(theme);
    expect(meta.getAttribute('content')).toBe(color);
  });

  test('a round trip restores the module colour', () => {
    document.body.setAttribute('data-active-module', 'voices');
    const meta = addMeta('#518159');
    applyTheme('dark');
    applyTheme('light');
    expect(meta.getAttribute('content')).toBe('#518159');
  });

  test('works without a theme-color meta', () => {
    expect(() => applyTheme('dark')).not.toThrow();
    expect(html().getAttribute('data-theme')).toBe('dark');
  });

  test('accepts another root element and uses its document', () => {
    const other = realDoc('https://www.sefaria.org/');
    other.head.innerHTML = '<meta name="theme-color" content="#18345D">';
    applyTheme('dark', other.documentElement);
    expect(other.documentElement.getAttribute('data-theme')).toBe('dark');
    expect(other.querySelector('meta[name="theme-color"]').getAttribute('content')).toBe('#181818');
    expect(html().hasAttribute('data-theme')).toBe(false);
  });

  test('changes nothing but data-theme on <html> (no classes, no legacy .dark), and writes no cookie', () => {
    const before = html().className;
    applyTheme('dark');
    expect(html().className).toBe(before);
    expect(document.body.classList.contains('dark')).toBe(false);
    expect(document.cookie).toBe('');
  });
});

describe('getCurrentPreference (browser)', () => {
  test('auto when there is no cookie', () => {
    expect(getCurrentPreference()).toBe('auto');
  });

  test.each(['auto', 'light', 'dark'])('reads the cookie %p', v => {
    setCookie(v);
    expect(getCurrentPreference()).toBe(v);
  });

  test('an invalid cookie means auto', () => {
    setCookie('sepia');
    expect(getCurrentPreference()).toBe('auto');
    setCookie('Dark');
    expect(getCurrentPreference()).toBe('auto');
  });

  test('the cookie is the only store: Sefaria.theme and <html data-theme> do not count in the browser', () => {
    Sefaria.theme = 'dark';
    html().setAttribute('data-theme', 'dark');
    expect(getCurrentPreference()).toBe('auto');
    setCookie('light');
    expect(getCurrentPreference()).toBe('light');
  });

  test('follows writeStoredPreference, not applyTheme', () => {
    applyTheme('dark');
    expect(getCurrentPreference()).toBe('auto');
    writeStoredPreference('dark', {domain: null});
    expect(getCurrentPreference()).toBe('dark');
  });

  test('auto when the cookie cannot be read (sandboxed frame)', () => {
    const spy = jest.spyOn(document, 'cookie', 'get').mockImplementation(() => { throw new Error('SecurityError'); });
    try {
      expect(getCurrentPreference()).toBe('auto');
    } finally {
      spy.mockRestore();
    }
  });
});

describe('watchSystemTheme', () => {
  const addMeta = () => {
    document.head.innerHTML = '<meta name="theme-color" content="#18345D">';
    return document.head.querySelector('meta');
  };

  test('subscribes to change events on the prefers-color-scheme: dark query and returns an unsubscribe', () => {
    const query = fakeQuery(false);
    const win = fakeWindow(query);
    const stop = watchSystemTheme(win);
    expect(win.matchMedia).toHaveBeenCalledWith(SYSTEM_DARK_QUERY);
    expect(query.addEventListener).toHaveBeenCalledTimes(1);
    expect(query.addEventListener.mock.calls[0][0]).toBe('change');
    expect(typeof stop).toBe('function');
    stop();
    expect(query.removeEventListener).toHaveBeenCalledWith('change', query.addEventListener.mock.calls[0][1]);
    expect(query.listeners.size).toBe(0);
  });

  test('does not apply anything when it starts (the head script already did)', () => {
    watchSystemTheme(fakeWindow(fakeQuery(true)));
    expect(html().hasAttribute('data-theme')).toBe(false);
  });

  test('follows the OS while the preference is auto (no cookie): data-theme and theme-color', () => {
    const meta = addMeta();
    const query = fakeQuery(false);
    watchSystemTheme(fakeWindow(query));
    query.fire(true);
    expect(html().getAttribute('data-theme')).toBe('dark');
    expect(meta.getAttribute('content')).toBe('#181818');
    query.fire(false);
    expect(html().getAttribute('data-theme')).toBe('light');
    expect(meta.getAttribute('content')).toBe('#18345D');
  });

  test.each(['auto', 'garbage'])('follows the OS while the cookie is %p', v => {
    setCookie(v);
    const query = fakeQuery(false);
    watchSystemTheme(fakeWindow(query));
    query.fire(true);
    expect(html().getAttribute('data-theme')).toBe('dark');
  });

  test.each([['light', true], ['dark', false]])('ignores OS changes while the preference is %p', (v, osDark) => {
    setCookie(v);
    html().setAttribute('data-theme', v);
    const query = fakeQuery(!osDark);
    watchSystemTheme(fakeWindow(query));
    query.fire(osDark);
    query.fire(!osDark);
    query.fire(osDark);
    expect(html().getAttribute('data-theme')).toBe(v);
  });

  test('checks the preference at the time of each change, not when it started', () => {
    const query = fakeQuery(false);
    watchSystemTheme(fakeWindow(query));
    setCookie('light');                       // the user picks Light
    html().setAttribute('data-theme', 'light');
    query.fire(true);
    expect(html().getAttribute('data-theme')).toBe('light');
    setCookie('auto');                        // ... then Auto again
    query.fire(true);
    expect(html().getAttribute('data-theme')).toBe('dark');
  });

  test('an event without a boolean "matches" re-reads the query', () => {
    const query = fakeQuery(false);
    watchSystemTheme(fakeWindow(query));
    query.matches = true;
    [...query.listeners].forEach(fn => fn({}));
    expect(html().getAttribute('data-theme')).toBe('dark');
    query.matches = false;
    [...query.listeners].forEach(fn => fn(undefined));
    expect(html().getAttribute('data-theme')).toBe('light');
  });

  test('after unsubscribing, OS changes are ignored', () => {
    const query = fakeQuery(false);
    const stop = watchSystemTheme(fakeWindow(query));
    stop();
    query.fire(true);
    expect(html().hasAttribute('data-theme')).toBe(false);
  });

  test('two watchers unsubscribe independently', () => {
    const query = fakeQuery(false);
    const stopA = watchSystemTheme(fakeWindow(query));
    watchSystemTheme(fakeWindow(query));
    expect(query.listeners.size).toBe(2);
    stopA();
    expect(query.listeners.size).toBe(1);
    query.fire(true);
    expect(html().getAttribute('data-theme')).toBe('dark');
  });

  describe('Safari < 14: only addListener/removeListener', () => {
    test('falls back to addListener and unsubscribes with removeListener', () => {
      const query = fakeQuery(false, {legacy: true});
      const stop = watchSystemTheme(fakeWindow(query));
      expect(query.addListener).toHaveBeenCalledTimes(1);
      query.fire(true);
      expect(html().getAttribute('data-theme')).toBe('dark');
      stop();
      expect(query.removeListener).toHaveBeenCalledWith(query.addListener.mock.calls[0][0]);
      query.fire(false);
      expect(html().getAttribute('data-theme')).toBe('dark');
    });

    test('prefers addEventListener when both exist', () => {
      const query = fakeQuery(false);
      query.addListener = jest.fn();
      watchSystemTheme(fakeWindow(query));
      expect(query.addEventListener).toHaveBeenCalledTimes(1);
      expect(query.addListener).not.toHaveBeenCalled();
    });

    test('still ignores changes while the preference is explicit', () => {
      setCookie('light');
      const query = fakeQuery(false, {legacy: true});
      watchSystemTheme(fakeWindow(query));
      query.fire(true);
      expect(html().hasAttribute('data-theme')).toBe(false);
    });
  });

  describe('a safe no-op where it cannot watch', () => {
    test.each([
      ['no window (SSR)', null],
      ['no matchMedia', {}],
      ['matchMedia returning null', {matchMedia: () => null}],
      ['a query with no listener API', {matchMedia: () => ({matches: true})}],
    ])('%s: returns a function and changes nothing', (name, win) => {
      let stop;
      expect(() => { stop = watchSystemTheme(win); }).not.toThrow();
      expect(typeof stop).toBe('function');
      expect(() => stop()).not.toThrow();
      expect(html().hasAttribute('data-theme')).toBe(false);
    });

    test('matchMedia that throws', () => {
      const win = throwingWindow();
      let stop;
      expect(() => { stop = watchSystemTheme(win); }).not.toThrow();
      expect(() => stop()).not.toThrow();
    });

    test('the global window without matchMedia (jsdom)', () => {
      expect(typeof window.matchMedia).toBe('undefined');
      expect(() => watchSystemTheme()()).not.toThrow();
    });
  });

  test('uses the global window by default', () => {
    const query = fakeQuery(false);
    window.matchMedia = jest.fn(() => query);
    const stop = watchSystemTheme();
    expect(window.matchMedia).toHaveBeenCalledWith(SYSTEM_DARK_QUERY);
    query.fire(true);
    expect(html().getAttribute('data-theme')).toBe('dark');
    stop();
  });
});
