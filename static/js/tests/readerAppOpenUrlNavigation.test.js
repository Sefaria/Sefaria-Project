/**
 * ReaderApp.openURL: did this call actually move the page?
 *
 * openURL returns true for three cases where the current page does NOT go anywhere -- it
 * opened a new tab, or the user cancelled an unsaved-changes prompt. The search analytics
 * flow used to be ended on that plain `true`, which meant clicking an external or
 * cross-module link from the search page silently killed reporting for the rest of the
 * visit, even though the search results were still on screen.
 *
 * lastOpenURLNavigatedInApp() separates the two meanings. openURL's own return value is
 * deliberately unchanged -- a dozen call sites read it as a plain "handled?" -- so these
 * tests pin down both: the return value AND the new flag.
 *
 * openURL is called on the prototype with a stub `this`, so this is the real method without
 * constructing the whole app.
 */

jest.mock('../sefaria/sefaria', () => {
  const LIBRARY = 'library', VOICES = 'voices';
  return { __esModule: true, default: {
    LIBRARY_MODULE: LIBRARY,
    VOICES_MODULE: VOICES,
    activeModule: LIBRARY,
    _: (k) => k,
    _bilingual: (s) => ({ en: s, he: s }),
    interfaceLang: 'english',
    apiHost: '',
    toc: [],
    terms: {},
    _tocOrderLookup: {},
    _siteSettings: { ABOUT_SIDEBAR_PAGES: [] },
    hebrew: { isHebrew: () => false },
    search: { entitySearch: jest.fn() },
    setup: () => {},
    isRef: () => false,
    humanRef: (r) => r,
    util: {
      clone: (x) => x,
      cookie: () => {},
      getObjectFromUrlParam: () => null,
      currentPath: () => '/',
      // Real fullURL rewrites the subdomain for a cross-module target; all these tests need
      // is an absolute URL for `new URL()` to parse.
      fullURL: (href, moduleTarget) =>
        (href.startsWith('http') ? href
          : `https://${moduleTarget === VOICES ? 'voices' : 'www'}.sefaria.org${href}`),
    },
    isSefariaURL: (url) => url.hostname.endsWith('sefaria.org'),
  }};
});

global.ResizeObserver = class { observe() {} unobserve() {} disconnect() {} };

// Misc.jsx and ImageCropper.jsx are the only two modules in the tree that import a
// stylesheet, which Jest cannot parse. Stubbing them keeps this test free of any
// project-level Jest configuration. Every named export becomes a no-op component; nothing
// under test renders them.
// (factories must be inline -- jest hoists them above the imports)
jest.mock("../Misc", () => new Proxy({}, {
  get: (_t, prop) => (prop === "__esModule" ? true : () => null),
}));
jest.mock("../ImageCropper", () => new Proxy({}, {
  get: (_t, prop) => (prop === "__esModule" ? true : () => null),
}));

import Sefaria from '../sefaria/sefaria';
import { ReaderApp } from '../ReaderApp.jsx';

const openURL = ReaderApp.prototype.openURL;
const navigatedInApp = ReaderApp.prototype.lastOpenURLNavigatedInApp;

// A stub standing in for a mounted ReaderApp: enough for openURL to run its branches.
const makeApp = (over = {}) => ({
  shouldAlertBeforeCloseEditor: () => false,
  alertUnsavedChangesConfirmed: () => true,
  _aboutSidebarPaths: new Set(),
  state: { showAuth: false },
  setState: jest.fn(),
  openPanel: jest.fn(),
  openPanelAtEnd: jest.fn(),
  showLibrary: jest.fn(),
  showRoot: jest.fn(),
  handleAuthNavigate: jest.fn(),
  setDefaultOption: jest.fn(),
  ...over,
});

// Returns {handled, navigated} for one openURL call against `app`.
const call = (app, href, ...rest) => ({
  handled: openURL.call(app, href, ...rest),
  navigated: navigatedInApp.call(app),
});

beforeEach(() => {
  Sefaria.activeModule = Sefaria.LIBRARY_MODULE;
  window.open = jest.fn();
});

describe('cases that open a new tab -- the page itself does not move', () => {
  test('an external URL', () => {
    const app = makeApp();
    const { handled, navigated } = call(app, 'https://example.com/article');

    expect(handled).toBe(true);           // openURL "handled" it
    expect(window.open).toHaveBeenCalled();
    expect(navigated).toBe(false);        // ...but this page stayed put
  });

  test('a cross-module link, e.g. a Voices link clicked from the library', () => {
    const app = makeApp();
    const { handled, navigated } = call(app, '/sheets/123', true, false, Sefaria.VOICES_MODULE);

    expect(handled).toBe(true);
    expect(window.open).toHaveBeenCalled();
    expect(navigated).toBe(false);
  });

  test('an about-sidebar page opened from Voices', () => {
    Sefaria.activeModule = Sefaria.VOICES_MODULE;
    const app = makeApp({ _aboutSidebarPaths: new Set(['/about']) });
    const { handled, navigated } = call(app, '/about');

    expect(handled).toBe(true);
    expect(window.open).toHaveBeenCalled();
    expect(navigated).toBe(false);
  });
});

describe('a cancelled unsaved-changes prompt', () => {
  test('is handled, but nothing moved', () => {
    const app = makeApp({
      shouldAlertBeforeCloseEditor: () => true,
      alertUnsavedChangesConfirmed: () => false,   // user clicked Cancel
    });
    const { handled, navigated } = call(app, '/texts');

    expect(handled).toBe(true);
    expect(app.showLibrary).not.toHaveBeenCalled();
    expect(navigated).toBe(false);
  });
});

describe('real in-app navigation', () => {
  test('a recognised path navigates and reports that it did', () => {
    const app = makeApp();
    const { handled, navigated } = call(app, '/texts');

    expect(handled).toBe(true);
    expect(app.showLibrary).toHaveBeenCalled();
    expect(window.open).not.toHaveBeenCalled();
    expect(navigated).toBe(true);        // the case that SHOULD end a search flow
  });

  test('confirming the unsaved-changes prompt still navigates', () => {
    const app = makeApp({
      shouldAlertBeforeCloseEditor: () => true,
      alertUnsavedChangesConfirmed: () => true,    // user clicked OK
    });
    const { handled, navigated } = call(app, '/texts');

    expect(handled).toBe(true);
    expect(app.showLibrary).toHaveBeenCalled();
    expect(navigated).toBe(true);
  });
});

describe('a path openURL does not recognise', () => {
  test('is not handled and did not navigate', () => {
    const app = makeApp();
    const { handled, navigated } = call(app, '/some/unrouted/path');

    expect(handled).toBe(false);
    expect(navigated).toBe(false);
  });
});

describe('the flag is per-call, not sticky', () => {
  test('a new-tab call after a navigating call reports false', () => {
    // The flag is instance state, so a stale true from a previous call would end a flow
    // that a new-tab click should have left running.
    const app = makeApp();

    expect(call(app, '/texts').navigated).toBe(true);
    expect(call(app, 'https://example.com').navigated).toBe(false);
  });
});
