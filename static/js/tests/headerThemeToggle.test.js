/**
 * Where the dark mode toggle sits in the real Header.
 *
 * Desktop (and tablet, which uses the desktop header): in `.header-icons`, right after the module
 * switcher and right before the avatar slot (LoggedInDropdown, or LoggedOutDropdown whose user
 * icon plays the avatar role), for every module, logged in or out, in both interface languages.
 *
 * Mobile: never in the top bar; in the hamburger menu's `.mobileAccountLinks`, right after
 * `.mobileInterfaceLanguageToggle`, and tapping it leaves the menu open.
 */
import React from 'react';
import ReactDOM from 'react-dom';
import { act } from 'react-dom/test-utils';

jest.mock('../sefaria/sefaria', () => {
  const en = require('../sefaria/i18n/interface/en.json');
  const he = require('../sefaria/i18n/interface/he.json');
  const Sefaria = {
    LIBRARY_MODULE: 'library',
    VOICES_MODULE: 'voices',
    activeModule: 'library',
    interfaceLang: 'english',
    theme: null,
    _uid: null,
    _debug: false,
    slug: 'test-user',
    full_name: 'Test User',
    profile_pic_url: '',
    breakpoints: { MOBILE: 'mobile', TABLET: 'tablet', DESKTOP: 'desktop' },
    mockBreakpoint: 'desktop',
    _siteSettings: {
      TORAH_SPECIFIC: true,
      HELP_CENTER_URLS: { HE: 'https://help.example/he', EN_US: 'https://help.example/en' },
    },
    getLogoutUrl: () => '/logout',
    util: {
      fullURL: (url) => url,
      currentPath: () => '/',
      getCookieDomain: () => '.sefaria.org',
    },
  };
  Sefaria.getBreakpoint = () => Sefaria.mockBreakpoint;
  Sefaria._ = (key) => (Sefaria.interfaceLang === 'hebrew' ? he : en)[key] || key;
  Sefaria._v = ({ he: h, en: e }) => (Sefaria.interfaceLang === 'hebrew' ? h : e);
  return { __esModule: true, default: Sefaria };
});

jest.mock('../sefaria/theme', () => {
  const THEMES = ['light', 'dark'];
  return {
    __esModule: true,
    THEMES,
    COOKIE: 'theme',
    normalizeTheme: (v) => (THEMES.includes(v) ? v : null),
    writeStoredTheme: jest.fn(),
    applyTheme: jest.fn((t) => global.document.documentElement.setAttribute('data-theme', t)),
    getCurrentTheme: () => global.document.documentElement.dataset.theme,
  };
});

// Misc.jsx imports a stylesheet Jest cannot parse, so the few pieces Header uses are stubbed
// with markup close enough for placement checks. (Factories must be inline: jest hoists them.)
jest.mock('../Misc', () => {
  const React = require('react');
  const Sefaria = require('../sefaria/sefaria').default;
  const InterfaceText = ({ text, children }) => {
    const isHe = Sefaria.interfaceLang === 'hebrew';
    const content = text ? (isHe ? text.he : text.en) : Sefaria._(children);
    return React.createElement('span', { className: isHe ? 'int-he' : 'int-en' }, content);
  };
  return {
    __esModule: true,
    InterfaceText,
    GlobalWarningMessage: () => null,
    InterfaceLanguageMenu: () => React.createElement('div', { className: 'interfaceLinks' }),
    LanguageToggleButton: () => React.createElement('button', { className: 'languageToggle' }),
    DonateLink: ({ classes, children }) => React.createElement('a', { className: classes, href: '/donate' }, children),
    useOnceFullyVisible: () => React.useRef(null),
  };
});
jest.mock('../HeaderAutocomplete', () => ({
  __esModule: true,
  HeaderAutocomplete: () => require('react').createElement('div', { className: 'searchBox' }),
}));
jest.mock('../ProfilePic', () => {
  const React = require('react');
  return {
    __esModule: true,
    ProfilePic: React.forwardRef((props, ref) => React.createElement('div', { className: 'profile-pic', ref, ...props, url: undefined, len: undefined, name: undefined })),
  };
});

import Sefaria from '../sefaria/sefaria';
import { Header } from '../Header';

let container;
const noop = () => {};

const renderHeader = (props = {}) => {
  const allProps = {
    multiPanel: true,
    headerMode: false,
    onRefClick: noop,
    showSearch: noop,
    openTopic: noop,
    openURL: noop,
    module: Sefaria.activeModule,
    mobileNavMenuOpen: false,
    onMobileMenuButtonClick: jest.fn(),
    notificationCount: 0,
    ...props,
  };
  act(() => { ReactDOM.render(<Header {...allProps} />, container); });
  return allProps;
};

const setUp = ({ module = 'library', loggedIn = false, lang = 'english', breakpoint = 'desktop', torahSpecific = true } = {}) => {
  Sefaria.activeModule = module;
  Sefaria._uid = loggedIn ? 42 : null;
  Sefaria.interfaceLang = lang;
  Sefaria.mockBreakpoint = breakpoint;
  Sefaria._siteSettings.TORAH_SPECIFIC = torahSpecific;
};

beforeEach(() => {
  container = document.createElement('div');
  document.body.appendChild(container);
  document.documentElement.removeAttribute('data-theme');
  Sefaria.theme = null;
  global.gtag = jest.fn();
  global.sa_event = jest.fn();
  setUp();
});

afterEach(() => {
  act(() => { ReactDOM.unmountComponentAtNode(container); });
  container.remove();
  delete global.gtag;
  delete global.sa_event;
});

const isModuleSwitcher = (el) => !!el && el.matches('.headerDropdownMenu') &&
  !!el.querySelector('img[src$="/moduleswitcher_mdl.svg"]');
const isAvatar = (el, loggedIn) => !!el && el.matches('.headerDropdownMenu') &&
  !!el.querySelector(loggedIn ? '.profile-pic' : 'img[src$="/profile_loggedout_mdl.svg"]');

const MATRIX = [];
['library', 'voices'].forEach((module) =>
  [false, true].forEach((loggedIn) =>
    ['english', 'hebrew'].forEach((lang) => MATRIX.push([module, loggedIn, lang]))));

describe('desktop header', () => {
  test.each(MATRIX)('%s, logged in: %p, %s interface: after the module switcher, before the avatar', (module, loggedIn, lang) => {
    setUp({ module, loggedIn, lang });
    renderHeader({ module });
    const icons = container.querySelector('.headerInner .header-icons');
    const toggles = container.querySelectorAll('button.themeToggle');
    expect(toggles).toHaveLength(1);
    const toggle = toggles[0];
    expect(toggle.parentElement).toBe(icons);
    expect(isModuleSwitcher(toggle.previousElementSibling)).toBe(true);
    expect(isAvatar(toggle.nextElementSibling, loggedIn)).toBe(true);
    expect(icons.lastElementChild).toBe(toggle.nextElementSibling);  // avatar stays last
    expect(toggle.getAttribute('aria-label')).toBe(lang === 'hebrew' ? 'מצב כהה' : 'Dark mode');
    expect(container.querySelector('.mobileThemeToggle')).toBeNull();
  });

  test('tablet uses the desktop header, toggle included', () => {
    setUp({ breakpoint: 'tablet' });
    renderHeader();
    const toggle = container.querySelector('.header-icons > button.themeToggle');
    expect(isModuleSwitcher(toggle.previousElementSibling)).toBe(true);
    expect(isAvatar(toggle.nextElementSibling, false)).toBe(true);
  });

  test('header mode (the header over a static page) renders it the same way', () => {
    renderHeader({ headerMode: true, multiPanel: false });
    const toggle = container.querySelector('.header-icons > button.themeToggle');
    expect(isModuleSwitcher(toggle.previousElementSibling)).toBe(true);
    expect(isAvatar(toggle.nextElementSibling, false)).toBe(true);
  });

  test('non-Torah-specific deployments (no help icon or language menu) still get it', () => {
    setUp({ torahSpecific: false });
    renderHeader();
    const toggle = container.querySelector('.header-icons > button.themeToggle');
    expect(isModuleSwitcher(toggle.previousElementSibling)).toBe(true);
    expect(isAvatar(toggle.nextElementSibling, false)).toBe(true);
  });

  test('full order of the icon cluster, logged out library', () => {
    renderHeader();
    const kinds = Array.from(container.querySelector('.header-icons').children).map((el) => {
      if (el.matches('button.themeToggle')) return 'theme';
      if (isModuleSwitcher(el)) return 'modules';
      if (isAvatar(el, false)) return 'avatar';
      if (el.querySelector('img[src$="/help_mdl.svg"]') || el.matches('a[href*="help"]')) return 'help';
      if (el.matches('.interfaceLinks')) return 'language';
      return el.className;
    });
    expect(kinds).toEqual(['help', 'language', 'modules', 'theme', 'avatar']);
  });

  test('full order of the icon cluster, logged in voices', () => {
    setUp({ module: 'voices', loggedIn: true });
    renderHeader({ module: 'voices' });
    const kinds = Array.from(container.querySelector('.header-icons').children).map((el) => {
      if (el.matches('button.themeToggle')) return 'theme';
      if (isModuleSwitcher(el)) return 'modules';
      if (isAvatar(el, true)) return 'avatar';
      if (el.matches('a[href*="help"]')) return 'help';
      if (el.matches('a[href="/notifications"]')) return 'notifications';
      return el.className;
    });
    expect(kinds).toEqual(['help', 'notifications', 'modules', 'theme', 'avatar']);
  });

  test('clicking it toggles the theme and does not open the neighbouring dropdowns', () => {
    renderHeader();
    const toggle = container.querySelector('button.themeToggle');
    act(() => { toggle.click(); });
    expect(toggle.getAttribute('aria-pressed')).toBe('true');
    expect(document.documentElement.getAttribute('data-theme')).toBe('dark');
    expect(container.querySelectorAll('.dropdownLinks-menu.open')).toHaveLength(0);
  });
});

describe('mobile header', () => {
  test.each(MATRIX)('%s, logged in: %p, %s interface: in the menu right after the language toggle, not in the top bar', (module, loggedIn, lang) => {
    setUp({ module, loggedIn, lang, breakpoint: 'mobile' });
    renderHeader({ module, multiPanel: false, mobileNavMenuOpen: true });

    const topBar = container.querySelector('.headerInner');
    expect(topBar.classList.contains('mobile')).toBe(true);
    expect(topBar.querySelector('.themeToggle, .mobileThemeToggle')).toBeNull();
    expect(container.querySelector('button.themeToggle')).toBeNull();

    const toggles = container.querySelectorAll('.mobileThemeToggle');
    expect(toggles).toHaveLength(1);
    const toggle = toggles[0];
    expect(toggle.parentElement).toBe(container.querySelector('.mobileNavMenu .mobileAccountLinks'));
    expect(toggle.previousElementSibling.matches('.mobileInterfaceLanguageToggle')).toBe(true);
    expect(toggle.nextElementSibling.tagName).toBe('HR');
    expect(toggle.getAttribute('role')).toBe('switch');
    expect(toggle.textContent).toBe(lang === 'hebrew' ? 'מצב כהה' : 'Dark mode');
  });

  test('tapping it switches the theme and leaves the menu open', () => {
    setUp({ breakpoint: 'mobile' });
    const props = renderHeader({ multiPanel: false, mobileNavMenuOpen: true });
    const toggle = container.querySelector('.mobileThemeToggle');
    act(() => { toggle.click(); });
    expect(toggle.getAttribute('aria-checked')).toBe('true');
    expect(document.documentElement.getAttribute('data-theme')).toBe('dark');
    expect(props.onMobileMenuButtonClick).not.toHaveBeenCalled();
    expect(container.querySelector('.mobileNavMenu').classList.contains('closed')).toBe(false);
    act(() => { toggle.click(); });
    expect(toggle.getAttribute('aria-checked')).toBe('false');
    expect(props.onMobileMenuButtonClick).not.toHaveBeenCalled();
  });

  test('it is in the (hidden) menu while the menu is closed, and in the menu over a text', () => {
    setUp({ breakpoint: 'mobile' });
    renderHeader({ multiPanel: false, mobileNavMenuOpen: false });
    expect(container.querySelector('.mobileNavMenu.closed .mobileAccountLinks .mobileThemeToggle')).not.toBeNull();

    // Over a library text the header is hidden unless the menu is open.
    renderHeader({ multiPanel: false, mobileNavMenuOpen: true, firstPanel: { mode: 'Text', menuOpen: null } });
    expect(container.querySelector('.mobileNavMenu:not(.closed) .mobileThemeToggle')).not.toBeNull();
  });

  test('switching breakpoint keeps the state: the remounted control reads <html>', () => {
    renderHeader();
    act(() => { container.querySelector('button.themeToggle').click(); });
    setUp({ breakpoint: 'mobile' });
    renderHeader({ multiPanel: false, mobileNavMenuOpen: true });
    expect(container.querySelector('.mobileThemeToggle').getAttribute('aria-checked')).toBe('true');
  });
});
