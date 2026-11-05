/**
 * @jest-environment node
 *
 * The Appearance controls under Node SSR, then hydrated in a browser-like DOM.
 *
 * Node has no window or document. The controls must render from Sefaria.theme alone (null means
 * auto), must not touch theme.js's DOM/cookie helpers while rendering, and must give markup that
 * hydrates without a mismatch, including when the visitor's cookie (read after mount) or the
 * system setting disagrees with what the server rendered.
 *
 * theme.js is the real module, wrapped in jest.fn()s so the render-time checks can see calls.
 */
import React from 'react';
import ReactDOMServer from 'react-dom/server';

jest.mock('../sefaria/sefaria', () => {
  const en = require('../sefaria/i18n/interface/en.json');
  const he = require('../sefaria/i18n/interface/he.json');
  const Sefaria = {
    interfaceLang: 'english',
    theme: null,
    util: { getCookieDomain: () => null },
  };
  Sefaria._ = (key) => (Sefaria.interfaceLang === 'hebrew' ? he : en)[key] || key;
  return { __esModule: true, default: Sefaria };
});

jest.mock('../sefaria/theme', () => {
  const actual = jest.requireActual('../sefaria/theme');
  const wrap = (name) => jest.fn(actual[name]);
  return {
    __esModule: true,
    ...actual,
    readStoredPreference: wrap('readStoredPreference'),
    writeStoredPreference: wrap('writeStoredPreference'),
    applyTheme: wrap('applyTheme'),
    resolveTheme: wrap('resolveTheme'),
    getSystemTheme: wrap('getSystemTheme'),
    getCurrentPreference: wrap('getCurrentPreference'),
    watchSystemTheme: wrap('watchSystemTheme'),
  };
});

import Sefaria from '../sefaria/sefaria';
import * as theme from '../sefaria/theme';
import { AppearanceToggle, MobileAppearanceToggle } from '../AppearanceToggle';

const OPTIONS = ['auto', 'light', 'dark'];

const App = () => (
  <div>
    <AppearanceToggle />
    <MobileAppearanceToggle />
  </div>
);

const serverRender = (themeValue, interfaceLang = 'english') => {
  Sefaria.theme = themeValue;
  Sefaria.interfaceLang = interfaceLang;
  return ReactDOMServer.renderToString(<App />);
};

// The aria-pressed values of the [auto, light, dark] buttons, in document order.
const pressedIn = (markup) => [...markup.matchAll(/data-appearance="(\w+)" aria-pressed="(true|false)"/g)].map((m) => [m[1], m[2]]);
const expectedPressed = (pref) => [...OPTIONS, ...OPTIONS].map((v) => [v, String(v === pref)]);

const CASES = [
  // [Sefaria.theme, the option pressed in the server markup]
  [null, 'auto'],
  [undefined, 'auto'],
  ['auto', 'auto'],
  ['light', 'light'],
  ['dark', 'dark'],
  ['garbage', 'auto'],
];

afterEach(() => {
  Sefaria.theme = null;
  Sefaria.interfaceLang = 'english';
});

describe('renderToString under Node', () => {
  test('there really is no DOM here', () => {
    expect(typeof window).toBe('undefined');
    expect(typeof document).toBe('undefined');
  });

  test.each(CASES)('theme %p renders without throwing, %p pressed in both controls', (themeValue, pref) => {
    let html;
    expect(() => { html = serverRender(themeValue); }).not.toThrow();
    expect(pressedIn(html)).toEqual(expectedPressed(pref));
    expect(html.match(/class="appearanceOption active"/g)).toHaveLength(2);
    expect(html).toContain('aria-label="Appearance"');
    expect(html).toContain('aria-label="Auto" title="Auto"');
    expect(html).toContain('aria-label="Light" title="Light"');
    expect(html).toContain('aria-label="Dark" title="Dark"');
    expect(html).toContain('data-prevent-close="true"');
  });

  test.each(CASES)('theme %p gives the same markup every time', (themeValue) => {
    const first = serverRender(themeValue);
    expect(serverRender(themeValue)).toBe(first);
    expect(serverRender(themeValue)).toBe(first);
  });

  test('null, undefined, auto and invalid values give identical markup; light and dark differ', () => {
    const auto = serverRender(null);
    expect(serverRender(undefined)).toBe(auto);
    expect(serverRender('auto')).toBe(auto);
    expect(serverRender('garbage')).toBe(auto);
    expect(serverRender('light')).not.toBe(auto);
    expect(serverRender('dark')).not.toBe(auto);
    expect(serverRender('dark')).not.toBe(serverRender('light'));
  });

  test('a previous visitor\'s preference does not leak: markup follows the current Sefaria.theme', () => {
    const auto = serverRender(null);
    const light = serverRender('light');
    serverRender('dark');
    expect(serverRender(null)).toBe(auto);
    serverRender('dark');
    expect(serverRender('light')).toBe(light);
  });

  test('rendering does not change Sefaria.theme', () => {
    serverRender('dark');
    expect(Sefaria.theme).toBe('dark');
    serverRender(null);
    expect(Sefaria.theme).toBeNull();
  });

  test('Hebrew interface renders the Hebrew labels', () => {
    const html = serverRender(null, 'hebrew');
    expect(html).toContain('aria-label="מראה"');
    expect(html).toContain('aria-label="אוטומטי" title="אוטומטי"');
    expect(html).toContain('aria-label="בהיר" title="בהיר"');
    expect(html).toContain('aria-label="כהה" title="כהה"');
    expect(html).toContain('class="int-he"');
    expect(html).not.toContain('class="int-en"');
  });

  test('rendering never calls the DOM, cookie or system-setting helpers', () => {
    CASES.forEach(([t]) => serverRender(t));
    serverRender('dark', 'hebrew');
    for (const name of ['readStoredPreference', 'writeStoredPreference', 'applyTheme', 'resolveTheme',
      'getSystemTheme', 'getCurrentPreference', 'watchSystemTheme']) {
      expect([name, theme[name].mock.calls.length]).toEqual([name, 0]);
    }
  });
});

describe('hydrating the server markup in jsdom', () => {
  // A real DOM is built here by hand (jsdom ships with Jest) so the markup above, produced with
  // no DOM at all, is what gets hydrated. react-dom decides at load time whether it has a DOM,
  // so it is loaded only after the globals exist, in an isolated module registry.
  const { JSDOM } = require('jsdom');
  const GLOBALS = ['window', 'document', 'navigator', 'CustomEvent', 'Event', 'HTMLElement', 'Node'];
  let saved;

  beforeEach(() => {
    saved = GLOBALS.map((k) => [k, Object.getOwnPropertyDescriptor(global, k)]);
  });
  afterEach(() => {
    saved.forEach(([k, d]) => {
      if (d) { Object.defineProperty(global, k, d); } else { delete global[k]; }
    });
  });

  // `cookie`: the visitor's theme cookie value in the browser (null = none); `systemDark`: what
  // matchMedia reports (null = no matchMedia); `clientTheme`: Sefaria.theme on the client
  // (defaults to the server value, as both unpack the same base props).
  const hydrate = (serverTheme, { cookie = serverTheme, systemDark = null, interfaceLang = 'english', clientTheme = serverTheme } = {}) => {
    const markup = serverRender(serverTheme, interfaceLang);
    const dom = new JSDOM(`<!doctype html><html><body><div id="s2">${markup}</div></body></html>`,
      { url: 'https://www.sefaria.org/texts' });
    if (cookie) { dom.window.document.cookie = `theme=${cookie}; path=/`; }
    if (systemDark !== null) {
      dom.window.matchMedia = (q) => ({ matches: systemDark && q === '(prefers-color-scheme: dark)', media: q });
    }
    GLOBALS.forEach((k) => {
      Object.defineProperty(global, k, { value: dom.window[k], configurable: true, writable: true });
    });

    const errors = jest.spyOn(console, 'error').mockImplementation(() => {});
    let client;
    jest.isolateModules(() => {
      const ReactC = require('react');
      const ReactDOM = require('react-dom');
      const { act } = require('react-dom/test-utils');
      const SefariaC = require('../sefaria/sefaria').default;
      const themeC = require('../sefaria/theme');
      const { AppearanceToggle: A, MobileAppearanceToggle: M, THEME_CHANGE_EVENT } = require('../AppearanceToggle');
      SefariaC.theme = clientTheme;
      SefariaC.interfaceLang = interfaceLang;
      const root = dom.window.document.getElementById('s2');
      act(() => {
        ReactDOM.hydrate(ReactC.createElement('div', null,
          ReactC.createElement(A), ReactC.createElement(M)), root);
      });
      client = { root, ReactDOM, act, themeC, SefariaC, THEME_CHANGE_EVENT };
    });
    const logged = errors.mock.calls.map((args) => args.join(' '));
    errors.mockRestore();
    const pressed = (sel) => OPTIONS.find((v) =>
      client.root.querySelector(`${sel} [data-appearance="${v}"]`).getAttribute('aria-pressed') === 'true');
    const unmount = () => client.act(() => { client.ReactDOM.unmountComponentAtNode(client.root); });
    return { ...client, errors: logged, document: dom.window.document, pressed, unmount };
  };

  test.each(CASES)('theme %p hydrates with no warnings, %p pressed', (themeValue, pref) => {
    const { errors, pressed, unmount } = hydrate(themeValue);
    expect(errors).toEqual([]);
    expect(pressed('.dropdownAppearanceToggle')).toBe(pref);
    expect(pressed('.mobileAppearanceToggle')).toBe(pref);
    unmount();
  });

  test('Hebrew interface hydrates with no warnings', () => {
    const { errors, unmount } = hydrate('dark', { interfaceLang: 'hebrew' });
    expect(errors).toEqual([]);
    unmount();
  });

  test('hydrating changes nothing on the page: no cookie write, no data-theme, no analytics', () => {
    const { themeC, document: doc, errors, unmount } = hydrate(null, { systemDark: true });
    expect(errors).toEqual([]);
    expect(themeC.writeStoredPreference).not.toHaveBeenCalled();
    expect(themeC.applyTheme).not.toHaveBeenCalled();
    expect(doc.documentElement.hasAttribute('data-theme')).toBe(false);
    expect(doc.cookie).toBe('');
    unmount();
  });

  test('auto with a dark system: still "Auto" pressed (the controls show the preference, not the theme)', () => {
    const { errors, pressed, unmount } = hydrate(null, { systemDark: true });
    expect(errors).toEqual([]);
    expect(pressed('.dropdownAppearanceToggle')).toBe('auto');
    unmount();
  });

  test('server said auto but the browser has a dark cookie: no warning, then the controls follow the cookie', () => {
    const { errors, pressed, themeC, unmount } = hydrate(null, { cookie: 'dark' });
    expect(errors).toEqual([]);
    expect(themeC.getCurrentPreference).toHaveBeenCalled();
    expect(pressed('.dropdownAppearanceToggle')).toBe('dark');
    expect(pressed('.mobileAppearanceToggle')).toBe('dark');
    unmount();
  });

  test('server said dark but the cookie now says light (e.g. a page cached for someone else): follows the cookie', () => {
    const { errors, pressed, unmount } = hydrate('dark', { cookie: 'light' });
    expect(errors).toEqual([]);
    expect(pressed('.dropdownAppearanceToggle')).toBe('light');
    unmount();
  });

  test('after hydrating, choosing an option works and syncs both controls', () => {
    const { root, act, pressed, document: doc, SefariaC, unmount } = hydrate(null, { systemDark: true, cookie: null });
    act(() => { root.querySelector('.mobileAppearanceToggle [data-appearance="light"]').click(); });
    expect(pressed('.dropdownAppearanceToggle')).toBe('light');
    expect(doc.documentElement.getAttribute('data-theme')).toBe('light');
    expect(doc.cookie).toBe('theme=light');
    expect(SefariaC.theme).toBe('light');
    act(() => { root.querySelector('.dropdownAppearanceToggle [data-appearance="auto"]').click(); });
    expect(pressed('.mobileAppearanceToggle')).toBe('auto');
    expect(doc.documentElement.getAttribute('data-theme')).toBe('dark');   // auto follows the system
    expect(doc.cookie).toBe('theme=auto');
    unmount();
  });

  test('the hydration check does detect a real mismatch', () => {
    // Guards the test itself: hydrate markup rendered for "dark" as if the client had "light"
    // before its effect runs, by rendering the server markup with one preference and the client
    // with another. React must warn, or the no-warning assertions above prove nothing.
    const { errors, unmount } = hydrate('dark', { clientTheme: 'light', cookie: 'light' });
    expect(errors.length).toBeGreaterThan(0);
    unmount();
  });
});
