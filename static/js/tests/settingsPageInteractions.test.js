/**
 * Developer settings interactions that cross components: the listing question while another
 * tab is showing, double clicks on buttons that send a request, and Back from a project URL.
 */

jest.mock('../sefaria/sefaria', () => {
  const sefaria = {
    interfaceLang: 'english',
    full_name: 'Tova Levi',
    _email: 'tova@example.org',
    _: (k) => k,
    track: { event: () => {}, setInterfaceLanguage: () => {} },
  };
  sefaria._v = (options) => options[sefaria.interfaceLang === 'hebrew' ? 'he' : 'en'];
  return { __esModule: true, default: sefaria };
});

jest.mock('../sefaria/sefariaJquery', () => ({
  __esModule: true,
  default: { cookie: jest.fn(), post: jest.fn(), get: jest.fn() },
}));

jest.mock('../Misc', () => {
  const Sefaria = require('../sefaria/sefaria').default;
  return {
    __esModule: true,
    InterfaceText: ({ text, children }) => (text ? text[Sefaria.interfaceLang === 'hebrew' ? 'he' : 'en'] : (children ?? null)),
  };
});

import React from 'react';
import ReactDOM from 'react-dom';
import { act } from 'react-dom/test-utils';
import $ from '../sefaria/sefariaJquery';
import Sefaria from '../sefaria/sefaria';
import SettingsPage from '../SettingsPage.jsx';
import { parseWebsite } from '../developerSettingsApi';

const HEBREW = /[֐-׿]/;
const DEVELOPER_ON = { developerEnabled: true, ssoConnected: true };
const PROFILE = {
  developerName: 'Tova Levi', description: '', additionalEmail: '',
  termsAccepted: true, developerNews: false, notADeveloper: false,
};
const UNVERIFIED = { developerEnabled: false, ssoConnected: false, emailVerified: false };
const LINK_SENT = { ...UNVERIFIED, confirmationSentAt: '2026-10-11T00:00:00Z' };
const LISTING = {
  id: '42', name: 'Mishnah Yomit Tracker', url: 'https://mishnahtracker.app',
  description: 'Track your daily two mishnayot and share progress with a study group.',
};
const project = (extra = {}) => ({
  id: 'proj01', name: 'Daf Tracker', description: 'A tracker', visibility: 'public', organization: '',
  websiteUrl: 'https://daftracker.org', aiAssisted: false, linkedListing: false,
  consentWithdrawnAt: null, keys: [], ...extra,
});
const key = (n, extra = {}) => ({
  id: 'k' + n, label: 'Key ' + n, value: 'sfr_test_' + n, created: null, restrictToWebsite: false, ...extra,
});

let container = null;
let props = null;

function render(next) {
  props = { ...props, ...next };
  act(() => { ReactDOM.render(<SettingsPage {...props} />, container); });
}

function mount(tab, developer = {}, extra = {}) {
  container = document.createElement('div');
  document.body.appendChild(container);
  props = {
    tab,
    projectId: null,
    accountSettings: { socialProviders: [], email: 'tova@example.org', emailNotifications: 'daily' },
    initialDeveloper: developer,
    setTab: () => {},
    setProjectId: () => {},
  };
  render(extra);
}

/* fetch answers by method and path under /api/developer/; anything unrouted gets the default. */
const answer = (status, body) => Promise.resolve({ ok: status < 400, status, json: () => Promise.resolve(body) });
const serve = (routes, fallback = [200, {}]) => {
  global.fetch = jest.fn((url, options) => {
    const route = (options.method || 'GET') + ' ' + url.replace('/api/developer/', '');
    const [status, body] = routes[route] || fallback;
    return answer(status, body);
  });
};
const respondWith = (state) => serve({}, [200, state]);
const respondError = (status, error) => serve({}, [status, { error }]);
const calls = (route) => global.fetch.mock.calls.filter(([url, options]) => (
  (options.method || 'GET') + ' ' + url.replace('/api/developer/', '')) === route).length;

const flush = async () => { for (let i = 0; i < 5; i++) { await Promise.resolve(); } };
const clickAndSettle = async (element) => { await act(async () => { element.click(); await flush(); }); };
const advance = async (ms) => { await act(async () => { jest.advanceTimersByTime(ms); await flush(); }); };

const accountPanel = () => container.querySelectorAll('.settingsPanel')[0];
const developerPanel = () => container.querySelectorAll('.settingsPanel')[1];
const buttonNamed = (root, name) => Array.from(root.querySelectorAll('button')).find(b => b.textContent.trim() === name);
const yourListingDialog = () => container.querySelector('[aria-labelledby="devPocYourListingTitle"]');
const noWebsiteDialog = () => container.querySelector('[aria-labelledby="devPocNoWebsiteTitle"]');

const typeInto = (input, value) => {
  const proto = input.tagName === 'TEXTAREA' ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
  act(() => {
    Object.getOwnPropertyDescriptor(proto, 'value').set.call(input, value);
    input.dispatchEvent(new Event('input', { bubbles: true }));
  });
};

const openNewProject = (developer = {}) => {
  mount('developer', { ...DEVELOPER_ON, profile: PROFILE, projects: [], ...developer });
  act(() => { container.querySelector('[data-agent-action="new-project"]').click(); });
};
const fillProject = ({ website = '' } = {}) => {
  typeInto(container.querySelector('#devPocProjectName'), 'Daf Tracker');
  typeInto(container.querySelector('#devPocProjectDescription'), 'A tracker');
  if (website) { typeInto(container.querySelector('#devPocProjectUrl'), website); }
  act(() => { container.querySelector('#devPocVisibilityPublic').click(); });
};
const submitProject = () => {
  const submit = container.querySelector('[data-agent-action="create-project"]');
  act(() => { submit.focus(); submit.click(); });
};

const pressOn = (target, keyName, init = {}) => {
  const event = new KeyboardEvent('keydown', { key: keyName, bubbles: true, cancelable: true, ...init });
  act(() => { target.dispatchEvent(event); });
  return event;
};

beforeEach(() => {
  Sefaria.interfaceLang = 'english';
  respondWith({});
  window.scrollTo = jest.fn();
  $.post.mockReset();
});

afterEach(() => {
  jest.useRealTimers();
  if (!container) { return; }
  ReactDOM.unmountComponentAtNode(container);
  container.remove();
  container = null;
});

describe('the Account tab of a developer with an unclaimed listing', () => {
  const mountAccountWithListing = () => mount('account', {
    ...DEVELOPER_ON, profile: PROFILE, projects: [], yourListing: LISTING,
  });

  it('leaves Tab to the browser on the Account tab', () => {
    mountAccountWithListing();
    const changeEmail = container.querySelector('#change-email');
    act(() => { changeEmail.focus(); });
    const tab = pressOn(changeEmail, 'Tab');
    expect(tab.defaultPrevented).toBe(false);
  });

  it('does not move focus into the hidden developer panel on load', () => {
    mountAccountWithListing();
    expect(developerPanel().contains(document.activeElement)).toBe(false);
  });

  it('does not answer the hidden listing question when Escape is pressed on the Account tab', () => {
    mountAccountWithListing();
    const changeEmail = container.querySelector('#change-email');
    act(() => { changeEmail.focus(); });
    pressOn(changeEmail, 'Escape');
    render({ tab: 'developer' });
    expect(yourListingDialog()).toBeTruthy();
  });
});

describe('double clicks', () => {
  const never = () => { global.fetch = jest.fn(() => new Promise(() => {})); };

  it('creates one project from a double-clicked "Create project"', () => {
    openNewProject();
    fillProject({ website: 'daftracker.org' });
    never();
    const submit = container.querySelector('[data-agent-action="create-project"]');
    act(() => { submit.click(); });
    act(() => { submit.click(); });
    expect(calls('POST projects')).toBe(1);
  });

  it('claims a listing once from a double-clicked "Yes, add it"', () => {
    mount('developer', { ...DEVELOPER_ON, profile: PROFILE, projects: [], yourListing: LISTING });
    never();
    const yes = container.querySelector('[data-agent-action="claim-listing"]');
    act(() => { yes.click(); });
    act(() => { yes.click(); });
    expect(calls('POST listings/42/claim')).toBe(1);
  });
});

describe('Back from a project URL', () => {
  it('collapses the project card when the URL no longer names it', () => {
    mount('developer', { ...DEVELOPER_ON, profile: PROFILE, projects: [project()] }, { projectId: 'proj01' });
    const toggle = () => container.querySelector('.devPocProjectToggle');
    expect(toggle().getAttribute('aria-expanded')).toBe('true');
    render({ projectId: null });
    expect(toggle().getAttribute('aria-expanded')).toBe('false');
  });
});
