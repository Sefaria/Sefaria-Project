/**
 * The in-browser mock of the developer settings API: the rules it enforces, and the mock-only
 * pages around SettingsPage.
 */

jest.mock('../sefaria/sefaria', () => {
  const sefaria = {
    interfaceLang: 'english',
    full_name: 'Tova Levi',
    _email: 'tova@example.org',
    _: (k) => k,
    track: { event: () => {} },
  };
  sefaria._v = (options) => options[sefaria.interfaceLang === 'hebrew' ? 'he' : 'en'];
  return { __esModule: true, default: sefaria };
});

jest.mock('../sefaria/sefariaJquery', () => ({ __esModule: true, default: { cookie: () => {}, post: () => {}, get: () => {} } }));

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
import { emptyBlob, handle, PREVIOUS_ACCOUNT_EMAIL } from '../developerSettingsMock';
import { MockEmailLandingPage, MockSettingsPage } from '../DeveloperSettingsMockPages';

const EMAIL = 'tova@example.org';
const CTX = { email: EMAIL, realProviders: [] };
const PROFILE = {
  developerName: 'Tova Levi', description: '', additionalEmail: '',
  termsAccepted: true, developerNews: false, notADeveloper: false,
};
const blob = (fields = {}) => ({ ...emptyBlob(), ...fields });
const SET_UP = { developerEnabled: true, ssoOverride: true, profile: PROFILE };
const PROJECT = {
  id: 'p1', name: 'Daf Tracker', description: 'A tracker', organization: '', websiteUrl: 'https://daftracker.org',
  visibility: 'private', aiAssisted: false, consentWithdrawnAt: null, listingId: null, createdAt: '2026-09-01T00:00:00Z', keys: [],
};
const KEY = { id: 'k1', label: 'Production', value: 'sfr_test_x', created: '2026-09-01T00:00:00Z', restrictToWebsite: false };

/* Runs requests in turn, each on the blob the one before left: [status, body, blob] of the last. */
const run = (start, ...requests) => requests.reduce(
  ([, , b], [method, path, body]) => handle(b, CTX, method, path, body), [200, null, start],
);

describe('the mock API', () => {
  it('answers with the whole developer state', () => {
    const [status, state] = run(blob(SET_UP), ['GET', 'state']);
    expect(status).toBe(200);
    expect(Object.keys(state).sort()).toEqual([
      'confirmationSentAt', 'developerEnabled', 'emailVerified', 'maxKeysPerProject', 'mock',
      'profile', 'projects', 'ssoConnected', 'yourListing',
    ]);
    expect(state.maxKeysPerProject).toBe(5);
  });

  it('starts over from an older version of the mock data', () => {
    const [, state] = run({ version: 1, developerEnabled: true, projects: [{ id: 'x' }] }, ['GET', 'state']);
    expect(state.developerEnabled).toBe(false);
    expect(state.projects).toEqual([]);
  });

  it('answers 404 for an unknown route and 405 for the wrong method', () => {
    expect(run(blob(), ['GET', 'nothing'])[0]).toBe(404);
    expect(run(blob(), ['GET', 'enable'])[0]).toBe(405);
  });
});

describe('verification', () => {
  it("won't turn developer settings on before the email is confirmed", () => {
    const [status, body] = run(blob({ ssoOverride: false }), ['POST', 'enable']);
    expect(status).toBe(400);
    expect(body.error).toBe('Confirm your email before turning on developer settings.');
  });

  it('counts the real Google or Apple login unless the test controls pretend otherwise', () => {
    const real = { email: EMAIL, realProviders: ['google'] };
    expect(handle(blob(), real, 'GET', 'state')[1].ssoConnected).toBe(true);
    expect(handle(blob({ ssoOverride: false }), real, 'GET', 'state')[1].ssoConnected).toBe(false);
  });

  it('limits confirmation emails to one a minute', () => {
    const [status, body] = run(blob({ ssoOverride: false }), ['POST', 'confirmation'], ['POST', 'confirmation']);
    expect(status).toBe(429);
    expect(body.error).toBe('Wait a minute before asking for another email.');
  });

  it('limits confirmation emails to five a day', () => {
    const earlier = [50, 40, 30, 20, 10].map(m => new Date(Date.now() - m * 60000).toISOString());
    const [status, body] = run(blob({ ssoOverride: false, confirmationSends: earlier }), ['POST', 'confirmation']);
    expect(status).toBe(429);
    expect(body.error).toContain("You've asked for 5 links today");
  });

  it('keeps the same link when it is sent again', () => {
    const later = new Date(Date.now() - 2 * 60000).toISOString();
    const [, , b] = run(blob({ ssoOverride: false, confirmationSentTo: EMAIL, confirmationToken: 'abcdefgh12345678', confirmationSends: [later] }),
      ['POST', 'confirmation']);
    expect(b.confirmationToken).toBe('abcdefgh12345678');
  });

  it('takes a link opened anywhere as confirmation, and turns developer settings on', () => {
    const [, state] = run(blob({ ssoOverride: false, confirmationSentTo: EMAIL, emailVerified: true }), ['GET', 'state']);
    expect(state).toMatchObject({ emailVerified: true, developerEnabled: true, confirmationSentAt: null });
  });

  it('ends verification when the account email changes, keeping what was set up', () => {
    const [, state] = run(blob({ ...SET_UP, ssoOverride: false, verifiedEmail: PREVIOUS_ACCOUNT_EMAIL, projects: [{ ...PROJECT, keys: [KEY] }] }),
      ['GET', 'state']);
    expect(state.emailVerified).toBe(false);
    expect(state.developerEnabled).toBe(true);
    expect(state.projects[0].keys.length).toBe(1);
  });

  it('only shows a link sent to the current account email as pending', () => {
    const [, state] = run(blob({ ssoOverride: false, confirmationSentAt: '2026-10-11T00:00:00Z', confirmationSentTo: PREVIOUS_ACCOUNT_EMAIL }),
      ['GET', 'state']);
    expect(state.confirmationSentAt).toBeNull();
  });
});

describe('projects and keys', () => {
  const changed = { ...SET_UP, ssoOverride: false, verifiedEmail: PREVIOUS_ACCOUNT_EMAIL, projects: [{ ...PROJECT, keys: [KEY] }] };

  it('need developer settings set up', () => {
    const [status, body] = run(blob({ ssoOverride: true }), ['POST', 'projects', { project: { name: 'X', visibility: 'private' } }]);
    expect(status).toBe(403);
    expect(body.error).toBe('Developer settings are not set up for this account.');
  });

  it('need a confirmed email to create, but not to manage', () => {
    expect(run(blob(changed), ['POST', 'projects', { project: { name: 'X', visibility: 'private' } }])[1].error)
      .toBe('Confirm your email address to create projects and keys.');
    expect(run(blob(changed), ['POST', 'projects/p1/keys', { label: 'Two' }])[0]).toBe(403);
    expect(run(blob(changed), ['DELETE', 'keys/k1'])[0]).toBe(200);
    expect(run(blob(changed), ['DELETE', 'projects/p1'])[0]).toBe(200);
  });

  it('answer 404 for a project or key that is not there', () => {
    expect(run(blob(SET_UP), ['POST', 'projects/nope/keys', { label: 'A' }])).toEqual(expect.arrayContaining([404, { error: 'No such project.' }]));
    expect(run(blob(SET_UP), ['DELETE', 'keys/nope'])[1].error).toBe('No such key.');
  });

  it('validate project fields like the server', () => {
    expect(run(blob(SET_UP), ['POST', 'projects', { project: { name: '', visibility: 'public' } }])[1].error).toBe('Give the project a name.');
    expect(run(blob(SET_UP), ['POST', 'projects', { project: { name: 'X' } }])[1].error).toBe('Choose whether the project is public or private.');
    expect(run(blob(SET_UP), ['POST', 'projects', { project: { name: 'X', visibility: 'public', websiteUrl: 'nope' } }])[1].error)
      .toBe('The website is not a valid web address.');
  });

  it('allow five active keys a project', () => {
    const keys = [1, 2, 3, 4, 5].map(n => ({ ...KEY, id: 'k' + n }));
    const [status, body] = run(blob({ ...SET_UP, projects: [{ ...PROJECT, keys }] }), ['POST', 'projects/p1/keys', { label: 'Six' }]);
    expect(status).toBe(400);
    expect(body.error).toBe('A project can have at most 5 keys.');
  });

  it('restrict a key only to a project website, and lift it when the website goes', () => {
    const noSite = blob({ ...SET_UP, projects: [{ ...PROJECT, websiteUrl: '', keys: [KEY] }] });
    expect(run(noSite, ['POST', 'keys/k1', { restrictToWebsite: true }])[1].error)
      .toBe("Add the project's website before restricting a key to it.");
    const [, state] = run(blob({ ...SET_UP, projects: [{ ...PROJECT, keys: [KEY] }] }),
      ['POST', 'keys/k1', { restrictToWebsite: true }],
      ['POST', 'projects/p1', { project: { ...PROJECT, websiteUrl: '' } }]);
    expect(state.projects[0].keys[0].restrictToWebsite).toBe(false);
  });

  it('fails the next key creation once when asked to', () => {
    const start = blob({ ...SET_UP, projects: [PROJECT], failNext: 'key' });
    expect(run(start, ['POST', 'projects/p1/keys', { label: 'A' }])[0]).toBe(500);
    expect(run(start, ['POST', 'projects/p1/keys', { label: 'A' }], ['POST', 'projects/p1/keys', { label: 'A' }])[0]).toBe(200);
  });
});

describe('Powered by listings', () => {
  const withListing = (fields = {}) => run(blob({ ...SET_UP, ...fields }), ['POST', 'mock', { action: 'create-listing' }]);

  it('offer a listing submitted with the account email once the email is confirmed', () => {
    expect(withListing()[1].yourListing).toMatchObject({ name: 'Daf Yomi Companion', url: 'https://dafyomicompanion.org' });
    expect(withListing({ ssoOverride: false })[1].yourListing).toBeNull();
    expect(withListing()[1].yourListing.submitterEmail).toBeUndefined();
  });

  it('turn a claimed listing into a public project linked to it', () => {
    const [, first, b] = withListing();
    const [, state] = run(b, ['POST', 'listings/' + first.yourListing.id + '/claim']);
    expect(state.projects[0]).toMatchObject({ name: 'Daf Yomi Companion', visibility: 'public', linkedListing: true });
    expect(state.projectId).toBe(state.projects[0].id);
    expect(state.yourListing).toBeNull();
  });

  it('stop asking about a dismissed listing', () => {
    const [, first, b] = withListing();
    expect(run(b, ['POST', 'listings/' + first.yourListing.id + '/dismiss'])[1].yourListing).toBeNull();
    expect(run(b, ['POST', 'listings/999/dismiss'])[1].error).toBe('No such listing.');
  });

  it('are released when the test controls start over', () => {
    const [, first, b] = withListing();
    const [, , claimed] = run(b, ['POST', 'listings/' + first.yourListing.id + '/claim']);
    const [, state] = run(claimed, ['POST', 'mock', { action: 'start-over', ssoOverride: true }], ['POST', 'enable'],
      ['POST', 'profile', { profile: PROFILE }]);
    expect(state.projects).toEqual([]);
    expect(state.yourListing).toMatchObject({ name: 'Daf Yomi Companion' });
  });
});

describe('test scenarios', () => {
  const scenario = (action, fields, start = blob()) => run(start, ['POST', 'mock', { action, ...fields }]);

  it('jump to a Google account with a project', () => {
    const [, state] = scenario('sample');
    expect(state).toMatchObject({ ssoConnected: true, developerEnabled: true });
    expect(state.projects[0].keys.length).toBe(2);
    expect(state.projectId).toBe(state.projects[0].id);
  });

  it('jump to an email account waiting for its link', () => {
    const [, state] = scenario('link-sent');
    expect(state.confirmationSentAt).toBeTruthy();
    expect(state.mock.confirmationKey).toMatch(/^[a-z0-9]{16}$/);
  });

  it('jump to an account whose email changed', () => {
    const [, state] = scenario('email-changed');
    expect(state).toMatchObject({ developerEnabled: true, ssoConnected: false, emailVerified: false });
    expect(state.projects.length).toBe(1);
  });

  it('jump to a project added by staff after outreach', () => {
    const [, state] = scenario('outreach');
    expect(state).toMatchObject({ emailVerified: true, developerEnabled: true, profile: null });
    expect(state.projects[0].linkedListing).toBe(true);
  });

  it('fill a project to the key limit', () => {
    const [, state] = scenario('fill-keys', {}, blob({ ...SET_UP, projects: [PROJECT] }));
    expect(state.projects[0].keys.length).toBe(5);
    expect(state.projectId).toBe('p1');
  });

  it('use up and reset the confirmation emails', () => {
    const [, used, b] = scenario('send-limit', { reached: true }, blob({ ssoOverride: false }));
    expect(used.mock.confirmationSendsToday).toBe(5);
    expect(run(b, ['POST', 'confirmation'])[0]).toBe(429);
    expect(run(b, ['POST', 'mock', { action: 'send-limit', reached: false }], ['POST', 'confirmation'])[0]).toBe(200);
  });

  it('reject an unknown action', () => {
    expect(scenario('nope')[1].error).toBe('Unknown test action.');
  });
});


describe('mock pages', () => {
  let container = null;
  let session = null;
  const render = (element) => {
    container = document.createElement('div');
    document.body.appendChild(container);
    act(() => { ReactDOM.render(element, container); });
  };
  const flush = async () => { for (let i = 0; i < 30; i++) { await Promise.resolve(); } };

  beforeEach(() => {
    session = null;
    global.fetch = jest.fn((url, options = {}) => {
      if (options.method === 'POST') { session = JSON.parse(options.body); }
      return Promise.resolve({ ok: true, json: () => Promise.resolve(session) });
    });
    window.scrollTo = jest.fn();
  });

  afterEach(() => {
    ReactDOM.unmountComponentAtNode(container);
    container.remove();
    window.history.replaceState(null, '', '/');
  });

  it('always show the developer tab, with both test panels', () => {
    render(<MockSettingsPage tab="account" projectId={null} developerPoc={null} accountSettings={{ socialProviders: [] }}
      setTab={() => {}} setProjectId={() => {}} />);
    expect(Array.from(container.querySelectorAll('nav.settingsNav a')).map(a => a.getAttribute('href')))
      .toEqual(['/settings/account', '/settings/developer']);
    expect(container.querySelectorAll('.devPocPanel').length).toBe(2);
  });

  it('jump to a state from the extra test panel, opening its project', async () => {
    const setTab = jest.fn();
    const setProjectId = jest.fn();
    render(<MockSettingsPage tab="developer" projectId={null} developerPoc={null} accountSettings={{ socialProviders: [] }}
      setTab={setTab} setProjectId={setProjectId} />);
    await act(async () => { container.querySelector('[data-poc-control="email-changed"]').click(); await flush(); });
    expect(setTab).toHaveBeenCalledWith('developer');
    expect(setProjectId).toHaveBeenCalledWith(session.projects[0].id);
    expect(container.textContent).toContain('Confirm your new email address');
  });

  it('show the page for an expired link from ?link=expired', () => {
    window.history.replaceState(null, '', '/settings/developer/email-confirmed?link=expired');
    render(<MockEmailLandingPage />);
    expect(container.querySelector('h1').textContent).toBe('This link has expired');
  });

  it('show the thank-you page without a link status', () => {
    window.history.replaceState(null, '', '/settings/developer/email-confirmed');
    render(<MockEmailLandingPage />);
    expect(container.querySelector('h1').textContent).toBe('Thank you for confirming your email');
  });
});
