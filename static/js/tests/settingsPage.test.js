/**
 * SettingsPage: the settings tabs and the developer settings POC.
 *
 * No React Testing Library in this repo -- react-dom directly, same pattern as
 * static/js/tests/searchResultCardAuxClick.test.js.
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
import Sefaria from '../sefaria/sefaria';
import SettingsPage, { EmailConfirmedPage } from '../SettingsPage.jsx';
import { parseWebsite } from '../developerPocStore';

let container = null;

const DEVELOPER_ON = { developerEnabled: true, ssoOverride: true };
const PROFILE = {
  developerName: 'Tova Levi', description: '', additionalEmail: '',
  termsAccepted: true, developerNews: false, notADeveloper: false,
};

function mount(tab, developerPoc = null, props = {}) {
  container = document.createElement('div');
  document.body.appendChild(container);
  act(() => {
    ReactDOM.render(
      <SettingsPage
        tab={tab}
        projectId={null}
        accountSettings={{ socialProviders: [], email: 'tova@example.org' }}
        initialDeveloperPoc={developerPoc}
        setTab={() => {}}
        setProjectId={() => {}}
        {...props}
      />,
      container,
    );
  });
}

const typeInto = (input, value) => {
  const proto = input.tagName === 'SELECT' ? HTMLSelectElement.prototype : HTMLInputElement.prototype;
  act(() => {
    Object.getOwnPropertyDescriptor(proto, 'value').set.call(input, value);
    input.dispatchEvent(new Event(input.tagName === 'SELECT' ? 'change' : 'input', { bubbles: true }));
  });
};

const lastSavedState = () => JSON.parse(global.fetch.mock.calls[global.fetch.mock.calls.length - 1][1].body);

const developerPanel = () => container.querySelectorAll('.settingsPanel')[1];
const buttonNamed = (root, name) => Array.from(root.querySelectorAll('button')).find(b => b.textContent.trim() === name);

beforeEach(() => {
  Sefaria.interfaceLang = 'english';
  global.fetch = jest.fn(() => Promise.resolve({ ok: true }));
  window.scrollTo = jest.fn();
});

afterEach(() => {
  if (!container) { return; }
  ReactDOM.unmountComponentAtNode(container);
  container.remove();
  container = null;
});

describe('settings tabs', () => {
  it('shows both tabs to a user who never opened developer settings', () => {
    mount('account');
    const links = Array.from(container.querySelectorAll('nav.settingsNav a'));
    expect(links.map(a => a.getAttribute('href'))).toEqual(['/settings/account', '/settings/developer']);
    expect(links[0].getAttribute('aria-current')).toBe('page');
  });

  it('keeps developer settings out of the account tab', () => {
    mount('account');
    const accountPanel = container.querySelectorAll('.settingsPanel')[0];
    expect(accountPanel.querySelector('#developerSettings')).toBeNull();
    expect(accountPanel.textContent).not.toContain('Get started');
  });

  it('gates the developer tab behind Get started', () => {
    mount('developer');
    expect(buttonNamed(developerPanel(), 'Get started')).toBeTruthy();
    expect(container.querySelectorAll('nav.settingsNav a')[1].getAttribute('aria-current')).toBe('page');
  });
});

describe('developer onboarding', () => {
  it('shows the account name and email locked', () => {
    mount('developer', DEVELOPER_ON);
    const name = container.querySelector('#devPocName');
    const email = container.querySelector('#devPocEmail');
    expect(name.value).toBe('Tova Levi');
    expect(name.readOnly).toBe(true);
    expect(email.value).toBe('tova@example.org');
    expect(email.readOnly).toBe(true);
    expect(container.querySelector('#devPocEmail2').readOnly).toBe(false);
  });

  it('has no info tips on the locked fields, but describes them to assistive tech', () => {
    mount('developer', DEVELOPER_ON);
    ['#devPocName', '#devPocEmail'].forEach(selector => {
      const input = container.querySelector(selector);
      expect(input.closest('.devPocField').querySelector('.devPocInfoButton')).toBeNull();
      expect(document.getElementById(input.getAttribute('aria-describedby')).textContent).toContain('From your Sefaria account');
    });
  });

  it('keeps info tips out of the tab order, with their text on the field', () => {
    mount('developer', DEVELOPER_ON);
    const buttons = Array.from(container.querySelectorAll('.devPocInfoButton'));
    expect(buttons.length).toBeGreaterThan(0);
    buttons.forEach(b => {
      expect(b.tabIndex).toBe(-1);
      expect(b.getAttribute('aria-hidden')).toBe('true');
    });
    const extra = container.querySelector('#devPocEmail2');
    const note = document.getElementById(extra.getAttribute('aria-describedby'));
    expect(note.textContent).toContain('Add another address');
    expect(note.hidden).toBe(true);

    act(() => { extra.focus(); });
    expect(extra.closest('.devPocField').querySelector('.devPocPopover').textContent).toContain('Add another address');
    act(() => { extra.blur(); });
    expect(extra.closest('.devPocField').querySelector('.devPocPopover')).toBeNull();
  });

  it("doesn't change the copy when the user doesn't write code", () => {
    mount('developer', DEVELOPER_ON);
    const before = developerPanel().textContent;
    const checkbox = Array.from(container.querySelectorAll('.devPocChoice'))
      .find(label => label.textContent.includes("I don't write code myself")).querySelector('input');
    act(() => { checkbox.click(); });
    expect(checkbox.checked).toBe(true);
    expect(developerPanel().textContent).toBe(before);
  });
});

const openNewProject = (state = {}, props = {}) => {
  mount('developer', { ...DEVELOPER_ON, profile: PROFILE, projects: [], ...state }, props);
  act(() => { container.querySelector('[data-agent-action="new-project"]').click(); });
  typeInto(container.querySelector('#devPocProjectName'), 'Daf Tracker');
};

const visibilityRadio = (value) => container.querySelector(`input[name="devPocVisibility"][value="${value}"]`);
const submitProject = () => act(() => { container.querySelector('[data-agent-action="create-project"]').click(); });

describe('project visibility', () => {
  it('has nothing preselected, and recommends neither option', () => {
    openNewProject();
    expect(container.querySelector('input[name="devPocVisibility"]:checked')).toBeNull();
    expect(container.querySelector('.devPocFieldset').textContent).not.toContain('Recommended');
  });

  it("won't save until a visibility is chosen", () => {
    openNewProject();
    typeInto(container.querySelector('#devPocProjectDescription'), 'A tracker');
    typeInto(container.querySelector('#devPocProjectUrl'), 'daftracker.org');
    submitProject();
    expect(container.querySelector('[role="alert"]').textContent).toContain('Choose whether the project is public or private');
    expect(container.querySelector('.devPocNewProject')).toBeTruthy();
  });

  it('chooses Public without a confirmation', () => {
    openNewProject();
    act(() => { visibilityRadio('public').click(); });
    expect(visibilityRadio('public').checked).toBe(true);
    expect(container.querySelector('[role="dialog"]')).toBeNull();
  });

  it('shows what will be public on request, with only a Close button', () => {
    openNewProject();
    act(() => { buttonNamed(container, 'Show me what will be public').click(); });
    const dialog = container.querySelector('[aria-labelledby="devPocPublicTitle"]');
    expect(dialog.textContent).toContain('Daf Tracker');
    expect(dialog.textContent).toContain('Tova Levi');
    expect(Array.from(dialog.querySelectorAll('button')).map(b => b.textContent.trim())).toEqual(['Close']);
    expect(dialog.querySelector('a')).toBeNull();

    act(() => { buttonNamed(dialog, 'Close').click(); });
    expect(container.querySelector('[aria-labelledby="devPocPublicTitle"]')).toBeNull();
    expect(container.querySelector('input[name="devPocVisibility"]:checked')).toBeNull();
  });
});

describe('short description', () => {
  it('is limited to 150 characters, with a counter', () => {
    openNewProject();
    const description = container.querySelector('#devPocProjectDescription');
    expect(description.maxLength).toBe(150);
    typeInto(description, 'A daily tracker');
    expect(container.querySelector('#devPocProjectDescriptionCount').textContent).toBe('15/150');
  });
});

describe('project website', () => {
  it('accepts a bare domain and adds https://', () => {
    expect(parseWebsite('example.com')).toEqual({ valid: true, url: 'https://example.com' });
    expect(parseWebsite('  www.example.co.il/app ')).toEqual({ valid: true, url: 'https://www.example.co.il/app' });
    expect(parseWebsite('http://example.org')).toEqual({ valid: true, url: 'http://example.org' });
    expect(parseWebsite('')).toEqual({ valid: true, url: '' });
  });

  it('rejects input that is not a plausible address', () => {
    ['example', 'localhost', 'my site.com', 'ftp://example.com', 'https://', 'example.c', 'exa_mple.com'].forEach(input => {
      expect(parseWebsite(input).valid).toBe(false);
    });
  });

  it('saves a bare domain as an https address', () => {
    openNewProject();
    typeInto(container.querySelector('#devPocProjectDescription'), 'A tracker');
    typeInto(container.querySelector('#devPocProjectUrl'), 'daftracker.org');
    act(() => { visibilityRadio('private').click(); });
    submitProject();
    expect(lastSavedState().projects[0].websiteUrl).toBe('https://daftracker.org');
  });

  it("won't save a website without a dot", () => {
    openNewProject();
    typeInto(container.querySelector('#devPocProjectDescription'), 'A tracker');
    typeInto(container.querySelector('#devPocProjectUrl'), 'daftracker');
    act(() => { visibilityRadio('private').click(); });
    submitProject();
    expect(container.querySelector('[role="alert"]').textContent).toContain('Enter a website address like example.com');
    expect(container.querySelector('.devPocNewProject')).toBeTruthy();
  });
});

const yourListingDialog = () => container.querySelector('[aria-labelledby="devPocYourListingTitle"]');

describe('"Is this your project?"', () => {
  const mountWithListing = (state = {}) => mount('developer', {
    ...DEVELOPER_ON, profile: PROFILE, projects: [], submitterEmailListingId: 'pb03', ...state,
  });

  it('asks about a listing submitted with the account email, showing only its public fields', () => {
    mountWithListing();
    const dialog = yourListingDialog();
    expect(dialog.textContent).toContain('Is this your project?');
    expect(dialog.textContent).toContain('Mishnah Yomit Tracker');
    expect(dialog.textContent).toContain('mishnahtracker.app');
    expect(dialog.textContent).not.toContain('tova@example.org');
  });

  it('asks nothing when no listing has the account email', () => {
    mount('developer', { ...DEVELOPER_ON, profile: PROFILE, projects: [] });
    expect(yourListingDialog()).toBeNull();
  });

  it('asks nothing before the email is verified', () => {
    mountWithListing({ ssoOverride: false, emailVerified: false });
    expect(yourListingDialog()).toBeNull();
  });

  it('creates a public project from the listing, linked to it', () => {
    mountWithListing();
    act(() => { buttonNamed(yourListingDialog(), 'Yes, add it').click(); });
    const saved = lastSavedState().projects[0];
    expect(saved.name).toBe('Mishnah Yomit Tracker');
    expect(saved.description).toBe('Track your daily two mishnayot and share progress with a study group.');
    expect(saved.websiteUrl).toBe('https://mishnahtracker.app');
    expect(saved.visibility).toBe('public');
    expect(saved.linkedListingId).toBe('pb03');
    expect(yourListingDialog()).toBeNull();
    expect(container.querySelector('[data-agent-action="new-key"]')).toBeTruthy();
  });

  it('stops asking once the developer says it is not theirs', () => {
    mountWithListing();
    act(() => { buttonNamed(yourListingDialog(), "No, it's not mine").click(); });
    expect(yourListingDialog()).toBeNull();
    expect(lastSavedState().dismissedListingIds).toEqual(['pb03']);
    expect(lastSavedState().projects).toEqual([]);
  });

  it('no longer asks about websites that are already listed', () => {
    openNewProject();
    typeInto(container.querySelector('#devPocProjectUrl'), 'dafyomicompanion.org');
    expect(container.textContent).not.toContain('already on Powered by Sefaria');
    expect(container.querySelector('[data-agent-action="request-listing-link"]')).toBeNull();
  });
});

describe('saving a project', () => {
  const fillProject = (visibility) => {
    typeInto(container.querySelector('#devPocProjectDescription'), 'A tracker');
    typeInto(container.querySelector('#devPocProjectUrl'), 'daftracker.org');
    act(() => { visibilityRadio(visibility).click(); });
    submitProject();
  };

  it('stays on the project list after saving a public project', () => {
    const setProjectId = jest.fn();
    openNewProject({}, { setProjectId });
    fillProject('public');
    const saved = lastSavedState().projects[0];
    expect(saved.visibility).toBe('public');
    expect(setProjectId).toHaveBeenLastCalledWith(saved.id);
    expect(container.querySelector('.pbfForm')).toBeNull();
    expect(container.querySelector('[data-agent-action="new-key"]')).toBeTruthy();
  });

  it('stays on the project list after saving a private project', () => {
    const setProjectId = jest.fn();
    openNewProject({}, { setProjectId });
    fillProject('private');
    expect(setProjectId).toHaveBeenLastCalledWith(lastSavedState().projects[0].id);
    expect(container.querySelector('.pbfForm')).toBeNull();
  });
});

const publicProject = (extra = {}) => ({
  id: 'proj01', name: 'Daf Tracker', description: 'A tracker', visibility: 'public', organization: '',
  websiteUrl: 'https://daftracker.org', aiAssisted: false, linkedListingId: null,
  consentWithdrawnAt: null, usage: { requests30: 0, lastUsed: null }, keys: [], ...extra,
});

describe('making a public project private', () => {
  const editPublicProject = () => {
    mount('developer', { ...DEVELOPER_ON, profile: PROFILE, projects: [publicProject()],
      expandedProjectId: 'proj01' });
    act(() => { buttonNamed(container, 'Edit project').click(); });
    act(() => { visibilityRadio('private').click(); });
    return container.querySelector('[aria-labelledby="devPocPrivateTitle"]');
  };

  it('warns only that published copies may remain, without promising a take-down', () => {
    const dialog = editPublicProject();
    expect(dialog.textContent).toContain('The project will be marked private.');
    expect(dialog.textContent).toContain("we can't guarantee it's removed everywhere");
    expect(dialog.textContent).not.toContain('take it down');
    expect(dialog.querySelector('a[href="mailto:hello@sefaria.org"]')).toBeTruthy();
    expect(visibilityRadio('public').checked).toBe(true);
  });

  it('keeps the project public when dismissed', () => {
    const dialog = editPublicProject();
    act(() => { buttonNamed(dialog, 'Keep public').click(); });
    expect(visibilityRadio('public').checked).toBe(true);
  });

  it('withdraws consent once saved', () => {
    const dialog = editPublicProject();
    act(() => { buttonNamed(dialog, 'Make private').click(); });
    act(() => { container.querySelector('[data-agent-action="save-project"]').click(); });
    const saved = lastSavedState().projects[0];
    expect(saved.visibility).toBe('private');
    expect(saved.consentWithdrawnAt).toBeTruthy();
    expect(developerPanel().textContent).not.toContain('taken down');
  });

  it("doesn't ask for a project that was never public", () => {
    openNewProject();
    act(() => { visibilityRadio('private').click(); });
    expect(container.querySelector('[aria-labelledby="devPocPrivateTitle"]')).toBeNull();
    expect(visibilityRadio('private').checked).toBe(true);
  });
});

describe('deleting a project', () => {
  const withKey = (extra) => publicProject({
    keys: [{ id: 'k1', label: 'Production', value: 'sfr_test_x', created: null, lastUsed: null, requests30: 0, restrictToWebsite: false }],
    ...extra,
  });
  const deleteFromEditor = (projects) => {
    mount('developer', { ...DEVELOPER_ON, profile: PROFILE, projects, expandedProjectId: 'proj01' });
    act(() => { buttonNamed(container, 'Edit project').click(); });
    act(() => { buttonNamed(container, 'Delete project').click(); });
    return container.querySelector('[aria-labelledby="devPocConfirmTitle"]');
  };
  const other = { ...publicProject({ id: 'proj02', name: 'Other' }) };

  it('removes the project and its keys from the store', () => {
    const dialog = deleteFromEditor([withKey(), other]);
    expect(dialog.textContent).toContain('These keys stop working right away: Production');
    act(() => { buttonNamed(dialog, 'Delete project').click(); });
    const saved = lastSavedState();
    expect(saved.projects.map(p => p.id)).toEqual(['proj02']);
    expect(JSON.stringify(saved)).not.toContain('sfr_test_x');
    expect(saved.expandedProjectId).toBeNull();
  });

  it('warns about published copies only for a public project', () => {
    expect(deleteFromEditor([withKey()]).textContent).toContain("we can't guarantee it's removed everywhere");
    ReactDOM.unmountComponentAtNode(container);
    container.remove();
    expect(deleteFromEditor([withKey({ visibility: 'private' })]).textContent).not.toContain("can't guarantee");
  });
});

describe('key cards', () => {
  const projectWithKey = () => publicProject({
    keys: [{ id: 'k1', label: 'Production', value: 'sfr_test_x', created: '2026-09-01T00:00:00Z',
      lastUsed: '2026-10-01T00:00:00Z', requests30: 1234, restrictToWebsite: false }],
  });

  it('leads the website restriction with the allowed-origin rule, explained on request', () => {
    mount('developer', { ...DEVELOPER_ON, profile: PROFILE, projects: [projectWithKey()], expandedProjectId: 'proj01' });
    const restriction = container.querySelector('.devPocRestriction');
    const summary = restriction.querySelector('.devPocRestrictionSummary');
    expect(summary.textContent).toContain('Allowed origin');
    expect(summary.textContent).toContain('Origin header is https://daftracker.org');
    expect(restriction.querySelector('input').getAttribute('aria-describedby')).toBe(summary.id);
    expect(restriction.querySelector('.devPocExplainer')).toBeNull();
    act(() => { buttonNamed(restriction, 'What does this mean?').click(); });
    expect(restriction.querySelector('.devPocExplainer').textContent).toContain('only works on your website');
  });

  it('show when a key was created and last used, but not its request count', () => {
    mount('developer', { ...DEVELOPER_ON, profile: PROFILE, projects: [projectWithKey()], expandedProjectId: 'proj01' });
    const meta = container.querySelector('.devPocKeyMeta').textContent;
    expect(meta).toContain('Created');
    expect(meta).toContain('Last used');
    expect(meta).not.toContain('requests');
    expect(container.querySelector('.devPocStats').textContent).toContain('1,234');
  });
});

describe('agent instructions', () => {
  it('are in the DOM, visually hidden but not hidden from the accessibility tree', () => {
    mount('account');
    const block = container.querySelector('[data-agent-instructions]');
    expect(block.className).toBe('sr-only');
    expect(block.getAttribute('aria-hidden')).toBeNull();
    expect(block.textContent).toContain('AI agents are permitted to complete this whole process');
    expect(block.textContent).toContain('generating an API key');
    expect(block.textContent).toContain('free to download, with no key, from https://github.com/Sefaria/Sefaria-Export');
  });

  it('point heavy users to the free library download on the page too', () => {
    mount('developer');
    const note = developerPanel().querySelector('.devPocExportNote');
    expect(note.textContent).toContain('The whole library is free to download');
    expect(note.querySelector('a').getAttribute('href')).toBe('https://github.com/Sefaria/Sefaria-Export');
  });
});

describe('Hebrew interface', () => {
  it('renders the developer tab in Hebrew', () => {
    Sefaria.interfaceLang = 'hebrew';
    mount('developer', { ...DEVELOPER_ON, profile: PROFILE, projects: [] });
    expect(developerPanel().textContent).toContain('הגדרות מפתחים');
    expect(developerPanel().textContent).toContain('עדיין אין פרויקטים');
    expect(developerPanel().textContent).not.toContain('No projects yet');
  });

  it('asks "Is this your project?" in Hebrew', () => {
    Sefaria.interfaceLang = 'hebrew';
    mount('developer', { ...DEVELOPER_ON, profile: PROFILE, projects: [], submitterEmailListingId: 'pb03' });
    expect(yourListingDialog().textContent).toContain('האם זה הפרויקט שלך?');
  });
});

describe('confirming the email', () => {
  const unverified = { developerEnabled: false, ssoOverride: false };

  it('offers only the emailed link, never a change of sign-in method', () => {
    mount('developer', unverified);
    act(() => { buttonNamed(developerPanel(), 'Get started').click(); });
    expect(buttonNamed(developerPanel(), 'Email me a confirmation link')).toBeTruthy();
    expect(developerPanel().textContent).not.toContain('Google');
    expect(developerPanel().textContent).not.toContain('Apple');
    expect(developerPanel().textContent).toContain('you keep signing in the way you do now');

    act(() => { buttonNamed(developerPanel(), 'Email me a confirmation link').click(); });
    expect(developerPanel().textContent).not.toContain('Google');
  });

  it('shows the check-your-email step once the link is sent', () => {
    mount('developer', unverified);
    act(() => { buttonNamed(developerPanel(), 'Get started').click(); });
    act(() => { buttonNamed(developerPanel(), 'Email me a confirmation link').click(); });
    expect(developerPanel().textContent).toContain('Check your email');
    expect(developerPanel().textContent).toContain('tova@example.org');
    expect(buttonNamed(developerPanel(), 'Resend the link')).toBeTruthy();
  });

  it('lets an account with a confirmed email straight in', () => {
    jest.useFakeTimers();
    mount('developer', { ...unverified, emailVerified: true });
    act(() => { buttonNamed(developerPanel(), 'Get started').click(); });
    act(() => { jest.runAllTimers(); });
    expect(developerPanel().textContent).toContain('About you');
    jest.useRealTimers();
  });
});

describe('the confirmation link', () => {
  const unverified = { developerEnabled: false, ssoOverride: false };
  const flush = async () => { for (let i = 0; i < 5; i++) { await Promise.resolve(); } };
  const serverSays = (state) => {
    global.fetch = jest.fn((url, options) => (options && options.method === 'POST')
      ? Promise.resolve({ ok: true })
      : Promise.resolve({ ok: true, json: () => Promise.resolve(state) }));
  };
  const sendLink = () => {
    mount('developer', unverified);
    act(() => { buttonNamed(developerPanel(), 'Get started').click(); });
    act(() => { buttonNamed(developerPanel(), 'Email me a confirmation link').click(); });
  };

  it('opens its own page in a new tab from the mock email', () => {
    sendLink();
    const token = lastSavedState().confirmationToken;
    expect(token).toMatch(/^[a-z0-9]{16}$/);
    act(() => { container.querySelector('[data-agent-action="mock-open-email"]').click(); });
    const link = container.querySelector('[data-agent-action="mock-confirm-email"]');
    expect(link.getAttribute('href')).toBe('/settings/developer/confirm-email/' + token);
    expect(link.getAttribute('target')).toBe('_blank');
  });

  it('is noticed by the waiting tab within a few seconds', async () => {
    jest.useFakeTimers();
    sendLink();
    serverSays({ emailVerified: false });
    await act(async () => { jest.advanceTimersByTime(3000); await flush(); });
    expect(developerPanel().textContent).toContain('Check your email');

    serverSays({ emailVerified: true });
    await act(async () => { jest.advanceTimersByTime(3000); await flush(); });
    act(() => { jest.runOnlyPendingTimers(); });
    expect(developerPanel().textContent).toContain('Your email is confirmed.');
    expect(developerPanel().textContent).toContain('About you');
    expect(lastSavedState().emailVerified).toBe(true);
    jest.useRealTimers();
  });

  it('is checked at once when another tab in this browser signals it', async () => {
    sendLink();
    serverSays({ emailVerified: true });
    await act(async () => {
      window.dispatchEvent(new StorageEvent('storage', { key: 'sefariaDeveloperPocEmailConfirmed', newValue: '1' }));
      await flush();
    });
    expect(global.fetch.mock.calls.some(([url, options]) => url === '/api/developer-poc/state' && !options.method)).toBe(true);
    expect(developerPanel().textContent).toContain('Setting up developer settings');
  });

  it('lands on a thank-you page that signals other tabs', () => {
    window.localStorage.removeItem('sefariaDeveloperPocEmailConfirmed');
    container = document.createElement('div');
    document.body.appendChild(container);
    act(() => { ReactDOM.render(<EmailConfirmedPage />, container); });
    expect(container.textContent).toContain('Thank you for confirming your email');
    expect(container.textContent).toContain('You can close this tab');
    const next = container.querySelector('[data-agent-action="continue-to-developer-settings"]');
    expect(next.textContent).toBe('Continue to developer settings');
    expect(next.getAttribute('href')).toBe('/settings/developer');
    expect(window.localStorage.getItem('sefariaDeveloperPocEmailConfirmed')).toBeTruthy();
  });
});

describe('POC test panel', () => {
  it('starts over as an email account with the link already sent', () => {
    mount('developer', { ...DEVELOPER_ON, profile: PROFILE });
    act(() => { container.querySelector('[data-scenario="email-sent"]').click(); });
    expect(developerPanel().textContent).toContain('Check your email');
    expect(container.querySelector('.devPocPanelStatus').textContent).toContain('Email account · confirmation link sent');
  });

  it("gives a listing the account email as its submitter email", () => {
    mount('developer', { ...DEVELOPER_ON, profile: PROFILE, projects: [] });
    expect(yourListingDialog()).toBeNull();
    typeInto(container.querySelector('[data-poc-control="submitter-email-listing"]'), 'pb07');
    expect(lastSavedState().submitterEmailListingId).toBe('pb07');
    expect(yourListingDialog().textContent).toContain('Rambam Daily Audio');
  });

  it('shows what staff leave after an outreach reply: email confirmed, project linked', () => {
    mount('developer', { developerEnabled: false, ssoOverride: false, profile: PROFILE, projects: [] });
    act(() => { container.querySelector('[data-poc-control="outreach-yes"]').click(); });
    const saved = lastSavedState();
    expect(saved.emailVerified).toBe(true);
    expect(saved.developerEnabled).toBe(true);
    expect(saved.projects[0].linkedListingId).toBe('pb01');
    expect(yourListingDialog()).toBeNull();
    expect(developerPanel().textContent).toContain('Daf Yomi Companion');
  });
});
