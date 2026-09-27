/**
 * ThemeToggle / MobileThemeToggle: the dark mode controls in the desktop header and the mobile
 * hamburger menu.
 *
 * `../sefaria/theme` (chunk A) is mocked, so these tests pin down what the toggle asks of that
 * module (which theme, which cookie domain) without depending on how it stores or applies it.
 */
import React from 'react';
import ReactDOM from 'react-dom';
import { act } from 'react-dom/test-utils';

jest.mock('../sefaria/sefaria', () => {
  const en = require('../sefaria/i18n/interface/en.json');
  const he = require('../sefaria/i18n/interface/he.json');
  const Sefaria = {
    interfaceLang: 'english',
    theme: null,
    util: { getCookieDomain: jest.fn(() => '.sefaria.org') },
  };
  Sefaria._ = (key) => (Sefaria.interfaceLang === 'hebrew' ? he : en)[key] || key;
  return { __esModule: true, default: Sefaria };
});

jest.mock('../sefaria/theme', () => {
  const THEMES = ['light', 'dark'];
  const normalizeTheme = (v) => (THEMES.includes(v) ? v : null);
  return {
    __esModule: true,
    THEMES,
    COOKIE: 'theme',
    normalizeTheme: jest.fn(normalizeTheme),
    writeStoredTheme: jest.fn(),
    applyTheme: jest.fn((theme) => global.document.documentElement.setAttribute('data-theme', theme)),
    getCurrentTheme: jest.fn(() => global.document.documentElement.dataset.theme),
  };
});

import Sefaria from '../sefaria/sefaria';
import { writeStoredTheme, applyTheme } from '../sefaria/theme';
import { ThemeToggle, MobileThemeToggle, THEME_CHANGE_EVENT } from '../ThemeToggle';

let container;

const mount = (element) => {
  act(() => { ReactDOM.render(element, container); });
};
const click = (el) => {
  act(() => { el.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true })); });
};
const desktop = () => container.querySelector('button.themeToggle');
const mobile = () => container.querySelector('button.mobileThemeToggle');

beforeEach(() => {
  container = document.createElement('div');
  document.body.appendChild(container);
  document.documentElement.removeAttribute('data-theme');
  Sefaria.interfaceLang = 'english';
  Sefaria.theme = null;
  Sefaria.util.getCookieDomain.mockReturnValue('.sefaria.org');
  global.gtag = jest.fn();
  jest.clearAllMocks();
});

afterEach(() => {
  act(() => { ReactDOM.unmountComponentAtNode(container); });
  container.remove();
  delete global.gtag;
});

describe('desktop ThemeToggle', () => {
  test('is a native type="button" with the icon-only header class', () => {
    mount(<ThemeToggle />);
    const btn = desktop();
    expect(btn).toBeInstanceOf(HTMLButtonElement);
    expect(btn.getAttribute('type')).toBe('button');
    expect(btn.classList.contains('icon-only')).toBe(true);
    expect(btn.getAttribute('role')).toBeNull();  // a toggle button, not a switch
  });

  test('starts light when Sefaria.theme is null: not pressed, moon icon', () => {
    mount(<ThemeToggle />);
    expect(desktop().getAttribute('aria-pressed')).toBe('false');
    expect(desktop().querySelector('svg.themeToggleMoon')).not.toBeNull();
    expect(desktop().querySelector('svg.themeToggleSun')).toBeNull();
  });

  test('starts dark when Sefaria.theme is "dark": pressed, sun icon', () => {
    Sefaria.theme = 'dark';
    document.documentElement.setAttribute('data-theme', 'dark');
    mount(<ThemeToggle />);
    expect(desktop().getAttribute('aria-pressed')).toBe('true');
    expect(desktop().querySelector('svg.themeToggleSun')).not.toBeNull();
    expect(desktop().querySelector('svg.themeToggleMoon')).toBeNull();
  });

  test('an unknown Sefaria.theme value is treated as light', () => {
    Sefaria.theme = 'sepia';
    mount(<ThemeToggle />);
    expect(desktop().getAttribute('aria-pressed')).toBe('false');
  });

  test('after mount it follows data-theme on <html> (e.g. set by the head script)', () => {
    document.documentElement.setAttribute('data-theme', 'dark');  // Sefaria.theme stays null
    mount(<ThemeToggle />);
    expect(desktop().getAttribute('aria-pressed')).toBe('true');
  });

  test('with no data-theme on <html> it keeps the server value', () => {
    Sefaria.theme = 'dark';
    mount(<ThemeToggle />);
    expect(desktop().getAttribute('aria-pressed')).toBe('true');
  });

  test('the SVG icons are decorative, drawn in currentColor', () => {
    mount(<ThemeToggle />);
    const svg = desktop().querySelector('svg');
    expect(svg.getAttribute('aria-hidden')).toBe('true');
    expect(svg.getAttribute('focusable')).toBe('false');
    expect(svg.getAttribute('stroke')).toBe('currentColor');
    expect(svg.getAttribute('width')).toBe('18');
    expect(svg.getAttribute('height')).toBe('18');
  });

  test('click switches light -> dark: stores, applies, updates Sefaria.theme and fires analytics', () => {
    mount(<ThemeToggle />);
    click(desktop());

    expect(writeStoredTheme).toHaveBeenCalledTimes(1);
    expect(writeStoredTheme).toHaveBeenCalledWith('dark', { domain: '.sefaria.org' });
    expect(applyTheme).toHaveBeenCalledTimes(1);
    expect(applyTheme).toHaveBeenCalledWith('dark');
    expect(Sefaria.theme).toBe('dark');
    expect(document.documentElement.getAttribute('data-theme')).toBe('dark');
    expect(global.gtag).toHaveBeenCalledTimes(1);
    expect(global.gtag).toHaveBeenCalledWith('event', 'theme_toggle', {
      feature_name: 'theme_toggle', from: 'light', to: 'dark', action: 'header',
    });
    expect(desktop().getAttribute('aria-pressed')).toBe('true');
    expect(desktop().querySelector('svg.themeToggleSun')).not.toBeNull();
  });

  test('order: store the choice, then apply it, then report analytics', () => {
    const order = [];
    writeStoredTheme.mockImplementationOnce(() => order.push('write'));
    applyTheme.mockImplementationOnce(() => order.push('apply'));
    global.gtag.mockImplementationOnce(() => order.push('analytics'));
    mount(<ThemeToggle />);
    click(desktop());
    expect(order).toEqual(['write', 'apply', 'analytics']);
  });

  test('a second click switches back dark -> light', () => {
    mount(<ThemeToggle />);
    click(desktop());
    click(desktop());
    expect(writeStoredTheme).toHaveBeenLastCalledWith('light', { domain: '.sefaria.org' });
    expect(applyTheme).toHaveBeenLastCalledWith('light');
    expect(Sefaria.theme).toBe('light');
    expect(global.gtag).toHaveBeenLastCalledWith('event', 'theme_toggle', {
      feature_name: 'theme_toggle', from: 'dark', to: 'light', action: 'header',
    });
    expect(desktop().getAttribute('aria-pressed')).toBe('false');
  });

  test('without a cookie domain (localhost) it lets theme.js pick the default', () => {
    Sefaria.util.getCookieDomain.mockReturnValue(null);
    mount(<ThemeToggle />);
    click(desktop());
    expect(writeStoredTheme).toHaveBeenCalledTimes(1);
    expect(writeStoredTheme.mock.calls[0]).toEqual(['dark']);
  });

  test('the accessible label and title stay "Dark mode" in both states', () => {
    mount(<ThemeToggle />);
    expect(desktop().getAttribute('aria-label')).toBe('Dark mode');
    expect(desktop().getAttribute('title')).toBe('Dark mode');
    click(desktop());
    expect(desktop().getAttribute('aria-label')).toBe('Dark mode');
    expect(desktop().getAttribute('title')).toBe('Dark mode');
  });

  test('Hebrew interface: label and title are "מצב כהה"', () => {
    Sefaria.interfaceLang = 'hebrew';
    mount(<ThemeToggle />);
    expect(desktop().getAttribute('aria-label')).toBe('מצב כהה');
    expect(desktop().getAttribute('title')).toBe('מצב כהה');
  });

  test('keyboard: focusable, and Enter/Space are left to the native button', () => {
    // jsdom does not run a button's native activation behaviour for Enter/Space, so this checks
    // the preconditions for it (a focusable, enabled, native button that does not cancel the
    // keys) and then the click the browser dispatches. The real key press is covered in E2E.
    mount(<ThemeToggle />);
    const btn = desktop();
    btn.focus();
    expect(document.activeElement).toBe(btn);
    expect(btn.disabled).toBe(false);
    expect(btn.tabIndex).toBe(0);
    ['Enter', ' '].forEach((key) => {
      const down = new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true });
      act(() => { btn.dispatchEvent(down); });
      expect(down.defaultPrevented).toBe(false);
    });
    act(() => { btn.click(); });
    expect(btn.getAttribute('aria-pressed')).toBe('true');
  });

  test('does not throw when gtag is not defined (e.g. blocked)', () => {
    delete global.gtag;
    mount(<ThemeToggle />);
    expect(() => click(desktop())).not.toThrow();
    expect(applyTheme).toHaveBeenCalledWith('dark');
  });
});

describe('mobile MobileThemeToggle', () => {
  test('is a native button with role="switch" and aria-checked', () => {
    mount(<MobileThemeToggle />);
    const btn = mobile();
    expect(btn).toBeInstanceOf(HTMLButtonElement);
    expect(btn.getAttribute('type')).toBe('button');
    expect(btn.getAttribute('role')).toBe('switch');
    expect(btn.getAttribute('aria-checked')).toBe('false');
    expect(btn.hasAttribute('aria-pressed')).toBe(false);
  });

  test('row content: 16px icon, visible label, decorative on/off indicator', () => {
    mount(<MobileThemeToggle />);
    const btn = mobile();
    const svg = btn.querySelector('svg.themeToggleIcon');
    expect(svg.getAttribute('width')).toBe('16');
    expect(svg.getAttribute('aria-hidden')).toBe('true');
    const text = btn.querySelector('span.int-en');
    expect(text.textContent).toBe('Dark mode');
    expect(btn.querySelector('.mobileThemeToggleSwitch').getAttribute('aria-hidden')).toBe('true');
    expect(btn.textContent).toBe('Dark mode');  // accessible name is the label only
  });

  test('starts from Sefaria.theme', () => {
    Sefaria.theme = 'dark';
    mount(<MobileThemeToggle />);
    expect(mobile().getAttribute('aria-checked')).toBe('true');
  });

  test('click switches the theme with action "mobile_menu"', () => {
    mount(<MobileThemeToggle />);
    click(mobile());
    expect(mobile().getAttribute('aria-checked')).toBe('true');
    expect(writeStoredTheme).toHaveBeenCalledWith('dark', { domain: '.sefaria.org' });
    expect(applyTheme).toHaveBeenCalledWith('dark');
    expect(Sefaria.theme).toBe('dark');
    expect(global.gtag).toHaveBeenCalledWith('event', 'theme_toggle', {
      feature_name: 'theme_toggle', from: 'light', to: 'dark', action: 'mobile_menu',
    });
    click(mobile());
    expect(mobile().getAttribute('aria-checked')).toBe('false');
    expect(global.gtag).toHaveBeenLastCalledWith('event', 'theme_toggle', {
      feature_name: 'theme_toggle', from: 'dark', to: 'light', action: 'mobile_menu',
    });
  });

  test('the click is not cancelled or stopped (nothing above it is swallowed)', () => {
    const outer = jest.fn();
    mount(<div onClick={outer}><MobileThemeToggle /></div>);
    const ev = new MouseEvent('click', { bubbles: true, cancelable: true });
    act(() => { mobile().dispatchEvent(ev); });
    expect(ev.defaultPrevented).toBe(false);
    expect(outer).toHaveBeenCalledTimes(1);
  });

  test('the label stays constant', () => {
    mount(<MobileThemeToggle />);
    click(mobile());
    expect(mobile().textContent).toBe('Dark mode');
  });

  test('Hebrew interface: label is "מצב כהה" in an int-he span', () => {
    Sefaria.interfaceLang = 'hebrew';
    mount(<MobileThemeToggle />);
    const text = mobile().querySelector('span.int-he');
    expect(text.textContent).toBe('מצב כהה');
    expect(mobile().querySelector('span.int-en')).toBeNull();
  });
});

describe('keeping instances in sync', () => {
  const both = () => mount(<div><ThemeToggle /><MobileThemeToggle /></div>);

  test('toggling the desktop control updates the mobile one', () => {
    both();
    click(desktop());
    expect(desktop().getAttribute('aria-pressed')).toBe('true');
    expect(mobile().getAttribute('aria-checked')).toBe('true');
  });

  test('toggling the mobile control updates the desktop one', () => {
    both();
    click(mobile());
    expect(mobile().getAttribute('aria-checked')).toBe('true');
    expect(desktop().getAttribute('aria-pressed')).toBe('true');
    click(desktop());
    expect(mobile().getAttribute('aria-checked')).toBe('false');
    expect(desktop().getAttribute('aria-pressed')).toBe('false');
    // one store/apply/analytics per click, not one per mounted instance
    expect(writeStoredTheme).toHaveBeenCalledTimes(2);
    expect(applyTheme).toHaveBeenCalledTimes(2);
    expect(global.gtag).toHaveBeenCalledTimes(2);
  });

  test(`a "${THEME_CHANGE_EVENT}" event from elsewhere updates both`, () => {
    both();
    act(() => {
      document.dispatchEvent(new CustomEvent(THEME_CHANGE_EVENT, { detail: { theme: 'dark', from: 'light' } }));
    });
    expect(desktop().getAttribute('aria-pressed')).toBe('true');
    expect(mobile().getAttribute('aria-checked')).toBe('true');
    expect(writeStoredTheme).not.toHaveBeenCalled();  // listeners only reflect, never re-store
  });

  test('the event carries the new and previous theme', () => {
    const listener = jest.fn();
    document.addEventListener(THEME_CHANGE_EVENT, listener);
    mount(<ThemeToggle />);
    click(desktop());
    document.removeEventListener(THEME_CHANGE_EVENT, listener);
    expect(listener).toHaveBeenCalledTimes(1);
    expect(listener.mock.calls[0][0].detail).toEqual({ theme: 'dark', from: 'light' });
  });

  test('an event without a valid theme falls back to data-theme on <html>', () => {
    both();
    document.documentElement.setAttribute('data-theme', 'dark');
    act(() => { document.dispatchEvent(new CustomEvent(THEME_CHANGE_EVENT, { detail: { theme: 'bogus' } })); });
    expect(desktop().getAttribute('aria-pressed')).toBe('true');
  });

  test('unmounting removes the listener', () => {
    const spy = jest.spyOn(console, 'error').mockImplementation(() => {});
    mount(<ThemeToggle />);
    act(() => { ReactDOM.unmountComponentAtNode(container); });
    act(() => {
      document.dispatchEvent(new CustomEvent(THEME_CHANGE_EVENT, { detail: { theme: 'dark' } }));
    });
    expect(spy).not.toHaveBeenCalled();  // no "state update on an unmounted component"
    spy.mockRestore();
  });
});
