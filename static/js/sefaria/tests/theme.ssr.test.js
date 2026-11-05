/**
 * @jest-environment node
 *
 * Node SSR requires theme.js (the Appearance controls render on the server), where there is no
 * `document` or `window`. Importing it must not touch browser globals, and every function must
 * degrade to a safe no-op or fall back to `Sefaria.theme`, the validated cookie value from base
 * props (null means auto).
 */
jest.mock('../sefaria', () => ({
  __esModule: true,
  default: {theme: null, util: {getCookieDomain: jest.fn(() => '.sefaria.org')}},
}));
import Sefaria from '../sefaria';

const BROWSER_GLOBALS = ['document', 'window', 'navigator', 'localStorage', 'matchMedia'];

// Trip-wires: while `fn` runs, reading any of `names` on the global object throws.
const withTripWires = (names, fn) => {
  for (const name of names) {
    Object.defineProperty(global, name, {
      configurable: true,
      get() { throw new Error(`theme.js touched ${name}`); },
    });
  }
  try {
    return fn();
  } finally {
    for (const name of names) { delete global[name]; }
  }
};

describe('theme.js under Node SSR', () => {
  let theme;

  beforeAll(() => {
    expect(typeof document).toBe('undefined');
    expect(typeof window).toBe('undefined');
    theme = withTripWires(BROWSER_GLOBALS, () => require('../theme'));   // nothing at import time
    expect(Sefaria.util.getCookieDomain).not.toHaveBeenCalled();
  });

  afterEach(() => { Sefaria.theme = null; });

  test('exports the API the Appearance controls and client.jsx build on', () => {
    for (const name of ['normalizePreference', 'normalizeTheme', 'getSystemTheme', 'resolveTheme',
      'parseThemeCookie', 'readStoredPreference', 'writeStoredPreference', 'getThemeColor', 'applyTheme',
      'getCurrentPreference', 'watchSystemTheme']) {
      expect(typeof theme[name]).toBe('function');
    }
    expect(theme.PREFERENCES).toEqual(['auto', 'light', 'dark']);
    expect(theme.THEMES).toEqual(['light', 'dark']);
    expect(theme.COOKIE).toBe('theme');
    expect(theme.DEFAULT_PREFERENCE).toBe('auto');
  });

  test('readStoredPreference returns null', () => {
    expect(theme.readStoredPreference()).toBeNull();
  });

  test('writeStoredPreference writes nothing and does not look up the cookie domain', () => {
    expect(theme.writeStoredPreference('dark')).toBeNull();
    expect(theme.writeStoredPreference('auto')).toBeNull();
    expect(Sefaria.util.getCookieDomain).not.toHaveBeenCalled();
  });

  test('applyTheme is a no-op that still returns the theme it would show', () => {
    expect(theme.applyTheme('dark')).toBe('dark');
    expect(theme.applyTheme('auto')).toBe('light');
    expect(theme.applyTheme('bogus')).toBe('light');
  });

  test('getCurrentPreference resolves Sefaria.theme, and unset or invalid means auto', () => {
    expect(theme.getCurrentPreference()).toBe('auto');
    for (const v of ['auto', 'light', 'dark']) {
      Sefaria.theme = v;
      expect(theme.getCurrentPreference()).toBe(v);
    }
    for (const v of ['<script>', 'DARK', 'system', 42, undefined]) {
      Sefaria.theme = v;
      expect(theme.getCurrentPreference()).toBe('auto');
    }
  });

  test('the server cannot know the system setting: getSystemTheme is light and auto resolves to light', () => {
    withTripWires(['matchMedia', 'navigator'], () => {
      expect(theme.getSystemTheme()).toBe('light');
      expect(theme.resolveTheme('auto')).toBe('light');
      expect(theme.resolveTheme(null)).toBe('light');
      expect(theme.resolveTheme('dark')).toBe('dark');
    });
  });

  test('watchSystemTheme is a no-op that returns a callable unsubscribe', () => {
    withTripWires(['matchMedia', 'navigator'], () => {
      const stop = theme.watchSystemTheme();
      expect(typeof stop).toBe('function');
      expect(() => stop()).not.toThrow();
    });
  });

  test('the pure helpers behave exactly as in the browser', () => {
    expect(theme.normalizePreference('auto')).toBe('auto');
    expect(theme.normalizeTheme('auto')).toBeNull();
    expect(theme.normalizeTheme('dark')).toBe('dark');
    expect(theme.resolveTheme('auto', 'dark')).toBe('dark');
    expect(theme.parseThemeCookie('a=1; theme=dark')).toBe('dark');
    expect(theme.parseThemeCookie('a=1; theme=auto')).toBe('auto');
    expect(theme.getThemeColor('dark', 'voices')).toBe('#181818');
  });

  test('holds no state between calls (one Node process renders every visitor)', () => {
    Sefaria.theme = 'dark';
    expect(theme.getCurrentPreference()).toBe('dark');
    Sefaria.theme = null;
    expect(theme.getCurrentPreference()).toBe('auto');
  });
});
