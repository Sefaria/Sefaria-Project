/* Testing done using Jest */
import {JSDOM} from 'jsdom';
import {
  THEMES, COOKIE, DEFAULT_THEME, COOKIE_MAX_AGE, THEME_COLORS,
  normalizeTheme, resolveTheme, parseThemeCookie, readStoredTheme, writeStoredTheme,
  getThemeColor, applyTheme, getCurrentTheme,
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

afterEach(() => {
  Sefaria.theme = null;
  Sefaria.util.getCookieDomain.mockReset();
  Sefaria.util.getCookieDomain.mockImplementation(() => null);
  document.documentElement.removeAttribute('data-theme');
  document.head.innerHTML = '';
  document.body.removeAttribute('data-active-module');
  document.cookie.split(';').forEach(c => {
    const name = c.split('=')[0].trim();
    if (name) { document.cookie = `${name}=; path=/; max-age=0`; }
  });
});

describe('constants', () => {
  test('stored values, cookie name and default', () => {
    expect(THEMES).toEqual(['light', 'dark']);
    expect(COOKIE).toBe('theme');
    expect(DEFAULT_THEME).toBe('light');
    expect(COOKIE_MAX_AGE).toBe(20 * 365 * 24 * 60 * 60);
  });

  test('THEMES and THEME_COLORS cannot be mutated by a consumer', () => {
    expect(Object.isFrozen(THEMES)).toBe(true);
    expect(Object.isFrozen(THEME_COLORS)).toBe(true);
    expect(Object.isFrozen(THEME_COLORS.light)).toBe(true);
  });

  test('theme-color values: module colours in light, the header surface in dark', () => {
    expect(THEME_COLORS).toEqual({light: {library: '#18345D', voices: '#518159'}, dark: '#181818'});
  });
});

describe('normalizeTheme', () => {
  test.each(['light', 'dark'])('accepts %p', v => {
    expect(normalizeTheme(v)).toBe(v);
  });

  test.each([
    'Light', 'DARK', 'Dark', ' dark', 'dark ', 'dark\n', 'system', 'auto', 'sepia', '', 'null',
    'undefined', 'darkish', '"dark"', '<script>', 'light;dark',
  ])('rejects the string %p (case-sensitive, like the server)', v => {
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

describe('resolveTheme', () => {
  test.each([
    ['dark', 'dark'],
    ['light', 'light'],
    [null, 'light'],
    [undefined, 'light'],
    ['', 'light'],
    ['DARK', 'light'],
    ['system', 'light'],
    ['garbage', 'light'],
    [42, 'light'],
  ])('stored %p -> %p', (stored, expected) => {
    expect(resolveTheme(stored)).toBe(expected);
  });

  test('never follows the OS: extra arguments (the old default/system signature) are ignored', () => {
    for (const stored of [null, 'garbage']) {
      expect(resolveTheme(stored, 'system', true)).toBe('light');
      expect(resolveTheme(stored, 'dark', true)).toBe('light');
    }
    expect(resolveTheme('light', 'system', true)).toBe('light');
    expect(resolveTheme('dark', 'light', false)).toBe('dark');
  });
});

describe('parseThemeCookie', () => {
  test.each(COOKIE_CASES.map(c => [c.cookie, c.expected]))('%p -> %p', (cookie, expected) => {
    expect(parseThemeCookie(cookie)).toBe(expected);
  });

  test.each([null, undefined, 1, {}])('non-string %p -> null', v => {
    expect(parseThemeCookie(v)).toBeNull();
  });
});

describe('readStoredTheme', () => {
  test('reads the global document by default', () => {
    expect(readStoredTheme()).toBeNull();
    document.cookie = 'theme=dark; path=/';
    expect(readStoredTheme()).toBe('dark');
    document.cookie = 'theme=light; path=/';
    expect(readStoredTheme()).toBe('light');
  });

  test('ignores other cookies whose names contain "theme"', () => {
    document.cookie = 'xtheme=dark; path=/';
    document.cookie = 'theme_old=dark; path=/';
    expect(readStoredTheme()).toBeNull();
  });

  test('reads a given document', () => {
    expect(readStoredTheme(recordingDoc({cookie: 'a=1; theme=dark'}))).toBe('dark');
    expect(readStoredTheme(recordingDoc({cookie: 'theme=nope'}))).toBeNull();
  });

  test('returns null without a document (SSR) or a cookie string', () => {
    expect(readStoredTheme(null)).toBeNull();
    expect(readStoredTheme({})).toBeNull();
  });

  test('returns null when reading cookies throws (sandboxed frame)', () => {
    const doc = {get cookie() { throw new Error('SecurityError'); }};
    expect(readStoredTheme(doc)).toBeNull();
  });
});

describe('writeStoredTheme: the cookie strings', () => {
  const LIFETIME = `max-age=${20 * 365 * 24 * 60 * 60}`;

  test('with a domain: expires the host-only duplicate first, then writes the domain cookie', () => {
    const doc = recordingDoc();
    const written = writeStoredTheme('dark', {domain: '.sefaria.org', doc});
    expect(doc.writes).toEqual([
      'theme=; path=/; max-age=0; SameSite=Lax; Secure',
      `theme=dark; path=/; ${LIFETIME}; SameSite=Lax; domain=.sefaria.org; Secure`,
    ]);
    expect(written).toBe(doc.writes[1]);
  });

  test('host-only (domain null): one write, nothing to expire', () => {
    const doc = recordingDoc({hostname: 'localhost', protocol: 'http:'});
    expect(writeStoredTheme('light', {domain: null, doc})).toBe(`theme=light; path=/; ${LIFETIME}; SameSite=Lax`);
    expect(doc.writes).toHaveLength(1);
  });

  test('Secure only on https', () => {
    const http = recordingDoc({protocol: 'http:'});
    writeStoredTheme('dark', {domain: '.sefaria.org', doc: http});
    http.writes.forEach(w => expect(w).not.toMatch(/Secure/));
    const https = recordingDoc({protocol: 'https:'});
    writeStoredTheme('dark', {domain: '.sefaria.org', doc: https});
    https.writes.forEach(w => expect(w).toMatch(/; Secure$/));
  });

  test('every write is path=/ and SameSite=Lax', () => {
    const doc = recordingDoc();
    writeStoredTheme('dark', {domain: '.sefaria.org', doc});
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
    const written = writeStoredTheme('dark', {domain, doc});
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
    expect(writeStoredTheme('dark', {doc})).toMatch(/; domain=\.sefaria\.org;/);
    expect(Sefaria.util.getCookieDomain).toHaveBeenCalled();
  });

  test('an explicit domain (even null) skips getCookieDomain()', () => {
    Sefaria.util.getCookieDomain.mockImplementation(() => '.sefaria.org');
    writeStoredTheme('dark', {domain: null, doc: recordingDoc()});
    expect(Sefaria.util.getCookieDomain).not.toHaveBeenCalled();
  });

  test('falls back to host-only when getCookieDomain() throws or returns nothing', () => {
    Sefaria.util.getCookieDomain.mockImplementation(() => { throw new Error('no domainModules'); });
    expect(writeStoredTheme('dark', {doc: recordingDoc()})).not.toMatch(/domain=/);
    Sefaria.util.getCookieDomain.mockImplementation(() => '');
    expect(writeStoredTheme('dark', {doc: recordingDoc()})).not.toMatch(/domain=/);
  });

  test.each([null, undefined, '', 'DARK', 'system', 'dark; domain=evil.com', '<script>'])(
    'writes nothing for the invalid value %p', v => {
      const doc = recordingDoc();
      expect(writeStoredTheme(v, {domain: '.sefaria.org', doc})).toBeNull();
      expect(doc.writes).toEqual([]);
    });

  test('writes nothing without a document (SSR)', () => {
    expect(writeStoredTheme('dark', {doc: null})).toBeNull();
  });

  test('returns null when cookies are unavailable (sandboxed frame)', () => {
    const doc = {location: {hostname: 'www.sefaria.org', protocol: 'https:'}, set cookie(v) { throw new Error('SecurityError'); }};
    expect(writeStoredTheme('dark', {domain: '.sefaria.org', doc})).toBeNull();
  });

  test('writes the global document by default', () => {
    expect(writeStoredTheme('dark', {domain: null})).toMatch(/^theme=dark;/);
    expect(document.cookie).toBe('theme=dark');
    expect(readStoredTheme()).toBe('dark');
  });
});

describe('writeStoredTheme: a real cookie jar', () => {
  test('replaces a host-only duplicate, so exactly one theme cookie remains', () => {
    const doc = realDoc('https://www.sefaria.org/texts');
    doc.cookie = 'theme=light; path=/';                       // host-only leftover
    expect(doc.cookie).toBe('theme=light');
    writeStoredTheme('dark', {domain: '.sefaria.org', doc});
    expect(doc.cookie).toBe('theme=dark');
    expect(readStoredTheme(doc)).toBe('dark');
  });

  test('the domain cookie is shared with the other module (Library -> Voices)', () => {
    const {CookieJar} = require('jsdom');
    const jar = new CookieJar();
    writeStoredTheme('dark', {domain: '.sefaria.org', doc: realDoc('https://www.sefaria.org/', jar)});
    expect(readStoredTheme(realDoc('https://voices.sefaria.org/', jar))).toBe('dark');
    expect(readStoredTheme(realDoc('https://www.sefaria.org.il/', jar))).toBeNull();  // .org.il is separate
  });

  test('toggling back and forth never leaves two cookies', () => {
    const doc = realDoc('https://www.sefaria.org/');
    for (const t of ['dark', 'light', 'dark', 'light']) {
      writeStoredTheme(t, {domain: '.sefaria.org', doc});
      expect(doc.cookie).toBe(`theme=${t}`);
    }
  });

  test('on the bare host the domain cookie survives its own duplicate cleanup', () => {
    const doc = realDoc('https://sefaria.org/');
    writeStoredTheme('light', {domain: '.sefaria.org', doc});
    writeStoredTheme('dark', {domain: '.sefaria.org', doc});
    expect(doc.cookie).toBe('theme=dark');
  });

  test('host-only on localhost', () => {
    const doc = realDoc('http://localhost:8000/');
    writeStoredTheme('dark', {domain: null, doc});
    expect(doc.cookie).toBe('theme=dark');
  });

  test('a domain the host is not inside falls back to host-only instead of being dropped', () => {
    const doc = realDoc('https://www.sefaria.org.il/');
    writeStoredTheme('dark', {domain: '.sefaria.org', doc});
    expect(readStoredTheme(doc)).toBe('dark');
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
    expect(document.documentElement.getAttribute('data-theme')).toBe('dark');
    expect(document.documentElement.dataset.theme).toBe('dark');
    expect(applyTheme('light')).toBe('light');
    expect(document.documentElement.getAttribute('data-theme')).toBe('light');
  });

  test.each([null, undefined, 'DARK', 'system', '"><script>'])('applies light for the invalid value %p', v => {
    document.documentElement.setAttribute('data-theme', 'dark');
    expect(applyTheme(v)).toBe('light');
    expect(document.documentElement.getAttribute('data-theme')).toBe('light');
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
    expect(document.documentElement.getAttribute('data-theme')).toBe('dark');
  });

  test('accepts another root element and uses its document', () => {
    const other = realDoc('https://www.sefaria.org/');
    other.head.innerHTML = '<meta name="theme-color" content="#18345D">';
    applyTheme('dark', other.documentElement);
    expect(other.documentElement.getAttribute('data-theme')).toBe('dark');
    expect(other.querySelector('meta[name="theme-color"]').getAttribute('content')).toBe('#181818');
    expect(document.documentElement.hasAttribute('data-theme')).toBe(false);
  });

  test('changes nothing but data-theme on <html> (no classes, no legacy .dark)', () => {
    const before = document.documentElement.className;
    applyTheme('dark');
    expect(document.documentElement.className).toBe(before);
    expect(document.body.classList.contains('dark')).toBe(false);
  });
});

describe('getCurrentTheme (browser)', () => {
  test('reads <html data-theme>', () => {
    document.documentElement.setAttribute('data-theme', 'dark');
    expect(getCurrentTheme()).toBe('dark');
    document.documentElement.setAttribute('data-theme', 'light');
    Sefaria.theme = 'dark';
    expect(getCurrentTheme()).toBe('light');       // the page wins over the props
  });

  test('falls back to Sefaria.theme when the attribute is missing or invalid', () => {
    Sefaria.theme = 'dark';
    expect(getCurrentTheme()).toBe('dark');
    document.documentElement.setAttribute('data-theme', 'sepia');
    expect(getCurrentTheme()).toBe('dark');
  });

  test('light when nothing is set', () => {
    expect(getCurrentTheme()).toBe('light');
    Sefaria.theme = 'garbage';
    expect(getCurrentTheme()).toBe('light');
  });

  test('follows applyTheme', () => {
    applyTheme('dark');
    expect(getCurrentTheme()).toBe('dark');
  });
});

describe('does not follow the OS setting', () => {
  test('matchMedia is never consulted', () => {
    const matchMedia = jest.fn(() => ({matches: true}));
    window.matchMedia = matchMedia;
    try {
      expect(resolveTheme(readStoredTheme())).toBe('light');
      expect(getCurrentTheme()).toBe('light');
      applyTheme(resolveTheme(null));
      expect(document.documentElement.getAttribute('data-theme')).toBe('light');
      expect(matchMedia).not.toHaveBeenCalled();
    } finally {
      delete window.matchMedia;
    }
  });
});
