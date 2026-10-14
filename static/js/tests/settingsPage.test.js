/**
 * SettingsPage: the settings tabs and developer settings.
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

let container = null;

const DEVELOPER_ON = { developerEnabled: true, ssoConnected: true };
const PROFILE = {
  developerName: 'Tova Levi', description: '', additionalEmail: '',
  termsAccepted: true, developerNews: false, notADeveloper: false,
};

/* developer is the server's developer state; null is what the server sends where developer settings are off. */
function mount(tab, developer = {}, props = {}) {
  container = document.createElement('div');
  document.body.appendChild(container);
  act(() => {
    ReactDOM.render(
      <SettingsPage
        tab={tab}
        projectId={null}
        accountSettings={{ socialProviders: [], email: 'tova@example.org' }}
        initialDeveloper={developer}
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

/* The server answers every call with the developer state; respondWith sets what it answers. */
let serverState = {};
const respondWith = (state) => {
  serverState = state;
  global.fetch = jest.fn(() => Promise.resolve({ ok: true, json: () => Promise.resolve(serverState) }));
};
const lastRequest = () => {
  const [url, options] = global.fetch.mock.calls[global.fetch.mock.calls.length - 1];
  return { url, method: options.method, body: options.body ? JSON.parse(options.body) : null };
};
const flush = async () => { for (let i = 0; i < 5; i++) { await Promise.resolve(); } };
const clickAndSettle = async (element) => { await act(async () => { element.click(); await flush(); }); };

const developerPanel = () => container.querySelectorAll('.settingsPanel')[1];
const buttonNamed = (root, name) => Array.from(root.querySelectorAll('button')).find(b => b.textContent.trim() === name);

beforeEach(() => {
  Sefaria.interfaceLang = 'english';
  respondWith({});
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

  it('has no developer tab or agent instructions where developer settings are off', () => {
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

  it('saves a bare domain as an https address', () => {
    openNewProject();
    typeInto(container.querySelector('#devPocProjectDescription'), 'A tracker');
    typeInto(container.querySelector('#devPocProjectUrl'), 'daftracker.org');
    act(() => { visibilityRadio('private').click(); });
    submitProject();
    expect(lastRequest().url).toBe('/api/developer/projects');
    expect(lastRequest().body.project.websiteUrl).toBe('https://daftracker.org');
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
};

describe('"Is this your project?"', () => {
  const mountWithListing = (state = {}) => mount('developer', {
    ...DEVELOPER_ON, profile: PROFILE, projects: [], yourListing: LISTING, ...state,
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

  it('asks nothing before developer settings are set up', () => {
    mountWithListing({ profile: null });
    expect(yourListingDialog()).toBeNull();
  });

  it('claims the listing and opens it as a project', async () => {
    const setProjectId = jest.fn();
    mount('developer', { ...DEVELOPER_ON, profile: PROFILE, projects: [], yourListing: LISTING }, { setProjectId });
    respondWith({
      ...DEVELOPER_ON, profile: PROFILE, yourListing: null, projectId: '42',
      projects: [publicProject({ id: '42', name: LISTING.name, linkedListing: true })],
    });
    await clickAndSettle(buttonNamed(yourListingDialog(), 'Yes, add it'));
    expect(lastRequest()).toMatchObject({ url: '/api/developer/listings/42/claim', method: 'POST' });
    expect(setProjectId).toHaveBeenLastCalledWith('42');
    expect(yourListingDialog()).toBeNull();
    expect(container.querySelector('[data-agent-action="new-key"]')).toBeTruthy();
    expect(developerPanel().textContent).toContain('this is the Mishnah Yomit Tracker listing');
  });

  it('stops asking once the developer says it is not theirs', async () => {
    mountWithListing();
    respondWith({ ...DEVELOPER_ON, profile: PROFILE, projects: [], yourListing: null });
    await clickAndSettle(buttonNamed(yourListingDialog(), "No, it's not mine"));
    expect(lastRequest()).toMatchObject({ url: '/api/developer/listings/42/dismiss', method: 'POST' });
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
    respondWith({ ...DEVELOPER_ON, profile: PROFILE, projectId: '7', projects: [publicProject({ id: '7', visibility })] });
    await clickAndSettle(container.querySelector('[data-agent-action="create-project"]'));
  };

  it('opens the new project, ready for a key', async () => {
    const setProjectId = jest.fn();
    openNewProject({}, { setProjectId });
    await fillProject('public');
    expect(lastRequest().body.project.visibility).toBe('public');
    expect(setProjectId).toHaveBeenLastCalledWith('7');
    expect(container.querySelector('.devPocNewProject')).toBeNull();
    expect(container.querySelector('[data-agent-action="new-key"]')).toBeTruthy();
  });

  it('keeps the form open with the server error when saving fails', async () => {
    openNewProject();
    typeInto(container.querySelector('#devPocProjectDescription'), 'A tracker');
    typeInto(container.querySelector('#devPocProjectUrl'), 'daftracker.org');
    act(() => { visibilityRadio('private').click(); });
    global.fetch = jest.fn(() => Promise.resolve({ ok: false, json: () => Promise.resolve({ error: 'Give the project a name.' }) }));
    await clickAndSettle(container.querySelector('[data-agent-action="create-project"]'));
    expect(container.querySelector('.devPocNewProject')).toBeTruthy();
    expect(container.querySelector('[role="alert"]').textContent).toContain('Give the project a name.');
  });
});

const publicProject = (extra = {}) => ({
  id: 'proj01', name: 'Daf Tracker', description: 'A tracker', visibility: 'public', organization: '',
  websiteUrl: 'https://daftracker.org', aiAssisted: false, linkedListing: false,
  consentWithdrawnAt: null, keys: [], ...extra,
});

describe('making a public project private', () => {
  const editPublicProject = () => {
    mount('developer', { ...DEVELOPER_ON, profile: PROFILE, projects: [publicProject()] }, { projectId: 'proj01' });
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

  it('saves the project as private', async () => {
    const dialog = editPublicProject();
    act(() => { buttonNamed(dialog, 'Make private').click(); });
    respondWith({ ...DEVELOPER_ON, profile: PROFILE, projects: [publicProject({ visibility: 'private' })] });
    await clickAndSettle(container.querySelector('[data-agent-action="save-project"]'));
    expect(lastRequest()).toMatchObject({ url: '/api/developer/projects/proj01', method: 'POST' });
    expect(lastRequest().body.project.visibility).toBe('private');
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
  const withKey = (extra) => publicProject({
    keys: [{ id: 'k1', label: 'Production', value: 'sfr_test_x', created: null, restrictToWebsite: false }],
    ...extra,
  });
  const deleteFromEditor = (projects) => {
    mount('developer', { ...DEVELOPER_ON, profile: PROFILE, projects }, { projectId: 'proj01' });
    act(() => { buttonNamed(container, 'Edit project').click(); });
    act(() => { buttonNamed(container, 'Delete project').click(); });
    return container.querySelector('[aria-labelledby="devPocConfirmTitle"]');
  };
  const other = { ...publicProject({ id: 'proj02', name: 'Other' }) };

  it('deletes the project, naming the keys that stop working', async () => {
    const dialog = deleteFromEditor([withKey(), other]);
    expect(dialog.textContent).toContain('These keys stop working right away: Production');
    respondWith({ ...DEVELOPER_ON, profile: PROFILE, projects: [other] });
    await clickAndSettle(buttonNamed(dialog, 'Delete project'));
    expect(lastRequest()).toMatchObject({ url: '/api/developer/projects/proj01', method: 'DELETE' });
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
  const projectWithKey = () => publicProject({
    keys: [{ id: 'k1', label: 'Production', value: 'sfr_test_x', created: '2026-09-01T00:00:00Z', restrictToWebsite: false }],
  });

  it('leads the website restriction with the allowed-origin rule, explained on request', () => {
    mount('developer', { ...DEVELOPER_ON, profile: PROFILE, projects: [projectWithKey()] }, { projectId: 'proj01' });
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
    mount('developer', { ...DEVELOPER_ON, profile: PROFILE, projects: [projectWithKey()] }, { projectId: 'proj01' });
    const meta = container.querySelector('.devPocKeyMeta').textContent;
    expect(meta).toContain('Created');
    const body = container.querySelector('.devPocProjectBody').textContent;
    expect(body).not.toContain('Last used');
    expect(body).not.toMatch(/requests in the last|requests per day|requests by key/i);
  });
});

describe('keys', () => {
  const projectWithKey = () => publicProject({
    keys: [{ id: 'k1', label: 'Production', value: 'sfr_x', created: '2026-09-01T00:00:00Z', restrictToWebsite: false }],
  });
  const mountProject = (project) => mount('developer', { ...DEVELOPER_ON, profile: PROFILE, projects: [project] }, { projectId: 'proj01' });

  it('creates a key and shows it once the setup wait is over', async () => {
    jest.useFakeTimers();
    mountProject(publicProject());
    act(() => { container.querySelector('[data-agent-action="new-key"]').click(); });
    typeInto(container.querySelector('#devPocKeyLabel'), 'Production');
    respondWith({ ...DEVELOPER_ON, profile: PROFILE, keyId: 'k1', projects: [projectWithKey()] });
    await act(async () => { container.querySelector('[data-agent-action="create-key"]').click(); await flush(); });
    expect(lastRequest()).toMatchObject({ url: '/api/developer/projects/proj01/keys', body: { label: 'Production' } });
    expect(developerPanel().textContent).toContain('Setting up your key');
    await act(async () => { jest.advanceTimersByTime(4000); await flush(); });
    expect(developerPanel().textContent).toContain('Ready to use');
    jest.useRealTimers();
  });

  it('says so when the key could not be created', async () => {
    jest.useFakeTimers();
    mountProject(publicProject());
    act(() => { container.querySelector('[data-agent-action="new-key"]').click(); });
    typeInto(container.querySelector('#devPocKeyLabel'), 'Production');
    global.fetch = jest.fn(() => Promise.resolve({ ok: false, json: () => Promise.resolve({ error: 'Nope' }) }));
    await act(async () => { container.querySelector('[data-agent-action="create-key"]').click(); await flush(); });
    await act(async () => { jest.advanceTimersByTime(4000); await flush(); });
    expect(developerPanel().textContent).toContain("We couldn't create your key.");
    jest.useRealTimers();
  });

  it('restricts a key to the website', async () => {
    mountProject(projectWithKey());
    respondWith({ ...DEVELOPER_ON, profile: PROFILE, projects: [projectWithKey()] });
    await clickAndSettle(container.querySelector('.devPocRestriction input'));
    expect(lastRequest()).toMatchObject({ url: '/api/developer/keys/k1', method: 'POST', body: { restrictToWebsite: true } });
  });

  it('deletes a key after confirming', async () => {
    mountProject(projectWithKey());
    act(() => { buttonNamed(container.querySelector('.devPocKey'), 'Delete key').click(); });
    respondWith({ ...DEVELOPER_ON, profile: PROFILE, projects: [publicProject()] });
    await clickAndSettle(buttonNamed(container.querySelector('[aria-labelledby="devPocConfirmTitle"]'), 'Delete key'));
    expect(lastRequest()).toMatchObject({ url: '/api/developer/keys/k1', method: 'DELETE' });
    expect(container.querySelector('.devPocKey')).toBeNull();
  });
});

describe('dialog keyboard behaviour', () => {
  const projectWithKey = () => publicProject({
    keys: [{ id: 'k1', label: 'Production', value: 'sfr_x', created: null, restrictToWebsite: false }],
  });
  const openDeleteKey = () => {
    mount('developer', { ...DEVELOPER_ON, profile: PROFILE, projects: [projectWithKey()] }, { projectId: 'proj01' });
    const opener = buttonNamed(container.querySelector('.devPocKey'), 'Delete key');
    act(() => { opener.focus(); opener.click(); });
    return { opener, dialog: container.querySelector('[aria-labelledby="devPocConfirmTitle"]') };
  };
  const press = (key, init = {}) => act(() => {
    document.activeElement.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true, ...init }));
  });

  it("closes on Escape without the key reaching the panel around the page", () => {
    const outer = jest.fn();
    container = document.createElement('div');
    document.body.appendChild(container);
    act(() => {
      ReactDOM.render(
        <div onKeyDown={e => { if (e.key === 'Escape') { outer(); } }}>
          <SettingsPage tab="developer" projectId="proj01" accountSettings={{ socialProviders: [] }}
            initialDeveloper={{ ...DEVELOPER_ON, profile: PROFILE, projects: [projectWithKey()] }}
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
    mount('developer', { ...DEVELOPER_ON, profile: PROFILE, projects: [] });
    expect(developerPanel().textContent).toContain('הגדרות מפתחים');
    expect(developerPanel().textContent).toContain('עדיין אין פרויקטים');
    expect(developerPanel().textContent).not.toContain('No projects yet');
  });

  it('asks "Is this your project?" in Hebrew', () => {
    Sefaria.interfaceLang = 'hebrew';
    mount('developer', { ...DEVELOPER_ON, profile: PROFILE, projects: [], yourListing: LISTING });
    expect(yourListingDialog().textContent).toContain('האם זה הפרויקט שלך?');
  });
});

describe('confirming the email', () => {
  const unverified = { developerEnabled: false, ssoConnected: false, emailVerified: false };
  const linkSent = { ...unverified, confirmationSentAt: '2026-10-11T00:00:00Z' };

  it('offers only the emailed link, never a change of sign-in method', () => {
    mount('developer', unverified);
    act(() => { buttonNamed(developerPanel(), 'Get started').click(); });
    expect(buttonNamed(developerPanel(), 'Email me a confirmation link')).toBeTruthy();
    expect(developerPanel().textContent).not.toContain('Google');
    expect(developerPanel().textContent).not.toContain('Apple');
    expect(developerPanel().textContent).toContain('you keep signing in the way you do now');
  });

  it('asks the server to send the link, then shows the check-your-email step', async () => {
    mount('developer', unverified);
    act(() => { buttonNamed(developerPanel(), 'Get started').click(); });
    respondWith(linkSent);
    await clickAndSettle(buttonNamed(developerPanel(), 'Email me a confirmation link'));
    expect(lastRequest()).toMatchObject({ url: '/api/developer/confirmation', method: 'POST' });
    expect(developerPanel().textContent).toContain('Check your email');
    expect(developerPanel().textContent).toContain('tova@example.org');
    expect(buttonNamed(developerPanel(), 'Resend the link')).toBeTruthy();
  });

  it('lets an account with a confirmed email straight in', async () => {
    jest.useFakeTimers();
    mount('developer', { ...unverified, emailVerified: true });
    respondWith({ ...unverified, emailVerified: true, developerEnabled: true });
    await clickAndSettle(buttonNamed(developerPanel(), 'Get started'));
    expect(lastRequest()).toMatchObject({ url: '/api/developer/enable', method: 'POST' });
    expect(developerPanel().textContent).toContain('Setting up developer settings');
    act(() => { jest.runAllTimers(); });
    expect(developerPanel().textContent).toContain('About you');
    jest.useRealTimers();
  });

  it('saves the profile and moves on to projects', async () => {
    mount('developer', DEVELOPER_ON);
    act(() => { container.querySelector('.devPocLegal input[type="checkbox"]').click(); });
    respondWith({ ...DEVELOPER_ON, profile: PROFILE, projects: [] });
    await clickAndSettle(container.querySelector('[data-agent-action="save-profile"]'));
    expect(lastRequest()).toMatchObject({ url: '/api/developer/profile', method: 'POST' });
    expect(lastRequest().body.profile.termsAccepted).toBe(true);
    expect(developerPanel().textContent).toContain('No projects yet');
  });
});

describe('the confirmation link', () => {
  const linkSent = {
    developerEnabled: false, ssoConnected: false, emailVerified: false, confirmationSentAt: '2026-10-11T00:00:00Z',
  };

  it('is noticed by the waiting tab within a few seconds', async () => {
    jest.useFakeTimers();
    mount('developer', linkSent);
    respondWith(linkSent);
    await act(async () => { jest.advanceTimersByTime(3000); await flush(); });
    expect(developerPanel().textContent).toContain('Check your email');

    respondWith({ ...linkSent, emailVerified: true, developerEnabled: true, confirmationSentAt: null });
    await act(async () => { jest.advanceTimersByTime(3000); await flush(); });
    act(() => { jest.runOnlyPendingTimers(); });
    expect(developerPanel().textContent).toContain('Your email is confirmed.');
    expect(developerPanel().textContent).toContain('About you');
    jest.useRealTimers();
  });

  it('is checked at once when another tab in this browser signals it', async () => {
    mount('developer', linkSent);
    respondWith({ ...linkSent, emailVerified: true, developerEnabled: true });
    await act(async () => {
      window.dispatchEvent(new StorageEvent('storage', { key: 'sefariaDeveloperEmailConfirmed', newValue: '1' }));
      await flush();
    });
    expect(lastRequest()).toMatchObject({ url: '/api/developer/state', method: 'GET' });
    expect(developerPanel().textContent).toContain('Setting up developer settings');
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
  const MOCK = { ssoOverride: null, realSsoProviders: [], confirmationKey: null };

  it('are hidden unless the server has them on', () => {
    mount('developer', { ...DEVELOPER_ON, profile: PROFILE });
    expect(container.querySelector('.devPocPanel')).toBeNull();
  });

  it('start over through the mock API', async () => {
    mount('developer', { ...DEVELOPER_ON, profile: PROFILE, mock: MOCK });
    respondWith({ developerEnabled: false, ssoConnected: false, emailVerified: false, mock: { ...MOCK, ssoOverride: false } });
    await clickAndSettle(container.querySelector('[data-scenario="email"]'));
    expect(lastRequest()).toMatchObject({
      url: '/api/developer/mock', body: { action: 'start-over', ssoOverride: false, emailVerified: false },
    });
    expect(container.querySelector('.devPocPanelStatus').textContent).toContain('Email account · email not confirmed');
  });

  it('add a listing submitted with the account email, which is then offered', async () => {
    mount('developer', { ...DEVELOPER_ON, profile: PROFILE, projects: [], mock: MOCK });
    respondWith({ ...DEVELOPER_ON, profile: PROFILE, projects: [], yourListing: LISTING, mock: MOCK });
    await clickAndSettle(container.querySelector('[data-poc-control="create-listing"]'));
    expect(lastRequest().body).toEqual({ action: 'create-listing' });
    expect(yourListingDialog().textContent).toContain('Mishnah Yomit Tracker');
  });

  it('open the mock email, whose button is the real confirmation link', () => {
    mount('developer', {
      developerEnabled: false, ssoConnected: false, emailVerified: false, confirmationSentAt: '2026-10-11T00:00:00Z',
      mock: { ...MOCK, confirmationKey: 'abc:123' },
    });
    act(() => { container.querySelector('[data-agent-action="mock-open-email"]').click(); });
    const link = container.querySelector('[data-agent-action="mock-confirm-email"]');
    expect(link.getAttribute('href')).toBe('/settings/developer/confirm-email/abc:123');
    expect(link.getAttribute('target')).toBe('_blank');
  });
});


describe('a confirmation link that cannot confirm', () => {
  const renderLink = (status) => {
    container = document.createElement('div');
    document.body.appendChild(container);
    act(() => { ReactDOM.render(<EmailLinkPage link={{ status, key: 'abc:123' }} />, container); });
  };

  it('offers a new link when it has expired', async () => {
    renderLink('expired');
    expect(container.querySelector('h1').textContent).toBe('This link has expired');
    respondWith({ sent: true });
    await clickAndSettle(buttonNamed(container, 'Send a new link'));
    expect(lastRequest()).toEqual({ url: '/api/developer/confirmation/new-link', method: 'POST', body: { key: 'abc:123' } });
    expect(container.textContent).toContain('We sent a new link. Check your email.');
    expect(buttonNamed(container, 'Send a new link')).toBeUndefined();
  });

  it('shows the server\'s reason when a new link is refused', async () => {
    renderLink('expired');
    global.fetch = jest.fn(() => Promise.resolve({ ok: false, json: () => Promise.resolve({ error: 'Wait a minute before asking for another email.' }) }));
    await clickAndSettle(buttonNamed(container, 'Send a new link'));
    expect(container.querySelector('[role="alert"]').textContent).toBe('Wait a minute before asking for another email.');
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
    developerEnabled: true, ssoConnected: false, emailVerified: false, profile: PROFILE,
    projects: [publicProject({
      keys: [{ id: 'k1', label: 'Production', value: 'sfr_test_x', created: '2026-09-01T00:00:00Z', restrictToWebsite: false }],
    })],
  };

  it('keeps projects and keys on show but offers no new ones', () => {
    mount('developer', changedEmail, { projectId: 'proj01' });
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
    mount('developer', { ...changedEmail, projects: [] });
    expect(developerPanel().textContent).toContain('No projects yet');
    expect(developerPanel().querySelector('[data-agent-action="new-project"]')).toBeNull();
  });

  it('emails a link to the new address', async () => {
    mount('developer', changedEmail);
    respondWith({ ...changedEmail, confirmationSentAt: '2026-10-12T00:00:00Z' });
    await clickAndSettle(buttonNamed(developerPanel(), 'Email me a confirmation link'));
    expect(lastRequest()).toMatchObject({ url: '/api/developer/confirmation', method: 'POST' });
    expect(developerPanel().textContent).toContain('We sent a confirmation link to tova@example.org');
    expect(buttonNamed(developerPanel(), 'Resend the link')).toBeTruthy();
  });

  it('offers new projects again once the new address is confirmed', () => {
    mount('developer', { ...changedEmail, emailVerified: true });
    expect(developerPanel().textContent).not.toContain('Confirm your new email address');
    expect(developerPanel().querySelector('[data-agent-action="new-project"]')).toBeTruthy();
  });
});
