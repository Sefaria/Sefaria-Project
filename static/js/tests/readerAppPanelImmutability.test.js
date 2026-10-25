/**
 * ReaderApp panel-state updates: the panel list and the panel objects held in state are
 * treated as immutable. Each update builds a copy and hands it to setState, so the previous
 * state object (which React and componentDidUpdate compare against) is never edited in place.
 *
 * The methods below are called on the prototype with a stub `this` that records setState,
 * so this is the real method without constructing the whole app.
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
    track: { event: () => {} },
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
// json-edit-react (pulled in via ConnectionsPanel -> LexiconContentEditBox) does DOM feature
// detection at import time that jsdom doesn't support (insertAdjacentElement); stubbing it
// avoids ever evaluating the real package, same as the two mocks above.
jest.mock("json-edit-react", () => new Proxy({}, {
  get: (_t, prop) => (prop === "__esModule" ? true : () => null),
}));
// react-simple-wysiwyg (pulled in via LexiconContentEditBox -> LexiconWysiwygValue) injects its
// stylesheet at import time via insertAdjacentElement, same jsdom gap as json-edit-react above.
// createButton(...) is called at module-load time and must itself return a component, not null.
jest.mock("react-simple-wysiwyg", () => new Proxy({}, {
  get: (_t, prop) => {
    if (prop === "__esModule") { return true; }
    if (prop === "createButton") { return () => (() => null); }
    return () => null;
  },
}));

import Sefaria from '../sefaria/sefaria';
import { ReaderApp } from '../ReaderApp.jsx';

const openComparePanel = ReaderApp.prototype.openComparePanel;
const setSelectedWords = ReaderApp.prototype.setSelectedWords;

function stubApp(panels) {
  return {
    state: { panels },
    setState: jest.fn(),
    makePanelState: (props) => ({ ...props }),
  };
}

describe('openComparePanel', () => {
  test('does not overwrite the panel at position n in the previous panels array', () => {
    const textPanel = { mode: 'Text', refs: ['Genesis 1:1'] };
    const otherPanel = { mode: 'Text', refs: ['Exodus 1:1'] };
    const original = [textPanel, otherPanel];
    const app = stubApp(original);

    openComparePanel.call(app, 0, true);

    expect(original[0]).toBe(textPanel);
    expect(original).toHaveLength(2);
    expect(textPanel.compare).toBeUndefined();
    const [{ panels: next }] = app.setState.mock.calls[0];
    expect(next).not.toBe(original);
    expect(next[0].compare).toBe(true);
    expect(next[1]).toBe(otherPanel);
  });
});

describe('setSelectedWords', () => {
  test('writes the selection onto a copy of the connections panel, not the existing object', () => {
    const basePanel = { mode: 'Text', refs: ['Genesis 1:1'] };
    const connectionsPanel = { mode: 'Connections', refs: ['Genesis 1:1'] };
    const original = [basePanel, connectionsPanel];
    const app = stubApp(original);

    setSelectedWords.call(app, 0, 'bereshit');

    expect(connectionsPanel.selectedWords).toBeUndefined();
    expect(original[1]).toBe(connectionsPanel);
    const [{ panels: next }] = app.setState.mock.calls[0];
    expect(next).not.toBe(original);
    expect(next[1]).not.toBe(connectionsPanel);
    expect(next[1].selectedWords).toBe('bereshit');
    expect(next[0]).toBe(basePanel);
  });

  test('does nothing when the next panel is a menu', () => {
    const basePanel = { mode: 'Text', refs: ['Genesis 1:1'] };
    const menuPanel = { mode: 'Text', menuOpen: 'navigation' };
    const app = stubApp([basePanel, menuPanel]);

    setSelectedWords.call(app, 0, 'bereshit');

    expect(app.setState).not.toHaveBeenCalled();
    expect(menuPanel.selectedWords).toBeUndefined();
  });
});
