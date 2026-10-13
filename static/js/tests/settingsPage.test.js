/**
 * SettingsPage: the settings tabs and developer settings, against the in-browser mock of the
 * developer API (developerSettingsMock.js).
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
import SettingsPage, { EmailConfirmedPage, EmailLinkPage } from '../SettingsPage.jsx';
import { parseWebsite } from '../developerSettingsApi';
import { developerState, emptyBlob, PREVIOUS_ACCOUNT_EMAIL } from '../developerSettingsMock';

let container = null;

const EMAIL = 'tova@example.org';
const CONTEXT = { email: EMAIL, realProviders: [] };
const PROFILE = {
  developerName: 'Tova Levi', description: '', additionalEmail: '',
  termsAccepted: true, developerNews: false, notADeveloper: false,
};

/* Mock data, as the session keeps it. */
const blob = (fields = {}) => ({ ...emptyBlob(), ...fields });
const DEVELOPER_ON = { developerEnabled: true, ssoOverride: true };
const SET_UP = { ...DEVELOPER_ON, profile: PROFILE };

const project = (extra = {}) => ({
  id: 'proj01', name: 'Daf Tracker', description: 'A tracker', visibility: 'public', organization: '',
  websiteUrl: 'https://daftracker.org', aiAssisted: false, consentWithdrawnAt: null, listingId: null,
  createdAt: '2026-09-01T00:00:00Z', keys: [], ...extra,
});
const key = (extra = {}) => ({
  id: 'k1', label: 'Production', value: 'sfr_test_x', created: '2026-09-01T00:00:00Z', restrictToWebsite: false, ...extra,
});

/* The session endpoint the mock keeps its data in: GET answers what POST stored. */
let session = null;
const serveSession = (initial) => {
  session = initial;
  global.fetch = jest.fn((url, options = {}) => {
    if (url !== '/api/developer-poc/state') { return Promise.reject(new Error('Unexpected request to ' + url)); }
    if (options.method === 'POST') { session = JSON.parse(options.body); }
    return Promise.resolve({ ok: true, json: () => Promise.resolve(session) });
  });
};
const sessionWrites = () => global.fetch.mock.calls.filter(([, options = {}]) => options.method === 'POST');

/* Mounts the page on mock data: the session holds it, and the page starts from its state. */
function mount(tab, data = blob(), props = {}) {
  serveSession(data);
  container = document.createElement('div');
  document.body.appendChild(container);
  act(() => {
    ReactDOM.render(
      <SettingsPage
        tab={tab}
        projectId={null}
        accountSettings={{ socialProviders: [], email: EMAIL }}
        initialDeveloper={data === null ? null : developerState(data, CONTEXT)}
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

const flush = async () => { for (let i = 0; i < 30; i++) { await Promise.resolve(); } };
const clickAndSettle = async (element) => { await act(async () => { element.click(); await flush(); }); };

const developerPanel = () => container.querySelectorAll('.settingsPanel')[1];
const buttonNamed = (root, name) => Array.from(root.querySelectorAll('button')).find(b => b.textContent.trim() === name);

beforeEach(() => {
  Sefaria.interfaceLang = 'english';
  serveSession(null);
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

  it('has no developer tab or agent instructions without a developer state', () => {
    mount('account', null);
    const links = Array.from(container.querySelectorAll('nav.settingsNav a'));
    expect(links.map(a => a.getAttribute('href'))).toEqual(['/settings/account']);
    expect(container.querySelectorAll('.settingsPanel').length).toBe(1);
    expect(container.querySelector('[data-agent-instructions]')).toBeNull();
  });

  it('gates the developer tab behind Get started', () => {
    mount('developer');
    expect(buttonNamed(developerPanel(), 'Get started')).toBeTruthy();
    expect(container.querySelectorAll('nav.settingsNav a')[1].getAttribute('aria-current')).toBe('page');
  });
});

describe('developer onboarding', () => {
  it('shows the account name and email locked', () => {
    mount('developer', blob(DEVELOPER_ON));
    const name = container.querySelector('#devPocName');
    const email = container.querySelector('#devPocEmail');
    expect(name.value).toBe('Tova Levi');
    expect(name.readOnly).toBe(true);
    expect(email.value).toBe(EMAIL);
    expect(email.readOnly).toBe(true);
    expect(container.querySelector('#devPocEmail2').readOnly).toBe(false);
  });

  it('has no info tips on the locked fields, but describes them to assistive tech', () => {
    mount('developer', blob(DEVELOPER_ON));
    ['#devPocName', '#devPocEmail'].forEach(selector => {
      const input = container.querySelector(selector);
      expect(input.closest('.devPocField').querySelector('.devPocInfoButton')).toBeNull();
      expect(document.getElementById(input.getAttribute('aria-describedby')).textContent).toContain('From your Sefaria account');
    });
  });

  it('keeps info tips out of the tab order, with their text on the field', () => {
    mount('developer', blob(DEVELOPER_ON));
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
    mount('developer', blob(DEVELOPER_ON));
    const before = developerPanel().textContent;
    const checkbox = Array.from(container.querySelectorAll('.devPocChoice'))
      .find(label => label.textContent.includes("I don't write code myself")).querySelector('input');
    act(() => { checkbox.click(); });
    expect(checkbox.checked).toBe(true);
    expect(developerPanel().textContent).toBe(before);
  });
});

const openNewProject = (fields = {}, props = {}) => {
  mount('developer', blob({ ...SET_UP, nextId: 7, ...fields }), props);
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
    expect(dialog.textContent).not.toContain('Tova Levi');
    expect(dialog.textContent).not.toContain('Made by');
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

  it('saves a bare domain as an https address', async () => {
    openNewProject();
    typeInto(container.querySelector('#devPocProjectDescription'), 'A tracker');
    typeInto(container.querySelector('#devPocProjectUrl'), 'daftracker.org');
    act(() => { visibilityRadio('private').click(); });
    await clickAndSettle(container.querySelector('[data-agent-action="create-project"]'));
    expect(session.projects[0].websiteUrl).toBe('https://daftracker.org');
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

const LISTING = {
  id: '42', name: 'Mishnah Yomit Tracker', url: 'https://mishnahtracker.app',
  description: 'Track your daily two mishnayot and share progress with a study group.',
  submitterEmail: EMAIL, projectId: null, deleted: false, createdAt: '2026-09-01T00:00:00Z',
};

describe('"Is this your project?"', () => {
  const mountWithListing = (fields = {}, props = {}) => mount('developer', blob({
    ...SET_UP, listings: [LISTING], nextId: 43, ...fields,
  }), props);

  it('asks about a listing submitted with the account email, showing only its public fields', () => {
    mountWithListing();
    const dialog = yourListingDialog();
    expect(dialog.textContent).toContain('Is this your project?');
    expect(dialog.textContent).toContain('Mishnah Yomit Tracker');
    expect(dialog.textContent).toContain('mishnahtracker.app');
    expect(dialog.textContent).not.toContain(EMAIL);
  });

  it('asks nothing when no listing has the account email', () => {
    mountWithListing({ listings: [{ ...LISTING, submitterEmail: 'someone@else.org' }] });
    expect(yourListingDialog()).toBeNull();
  });

  it('asks nothing before developer settings are set up', () => {
    mountWithListing({ profile: null });
    expect(yourListingDialog()).toBeNull();
  });

  it('asks nothing while the account email is unconfirmed', () => {
    mountWithListing({ ssoOverride: false });
    expect(yourListingDialog()).toBeNull();
  });

  it('claims the listing and opens it as a project', async () => {
    const setProjectId = jest.fn();
    mountWithListing({}, { setProjectId });
    await clickAndSettle(buttonNamed(yourListingDialog(), 'Yes, add it'));
    expect(session.projects[0]).toMatchObject({ id: '43', name: LISTING.name, visibility: 'public', listingId: '42' });
    expect(setProjectId).toHaveBeenLastCalledWith('43');
    expect(yourListingDialog()).toBeNull();
    expect(container.querySelector('[data-agent-action="new-key"]')).toBeTruthy();
    expect(developerPanel().textContent).toContain('this is the Mishnah Yomit Tracker listing');
  });

  it('stops asking once the developer says it is not theirs', async () => {
    mountWithListing();
    await clickAndSettle(buttonNamed(yourListingDialog(), "No, it's not mine"));
    expect(session.dismissedListingIds).toEqual(['42']);
    expect(yourListingDialog()).toBeNull();
  });

  it('can be put off until the next visit with Not now', () => {
    mountWithListing();
    act(() => { buttonNamed(yourListingDialog(), 'Not now').click(); });
    expect(yourListingDialog()).toBeNull();
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it('no longer asks about websites that are already listed', () => {
    openNewProject();
    typeInto(container.querySelector('#devPocProjectUrl'), 'dafyomicompanion.org');
    expect(container.textContent).not.toContain('already on Powered by Sefaria');
    expect(container.querySelector('[data-agent-action="request-listing-link"]')).toBeNull();
  });
});

describe('saving a project', () => {
  const fillProject = async (visibility) => {
    typeInto(container.querySelector('#devPocProjectDescription'), 'A tracker');
    typeInto(container.querySelector('#devPocProjectUrl'), 'daftracker.org');
    act(() => { visibilityRadio(visibility).click(); });
    await clickAndSettle(container.querySelector('[data-agent-action="create-project"]'));
  };

  it('opens the new project, ready for a key', async () => {
    const setProjectId = jest.fn();
    openNewProject({}, { setProjectId });
    await fillProject('public');
    expect(session.projects[0]).toMatchObject({ id: '7', visibility: 'public' });
    expect(setProjectId).toHaveBeenLastCalledWith('7');
    expect(container.querySelector('.devPocNewProject')).toBeNull();
    expect(container.querySelector('[data-agent-action="new-key"]')).toBeTruthy();
  });

  it('keeps the form open with the server error when saving fails', async () => {
    openNewProject();
    typeInto(container.querySelector('#devPocProjectName'), 'x'.repeat(256));
    await fillProject('private');
    expect(container.querySelector('.devPocNewProject')).toBeTruthy();
    expect(container.querySelector('[role="alert"]').textContent).toContain('The project name can be at most 255 characters.');
    expect(session.projects).toEqual([]);
  });

  it('shows a general error when the save fails without a reason', async () => {
    openNewProject({ failNext: 'any' });
    await fillProject('private');
    expect(container.querySelector('[role="alert"]').textContent).toContain("Something went wrong and your change wasn't saved");
    expect(session.failNext).toBeNull();
  });
});

describe('making a public project private', () => {
  const editPublicProject = () => {
    mount('developer', blob({ ...SET_UP, projects: [project()] }), { projectId: 'proj01' });
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

  it('saves the project as private, withdrawing its consent', async () => {
    const dialog = editPublicProject();
    act(() => { buttonNamed(dialog, 'Make private').click(); });
    await clickAndSettle(container.querySelector('[data-agent-action="save-project"]'));
    expect(session.projects[0].visibility).toBe('private');
    expect(session.projects[0].consentWithdrawnAt).toBeTruthy();
    expect(developerPanel().textContent).toContain('Private: not shown on Powered by Sefaria.');
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
  const withKey = (extra) => project({ keys: [key({ created: null })], ...extra });
  const deleteFromEditor = (projects) => {
    mount('developer', blob({ ...SET_UP, projects }), { projectId: 'proj01' });
    act(() => { buttonNamed(container, 'Edit project').click(); });
    act(() => { buttonNamed(container, 'Delete project').click(); });
    return container.querySelector('[aria-labelledby="devPocConfirmTitle"]');
  };
  const other = project({ id: 'proj02', name: 'Other' });

  it('deletes the project, naming the keys that stop working', async () => {
    const dialog = deleteFromEditor([withKey(), other]);
    expect(dialog.textContent).toContain('These keys stop working right away: Production');
    await clickAndSettle(buttonNamed(dialog, 'Delete project'));
    expect(session.projects.map(p => p.id)).toEqual(['proj02']);
    expect(developerPanel().textContent).not.toContain('Daf Tracker');
    expect(developerPanel().textContent).toContain('Other');
  });

  it('warns about published copies only for a public project', () => {
    expect(deleteFromEditor([withKey()]).textContent).toContain("we can't guarantee it's removed everywhere");
    ReactDOM.unmountComponentAtNode(container);
    container.remove();
    expect(deleteFromEditor([withKey({ visibility: 'private' })]).textContent).not.toContain("can't guarantee");
  });
});

describe('key cards', () => {
  const projectWithKey = () => project({ keys: [key()] });

  it('leads the website restriction with the allowed-origin rule, explained on request', () => {
    mount('developer', blob({ ...SET_UP, projects: [projectWithKey()] }), { projectId: 'proj01' });
    const restriction = container.querySelector('.devPocRestriction');
    const summary = restriction.querySelector('.devPocRestrictionSummary');
    expect(summary.textContent).toContain('Allowed origin');
    expect(summary.textContent).toContain('Origin header is https://daftracker.org');
    expect(restriction.querySelector('input').getAttribute('aria-describedby')).toBe(summary.id);
    expect(restriction.querySelector('.devPocExplainer')).toBeNull();
    act(() => { buttonNamed(restriction, 'What does this mean?').click(); });
    expect(restriction.querySelector('.devPocExplainer').textContent).toContain('only works on your website');
  });

  it('show when a key was created, with no usage information', () => {
    mount('developer', blob({ ...SET_UP, projects: [projectWithKey()] }), { projectId: 'proj01' });
    const meta = container.querySelector('.devPocKeyMeta').textContent;
    expect(meta).toContain('Created');
    const body = container.querySelector('.devPocProjectBody').textContent;
    expect(body).not.toContain('Last used');
    expect(body).not.toMatch(/requests in the last|requests per day|requests by key/i);
  });
});

describe('keys', () => {
  const mountProject = (p, fields = {}) => mount('developer', blob({ ...SET_UP, projects: [p], ...fields }), { projectId: 'proj01' });
  const startKey = () => {
    act(() => { container.querySelector('[data-agent-action="new-key"]').click(); });
    typeInto(container.querySelector('#devPocKeyLabel'), 'Production');
  };

  it('creates a key and shows it once the setup wait is over', async () => {
    jest.useFakeTimers();
    mountProject(project());
    startKey();
    await act(async () => { container.querySelector('[data-agent-action="create-key"]').click(); await flush(); });
    expect(session.projects[0].keys.map(k => k.label)).toEqual(['Production']);
    expect(session.projects[0].keys[0].value).toMatch(/^sfr_test_/);
    expect(developerPanel().textContent).toContain('Setting up your key');
    await act(async () => { jest.advanceTimersByTime(4000); await flush(); });
    expect(developerPanel().textContent).toContain('Ready to use');
    jest.useRealTimers();
  });

  it('says so when the key could not be created', async () => {
    jest.useFakeTimers();
    mountProject(project(), { failNext: 'key' });
    startKey();
    await act(async () => { container.querySelector('[data-agent-action="create-key"]').click(); await flush(); });
    await act(async () => { jest.advanceTimersByTime(4000); await flush(); });
    expect(developerPanel().textContent).toContain("We couldn't create your key.");
    expect(session.projects[0].keys).toEqual([]);
    expect(session.failNext).toBeNull();
    jest.useRealTimers();
  });

  it('stops at five keys a project', () => {
    mountProject(project({ keys: [1, 2, 3, 4, 5].map(n => key({ id: 'k' + n, label: 'Key ' + n })) }));
    expect(developerPanel().textContent).toContain('You have 5 keys, the most a project can have.');
    expect(container.querySelector('[data-agent-action="new-key"]').disabled).toBe(true);
  });

  it('restricts a key to the website', async () => {
    mountProject(project({ keys: [key()] }));
    await clickAndSettle(container.querySelector('.devPocRestriction input'));
    expect(session.projects[0].keys[0].restrictToWebsite).toBe(true);
    expect(container.querySelector('.devPocRestriction input').checked).toBe(true);
  });

  it('deletes a key after confirming', async () => {
    mountProject(project({ keys: [key()] }));
    act(() => { buttonNamed(container.querySelector('.devPocKey'), 'Delete key').click(); });
    await clickAndSettle(buttonNamed(container.querySelector('[aria-labelledby="devPocConfirmTitle"]'), 'Delete key'));
    expect(session.projects[0].keys).toEqual([]);
    expect(container.querySelector('.devPocKey')).toBeNull();
  });
});

describe('dialog keyboard behaviour', () => {
  const projectWithKey = () => project({ keys: [key({ value: 'sfr_x', created: null })] });
  const openDeleteKey = () => {
    mount('developer', blob({ ...SET_UP, projects: [projectWithKey()] }), { projectId: 'proj01' });
    const opener = buttonNamed(container.querySelector('.devPocKey'), 'Delete key');
    act(() => { opener.focus(); opener.click(); });
    return { opener, dialog: container.querySelector('[aria-labelledby="devPocConfirmTitle"]') };
  };
  const press = (k, init = {}) => act(() => {
    document.activeElement.dispatchEvent(new KeyboardEvent('keydown', { key: k, bubbles: true, cancelable: true, ...init }));
  });

  it("closes on Escape without the key reaching the panel around the page", () => {
    const outer = jest.fn();
    container = document.createElement('div');
    document.body.appendChild(container);
    act(() => {
      ReactDOM.render(
        <div onKeyDown={e => { if (e.key === 'Escape') { outer(); } }}>
          <SettingsPage tab="developer" projectId="proj01" accountSettings={{ socialProviders: [] }}
            initialDeveloper={developerState(blob({ ...SET_UP, projects: [projectWithKey()] }), CONTEXT)}
            setTab={() => {}} setProjectId={() => {}} />
        </div>,
        container,
      );
    });
    act(() => { buttonNamed(container.querySelector('.devPocKey'), 'Delete key').click(); });
    press('Escape');
    expect(container.querySelector('[aria-labelledby="devPocConfirmTitle"]')).toBeNull();
    expect(outer).not.toHaveBeenCalled();
  });

  it('keeps Tab inside the dialog and returns focus to the opener on close', () => {
    const { opener, dialog } = openDeleteKey();
    const buttons = Array.from(dialog.querySelectorAll('button'));
    expect(document.activeElement).toBe(buttons[0]);
    act(() => { buttons[buttons.length - 1].focus(); });
    press('Tab');
    expect(document.activeElement).toBe(buttons[0]);
    press('Tab', { shiftKey: true });
    expect(document.activeElement).toBe(buttons[buttons.length - 1]);
    act(() => { buttonNamed(dialog, 'Cancel').click(); });
    expect(document.activeElement).toBe(opener);
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
    mount('developer', blob(SET_UP));
    expect(developerPanel().textContent).toContain('הגדרות מפתחים');
    expect(developerPanel().textContent).toContain('עדיין אין פרויקטים');
    expect(developerPanel().textContent).not.toContain('No projects yet');
  });

  it('asks "Is this your project?" in Hebrew', () => {
    Sefaria.interfaceLang = 'hebrew';
    mount('developer', blob({ ...SET_UP, listings: [LISTING] }));
    expect(yourListingDialog().textContent).toContain('האם זה הפרויקט שלך?');
  });

  it('asks to confirm a changed email in Hebrew', () => {
    Sefaria.interfaceLang = 'hebrew';
    mount('developer', blob({ ...SET_UP, ssoOverride: false, verifiedEmail: PREVIOUS_ACCOUNT_EMAIL }));
    expect(developerPanel().textContent).toContain('אישור כתובת הדוא״ל החדשה');
  });
});

describe('confirming the email', () => {
  const unverified = { ssoOverride: false };

  it('offers only the emailed link, never a change of sign-in method', () => {
    mount('developer', blob(unverified));
    act(() => { buttonNamed(developerPanel(), 'Get started').click(); });
    expect(buttonNamed(developerPanel(), 'Email me a confirmation link')).toBeTruthy();
    expect(developerPanel().textContent).not.toContain('Google');
    expect(developerPanel().textContent).not.toContain('Apple');
    expect(developerPanel().textContent).toContain('you keep signing in the way you do now');
  });

  it('sends the link, then shows the check-your-email step', async () => {
    mount('developer', blob(unverified));
    act(() => { buttonNamed(developerPanel(), 'Get started').click(); });
    await clickAndSettle(buttonNamed(developerPanel(), 'Email me a confirmation link'));
    expect(session.confirmationSentTo).toBe(EMAIL);
    expect(session.confirmationToken).toMatch(/^[a-z0-9]{16}$/);
    expect(developerPanel().textContent).toContain('Check your email');
    expect(developerPanel().textContent).toContain(EMAIL);
    expect(buttonNamed(developerPanel(), 'Resend the link')).toBeTruthy();
  });

  it('refuses a resend within a minute', async () => {
    mount('developer', blob(unverified));
    act(() => { buttonNamed(developerPanel(), 'Get started').click(); });
    await clickAndSettle(buttonNamed(developerPanel(), 'Email me a confirmation link'));
    await clickAndSettle(buttonNamed(developerPanel(), 'Resend the link'));
    expect(session.confirmationSends.length).toBe(1);
  });

  it('lets an account with a confirmed email straight in', async () => {
    jest.useFakeTimers();
    mount('developer', blob({ ...unverified, verifiedEmail: EMAIL }));
    await clickAndSettle(buttonNamed(developerPanel(), 'Get started'));
    expect(session.developerEnabled).toBe(true);
    expect(developerPanel().textContent).toContain('Setting up developer settings');
    act(() => { jest.runAllTimers(); });
    expect(developerPanel().textContent).toContain('About you');
    jest.useRealTimers();
  });

  it('saves the profile and moves on to projects', async () => {
    mount('developer', blob(DEVELOPER_ON));
    act(() => { container.querySelector('.devPocLegal input[type="checkbox"]').click(); });
    await clickAndSettle(container.querySelector('[data-agent-action="save-profile"]'));
    expect(session.profile.termsAccepted).toBe(true);
    expect(developerPanel().textContent).toContain('No projects yet');
  });
});

describe('the confirmation link', () => {
  const linkSent = {
    ssoOverride: false, confirmationSentAt: '2026-10-11T00:00:00Z', confirmationSentTo: EMAIL, confirmationToken: 'abcdefgh12345678',
  };
  /* What the server does when the emailed link is opened, in any browser. */
  const openLink = () => { session = { ...session, emailVerified: true, confirmationSentAt: null, confirmationToken: null, developerEnabled: true }; };

  it('is noticed by the waiting tab within a few seconds', async () => {
    jest.useFakeTimers();
    mount('developer', blob(linkSent));
    await act(async () => { jest.advanceTimersByTime(3000); await flush(); });
    expect(developerPanel().textContent).toContain('Check your email');

    openLink();
    await act(async () => { jest.advanceTimersByTime(3000); await flush(); });
    act(() => { jest.runOnlyPendingTimers(); });
    expect(developerPanel().textContent).toContain('Your email is confirmed.');
    expect(developerPanel().textContent).toContain('About you');
    jest.useRealTimers();
  });

  it('is checked at once when another tab in this browser signals it', async () => {
    mount('developer', blob(linkSent));
    openLink();
    await act(async () => {
      window.dispatchEvent(new StorageEvent('storage', { key: 'sefariaDeveloperEmailConfirmed', newValue: '1' }));
      await flush();
    });
    expect(global.fetch).toHaveBeenCalled();
    expect(developerPanel().textContent).toContain('Setting up developer settings');
  });

  it("doesn't confirm an address that is no longer the account email", () => {
    const state = developerState(blob({ ...linkSent, confirmationSentTo: PREVIOUS_ACCOUNT_EMAIL, emailVerified: true }), CONTEXT);
    expect(state.emailVerified).toBe(false);
  });

  it('lands on a thank-you page that signals other tabs', () => {
    window.localStorage.removeItem('sefariaDeveloperEmailConfirmed');
    container = document.createElement('div');
    document.body.appendChild(container);
    act(() => { ReactDOM.render(<EmailConfirmedPage />, container); });
    expect(container.textContent).toContain('Thank you for confirming your email');
    expect(container.textContent).toContain('You can close this tab');
    const next = container.querySelector('[data-agent-action="continue-to-developer-settings"]');
    expect(next.textContent).toBe('Continue to developer settings');
    expect(next.getAttribute('href')).toBe('/settings/developer');
    expect(window.localStorage.getItem('sefariaDeveloperEmailConfirmed')).toBeTruthy();
  });
});

describe('test controls', () => {
  it('are hidden without mock data in the state', () => {
    serveSession(null);
    container = document.createElement('div');
    document.body.appendChild(container);
    act(() => {
      ReactDOM.render(
        <SettingsPage tab="developer" projectId={null} accountSettings={{ socialProviders: [] }}
          initialDeveloper={{ developerEnabled: true, ssoConnected: true, profile: PROFILE }}
          setTab={() => {}} setProjectId={() => {}} />,
        container,
      );
    });
    expect(container.querySelector('.devPocPanel')).toBeNull();
  });

  it('start over as the chosen account', async () => {
    mount('developer', blob({ ...SET_UP, projects: [project()] }));
    await clickAndSettle(container.querySelector('[data-scenario="email"]'));
    expect(session).toMatchObject({ developerEnabled: false, profile: null, projects: [], ssoOverride: false, verifiedEmail: null });
    expect(container.querySelector('.devPocPanelStatus').textContent).toContain('Email account · email not confirmed');
  });

  it('add a listing submitted with the account email, which is then offered', async () => {
    mount('developer', blob(SET_UP));
    await clickAndSettle(container.querySelector('[data-poc-control="create-listing"]'));
    expect(session.listings[0]).toMatchObject({ name: 'Daf Yomi Companion', submitterEmail: EMAIL });
    expect(yourListingDialog().textContent).toContain('Daf Yomi Companion');
  });

  it('open the mock email, whose button is the real confirmation link', () => {
    mount('developer', blob({
      ssoOverride: false, confirmationSentAt: '2026-10-11T00:00:00Z', confirmationSentTo: EMAIL, confirmationToken: 'abcdefgh12345678',
    }));
    act(() => { container.querySelector('[data-agent-action="mock-open-email"]').click(); });
    const link = container.querySelector('[data-agent-action="mock-confirm-email"]');
    expect(link.getAttribute('href')).toBe('/settings/developer/confirm-email/abcdefgh12345678');
    expect(link.getAttribute('target')).toBe('_blank');
  });
});


describe('a confirmation link that cannot confirm', () => {
  const renderLink = (status, data = blob({ ssoOverride: false })) => {
    serveSession(data);
    container = document.createElement('div');
    document.body.appendChild(container);
    act(() => { ReactDOM.render(<EmailLinkPage link={{ status, key: 'mock' }} />, container); });
  };

  it('offers a new link when it has expired', async () => {
    renderLink('expired');
    expect(container.querySelector('h1').textContent).toBe('This link has expired');
    await clickAndSettle(buttonNamed(container, 'Send a new link'));
    expect(session.confirmationSentTo).toBe(EMAIL);
    expect(container.textContent).toContain('We sent a new link. Check your email.');
    expect(buttonNamed(container, 'Send a new link')).toBeUndefined();
  });

  it("shows the server's reason when a new link is refused", async () => {
    renderLink('expired', blob({ ssoOverride: false, confirmationSends: [new Date().toISOString()] }));
    await clickAndSettle(buttonNamed(container, 'Send a new link'));
    expect(container.querySelector('[role="alert"]').textContent).toBe('Wait a minute before asking for another email.');
  });

  it("won't renew a link once the email is confirmed", async () => {
    renderLink('expired', blob({ ssoOverride: false, verifiedEmail: EMAIL }));
    await clickAndSettle(buttonNamed(container, 'Send a new link'));
    expect(container.querySelector('[role="alert"]').textContent).toBe("This link can't be renewed.");
  });

  it('says a used link is already confirmed', () => {
    renderLink('already-confirmed');
    expect(container.querySelector('h1').textContent).toBe('Already confirmed');
    expect(container.querySelector('[data-agent-action="continue-to-developer-settings"]')).toBeTruthy();
  });

  it('rejects a link for an address that is no longer the account email', () => {
    renderLink('not-account-email');
    expect(container.querySelector('h1').textContent).toBe('This link is no longer valid');
    expect(container.textContent).toContain('no longer your account email');
    expect(buttonNamed(container, 'Send a new link')).toBeUndefined();
  });
});

describe('after the account email changes', () => {
  const changedEmail = {
    ...SET_UP, ssoOverride: false, verifiedEmail: PREVIOUS_ACCOUNT_EMAIL, projects: [project({ keys: [key()] })],
  };

  it('keeps projects and keys on show but offers no new ones', () => {
    mount('developer', blob(changedEmail), { projectId: 'proj01' });
    const panel = developerPanel();
    expect(panel.textContent).toContain('Confirm your new email address');
    expect(panel.textContent).toContain('Your projects and keys keep working');
    expect(panel.textContent).toContain('Daf Tracker');
    expect(panel.textContent).toContain('Production');
    expect(panel.textContent).not.toContain('Get started');
    expect(panel.querySelector('[data-agent-action="new-project"]')).toBeNull();
    expect(panel.querySelector('[data-agent-action="new-key"]')).toBeNull();
  });

  it('shows no create-first buttons on an empty account', () => {
    mount('developer', blob({ ...changedEmail, projects: [] }));
    expect(developerPanel().textContent).toContain('No projects yet');
    expect(developerPanel().querySelector('[data-agent-action="new-project"]')).toBeNull();
  });

  it('emails a link to the new address', async () => {
    mount('developer', blob(changedEmail));
    await clickAndSettle(buttonNamed(developerPanel(), 'Email me a confirmation link'));
    expect(session.confirmationSentTo).toBe(EMAIL);
    expect(developerPanel().textContent).toContain('We sent a confirmation link to tova@example.org');
    expect(buttonNamed(developerPanel(), 'Resend the link')).toBeTruthy();
  });

  it('offers new projects again once the new address is confirmed', () => {
    mount('developer', blob({ ...changedEmail, verifiedEmail: EMAIL }));
    expect(developerPanel().textContent).not.toContain('Confirm your new email address');
    expect(developerPanel().querySelector('[data-agent-action="new-project"]')).toBeTruthy();
  });
});
