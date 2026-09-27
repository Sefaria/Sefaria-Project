/**
 * @jest-environment node
 *
 * Node SSR requires theme.js (the toggle renders on the server), where there is no `document`
 * or `window`. Importing it must not touch browser globals, and every function must degrade to a
 * safe no-op or fall back to `Sefaria.theme`, the validated cookie value from base props.
 */
jest.mock('../sefaria', () => ({
  __esModule: true,
  default: {theme: null, util: {getCookieDomain: jest.fn(() => '.sefaria.org')}},
}));
import Sefaria from '../sefaria';

describe('theme.js under Node SSR', () => {
  let theme;

  beforeAll(() => {
    expect(typeof document).toBe('undefined');
    expect(typeof window).toBe('undefined');
    // Trip-wires: any import-time access to these would throw.
    for (const name of ['document', 'window', 'navigator', 'localStorage', 'matchMedia']) {
      Object.defineProperty(global, name, {
        configurable: true,
        get() { throw new Error(`theme.js touched ${name} at import time`); },
      });
    }
    try {
      theme = require('../theme');
    } finally {
      for (const name of ['document', 'window', 'navigator', 'localStorage', 'matchMedia']) {
        delete global[name];
      }
    }
    expect(Sefaria.util.getCookieDomain).not.toHaveBeenCalled();
  });

  afterEach(() => { Sefaria.theme = null; });

  test('exports the API chunk B builds on', () => {
    for (const name of ['normalizeTheme', 'resolveTheme', 'readStoredTheme', 'writeStoredTheme', 'applyTheme', 'getCurrentTheme']) {
      expect(typeof theme[name]).toBe('function');
    }
    expect(theme.THEMES).toEqual(['light', 'dark']);
    expect(theme.COOKIE).toBe('theme');
  });

  test('readStoredTheme returns null', () => {
    expect(theme.readStoredTheme()).toBeNull();
  });

  test('writeStoredTheme writes nothing and does not look up the cookie domain', () => {
    expect(theme.writeStoredTheme('dark')).toBeNull();
    expect(Sefaria.util.getCookieDomain).not.toHaveBeenCalled();
  });

  test('applyTheme is a no-op that still returns the resolved theme', () => {
    expect(theme.applyTheme('dark')).toBe('dark');
    expect(theme.applyTheme('bogus')).toBe('light');
  });

  test('getCurrentTheme resolves Sefaria.theme', () => {
    expect(theme.getCurrentTheme()).toBe('light');
    Sefaria.theme = 'dark';
    expect(theme.getCurrentTheme()).toBe('dark');
    Sefaria.theme = 'light';
    expect(theme.getCurrentTheme()).toBe('light');
    Sefaria.theme = '<script>';
    expect(theme.getCurrentTheme()).toBe('light');
  });

  test('the pure helpers behave exactly as in the browser', () => {
    expect(theme.normalizeTheme('dark')).toBe('dark');
    expect(theme.resolveTheme(null)).toBe('light');
    expect(theme.parseThemeCookie('a=1; theme=dark')).toBe('dark');
  });
});
