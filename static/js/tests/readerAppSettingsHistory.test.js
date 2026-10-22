/**
 * ReaderApp.makeHistoryState for the settings page: the settings themselves stay out of browser
 * history, so Back can't bring back stale values and API keys are never stored there.
 *
 * makeHistoryState is called on the prototype with a stub `this`, as in
 * readerAppOpenUrlNavigation.test.js.
 */

jest.mock('../sefaria/sefaria', () => ({ __esModule: true, default: {
  LIBRARY_MODULE: 'library',
  activeModule: 'library',
  _: (k) => k,
  _bilingual: (s) => ({ en: s, he: s }),
  interfaceLang: 'english',
  _getShortInterfaceLang: () => 'en',
  getPageTitle: (title) => title,
  toc: [],
  terms: {},
  _siteSettings: { ABOUT_SIDEBAR_PAGES: [] },
  hebrew: { isHebrew: () => false },
  setup: () => {},
  util: {
    clone: (x) => JSON.parse(JSON.stringify(x)),
    cookie: () => {},
    getUrlVersionsParams: () => '',
  },
}}));

global.ResizeObserver = class { observe() {} unobserve() {} disconnect() {} };

jest.mock("../Misc", () => new Proxy({}, {
  get: (_t, prop) => (prop === "__esModule" ? true : () => null),
}));
jest.mock("../ImageCropper", () => new Proxy({}, {
  get: (_t, prop) => (prop === "__esModule" ? true : () => null),
}));

import { ReaderApp } from '../ReaderApp.jsx';

const settingsPanel = (settingsTab) => ({
  menuOpen: 'settings',
  settingsTab,
  developerProjectId: null,
  accountSettings: { emailNotifications: 'daily', email: 'tova@example.org' },
  developer: { projects: [{ id: 'proj01', keys: [{ id: 'k1', value: 'sfr_secret' }] }] },
});

const historyFor = (panel) => {
  const app = { state: { showAuth: false, panels: [panel] }, clonePanel: ReaderApp.prototype.clonePanel };
  return ReaderApp.prototype.makeHistoryState.call(app);
};

describe('settings page history state', () => {
  it.each(['account', 'developer'])('leaves the settings and API keys out of the %s tab entry', (tab) => {
    const panel = settingsPanel(tab);
    const hist = historyFor(panel);
    expect(hist.url).toBe('/settings/' + tab);
    expect(hist.state.panels[0].settingsTab).toBe(tab);
    expect(hist.state.panels[0].accountSettings).toBeNull();
    expect(hist.state.panels[0].developer).toBeNull();
    expect(JSON.stringify(hist.state)).not.toContain('sfr_secret');
  });

  it('leaves the panel the page renders untouched', () => {
    const panel = settingsPanel('account');
    historyFor(panel);
    expect(panel.accountSettings.emailNotifications).toBe('daily');
    expect(panel.developer.projects[0].keys[0].value).toBe('sfr_secret');
  });
});
