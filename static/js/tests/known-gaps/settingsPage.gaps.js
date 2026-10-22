/**
 * Developer settings behaviour that is wanted but not built yet. Each test title carries
 * "@known-gap <case id>"; these fail until the gap is fixed.
 *
 * Kept out of the default Jest run: the file name doesn't match *.test.js. Run with
 *   npx jest --testMatch '<rootDir>/static/js/tests/known-gaps/*.gaps.js'
 */

jest.mock('../../sefaria/sefaria', () => {
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

jest.mock('../../sefaria/sefariaJquery', () => ({
  __esModule: true,
  default: { cookie: jest.fn(), post: jest.fn(), get: jest.fn() },
}));

jest.mock('../../Misc', () => {
  const Sefaria = require('../../sefaria/sefaria').default;
  return {
    __esModule: true,
    InterfaceText: ({ text, children }) => (text ? text[Sefaria.interfaceLang === 'hebrew' ? 'he' : 'en'] : (children ?? null)),
  };
});

import React from 'react';
import ReactDOM from 'react-dom';
import { act } from 'react-dom/test-utils';
import $ from '../../sefaria/sefariaJquery';
import Sefaria from '../../sefaria/sefaria';
import SettingsPage from '../../SettingsPage.jsx';
import { parseWebsite } from '../../developerSettingsApi';

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
  it('shows a refused confirmation send in the Get started view @known-gap N-C3', async () => {
    mount('developer', UNVERIFIED);
    act(() => { buttonNamed(developerPanel(), 'Get started').click(); });
    respondError(429, 'Wait a minute before asking for another email.');
    await clickAndSettle(buttonNamed(developerPanel(), 'Email me a confirmation link'));
    expect(developerPanel().textContent).toContain('Wait a minute before asking for another email.');
  });

  it('shows the daily-limit refusal in the Get started view @known-gap N-C3', async () => {
    mount('developer', UNVERIFIED);
    act(() => { buttonNamed(developerPanel(), 'Get started').click(); });
    respondError(429, "You've asked for 5 links today. Try again tomorrow, or contact hello@sefaria.org.");
    await clickAndSettle(buttonNamed(developerPanel(), 'Email me a confirmation link'));
    expect(developerPanel().textContent).toContain("You've asked for 5 links today.");
  });

  it('does not say "Sent again." when the resend was refused, and shows why @known-gap N-C3', async () => {
    mount('developer', LINK_SENT);
    respondError(429, 'Wait a minute before asking for another email.');
    await clickAndSettle(buttonNamed(developerPanel(), 'Resend the link'));
    expect(developerPanel().textContent).not.toContain('Sent again.');
    expect(developerPanel().textContent).toContain('Wait a minute before asking for another email.');
  });

  it('shows why Get started failed for a verified account @known-gap N-C3', async () => {
    mount('developer', { ...UNVERIFIED, emailVerified: true });
    respondError(400, 'Confirm your email before turning on developer settings.');
    await clickAndSettle(buttonNamed(developerPanel(), 'Get started'));
    expect(developerPanel().textContent).toContain('Confirm your email before turning on developer settings.');
  });

  it('shows "Your email is already confirmed." when sending is refused for that reason @known-gap N-C3', async () => {
    mount('developer', UNVERIFIED);
    act(() => { buttonNamed(developerPanel(), 'Get started').click(); });
    respondError(400, 'Your email is already confirmed.');
    await clickAndSettle(buttonNamed(developerPanel(), 'Email me a confirmation link'));
    expect(developerPanel().textContent).toContain('Your email is already confirmed.');
  });

  it('does not carry an error from before setup over to the projects page @known-gap N-C3', async () => {
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

describe('a restricted key on an http:// website', () => {
  it('names the origin the gateway checks, with its real scheme @known-gap N-C11', () => {
    const httpProject = project({ websiteUrl: 'http://example.org', keys: [key(1, { restrictToWebsite: true })] });
    mount('developer', { ...DEVELOPER_ON, profile: PROFILE, projects: [httpProject] }, { projectId: 'proj01' });
    const summary = container.querySelector('.devPocRestrictionSummary');
    expect(summary.textContent).toContain('Origin header is http://example.org');
    expect(summary.textContent).not.toContain('https://example.org');
  });
});

describe('key-create errors', () => {
  const startKey = (keys) => {
    jest.useFakeTimers();
    mount('developer', { ...DEVELOPER_ON, profile: PROFILE, projects: [project({ keys })] }, { projectId: 'proj01' });
    act(() => { container.querySelector('[data-agent-action="new-key"]').click(); });
  };
  const submitKey = async () => {
    await act(async () => { container.querySelector('[data-agent-action="create-key"]').click(); await flush(); });
    await advance(4000);
  };

  it('stops or explains a label over 100 characters @known-gap N-C12', async () => {
    startKey([]);
    const input = container.querySelector('#devPocKeyLabel');
    const limited = input.maxLength === 100;
    typeInto(input, 'x'.repeat(101));
    respondError(400, 'The key name can be at most 100 characters.');
    await submitKey();
    expect(limited || developerPanel().textContent.includes('The key name can be at most 100 characters.')).toBe(true);
  });

  it('shows the key-limit message when another tab took the last slot, and refreshes the count @known-gap N-C12', async () => {
    startKey([key(1), key(2), key(3), key(4)]);
    typeInto(container.querySelector('#devPocKeyLabel'), 'Fifth');
    serve({
      'POST projects/proj01/keys': [400, { error: 'A project can have at most 5 keys.' }],
      'GET state': [200, { ...DEVELOPER_ON, profile: PROFILE, projects: [project({ keys: [1, 2, 3, 4, 5].map(n => key(n)) })] }],
    });
    await submitKey();
    expect(developerPanel().textContent).toContain('A project can have at most 5 keys.');
    expect(developerPanel().textContent).toContain('5 of 5 keys');
  });
});

describe('an internationalised website address', () => {
  it('is refused, or kept the way browsers send it (punycode) @known-gap C7', () => {
    const { valid, url } = parseWebsite('דוגמה.co.il');
    expect(!valid || /^https:\/\/xn--[a-z0-9-]+\.co\.il\/?$/.test(url)).toBe(true);
  });
});

describe('the confirmation poll', () => {
  const setVisibility = (state) => {
    Object.defineProperty(document, 'visibilityState', { value: state, configurable: true });
    Object.defineProperty(document, 'hidden', { value: state === 'hidden', configurable: true });
    document.dispatchEvent(new Event('visibilitychange'));
  };
  afterEach(() => { setVisibility('visible'); });

  it('backs off or stops while the tab is hidden @known-gap N-CR13', async () => {
    jest.useFakeTimers();
    mount('developer', LINK_SENT);
    respondWith(LINK_SENT);
    act(() => { setVisibility('hidden'); });
    await advance(60000);
    expect(calls('GET state')).toBeLessThan(5);
  });

  it('stops after the session ends (401) @known-gap N-CR13', async () => {
    jest.useFakeTimers();
    mount('developer', LINK_SENT);
    respondError(401, 'Log in to use developer settings.');
    await advance(60000);
    expect(calls('GET state')).toBeLessThanOrEqual(2);
  });

  it('stops once the link has expired @known-gap N-CR13', async () => {
    jest.useFakeTimers();
    const sentAt = new Date(Date.now() - 4 * 24 * 3600 * 1000).toISOString();
    mount('developer', { ...UNVERIFIED, confirmationSentAt: sentAt });
    respondWith({ ...UNVERIFIED, confirmationSentAt: sentAt });
    await advance(60000);
    expect(calls('GET state')).toBeLessThanOrEqual(1);
  });
});

describe('Hebrew interface', () => {
  it('shows a server error from the developer API in Hebrew @known-gap N-CR15', async () => {
    Sefaria.interfaceLang = 'hebrew';
    openNewProject();
    fillProject({ website: 'daftracker.org' });
    respondError(400, 'Give the project a name.');
    await clickAndSettle(container.querySelector('[data-agent-action="create-project"]'));
    const alert = developerPanel().querySelector('[role="alert"]');
    expect(alert.textContent).toMatch(HEBREW);
  });
});

describe('changing the email in the Account tab', () => {
  it('asks to confirm the new address on the Developer tab without a reload @known-gap N-C8', () => {
    const setUp = { developerEnabled: true, ssoConnected: false, emailVerified: true, profile: PROFILE, projects: [project()] };
    mount('account', setUp);
    act(() => { container.querySelector('#change-email').click(); });
    typeInto(container.querySelector('#username-change-edit #email'), 'new@example.org');
    typeInto(container.querySelector('#username-change-edit #confirmEmail'), 'new@example.org');
    typeInto(container.querySelector('#username-change-edit #confirmPassword'), 'secret');
    act(() => { container.querySelector('#update-email').click(); });
    const [, , callback] = $.post.mock.calls[$.post.mock.calls.length - 1];
    respondWith({ ...setUp, emailVerified: false });
    act(() => { callback({ status: 'ok' }); });
    render({ tab: 'developer' });
    expect(developerPanel().querySelector('[aria-label="Confirm your new email"]')).toBeTruthy();
    expect(developerPanel().querySelector('[data-agent-action="new-project"]')).toBeNull();
  });
});
