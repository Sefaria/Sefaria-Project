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
import SettingsPage from '../SettingsPage.jsx';
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

describe('Powered by listing matches', () => {
  it('offers a listing submitted with the account email', () => {
    openNewProject({ submitterEmailListingId: 'pb03' });
    const notice = container.querySelector('.devPocMatch');
    expect(notice.textContent).toContain('We found a Powered by Sefaria listing you submitted: Mishnah Yomit Tracker');
    expect(buttonNamed(notice, 'Link')).toBeTruthy();

    act(() => { buttonNamed(notice, 'Not mine').click(); });
    expect(container.querySelector('.devPocMatch')).toBeNull();
  });

  it('offers nothing when no listing has the account email', () => {
    openNewProject();
    expect(container.querySelector('.devPocMatch')).toBeNull();
  });

  it('spots a listed website however it is typed, and offers only a request to link', () => {
    openNewProject();
    typeInto(container.querySelector('#devPocProjectUrl'), 'https://www.DafYomiCompanion.org/');
    const notice = container.querySelector('.devPocMatch');
    expect(notice.textContent).toContain('This website is already on Powered by Sefaria');
    expect(notice.textContent).toContain('Daf Yomi Companion');
    expect(notice.textContent).not.toContain('editor@dafyomicompanion.org');
    expect(buttonNamed(notice, 'Link this listing')).toBeUndefined();

    act(() => { buttonNamed(notice, 'Request to link').click(); });
    expect(container.querySelector('.devPocMatch').textContent).toContain('Link requested');
  });

  it('lets the website match carry on as a new project', () => {
    openNewProject();
    typeInto(container.querySelector('#devPocProjectUrl'), 'parshasheets.org');
    act(() => { buttonNamed(container.querySelector('.devPocMatch'), 'Continue as a new project').click(); });
    expect(container.querySelector('.devPocMatch')).toBeNull();
  });

  it('offers to link a listed website whose submitter email is the account email', () => {
    openNewProject({ submitterEmailListingId: 'pb03' });
    typeInto(container.querySelector('#devPocProjectUrl'), 'mishnahtracker.app');
    const notices = container.querySelectorAll('.devPocMatch');
    expect(notices.length).toBe(1);
    expect(notices[0].textContent).toContain('This website is already on Powered by Sefaria');
    expect(buttonNamed(notices[0], 'Link this listing')).toBeTruthy();
  });

  it('sends a website owned by another account to hello@sefaria.org', () => {
    openNewProject();
    typeInto(container.querySelector('#devPocProjectUrl'), 'chavrutamatch.com');
    const notice = container.querySelector('.devPocMatch');
    expect(notice.textContent).toContain('already registered by another account');
    expect(notice.querySelector('a[href="mailto:hello@sefaria.org"]')).toBeTruthy();
    expect(notice.querySelector('button')).toBeNull();
  });
});

describe('linking a listing', () => {
  const startLink = () => {
    openNewProject({ submitterEmailListingId: 'pb03' });
    typeInto(container.querySelector('#devPocProjectDescription'), 'My own tracker');
    act(() => { buttonNamed(container.querySelector('.devPocMatch'), 'Link').click(); });
    return container.querySelector('[aria-labelledby="devPocConflictTitle"]');
  };

  it('shows each differing field side by side and chooses nothing', () => {
    const dialog = startLink();
    const fields = Array.from(dialog.querySelectorAll('[data-conflict]')).map(c => c.dataset.conflict);
    expect(fields).toEqual(['name', 'description', 'websiteUrl']);
    const name = dialog.querySelector('[data-conflict="name"]');
    expect(name.textContent).toContain('Daf Tracker');
    expect(name.textContent).toContain('Mishnah Yomit Tracker');
    expect(dialog.querySelector('#devPocKeep-name').value).toBe('');
    expect(buttonNamed(dialog, 'Link listing').disabled).toBe(true);
  });

  it('links with what the person kept and makes the project public', () => {
    const dialog = startLink();
    act(() => { buttonNamed(dialog.querySelector('[data-conflict="name"]'), 'Use this').click(); });
    typeInto(dialog.querySelector('#devPocKeep-description'), 'Both, really');
    const websiteSide = dialog.querySelectorAll('[data-conflict="websiteUrl"] .devPocConflictSide')[1];
    act(() => { buttonNamed(websiteSide, 'Use this').click(); });
    act(() => { buttonNamed(dialog, 'Link listing').click(); });

    expect(container.querySelector('[aria-labelledby="devPocConflictTitle"]')).toBeNull();
    expect(container.querySelector('#devPocProjectName').value).toBe('Daf Tracker');
    expect(container.querySelector('#devPocProjectDescription').value).toBe('Both, really');
    expect(container.querySelector('#devPocProjectUrl').value).toBe('mishnahtracker.app');
    expect(container.querySelector('.devPocLinked').textContent).toContain('Mishnah Yomit Tracker');
    expect(visibilityRadio('public').checked).toBe(true);
    expect(container.querySelector('.devPocMatch')).toBeNull();
  });

  it('cancels without changing anything', () => {
    const dialog = startLink();
    act(() => { buttonNamed(dialog, 'Cancel').click(); });
    expect(container.querySelector('.devPocLinked')).toBeNull();
    expect(container.querySelector('#devPocProjectDescription').value).toBe('My own tracker');
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
  websiteUrl: 'https://daftracker.org', aiAssisted: false, listingRequest: null, linkedListingId: null,
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

describe('agent instructions', () => {
  it('are in the DOM, visually hidden but not hidden from the accessibility tree', () => {
    mount('account');
    const block = container.querySelector('[data-agent-instructions]');
    expect(block.className).toBe('sr-only');
    expect(block.getAttribute('aria-hidden')).toBeNull();
    expect(block.textContent).toContain('AI agents are permitted to complete this whole process');
    expect(block.textContent).toContain('generating an API key');
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

  it('renders the listing match and visibility in Hebrew', () => {
    Sefaria.interfaceLang = 'hebrew';
    openNewProject({ submitterEmailListingId: 'pb03' });
    expect(container.querySelector('.devPocMatch').textContent).toContain('מצאנו רישום ב־Powered by Sefaria שהגשת');
    expect(visibilityRadio('public').parentElement.textContent).toContain('ציבורי');
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

describe('POC test panel', () => {
  it('starts over as an email account with the link already sent', () => {
    mount('developer', { ...DEVELOPER_ON, profile: PROFILE });
    act(() => { container.querySelector('[data-scenario="email-sent"]').click(); });
    expect(developerPanel().textContent).toContain('Check your email');
    expect(container.querySelector('.devPocPanelStatus').textContent).toContain('Email account · confirmation link sent');
  });

  it("gives a listing the account email as its submitter email", () => {
    openNewProject();
    expect(container.querySelector('.devPocMatch')).toBeNull();
    typeInto(container.querySelector('[data-poc-control="submitter-email-listing"]'), 'pb07');
    expect(lastSavedState().submitterEmailListingId).toBe('pb07');
    expect(container.querySelector('.devPocMatch').textContent).toContain('Rambam Daily Audio');
  });
});
