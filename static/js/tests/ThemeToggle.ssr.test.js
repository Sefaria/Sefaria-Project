/**
 * @jest-environment node
 *
 * ThemeToggle under Node SSR, then hydrated in a browser-like DOM.
 *
 * Node has no window or document. The toggle must render from Sefaria.theme alone (null means
 * light), must not touch theme.js's DOM/cookie helpers while rendering, and must give markup
 * that hydrates without a mismatch, including when <html data-theme> (set by the server or the
 * head script) disagrees with what the server rendered.
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
  const THEMES = ['light', 'dark'];
  return {
    __esModule: true,
    THEMES,
    COOKIE: 'theme',
    normalizeTheme: (v) => (THEMES.includes(v) ? v : null),
    writeStoredTheme: jest.fn(),
    applyTheme: jest.fn(),
    getCurrentTheme: jest.fn(() => global.document.documentElement.dataset.theme),
  };
});

import Sefaria from '../sefaria/sefaria';
import * as theme from '../sefaria/theme';
import { ThemeToggle, MobileThemeToggle } from '../ThemeToggle';

const App = () => (
  <div>
    <ThemeToggle />
    <MobileThemeToggle />
  </div>
);

const serverRender = (themeValue, interfaceLang = 'english') => {
  Sefaria.theme = themeValue;
  Sefaria.interfaceLang = interfaceLang;
  return ReactDOMServer.renderToString(<App />);
};

const CASES = [
  // [Sefaria.theme, pressed/checked]
  [null, 'false'],
  [undefined, 'false'],
  ['light', 'false'],
  ['dark', 'true'],
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

  test.each(CASES)('theme %p renders without throwing, pressed=%s', (themeValue, pressed) => {
    let html;
    expect(() => { html = serverRender(themeValue); }).not.toThrow();
    expect(html).toContain(`aria-pressed="${pressed}"`);
    expect(html).toContain(`aria-checked="${pressed}"`);
    expect(html).toContain('aria-label="Dark mode"');
    expect(html).toContain(pressed === 'true' ? 'themeToggleSun' : 'themeToggleMoon');
  });

  test.each(CASES)('theme %p gives the same markup every time', (themeValue) => {
    const first = serverRender(themeValue);
    expect(serverRender(themeValue)).toBe(first);
    expect(serverRender(themeValue)).toBe(first);
  });

  test('null, undefined and light give identical markup', () => {
    expect(serverRender(undefined)).toBe(serverRender(null));
    expect(serverRender('light')).toBe(serverRender(null));
    expect(serverRender('dark')).not.toBe(serverRender(null));
  });

  test('a previous visitor\'s theme does not leak: markup follows the current Sefaria.theme', () => {
    const light = serverRender(null);
    serverRender('dark');
    expect(serverRender(null)).toBe(light);
  });

  test('Hebrew interface renders the Hebrew label', () => {
    const html = serverRender(null, 'hebrew');
    expect(html).toContain('aria-label="מצב כהה"');
    expect(html).toContain('class="int-he"');
  });

  test('rendering never calls the DOM/cookie helpers', () => {
    CASES.forEach(([t]) => serverRender(t));
    expect(theme.getCurrentTheme).not.toHaveBeenCalled();
    expect(theme.applyTheme).not.toHaveBeenCalled();
    expect(theme.writeStoredTheme).not.toHaveBeenCalled();
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

  const hydrate = (serverTheme, htmlTheme, interfaceLang = 'english') => {
    const markup = serverRender(serverTheme, interfaceLang);
    const dom = new JSDOM(`<!doctype html><html${htmlTheme ? ` data-theme="${htmlTheme}"` : ''}>` +
      `<body><div id="s2">${markup}</div></body></html>`);
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
      const { ThemeToggle: T, MobileThemeToggle: M } = require('../ThemeToggle');
      SefariaC.theme = serverTheme;         // the client unpacks the same base props
      SefariaC.interfaceLang = interfaceLang;
      const root = dom.window.document.getElementById('s2');
      act(() => {
        ReactDOM.hydrate(ReactC.createElement('div', null,
          ReactC.createElement(T), ReactC.createElement(M)), root);
      });
      client = { root, ReactDOM, act };
    });
    const logged = errors.mock.calls.map((args) => args.join(' '));
    errors.mockRestore();
    return { ...client, errors: logged, document: dom.window.document };
  };

  test.each(CASES)('theme %p hydrates with no warnings', (themeValue, pressed) => {
    const { root, errors, ReactDOM, act } = hydrate(themeValue, themeValue);
    expect(errors).toEqual([]);
    expect(root.querySelector('.themeToggle').getAttribute('aria-pressed')).toBe(pressed);
    expect(root.querySelector('.mobileThemeToggle').getAttribute('aria-checked')).toBe(pressed);
    act(() => { ReactDOM.unmountComponentAtNode(root); });
  });

  test('Hebrew interface hydrates with no warnings', () => {
    const { errors, root, ReactDOM, act } = hydrate('dark', 'dark', 'hebrew');
    expect(errors).toEqual([]);
    act(() => { ReactDOM.unmountComponentAtNode(root); });
  });

  test('server said light but <html> is dark (head script applied the cookie): no warning, then the toggle follows <html>', () => {
    const { root, errors, ReactDOM, act } = hydrate(null, 'dark');
    expect(errors).toEqual([]);
    expect(root.querySelector('.themeToggle').getAttribute('aria-pressed')).toBe('true');
    expect(root.querySelector('.themeToggle .themeToggleSun')).not.toBeNull();
    expect(root.querySelector('.mobileThemeToggle').getAttribute('aria-checked')).toBe('true');
    act(() => { ReactDOM.unmountComponentAtNode(root); });
  });

  test('server said dark but <html> is light: follows <html>', () => {
    const { root, errors, ReactDOM, act } = hydrate('dark', 'light');
    expect(errors).toEqual([]);
    expect(root.querySelector('.themeToggle').getAttribute('aria-pressed')).toBe('false');
    act(() => { ReactDOM.unmountComponentAtNode(root); });
  });

  test('the hydration check does detect a real mismatch', () => {
    // Guards the test itself: hydrate markup rendered for "dark" as if the client had "light"
    // before its effect runs, by rendering the server markup with one theme and the client
    // with another. React must warn, or the no-warning assertions above prove nothing.
    const markup = serverRender('dark');
    const dom = new JSDOM(`<!doctype html><html><body><div id="s2">${markup}</div></body></html>`);
    GLOBALS.forEach((k) => {
      Object.defineProperty(global, k, { value: dom.window[k], configurable: true, writable: true });
    });
    const errors = jest.spyOn(console, 'error').mockImplementation(() => {});
    jest.isolateModules(() => {
      const ReactC = require('react');
      const ReactDOM = require('react-dom');
      const { act } = require('react-dom/test-utils');
      const SefariaC = require('../sefaria/sefaria').default;
      const { ThemeToggle: T, MobileThemeToggle: M } = require('../ThemeToggle');
      SefariaC.theme = 'light';
      const root = dom.window.document.getElementById('s2');
      act(() => {
        ReactDOM.hydrate(ReactC.createElement('div', null,
          ReactC.createElement(T), ReactC.createElement(M)), root);
      });
      act(() => { ReactDOM.unmountComponentAtNode(root); });
    });
    const calls = errors.mock.calls.length;
    errors.mockRestore();
    expect(calls).toBeGreaterThan(0);
  });
});
