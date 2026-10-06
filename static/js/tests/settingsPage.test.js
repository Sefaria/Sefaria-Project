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
import {
  applyPoweredByValues, fillRequiredAnswers, listingIncomplete, listingMissingFields, poweredByValues,
} from '../developerPocStore';

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
        projectSection={null}
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
  it('has nothing preselected, and marks Public as recommended', () => {
    openNewProject();
    expect(container.querySelector('input[name="devPocVisibility"]:checked')).toBeNull();
    expect(visibilityRadio('public').parentElement.textContent).toContain('Recommended');
    expect(visibilityRadio('private').parentElement.textContent).not.toContain('Recommended');
  });

  it("won't save until a visibility is chosen", () => {
    openNewProject();
    typeInto(container.querySelector('#devPocProjectDescription'), 'A tracker');
    typeInto(container.querySelector('#devPocProjectUrl'), 'daftracker.org');
    submitProject();
    expect(container.querySelector('[role="alert"]').textContent).toContain('Choose whether the project is public or private');
    expect(container.querySelector('.devPocNewProject')).toBeTruthy();
  });

  it('previews what becomes public before switching', () => {
    openNewProject();
    act(() => { visibilityRadio('public').click(); });

    const dialog = container.querySelector('[aria-labelledby="devPocPublicTitle"]');
    expect(dialog.textContent).toContain('Daf Tracker');
    expect(dialog.textContent).toContain('Tova Levi');
    expect(dialog.querySelector('a[href="https://developers.sefaria.org/docs/powered-by-sefaria"]')).toBeTruthy();
    expect(container.querySelector('input[name="devPocVisibility"]:checked')).toBeNull();

    act(() => { buttonNamed(dialog, 'Make public').click(); });

    expect(container.querySelector('[aria-labelledby="devPocPublicTitle"]')).toBeNull();
    expect(visibilityRadio('public').checked).toBe(true);
  });

  it('stays unchosen when the preview is dismissed', () => {
    openNewProject();
    act(() => { visibilityRadio('public').click(); });
    act(() => { buttonNamed(container, 'Keep private').click(); });
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

const ACCOUNT = { name: 'Tova Levi', email: 'tova@example.org' };
const detailsForm = () => container.querySelector('.pbfMode-project');
const formField = (name) => container.querySelector('#pbf-' + name);

describe('saving a public project', () => {
  it('opens the Powered by form at its own address, prefilled from the account and project', () => {
    const setProjectId = jest.fn();
    openNewProject({}, { setProjectId });
    typeInto(container.querySelector('#devPocProjectDescription'), 'A tracker');
    typeInto(container.querySelector('#devPocProjectUrl'), 'daftracker.org');
    act(() => { container.querySelector('input[type="checkbox"]').click(); });
    act(() => { visibilityRadio('public').click(); });
    act(() => { buttonNamed(container, 'Make public').click(); });
    submitProject();

    const saved = lastSavedState().projects[0];
    expect(saved.visibility).toBe('public');
    expect(setProjectId).toHaveBeenLastCalledWith(saved.id, 'powered-by');
    expect(detailsForm()).toBeTruthy();
    expect(formField('firstName').value).toBe('Tova');
    expect(formField('lastName').value).toBe('Levi');
    expect(formField('email').value).toBe('tova@example.org');
    expect(formField('projectName').value).toBe('Daf Tracker');
    expect(formField('projectLink').value).toBe('daftracker.org');
    expect(formField('description').value).toBe('A tracker');
    expect(container.querySelector('#pbf-vibeCoded input[value="Yes"]').checked).toBe(true);
    expect(container.querySelector('#pbf-endpointCategories')).toBeNull();

    act(() => { container.querySelector('[data-agent-action="back-to-project"]').click(); });
    expect(setProjectId).toHaveBeenLastCalledWith(saved.id);
    expect(container.querySelector('[data-badge="listing-incomplete"]')).toBeTruthy();
  });

  it('stays on the project list after saving a private project', () => {
    const setProjectId = jest.fn();
    openNewProject({}, { setProjectId });
    typeInto(container.querySelector('#devPocProjectDescription'), 'A tracker');
    typeInto(container.querySelector('#devPocProjectUrl'), 'daftracker.org');
    act(() => { visibilityRadio('private').click(); });
    submitProject();
    expect(setProjectId).toHaveBeenLastCalledWith(lastSavedState().projects[0].id);
    expect(detailsForm()).toBeNull();
  });
});

const publicProject = (extra = {}) => ({
  id: 'proj01', name: 'Daf Tracker', description: 'A tracker', visibility: 'public', organization: '',
  websiteUrl: 'https://daftracker.org', aiAssisted: false, listingRequest: null, linkedListingId: null,
  poweredByAnswers: null, consentWithdrawnAt: null, usage: { requests30: 0, lastUsed: null }, keys: [], ...extra,
});

const completeProject = (extra = {}) => {
  const project = publicProject(extra);
  return applyPoweredByValues(project, fillRequiredAnswers(poweredByValues(project, ACCOUNT), ACCOUNT));
};

describe('the Powered by details page', () => {
  const openDetails = (project = publicProject()) => mount(
    'developer', { ...DEVELOPER_ON, profile: PROFILE, projects: [project], expandedProjectId: project.id },
    { projectId: project.id, projectSection: 'powered-by' },
  );

  it('renders from its address and says the listing is incomplete', () => {
    openDetails();
    expect(detailsForm()).toBeTruthy();
    expect(container.querySelector('[data-badge="listing-incomplete"]')).toBeTruthy();
  });

  it('autosaves after a pause, and shared fields change the project', () => {
    jest.useFakeTimers();
    openDetails();
    typeInto(formField('projectName'), 'Daf Tracker Pro');
    expect(container.querySelector('.devPocSaveStatus').textContent).toBe('Saving…');
    const writesBefore = global.fetch.mock.calls.length;
    act(() => { jest.advanceTimersByTime(800); });
    expect(global.fetch.mock.calls.length).toBe(writesBefore + 1);
    expect(container.querySelector('.devPocSaveStatus').textContent).toBe('Saved');
    const saved = lastSavedState().projects[0];
    expect(saved.name).toBe('Daf Tracker Pro');
    expect(saved.poweredByAnswers.firstName).toBe('Tova');
    expect(saved.poweredByAnswers.projectName).toBeUndefined();
    act(() => { jest.runOnlyPendingTimers(); });
    jest.useRealTimers();
  });

  it('saves pending changes when leaving', () => {
    openDetails();
    typeInto(formField('lastName'), 'Levi-Cohen');
    act(() => { container.querySelector('[data-agent-action="back-to-project"]').click(); });
    expect(lastSavedState().projects[0].poweredByAnswers.lastName).toBe('Levi-Cohen');
  });

  it('shows stored answers rather than the prefill', () => {
    openDetails(publicProject({ poweredByAnswers: { firstName: 'Tovah', lastName: 'L', email: 'work@example.org' } }));
    expect(formField('firstName').value).toBe('Tovah');
    expect(formField('email').value).toBe('work@example.org');
    expect(formField('projectName').value).toBe('Daf Tracker');
  });

  it('drops the incomplete notice once every required field is filled', () => {
    openDetails(completeProject());
    expect(container.querySelector('[data-badge="listing-incomplete"]')).toBeNull();
  });

  it('can be filled from the POC test panel', () => {
    openDetails();
    act(() => { container.querySelector('[data-poc-control="fill-answers"]').click(); });
    expect(container.querySelector('[data-badge="listing-incomplete"]')).toBeNull();
    expect(lastSavedState().projects[0].poweredByAnswers.consent).toBeTruthy();
  });
});

describe('consent on the Powered by details page', () => {
  const openDetails = (project = publicProject()) => mount(
    'developer', { ...DEVELOPER_ON, profile: PROFILE, projects: [project], expandedProjectId: project.id },
    { projectId: project.id, projectSection: 'powered-by' },
  );
  const consentOption = (value) => container.querySelector(`#pbf-consent input[value="${value}"]`);

  it('starts as yes for a public project and is not missing', () => {
    openDetails();
    expect(consentOption('Yes').checked).toBe(true);
    expect(listingMissingFields(publicProject(), ACCOUNT)).not.toContain('consent');
  });

  it('makes a public project with everything else filled in complete', () => {
    const values = fillRequiredAnswers({ ...poweredByValues(publicProject(), ACCOUNT), consent: '' }, ACCOUNT);
    const project = applyPoweredByValues(publicProject(), { ...values, consent: '' });
    expect(listingIncomplete(project, ACCOUNT)).toBe(false);
  });

  it('asks before treating no as making the project private, and keeps yes if dismissed', () => {
    openDetails();
    act(() => { consentOption('No').click(); });
    const dialog = container.querySelector('[aria-labelledby="devPocPrivateTitle"]');
    expect(dialog).toBeTruthy();
    act(() => { buttonNamed(dialog, 'Keep public').click(); });
    expect(container.querySelector('[aria-labelledby="devPocPrivateTitle"]')).toBeNull();
    expect(consentOption('Yes').checked).toBe(true);
  });

  it('makes the project private when confirmed', () => {
    openDetails();
    act(() => { consentOption('No').click(); });
    act(() => { buttonNamed(container, 'Make private').click(); });
    const saved = lastSavedState().projects[0];
    expect(saved.visibility).toBe('private');
    expect(saved.consentWithdrawnAt).toBeTruthy();
    expect(saved.poweredByAnswers.consent).toBe('');
    expect(detailsForm()).toBeNull();
    expect(developerPanel().textContent).toContain('taken down from Powered by Sefaria');
  });
});

describe('listing completeness', () => {
  it('comes from the required Powered by fields, not from linking', () => {
    expect(listingIncomplete(publicProject({ linkedListingId: 'pb03' }), ACCOUNT)).toBe(true);
    expect(listingIncomplete(completeProject(), ACCOUNT)).toBe(false);
    expect(listingIncomplete(publicProject({ visibility: 'private' }), ACCOUNT)).toBe(false);
  });

  it('badges only incomplete public projects', () => {
    mount('developer', { ...DEVELOPER_ON, profile: PROFILE, projects: [completeProject()], expandedProjectId: 'proj01' });
    expect(container.querySelector('[data-badge="listing-incomplete"]')).toBeNull();
  });

  it("doesn't reopen the form when a complete public project is saved", () => {
    const setProjectId = jest.fn();
    mount('developer', { ...DEVELOPER_ON, profile: PROFILE, projects: [completeProject()], expandedProjectId: 'proj01' },
      { setProjectId });
    act(() => { buttonNamed(container, 'Edit project').click(); });
    act(() => { container.querySelector('[data-agent-action="save-project"]').click(); });
    expect(detailsForm()).toBeNull();
  });

  it('reopens the form when a public project with missing answers is saved', () => {
    mount('developer', { ...DEVELOPER_ON, profile: PROFILE, projects: [publicProject()], expandedProjectId: 'proj01' });
    act(() => { buttonNamed(container, 'Edit project').click(); });
    act(() => { container.querySelector('[data-agent-action="save-project"]').click(); });
    expect(detailsForm()).toBeTruthy();
  });
});

describe('making a public project private', () => {
  const editPublicProject = () => {
    mount('developer', { ...DEVELOPER_ON, profile: PROFILE, projects: [completeProject()],
      expandedProjectId: 'proj01' });
    act(() => { buttonNamed(container, 'Edit project').click(); });
    act(() => { visibilityRadio('private').click(); });
    return container.querySelector('[aria-labelledby="devPocPrivateTitle"]');
  };

  it('warns that the listing may already appear elsewhere', () => {
    const dialog = editPublicProject();
    expect(dialog.textContent).toContain('may already appear on Powered by Sefaria or elsewhere');
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
    expect(developerPanel().textContent).toContain('taken down from Powered by Sefaria');
  });

  it("doesn't ask for a project that was never public", () => {
    openNewProject();
    act(() => { visibilityRadio('private').click(); });
    expect(container.querySelector('[aria-labelledby="devPocPrivateTitle"]')).toBeNull();
    expect(visibilityRadio('private').checked).toBe(true);
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
    expect(visibilityRadio('public').parentElement.textContent).toContain('מומלץ');
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
