/**
 * Where the Appearance controls sit in the real Header, and how they behave inside its menus.
 *
 * Desktop (and tablet, which uses the desktop header): inside the account menu
 * (LoggedInDropdown, or LoggedOutDropdown for visitors), right after the Site Language item
 * (DropdownLanguageToggle), for every module, logged in or out, in both interface languages.
 * Choosing an option keeps the menu open. The header bar itself has no theme button any more.
 *
 * Mobile: never in the top bar; in the hamburger menu's `.mobileAccountLinks`, right after
 * `.mobileInterfaceLanguageToggle`, and choosing an option leaves the menu open.
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

// The real theme.js, with the two calls that change the page wrapped so they can be counted.
jest.mock('../sefaria/theme', () => {
  const actual = jest.requireActual('../sefaria/theme');
  return {
    __esModule: true,
    ...actual,
    writeStoredPreference: jest.fn(actual.writeStoredPreference),
    applyTheme: jest.fn(actual.applyTheme),
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
import { writeStoredPreference, applyTheme } from '../sefaria/theme';
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

let consoleError;
beforeEach(() => {
  container = document.createElement('div');
  document.body.appendChild(container);
  document.documentElement.removeAttribute('data-theme');
  document.cookie = 'theme=; path=/; max-age=0';
  Sefaria.theme = null;
  global.gtag = jest.fn();
  global.sa_event = jest.fn();
  // Mounting the real Header prints pre-existing PropTypes/ref warnings from Button/DropdownMenu.
  consoleError = jest.spyOn(console, 'error').mockImplementation(() => {});
  jest.clearAllMocks();
  setUp();
});

afterEach(() => {
  act(() => { ReactDOM.unmountComponentAtNode(container); });
  container.remove();
  delete global.gtag;
  delete global.sa_event;
  delete window.matchMedia;
  consoleError.mockRestore();
});

const isAvatar = (el, loggedIn) => !!el && el.matches('.headerDropdownMenu') &&
  !!el.querySelector(loggedIn ? '.profile-pic' : 'img[src$="/profile_loggedout_mdl.svg"]');
const accountMenu = (loggedIn) => Array.from(container.querySelectorAll('.header-icons > .headerDropdownMenu'))
  .find((el) => isAvatar(el, loggedIn));
const openMenu = (menu) => {
  act(() => { menu.querySelector('.dropdownLinks-button').firstElementChild.click(); });
  expect(menu.querySelector('.dropdownLinks-menu').classList.contains('open')).toBe(true);
};
const isOpen = (menu) => menu.querySelector('.dropdownLinks-menu').classList.contains('open');
const pressedIn = (group) => ['auto', 'light', 'dark'].find((v) =>
  group.querySelector(`[data-appearance="${v}"]`).getAttribute('aria-pressed') === 'true');

const MATRIX = [];
['library', 'voices'].forEach((module) =>
  [false, true].forEach((loggedIn) =>
    ['english', 'hebrew'].forEach((lang) => MATRIX.push([module, loggedIn, lang]))));

describe('desktop header', () => {
  test.each(MATRIX)('%s, logged in: %p, %s interface: in the account menu right after Site Language', (module, loggedIn, lang) => {
    setUp({ module, loggedIn, lang });
    renderHeader({ module });
    const groups = container.querySelectorAll('.dropdownAppearanceToggle');
    expect(groups).toHaveLength(1);
    const group = groups[0];
    const menu = accountMenu(loggedIn);
    expect(menu).toBeDefined();
    expect(menu.contains(group)).toBe(true);

    const options = group.parentElement;
    expect(options.matches('.dropdownLinks-menu > .dropdownLinks-options')).toBe(true);
    const title = group.previousElementSibling;
    expect(title.matches('.languageHeader.appearanceHeader')).toBe(true);
    const language = title.previousElementSibling;
    expect(language.matches('.dropdownLanguageToggle')).toBe(true);
    expect(language.previousElementSibling.matches('.languageHeader:not(.appearanceHeader)')).toBe(true);
    expect(group.nextElementSibling.matches('.dropdownSeparator')).toBe(true);

    expect(group.getAttribute('role')).toBe('group');
    expect(group.getAttribute('data-prevent-close')).toBe('true');
    expect(group.getAttribute('aria-label')).toBe(lang === 'hebrew' ? 'מראה' : 'Appearance');
    expect(title.textContent).toBe(lang === 'hebrew' ? 'מראה' : 'Appearance');
    expect(group.querySelectorAll('button.appearanceOption')).toHaveLength(3);
    expect(container.querySelector('.mobileAppearanceToggle')).toBeNull();
  });

  test.each([[false], [true]])('logged in: %p: the header bar has no theme button any more', (loggedIn) => {
    setUp({ loggedIn });
    renderHeader();
    const icons = container.querySelector('.headerInner .header-icons');
    expect(icons.querySelector(':scope > button')).toBeNull();
    expect(container.querySelector('.themeToggle, .mobileThemeToggle, [aria-label="Dark mode"]')).toBeNull();
    expect(icons.lastElementChild).toBe(accountMenu(loggedIn));   // the avatar stays last
  });

  const isModuleSwitcher = (el) => !!el && el.matches('.headerDropdownMenu') &&
    !!el.querySelector('img[src$="/moduleswitcher_mdl.svg"]');
  const kinds = (loggedIn) => Array.from(container.querySelector('.header-icons').children).map((el) => {
    if (isModuleSwitcher(el)) return 'modules';
    if (isAvatar(el, loggedIn)) return 'avatar';
    if (el.querySelector('img[src$="/help_mdl.svg"]') || el.matches('a[href*="help"]')) return 'help';
    if (el.matches('.interfaceLinks')) return 'language';
    if (el.matches('a[href="/notifications"]')) return 'notifications';
    return el.className;
  });

  test('full order of the icon cluster, logged out library: the module switcher is next to the avatar again', () => {
    renderHeader();
    expect(kinds(false)).toEqual(['help', 'language', 'modules', 'avatar']);
  });

  test('full order of the icon cluster, logged in voices', () => {
    setUp({ module: 'voices', loggedIn: true });
    renderHeader({ module: 'voices' });
    expect(kinds(true)).toEqual(['help', 'notifications', 'modules', 'avatar']);
  });

  test('the module switcher menu does not get the controls', () => {
    renderHeader();
    const switcher = Array.from(container.querySelectorAll('.header-icons > .headerDropdownMenu'))
      .find((el) => el.querySelector('img[src$="/moduleswitcher_mdl.svg"]'));
    expect(switcher.querySelector('.dropdownAppearanceToggle')).toBeNull();
  });

  test('tablet uses the desktop header, controls included', () => {
    setUp({ breakpoint: 'tablet' });
    renderHeader();
    expect(accountMenu(false).querySelector('.dropdownAppearanceToggle')).not.toBeNull();
  });

  test('header mode (the header over a static page) renders them the same way', () => {
    renderHeader({ headerMode: true, multiPanel: false });
    expect(accountMenu(false).querySelector('.dropdownLanguageToggle + .appearanceHeader + .dropdownAppearanceToggle')).not.toBeNull();
  });

  test('non-Torah-specific deployments (no help icon or language menu) still get them', () => {
    setUp({ torahSpecific: false });
    renderHeader();
    expect(accountMenu(false).querySelector('.dropdownAppearanceToggle')).not.toBeNull();
  });

  test.each([[false], [true]])('logged in: %p: choosing an option applies it and keeps the menu open', (loggedIn) => {
    setUp({ loggedIn });
    renderHeader();
    const menu = accountMenu(loggedIn);
    openMenu(menu);
    const group = menu.querySelector('.dropdownAppearanceToggle');
    act(() => { group.querySelector('[data-appearance="dark"]').click(); });
    expect(pressedIn(group)).toBe('dark');
    expect(document.documentElement.getAttribute('data-theme')).toBe('dark');
    expect(document.cookie).toBe('theme=dark');
    expect(isOpen(menu)).toBe(true);
    expect(global.gtag).toHaveBeenCalledWith('event', 'appearance_change', expect.objectContaining({ action: 'header_menu', to: 'dark' }));

    // clicking on the icon itself (an SVG child) is found by closest() too
    act(() => { group.querySelector('[data-appearance="light"] svg path').dispatchEvent(new MouseEvent('click', { bubbles: true })); });
    expect(pressedIn(group)).toBe('light');
    expect(document.documentElement.getAttribute('data-theme')).toBe('light');
    expect(isOpen(menu)).toBe(true);

    // choosing the pressed option does nothing and still keeps the menu open
    act(() => { group.querySelector('[data-appearance="light"]').click(); });
    expect(writeStoredPreference).toHaveBeenCalledTimes(2);
    expect(applyTheme).toHaveBeenCalledTimes(2);
    expect(isOpen(menu)).toBe(true);
  });

  test('the menu still closes on an ordinary item (so "stays open" above is meaningful)', () => {
    renderHeader();
    const menu = accountMenu(false);
    openMenu(menu);
    act(() => { menu.querySelector('.appearanceHeader').click(); });
    expect(isOpen(menu)).toBe(false);
  });

  test('choosing Auto follows the system setting', () => {
    window.matchMedia = (q) => ({ matches: q === '(prefers-color-scheme: dark)', media: q });
    document.cookie = 'theme=light; path=/';
    Sefaria.theme = 'light';
    renderHeader();
    const menu = accountMenu(false);
    openMenu(menu);
    act(() => { menu.querySelector('[data-appearance="auto"]').click(); });
    expect(document.cookie).toBe('theme=auto');
    expect(document.documentElement.getAttribute('data-theme')).toBe('dark');
    expect(isOpen(menu)).toBe(true);
  });
});

describe('mobile header', () => {
  test.each(MATRIX)('%s, logged in: %p, %s interface: in the menu right after the language toggle, not in the top bar', (module, loggedIn, lang) => {
    setUp({ module, loggedIn, lang, breakpoint: 'mobile' });
    renderHeader({ module, multiPanel: false, mobileNavMenuOpen: true });

    const topBar = container.querySelector('.headerInner');
    expect(topBar.classList.contains('mobile')).toBe(true);
    expect(topBar.querySelector('.appearanceOption, .mobileAppearanceToggle, .dropdownAppearanceToggle')).toBeNull();
    expect(container.querySelector('.dropdownAppearanceToggle')).toBeNull();

    const rows = container.querySelectorAll('.mobileAppearanceToggle');
    expect(rows).toHaveLength(1);
    const row = rows[0];
    expect(row.parentElement).toBe(container.querySelector('.mobileNavMenu .mobileAccountLinks'));
    expect(row.previousElementSibling.matches('.mobileInterfaceLanguageToggle')).toBe(true);
    expect(row.nextElementSibling.tagName).toBe('HR');
    expect(row.getAttribute('role')).toBe('group');
    expect(row.getAttribute('aria-label')).toBe(lang === 'hebrew' ? 'מראה' : 'Appearance');
    expect(row.textContent).toBe(lang === 'hebrew' ? 'מראה' : 'Appearance');
    expect(row.querySelectorAll('button.appearanceOption')).toHaveLength(3);
  });

  test('choosing an option switches the theme and leaves the menu open', () => {
    setUp({ breakpoint: 'mobile' });
    const props = renderHeader({ multiPanel: false, mobileNavMenuOpen: true });
    const row = container.querySelector('.mobileAppearanceToggle');
    act(() => { row.querySelector('[data-appearance="dark"]').click(); });
    expect(pressedIn(row)).toBe('dark');
    expect(document.documentElement.getAttribute('data-theme')).toBe('dark');
    expect(global.gtag).toHaveBeenCalledWith('event', 'appearance_change', expect.objectContaining({ action: 'mobile_menu' }));
    expect(props.onMobileMenuButtonClick).not.toHaveBeenCalled();
    expect(container.querySelector('.mobileNavMenu').classList.contains('closed')).toBe(false);
    act(() => { row.querySelector('[data-appearance="light"]').click(); });
    expect(pressedIn(row)).toBe('light');
    expect(props.onMobileMenuButtonClick).not.toHaveBeenCalled();
  });

  test('it is in the (hidden) menu while the menu is closed, and in the menu over a text', () => {
    setUp({ breakpoint: 'mobile' });
    renderHeader({ multiPanel: false, mobileNavMenuOpen: false });
    expect(container.querySelector('.mobileNavMenu.closed .mobileAccountLinks .mobileAppearanceToggle')).not.toBeNull();

    // Over a library text the header is hidden unless the menu is open.
    renderHeader({ multiPanel: false, mobileNavMenuOpen: true, firstPanel: { mode: 'Text', menuOpen: null } });
    expect(container.querySelector('.mobileNavMenu:not(.closed) .mobileAppearanceToggle')).not.toBeNull();
  });

  test('switching breakpoint keeps the choice: the remounted control reads it', () => {
    renderHeader();
    const menu = accountMenu(false);
    openMenu(menu);
    act(() => { menu.querySelector('[data-appearance="dark"]').click(); });
    setUp({ breakpoint: 'mobile' });
    renderHeader({ multiPanel: false, mobileNavMenuOpen: true });
    expect(pressedIn(container.querySelector('.mobileAppearanceToggle'))).toBe('dark');
  });
});
