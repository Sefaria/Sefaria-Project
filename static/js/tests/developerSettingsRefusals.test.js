/**
 * Developer settings when the server refuses or the session changes: refused confirmation
 * emails, refused keys, the confirmation poll and an account email change.
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

describe('errors before setup', () => {
  it('shows a refused confirmation send in the Get started view', async () => {
    mount('developer', UNVERIFIED);
    act(() => { buttonNamed(developerPanel(), 'Get started').click(); });
    respondError(429, 'Wait a minute before asking for another email.');
    await clickAndSettle(buttonNamed(developerPanel(), 'Email me a confirmation link'));
    expect(developerPanel().textContent).toContain('Wait a minute before asking for another email.');
  });

  it('shows the daily-limit refusal in the Get started view', async () => {
    mount('developer', UNVERIFIED);
    act(() => { buttonNamed(developerPanel(), 'Get started').click(); });
    respondError(429, "You've asked for 5 links today. Try again tomorrow, or contact hello@sefaria.org.");
    await clickAndSettle(buttonNamed(developerPanel(), 'Email me a confirmation link'));
    expect(developerPanel().textContent).toContain("You've asked for 5 links today.");
  });

  it('does not say "Sent again." when the resend was refused, and shows why', async () => {
    mount('developer', LINK_SENT);
    respondError(429, 'Wait a minute before asking for another email.');
    await clickAndSettle(buttonNamed(developerPanel(), 'Resend the link'));
    expect(developerPanel().textContent).not.toContain('Sent again.');
    expect(developerPanel().textContent).toContain('Wait a minute before asking for another email.');
  });

  it('shows why Get started failed for a verified account', async () => {
    mount('developer', { ...UNVERIFIED, emailVerified: true });
    respondError(400, 'Confirm your email before turning on developer settings.');
    await clickAndSettle(buttonNamed(developerPanel(), 'Get started'));
    expect(developerPanel().textContent).toContain('Confirm your email before turning on developer settings.');
  });

  it('shows "Your email is already confirmed." when sending is refused for that reason', async () => {
    mount('developer', UNVERIFIED);
    act(() => { buttonNamed(developerPanel(), 'Get started').click(); });
    respondError(400, 'Your email is already confirmed.');
    await clickAndSettle(buttonNamed(developerPanel(), 'Email me a confirmation link'));
    expect(developerPanel().textContent).toContain('Your email is already confirmed.');
  });

  it('does not carry an error from before setup over to the projects page', async () => {
    jest.useFakeTimers();
    mount('developer', LINK_SENT);
    respondError(429, 'Wait a minute before asking for another email.');
    await clickAndSettle(buttonNamed(developerPanel(), 'Resend the link'));

    const confirmed = { ...UNVERIFIED, emailVerified: true, developerEnabled: true, confirmationSentAt: null };
    respondWith(confirmed);
    await advance(3000);
    await advance(2000);
    expect(developerPanel().textContent).toContain('About you');

    act(() => { container.querySelector('.devPocLegal input[type="checkbox"]').click(); });
    respondWith({ ...confirmed, profile: PROFILE, projects: [] });
    await clickAndSettle(container.querySelector('[data-agent-action="save-profile"]'));
    expect(developerPanel().textContent).toContain('No projects yet');
    expect(developerPanel().textContent).not.toContain('Wait a minute');
  });
});
