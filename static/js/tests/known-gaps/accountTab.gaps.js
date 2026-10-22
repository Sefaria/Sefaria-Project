/**
 * Account tab behaviour that is wanted but not built yet. Each test title carries
 * "@known-gap <case id>"; these fail until the gap is fixed.
 *
 * Kept out of the default Jest run: the file name doesn't match *.test.js. Run with
 *   npx jest --testMatch '<rootDir>/static/js/tests/known-gaps/*.gaps.js'
 */

jest.mock('../../sefaria/sefaria', () => {
  const strings = {
    en: require('../../sefaria/i18n/interface/en.json'),
    he: require('../../sefaria/i18n/interface/he.json'),
  };
  const sefaria = {
    interfaceLang: 'english',
    full_name: 'Tova Levi',
    _email: 'tova@example.org',
    track: { event: () => {}, setInterfaceLanguage: () => {} },
  };
  const lang = () => (sefaria.interfaceLang === 'hebrew' ? 'he' : 'en');
  /* Like Sefaria._: keyed IDs resolve from the interface string maps, and free text passes
     through untranslated. */
  sefaria._ = (s) => (/^[a-z0-9_]+(\.[a-z0-9_]+)+$/.test(s) ? (strings[lang()][s] || strings.en[s] || s) : s);
  sefaria._v = (options) => options[lang()];
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

const HEBREW = /[֐-׿]/;

let container = null;

function mount(settings = {}) {
  container = document.createElement('div');
  document.body.appendChild(container);
  act(() => {
    ReactDOM.render(
      <SettingsPage
        tab="account"
        projectId={null}
        accountSettings={{
          emailNotifications: 'daily', libraryAssistantEnabled: true, email: 'tova@example.org',
          socialProviders: [], sheetsExport: { gauthEmail: null }, torahSpecific: true, ...settings,
        }}
        initialDeveloper={null}
        setTab={() => {}}
        setProjectId={() => {}}
      />,
      container,
    );
  });
}

beforeEach(() => {
  Sefaria.interfaceLang = 'english';
  $.post.mockClear();
  window.alert = jest.fn();
});

afterEach(() => {
  if (!container) { return; }
  ReactDOM.unmountComponentAtNode(container);
  container.remove();
  container = null;
});

describe('Hebrew interface, email change', () => {
  it.each([
    ['#email', 'New Email'],
    ['#confirmEmail', 'Confirm New Email'],
    ['#confirmPassword', 'Password'],
  ])('shows the %s placeholder in Hebrew, as the old page did @known-gap N-M2', (selector, english) => {
    Sefaria.interfaceLang = 'hebrew';
    mount();
    const placeholder = container.querySelector('#username-change-edit ' + selector).getAttribute('placeholder');
    expect(placeholder).not.toBe(english);
    expect(placeholder).toMatch(HEBREW);
  });
});

describe('saving on a site that is not Torah-specific', () => {
  it('does not turn reading history off, since the page has no reading history setting @known-gap N-M15', () => {
    mount({ torahSpecific: false });
    act(() => { container.querySelector('.saveAccountSettingsBtn').click(); });
    const [, data] = $.post.mock.calls[$.post.mock.calls.length - 1];
    const { settings } = JSON.parse(data.json);
    expect(settings.reading_history).not.toBe(false);
  });
});
