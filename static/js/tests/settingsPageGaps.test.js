/**
 * Developer settings edge cases that settingsPage.test.js leaves out: focus after the
 * no-website dialog, and which website addresses a key can be restricted to.
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
import SettingsPage from '../SettingsPage.jsx';
import { parseWebsite } from '../developerSettingsApi';

const DEVELOPER_ON = { developerEnabled: true, ssoConnected: true };
const PROFILE = {
  developerName: 'Tova Levi', description: '', additionalEmail: '',
  termsAccepted: true, developerNews: false, notADeveloper: false,
};

let container = null;

function mount(developer) {
  container = document.createElement('div');
  document.body.appendChild(container);
  act(() => {
    ReactDOM.render(
      <SettingsPage
        tab="developer"
        projectId={null}
        accountSettings={{ socialProviders: [], email: 'tova@example.org' }}
        initialDeveloper={developer}
        setTab={() => {}}
        setProjectId={() => {}}
      />,
      container,
    );
  });
}

const typeInto = (input, value) => {
  const proto = input.tagName === 'TEXTAREA' ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
  act(() => {
    Object.getOwnPropertyDescriptor(proto, 'value').set.call(input, value);
    input.dispatchEvent(new Event('input', { bubbles: true }));
  });
};
const buttonNamed = (root, name) => Array.from(root.querySelectorAll('button')).find(b => b.textContent.trim() === name);
const noWebsiteDialog = () => container.querySelector('[aria-labelledby="devPocNoWebsiteTitle"]');

/* A new project with everything but a website, submitted the way a click does: the submit
   button has focus when the dialog opens, so it is the dialog's opener. */
const submitWithoutWebsite = () => {
  global.fetch = jest.fn(() => new Promise(() => {}));
  mount({ ...DEVELOPER_ON, profile: PROFILE, projects: [] });
  act(() => { container.querySelector('[data-agent-action="new-project"]').click(); });
  typeInto(container.querySelector('#devPocProjectName'), 'Daf Tracker');
  typeInto(container.querySelector('#devPocProjectDescription'), 'A tracker');
  act(() => { container.querySelector('#devPocVisibilityPublic').click(); });
  const submit = container.querySelector('[data-agent-action="create-project"]');
  act(() => { submit.focus(); submit.click(); });
};

afterEach(() => {
  if (!container) { return; }
  ReactDOM.unmountComponentAtNode(container);
  container.remove();
  container = null;
});

describe('"Add a website" in the no-website dialog', () => {
  it('puts focus in the website field and saves nothing', () => {
    submitWithoutWebsite();
    expect(noWebsiteDialog()).toBeTruthy();
    act(() => { buttonNamed(noWebsiteDialog(), 'Add a website').click(); });
    expect(noWebsiteDialog()).toBeNull();
    expect(document.activeElement.id).toBe('devPocProjectUrl');
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it('puts focus in the website field when Escape chooses it', () => {
    submitWithoutWebsite();
    act(() => {
      document.activeElement.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }));
    });
    expect(noWebsiteDialog()).toBeNull();
    expect(document.activeElement.id).toBe('devPocProjectUrl');
  });
});

/* No product decision yet on local-development, IP or browser-extension origins; this pins
   today's behaviour so a change to it is deliberate. */
describe('website addresses a key cannot be restricted to', () => {
  it.each([
    ['http://localhost:3000'],
    ['localhost'],
    ['http://127.0.0.1:8000'],
    ['https://192.168.1.10'],
    ['chrome-extension://abcdefghijklmnopabcdefghijklmnop'],
    ['moz-extension://0f1e2d3c-1111-2222-3333-444455556666'],
  ])('rejects %s', (input) => {
    expect(parseWebsite(input).valid).toBe(false);
  });

  it('accepts an http:// website, keeping its scheme', () => {
    expect(parseWebsite('http://example.org')).toEqual({ valid: true, url: 'http://example.org' });
  });
});
