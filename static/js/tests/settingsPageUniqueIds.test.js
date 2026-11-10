/**
 * The new-project form, a project's editor and the key-name form can be on the page together: every field id, tip
 * id and radio group they render is its own, so labels, descriptions, radios and info tips never cross.
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

jest.mock('../sefaria/sefariaJquery', () => ({
  __esModule: true,
  default: { cookie: () => {}, post: () => {}, get: () => {} },
}));

jest.mock('../Misc', () => {
  const Sefaria = require('../sefaria/sefaria').default;
  return {
    __esModule: true,
    InterfaceText: ({ text, children }) =>
      text ? text[Sefaria.interfaceLang === 'hebrew' ? 'he' : 'en'] : (children ?? null),
  };
});

import React from 'react';
import ReactDOM from 'react-dom';
import { act } from 'react-dom/test-utils';
import Sefaria from '../sefaria/sefaria';
import SettingsPage from '../SettingsPage.jsx';

const PROFILE = {
  developerName: 'Tova Levi',
  description: '',
  additionalEmail: '',
  termsAccepted: true,
  developerNews: false,
  notADeveloper: false,
};
const PROJECT = {
  id: 'proj01',
  name: 'Daf Tracker',
  description: '',
  visibility: 'public',
  organization: '',
  websiteUrl: 'https://daftracker.org',
  aiAssisted: false,
  linkedListing: false,
  consentWithdrawnAt: null,
  keys: [],
};

let container = null;

const click = (element) =>
  act(() => {
    element.click();
  });
const button = (root, name) => Array.from(root.querySelectorAll('button')).find((b) => b.textContent.trim() === name);

beforeEach(() => {
  jest.useFakeTimers();
  Sefaria.interfaceLang = 'english';
  window.scrollTo = jest.fn();
  global.fetch = jest.fn(() => new Promise(() => {}));
  document.head.innerHTML = '<meta name="csrf-token" content="test-token">';
  container = document.createElement('div');
  document.body.appendChild(container);
  act(() => {
    ReactDOM.render(
      <SettingsPage
        tab="developer"
        projectId="proj01"
        accountSettings={{ socialProviders: [], email: 'tova@example.org' }}
        initialDeveloper={{ developerEnabled: true, ssoConnected: true, profile: PROFILE, projects: [PROJECT] }}
        setTab={() => {}}
        setProjectId={() => {}}
      />,
      container
    );
  });
  /* Three at once: the new-project form, the open project's editor, and its key-name form. */
  click(container.querySelector('[data-agent-action="new-project"]'));
  click(button(container, 'Edit project'));
  click(button(container, 'Create your first key'));
});

afterEach(() => {
  ReactDOM.unmountComponentAtNode(container);
  container.remove();
  container = null;
  jest.useRealTimers();
});

const urlInputs = () => Array.from(container.querySelectorAll('[id$="devPocProjectUrl"]'));

describe('forms and sections rendered together', () => {
  it('renders two project forms and a key-name form', () => {
    expect(urlInputs()).toHaveLength(2);
    expect(container.querySelectorAll('[id$="devPocKeyLabel"]')).toHaveLength(1);
  });

  it('gives no DOM id to two elements', () => {
    const ids = Array.from(container.querySelectorAll('[id]')).map((el) => el.id);
    expect(ids.filter((id, i) => ids.indexOf(id) !== i)).toEqual([]);
  });

  it('points every label and description at exactly one element, inside its own form', () => {
    container.querySelectorAll('[aria-describedby]').forEach((el) => {
      el.getAttribute('aria-describedby')
        .split(' ')
        .forEach((id) => {
          const targets = container.querySelectorAll('[id="' + id + '"]');
          expect(targets).toHaveLength(1);
          const form = el.closest('form');
          if (form) {
            expect(form.contains(targets[0])).toBe(true);
          }
        });
    });
    container.querySelectorAll('label[for]').forEach((label) => {
      expect(container.querySelectorAll('[id="' + label.getAttribute('for') + '"]')).toHaveLength(1);
    });
  });

  it('gives each visibility choice its own radio group', () => {
    const radios = Array.from(container.querySelectorAll('input[type="radio"]'));
    const names = new Set(radios.map((r) => r.name));
    expect(radios).toHaveLength(4);
    expect(names.size).toBe(2);
    names.forEach((name) => expect(name).toMatch(/-devPocVisibility$/));
  });

  it("opens an info tip for the focused field only, in that field's own form", () => {
    const [first, second] = urlInputs();
    act(() => {
      second.focus();
    });
    expect(second.closest('.devPocField').querySelector('.devPocPopover')).toBeTruthy();
    expect(first.closest('.devPocField').querySelector('.devPocPopover')).toBeNull();
    act(() => {
      second.blur();
      first.focus();
    });
    expect(first.closest('.devPocField').querySelector('.devPocPopover')).toBeTruthy();
    expect(second.closest('.devPocField').querySelector('.devPocPopover')).toBeNull();
  });
});
