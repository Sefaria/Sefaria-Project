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

let container = null;

const DEVELOPER_ON = { developerEnabled: true, ssoOverride: true };
const PROFILE = {
  developerName: 'Tova Levi', description: '', additionalEmail: '',
  termsAccepted: true, developerNews: false, notADeveloper: false,
};

function mount(tab, developerPoc = null) {
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
      />,
      container,
    );
  });
}

const developerPanel = () => container.querySelectorAll('.settingsPanel')[1];
const buttonNamed = (root, name) => Array.from(root.querySelectorAll('button')).find(b => b.textContent.trim() === name);

beforeEach(() => {
  Sefaria.interfaceLang = 'english';
  global.fetch = jest.fn(() => Promise.resolve({ ok: true }));
});

afterEach(() => {
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

describe('making a project public', () => {
  const openNewProject = () => {
    mount('developer', { ...DEVELOPER_ON, profile: PROFILE, projects: [] });
    act(() => { buttonNamed(container, 'Create your first project').click(); });
    const nameInput = container.querySelector('#devPocProjectName');
    act(() => {
      const setValue = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set;
      setValue.call(nameInput, 'Daf Tracker');
      nameInput.dispatchEvent(new Event('input', { bubbles: true }));
    });
    return Array.from(container.querySelectorAll('input[name="devPocVisibility"]'));
  };

  it('starts private and previews what becomes public before switching', () => {
    const [privateRadio, publicRadio] = openNewProject();
    expect(privateRadio.checked).toBe(true);

    act(() => { publicRadio.click(); });

    const dialog = container.querySelector('[aria-labelledby="devPocPublicTitle"]');
    expect(dialog.textContent).toContain('Daf Tracker');
    expect(dialog.textContent).toContain('Tova Levi');
    expect(dialog.querySelector('a[href="https://developers.sefaria.org/docs/powered-by-sefaria"]')).toBeTruthy();
    expect(container.querySelector('input[name="devPocVisibility"]:checked')).toBe(privateRadio);

    act(() => { buttonNamed(dialog, 'Make public').click(); });

    expect(container.querySelector('[aria-labelledby="devPocPublicTitle"]')).toBeNull();
    expect(container.querySelector('input[name="devPocVisibility"]:checked').parentElement.textContent).toContain('Public');
  });

  it('stays private when the preview is dismissed', () => {
    const [privateRadio, publicRadio] = openNewProject();
    act(() => { publicRadio.click(); });
    act(() => { buttonNamed(container, 'Keep private').click(); });
    expect(container.querySelector('input[name="devPocVisibility"]:checked')).toBe(privateRadio);
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
});

describe('confirming the email', () => {
  const unverified = { developerEnabled: false, ssoOverride: false };

  it('offers an emailed link first, with Google or Apple as the alternative', () => {
    mount('developer', unverified);
    act(() => { buttonNamed(developerPanel(), 'Get started').click(); });
    const actions = Array.from(developerPanel().querySelectorAll('button')).map(b => b.textContent.trim());
    expect(actions.indexOf('Email me a confirmation link')).toBeLessThan(actions.indexOf('Continue with Google'));
    expect(developerPanel().textContent).toContain('you keep signing in the way you do now');
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
});
