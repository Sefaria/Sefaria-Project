/**
 * ReaderApp.makeHistoryState: the URL serialized for a multi-panel layout must carry each
 * panel's parameters under that panel's own numeric suffix, because the server parses the
 * same keys (reader/views.py text_panels). Three cases are pinned here:
 *
 *  - sidebar search queries on panel N are written as `sbsq<N>` and percent-encoded;
 *  - the first-panel `aliyot` flag survives into the short text+commentary URL;
 *  - extended-notes panels get the suffix of their panel position, not a doubled one.
 *
 * makeHistoryState is called on the prototype with a stub `this`, so this is the real
 * method without constructing the whole app.
 */

jest.mock('../sefaria/sefaria', () => {
  const LIBRARY = 'library', VOICES = 'voices';
  return { __esModule: true, default: {
    LIBRARY_MODULE: LIBRARY,
    VOICES_MODULE: VOICES,
    activeModule: LIBRARY,
    _: (k) => k,
    _r: (r) => r,
    _bilingual: (s) => ({ en: s, he: s }),
    _getShortInterfaceLang: () => 'en',
    interfaceLang: 'english',
    apiHost: '',
    toc: [],
    terms: {},
    _tocOrderLookup: {},
    track: { event: () => {} },
    _siteSettings: { ABOUT_SIDEBAR_PAGES: [] },
    hebrew: { isHebrew: () => false },
    search: { entitySearch: jest.fn() },
    setup: () => {},
    isRef: () => false,
    humanRef: (r) => r,
    getPageTitle: (t) => t,
    normRef: (r) => (Array.isArray(r) ? r.join('; ') : r),
    normRefList: (r) => (Array.isArray(r) ? r.join('; ') : r),
    refContains: () => false,
    titleIsTorah: (ref) => /^Genesis/.test(ref),
    util: {
      clone: (x) => x,
      cookie: () => {},
      getObjectFromUrlParam: () => null,
      currentPath: () => '/',
      encodeTitleForUrl: (t) => t.replace(/ /g, '_'),
      getUrlVersionsParams: () => '',
      encodeVtitle: (v) => v,
      fullURL: (href) => (href.startsWith('http') ? href : `https://www.sefaria.org${href}`),
    },
    isSefariaURL: (url) => url.hostname.endsWith('sefaria.org'),
  }};
});

global.ResizeObserver = class { observe() {} unobserve() {} disconnect() {} };

// Same heavy-import stubs as the other ReaderApp prototype tests.
jest.mock("../Misc", () => new Proxy({}, {
  get: (_t, prop) => (prop === "__esModule" ? true : () => null),
}));
jest.mock("../ImageCropper", () => new Proxy({}, {
  get: (_t, prop) => (prop === "__esModule" ? true : () => null),
}));
jest.mock("json-edit-react", () => new Proxy({}, {
  get: (_t, prop) => (prop === "__esModule" ? true : () => null),
}));
jest.mock("react-simple-wysiwyg", () => new Proxy({}, {
  get: (_t, prop) => {
    if (prop === "__esModule") { return true; }
    if (prop === "createButton") { return () => (() => null); }
    return () => null;
  },
}));

import { ReaderApp } from '../ReaderApp.jsx';

const makeHistoryState = ReaderApp.prototype.makeHistoryState;

function textPanel(overrides = {}) {
  return {
    mode: 'Text',
    highlightedRefs: [],
    currentlyVisibleRef: 'Genesis 1',
    currVersions: {},
    settings: { language: 'english', aliyotTorah: 'aliyotOff' },
    ...overrides,
  };
}

function sidebarSearchPanel(query) {
  return {
    mode: 'Connections',
    refs: ['Genesis 1:1'],
    filter: [],
    connectionsMode: 'SidebarSearch',
    sidebarSearchQuery: query,
    versionFilter: [],
    selectedWords: [],
    settings: { language: 'english', aliyotTorah: 'aliyotOff' },
  };
}

function extendedNotesPanel() {
  return {
    mode: 'Text',
    menuOpen: 'extended notes',
    bookRef: 'Genesis',
    currVersions: {},
    settings: { language: 'english', aliyotTorah: 'aliyotOff' },
  };
}

function urlFor(panels) {
  const stub = { state: { panels, showAuth: false }, clonePanel: (p) => p };
  return makeHistoryState.call(stub).url;
}

describe('makeHistoryState sidebar search suffix', () => {
  test('writes sbsq with the panel number and encodes the query', () => {
    const url = urlFor([textPanel(), textPanel(), sidebarSearchPanel('peace & quiet')]);

    expect(url).toContain('&sbsq2=peace%20%26%20quiet');
    expect(url).not.toContain('{i}');
  });
});

describe('makeHistoryState aliyot on the short text+commentary URL', () => {
  test('keeps the first panel aliyot flag in the merged URL', () => {
    const torahPanel = textPanel({
      currentlyVisibleRef: 'Genesis 1',
      settings: { language: 'english', aliyotTorah: 'aliyotOn' },
    });
    const url = urlFor([torahPanel, sidebarSearchPanel('shalom')]);

    expect(url).toContain('&aliyot=1');
  });
});

describe('makeHistoryState extended notes suffix', () => {
  test('each extended-notes panel carries its own panel number once', () => {
    const url = urlFor([textPanel(), extendedNotesPanel(), extendedNotesPanel()]);

    expect(url).toContain('&p2=Genesis&notes2=1');
    expect(url).toContain('&p3=Genesis&notes3=1');
    expect(url).not.toContain('notes23');
  });
});
