/**
 * AppearanceToggle / MobileAppearanceToggle: the Auto / Light / Dark controls in the desktop
 * account menus and the mobile hamburger menu.
 *
 * `../sefaria/theme` is wrapped, not replaced: every function the controls call is a jest.fn()
 * around the real implementation, so these tests pin down what the controls ask of that module
 * (which preference to store, which theme to show) while the cookie and <html data-theme> really
 * change in jsdom.
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
  const actual = jest.requireActual('../sefaria/theme');
  const wrap = (name) => jest.fn(actual[name]);
  return {
    __esModule: true,
    ...actual,
    writeStoredPreference: wrap('writeStoredPreference'),
    applyTheme: wrap('applyTheme'),
    resolveTheme: wrap('resolveTheme'),
    getCurrentPreference: wrap('getCurrentPreference'),
  };
});

import Sefaria from '../sefaria/sefaria';
import { writeStoredPreference, applyTheme, resolveTheme, getCurrentPreference } from '../sefaria/theme';
import { AppearanceToggle, MobileAppearanceToggle, THEME_CHANGE_EVENT } from '../AppearanceToggle';

const OPTIONS = ['auto', 'light', 'dark'];
const LABELS = {
  english: { group: 'Appearance', auto: 'Auto', light: 'Light', dark: 'Dark' },
  hebrew: { group: 'מראה', auto: 'אוטומטי', light: 'בהיר', dark: 'כהה' },
};

let container;

const mount = (element) => {
  act(() => { ReactDOM.render(element, container); });
};
const click = (el) => {
  act(() => { el.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true })); });
};
const desktopGroup = () => container.querySelector('.dropdownAppearanceToggle');
const mobileGroup = () => container.querySelector('.mobileAppearanceToggle');
const option = (group, value) => group.querySelector(`button.appearanceOption[data-appearance="${value}"]`);
const desktop = (value) => option(desktopGroup(), value);
const mobile = (value) => option(mobileGroup(), value);
// Which option is pressed, as [auto, light, dark] aria-pressed values.
const pressed = (group) => OPTIONS.map((v) => option(group, v).getAttribute('aria-pressed'));
const PRESSED = {
  auto: ['true', 'false', 'false'],
  light: ['false', 'true', 'false'],
  dark: ['false', 'false', 'true'],
};
const setSystemDark = (dark) => {
  window.matchMedia = jest.fn((q) => ({ matches: dark && q === '(prefers-color-scheme: dark)', media: q }));
};
const setCookie = (v) => { document.cookie = `theme=${v}; path=/`; };

beforeEach(() => {
  container = document.createElement('div');
  document.body.appendChild(container);
  document.documentElement.removeAttribute('data-theme');
  document.cookie = 'theme=; path=/; max-age=0';
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
  delete window.matchMedia;
});

describe('desktop AppearanceToggle', () => {
  test('a "languageHeader" title, then a labelled group that keeps the menu open', () => {
    mount(<AppearanceToggle />);
    const header = container.firstElementChild;
    expect(header.matches('div.languageHeader.appearanceHeader')).toBe(true);
    expect(header.querySelector('span.int-en').textContent).toBe('Appearance');
    const group = header.nextElementSibling;
    expect(group).toBe(desktopGroup());
    expect(group.tagName).toBe('DIV');
    expect(group.getAttribute('role')).toBe('group');
    expect(group.getAttribute('aria-label')).toBe('Appearance');
    expect(group.getAttribute('data-prevent-close')).toBe('true');
    expect(container.children).toHaveLength(2);
  });

  test('three native type="button" options, in the order Auto, Light, Dark', () => {
    mount(<AppearanceToggle />);
    const buttons = Array.from(desktopGroup().children);
    expect(buttons.map((b) => b.getAttribute('data-appearance'))).toEqual(OPTIONS);
    for (const btn of buttons) {
      expect(btn).toBeInstanceOf(HTMLButtonElement);
      expect(btn.getAttribute('type')).toBe('button');
      expect(btn.classList.contains('appearanceOption')).toBe(true);
      expect(btn.getAttribute('role')).toBeNull();   // toggle buttons (aria-pressed), not radios or switches
      expect(btn.hasAttribute('aria-checked')).toBe(false);
    }
  });

  test('labels and tooltips: Auto, Light, Dark', () => {
    mount(<AppearanceToggle />);
    for (const v of OPTIONS) {
      expect(desktop(v).getAttribute('aria-label')).toBe(LABELS.english[v]);
      expect(desktop(v).getAttribute('title')).toBe(LABELS.english[v]);
    }
  });

  test('starts on Auto when Sefaria.theme is null (no cookie)', () => {
    mount(<AppearanceToggle />);
    expect(pressed(desktopGroup())).toEqual(PRESSED.auto);
    expect(desktop('auto').classList.contains('active')).toBe(true);
    expect(desktopGroup().querySelectorAll('.active')).toHaveLength(1);
  });

  test.each(OPTIONS)('starts on %p when Sefaria.theme and the cookie say so', (v) => {
    Sefaria.theme = v;
    setCookie(v);
    mount(<AppearanceToggle />);
    expect(pressed(desktopGroup())).toEqual(PRESSED[v]);
    expect(desktop(v).classList.contains('active')).toBe(true);
  });

  test.each(['sepia', 'DARK', 'system', 42])('an unknown Sefaria.theme %p is treated as auto', (v) => {
    Sefaria.theme = v;
    mount(<AppearanceToggle />);
    expect(pressed(desktopGroup())).toEqual(PRESSED.auto);
  });

  test('after mount it follows the cookie (the browser\'s own record of the choice)', () => {
    setCookie('dark');                    // Sefaria.theme stays null
    mount(<AppearanceToggle />);
    expect(getCurrentPreference).toHaveBeenCalled();
    expect(pressed(desktopGroup())).toEqual(PRESSED.dark);
  });

  test('after mount the cookie wins over Sefaria.theme (e.g. a page cached for someone else)', () => {
    Sefaria.theme = 'dark';
    setCookie('light');
    mount(<AppearanceToggle />);
    expect(pressed(desktopGroup())).toEqual(PRESSED.light);
    act(() => { ReactDOM.unmountComponentAtNode(container); });
    Sefaria.theme = 'dark';
    document.cookie = 'theme=; path=/; max-age=0';
    mount(<AppearanceToggle />);
    expect(pressed(desktopGroup())).toEqual(PRESSED.auto);
  });

  test('mounting stores, applies and reports nothing', () => {
    setCookie('dark');
    mount(<AppearanceToggle />);
    expect(writeStoredPreference).not.toHaveBeenCalled();
    expect(applyTheme).not.toHaveBeenCalled();
    expect(global.gtag).not.toHaveBeenCalled();
    expect(document.documentElement.hasAttribute('data-theme')).toBe(false);
  });

  test('the SVG icons are decorative, drawn in currentColor, one per option', () => {
    mount(<AppearanceToggle />);
    const kinds = { auto: 'appearanceIconAuto', light: 'appearanceIconLight', dark: 'appearanceIconDark' };
    for (const v of OPTIONS) {
      const svgs = desktop(v).querySelectorAll('svg');
      expect(svgs).toHaveLength(1);
      const svg = svgs[0];
      expect(svg.classList.contains('appearanceIcon')).toBe(true);
      expect(svg.classList.contains(kinds[v])).toBe(true);
      expect(svg.getAttribute('aria-hidden')).toBe('true');
      expect(svg.getAttribute('focusable')).toBe('false');
      expect(svg.getAttribute('stroke')).toBe('currentColor');
      expect(svg.getAttribute('width')).toBe('18');
      expect(svg.getAttribute('height')).toBe('18');
      expect(desktop(v).textContent).toBe('');
    }
  });

  test('choosing Dark: stores the preference, shows it, updates Sefaria.theme and fires analytics', () => {
    mount(<AppearanceToggle />);
    click(desktop('dark'));

    expect(writeStoredPreference).toHaveBeenCalledTimes(1);
    expect(writeStoredPreference.mock.calls[0]).toEqual(['dark']);    // theme.js picks the cookie domain
    expect(resolveTheme).toHaveBeenCalledWith('dark');
    expect(applyTheme).toHaveBeenCalledTimes(1);
    expect(applyTheme).toHaveBeenCalledWith('dark');
    expect(Sefaria.theme).toBe('dark');
    expect(document.cookie).toBe('theme=dark');
    expect(document.documentElement.getAttribute('data-theme')).toBe('dark');
    expect(global.gtag).toHaveBeenCalledTimes(1);
    expect(global.gtag).toHaveBeenCalledWith('event', 'appearance_change', {
      feature_name: 'appearance', from: 'auto', to: 'dark', theme: 'dark', action: 'header_menu',
    });
    expect(pressed(desktopGroup())).toEqual(PRESSED.dark);
    expect(desktop('dark').classList.contains('active')).toBe(true);
    expect(desktop('auto').classList.contains('active')).toBe(false);
  });

  test('choosing Light while the system is dark shows light', () => {
    setSystemDark(true);
    mount(<AppearanceToggle />);
    click(desktop('light'));
    expect(applyTheme).toHaveBeenCalledWith('light');
    expect(document.documentElement.getAttribute('data-theme')).toBe('light');
    expect(global.gtag).toHaveBeenLastCalledWith('event', 'appearance_change', {
      feature_name: 'appearance', from: 'auto', to: 'light', theme: 'light', action: 'header_menu',
    });
  });

  test.each([
    ['dark', true, 'dark'],
    ['light', false, 'light'],
    ['absent', null, 'light'],
  ])('choosing Auto with the system %s stores "auto" and shows %p', (name, dark, shown) => {
    if (dark !== null) { setSystemDark(dark); }
    Sefaria.theme = 'dark';
    setCookie('dark');
    mount(<AppearanceToggle />);
    click(desktop('auto'));
    expect(writeStoredPreference.mock.calls[0]).toEqual(['auto']);
    expect(document.cookie).toBe('theme=auto');               // auto is stored, not the resolved theme
    expect(resolveTheme).toHaveBeenCalledWith('auto');
    expect(applyTheme).toHaveBeenCalledWith(shown);
    expect(document.documentElement.getAttribute('data-theme')).toBe(shown);
    expect(Sefaria.theme).toBe('auto');
    expect(global.gtag).toHaveBeenCalledWith('event', 'appearance_change', {
      feature_name: 'appearance', from: 'dark', to: 'auto', theme: shown, action: 'header_menu',
    });
    expect(pressed(desktopGroup())).toEqual(PRESSED.auto);
  });

  test('order: store the preference, show it, announce it, then report analytics', () => {
    const order = [];
    writeStoredPreference.mockImplementationOnce(() => order.push('write'));
    applyTheme.mockImplementationOnce(() => { order.push('apply'); return 'dark'; });
    const listener = () => order.push('event');
    document.addEventListener(THEME_CHANGE_EVENT, listener);
    global.gtag.mockImplementationOnce(() => order.push('analytics'));
    mount(<AppearanceToggle />);
    click(desktop('dark'));
    document.removeEventListener(THEME_CHANGE_EVENT, listener);
    expect(order).toEqual(['write', 'apply', 'event', 'analytics']);
  });

  test('a sequence of choices reports each from -> to', () => {
    setSystemDark(false);
    mount(<AppearanceToggle />);
    click(desktop('light'));
    click(desktop('dark'));
    click(desktop('auto'));
    expect(global.gtag.mock.calls.map(([, , p]) => [p.from, p.to, p.theme])).toEqual([
      ['auto', 'light', 'light'], ['light', 'dark', 'dark'], ['dark', 'auto', 'light'],
    ]);
    expect(writeStoredPreference.mock.calls).toEqual([['light'], ['dark'], ['auto']]);
    expect(pressed(desktopGroup())).toEqual(PRESSED.auto);
  });

  test('choosing the option that is already pressed does nothing', () => {
    const listener = jest.fn();
    document.addEventListener(THEME_CHANGE_EVENT, listener);
    mount(<AppearanceToggle />);
    click(desktop('auto'));                     // already pressed on first render
    click(desktop('dark'));
    click(desktop('dark'));                     // already pressed after a change
    document.removeEventListener(THEME_CHANGE_EVENT, listener);
    expect(writeStoredPreference).toHaveBeenCalledTimes(1);
    expect(applyTheme).toHaveBeenCalledTimes(1);
    expect(global.gtag).toHaveBeenCalledTimes(1);
    expect(listener).toHaveBeenCalledTimes(1);
    expect(pressed(desktopGroup())).toEqual(PRESSED.dark);
  });

  test('clicking the icon inside an option counts as clicking the option', () => {
    mount(<AppearanceToggle />);
    click(desktop('dark').querySelector('path'));
    expect(pressed(desktopGroup())).toEqual(PRESSED.dark);
    expect(document.documentElement.getAttribute('data-theme')).toBe('dark');
  });

  test('the labels stay the same in every state', () => {
    mount(<AppearanceToggle />);
    for (const v of ['dark', 'light', 'auto']) {
      click(desktop(v));
      expect(OPTIONS.map((o) => desktop(o).getAttribute('aria-label'))).toEqual(OPTIONS.map((o) => LABELS.english[o]));
      expect(desktopGroup().getAttribute('aria-label')).toBe('Appearance');
    }
  });

  test('Hebrew interface: Hebrew title, group label, option labels and tooltips', () => {
    Sefaria.interfaceLang = 'hebrew';
    mount(<AppearanceToggle />);
    const title = container.querySelector('.appearanceHeader span.int-he');
    expect(title.textContent).toBe('מראה');
    expect(container.querySelector('.appearanceHeader span.int-en')).toBeNull();
    expect(desktopGroup().getAttribute('aria-label')).toBe('מראה');
    for (const v of OPTIONS) {
      expect(desktop(v).getAttribute('aria-label')).toBe(LABELS.hebrew[v]);
      expect(desktop(v).getAttribute('title')).toBe(LABELS.hebrew[v]);
    }
  });

  test('keyboard: each option is focusable, and Enter/Space are left to the native button', () => {
    // jsdom does not run a button's native activation behaviour for Enter/Space, so this checks
    // the preconditions for it (a focusable, enabled, native button that does not cancel the
    // keys) and then the click the browser dispatches. The real key press is covered in E2E.
    mount(<AppearanceToggle />);
    for (const v of OPTIONS) {
      const btn = desktop(v);
      btn.focus();
      expect(document.activeElement).toBe(btn);
      expect(btn.disabled).toBe(false);
      expect(btn.tabIndex).toBe(0);
      ['Enter', ' '].forEach((key) => {
        const down = new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true });
        act(() => { btn.dispatchEvent(down); });
        expect(down.defaultPrevented).toBe(false);
      });
    }
    act(() => { desktop('dark').click(); });
    expect(desktop('dark').getAttribute('aria-pressed')).toBe('true');
  });

  test('does not throw when gtag is not defined (e.g. blocked)', () => {
    delete global.gtag;
    mount(<AppearanceToggle />);
    expect(() => click(desktop('dark'))).not.toThrow();
    expect(applyTheme).toHaveBeenCalledWith('dark');
    expect(document.cookie).toBe('theme=dark');
  });
});

describe('mobile MobileAppearanceToggle', () => {
  test('a labelled group row: leading icon, label, then the three options', () => {
    mount(<MobileAppearanceToggle />);
    const row = mobileGroup();
    expect(row.tagName).toBe('DIV');
    expect(row.getAttribute('role')).toBe('group');
    expect(row.getAttribute('aria-label')).toBe('Appearance');
    const kids = Array.from(row.children);
    expect(kids.map((k) => k.tagName.toLowerCase())).toEqual(['svg', 'span', 'span']);
    expect(kids[0].classList.contains('appearanceIconRow')).toBe(true);
    expect(kids[0].getAttribute('width')).toBe('16');
    expect(kids[0].getAttribute('aria-hidden')).toBe('true');
    expect(kids[0].getAttribute('focusable')).toBe('false');
    expect(kids[1].matches('span.int-en')).toBe(true);
    expect(kids[1].textContent).toBe('Appearance');
    expect(kids[2].matches('span.mobileAppearanceOptions')).toBe(true);
    expect(Array.from(kids[2].children).map((b) => b.getAttribute('data-appearance'))).toEqual(OPTIONS);
  });

  test('the row itself is not a control: no switch, no aria-checked; the options are native buttons', () => {
    mount(<MobileAppearanceToggle />);
    expect(mobileGroup()).not.toBeInstanceOf(HTMLButtonElement);
    expect(container.querySelector('[role="switch"], [aria-checked]')).toBeNull();
    for (const v of OPTIONS) {
      expect(mobile(v)).toBeInstanceOf(HTMLButtonElement);
      expect(mobile(v).getAttribute('type')).toBe('button');
      expect(mobile(v).getAttribute('aria-label')).toBe(LABELS.english[v]);
      expect(mobile(v).getAttribute('title')).toBe(LABELS.english[v]);
      expect(mobile(v).querySelector('svg').getAttribute('width')).toBe('18');
    }
  });

  test('starts from Sefaria.theme', () => {
    Sefaria.theme = 'dark';
    setCookie('dark');
    mount(<MobileAppearanceToggle />);
    expect(pressed(mobileGroup())).toEqual(PRESSED.dark);
  });

  test('choosing options reports action "mobile_menu"', () => {
    mount(<MobileAppearanceToggle />);
    click(mobile('dark'));
    expect(pressed(mobileGroup())).toEqual(PRESSED.dark);
    expect(writeStoredPreference.mock.calls[0]).toEqual(['dark']);
    expect(applyTheme).toHaveBeenCalledWith('dark');
    expect(Sefaria.theme).toBe('dark');
    expect(global.gtag).toHaveBeenCalledWith('event', 'appearance_change', {
      feature_name: 'appearance', from: 'auto', to: 'dark', theme: 'dark', action: 'mobile_menu',
    });
    click(mobile('light'));
    expect(pressed(mobileGroup())).toEqual(PRESSED.light);
    expect(global.gtag).toHaveBeenLastCalledWith('event', 'appearance_change', {
      feature_name: 'appearance', from: 'dark', to: 'light', theme: 'light', action: 'mobile_menu',
    });
  });

  test('choosing the pressed option does nothing', () => {
    mount(<MobileAppearanceToggle />);
    click(mobile('auto'));
    expect(writeStoredPreference).not.toHaveBeenCalled();
    expect(global.gtag).not.toHaveBeenCalled();
  });

  test('the click is not cancelled or stopped (nothing above it is swallowed)', () => {
    const outer = jest.fn();
    mount(<div onClick={outer}><MobileAppearanceToggle /></div>);
    const ev = new MouseEvent('click', { bubbles: true, cancelable: true });
    act(() => { mobile('dark').dispatchEvent(ev); });
    expect(ev.defaultPrevented).toBe(false);
    expect(outer).toHaveBeenCalledTimes(1);
  });

  test('the visible label stays constant', () => {
    mount(<MobileAppearanceToggle />);
    click(mobile('dark'));
    expect(mobileGroup().textContent).toBe('Appearance');
  });

  test('Hebrew interface: label "מראה" in an int-he span, Hebrew option labels', () => {
    Sefaria.interfaceLang = 'hebrew';
    mount(<MobileAppearanceToggle />);
    expect(mobileGroup().querySelector('span.int-he').textContent).toBe('מראה');
    expect(mobileGroup().querySelector('span.int-en')).toBeNull();
    expect(mobileGroup().getAttribute('aria-label')).toBe('מראה');
    expect(OPTIONS.map((v) => mobile(v).getAttribute('aria-label'))).toEqual(OPTIONS.map((v) => LABELS.hebrew[v]));
  });
});

describe('keeping instances in sync', () => {
  const both = () => mount(<div><AppearanceToggle /><MobileAppearanceToggle /></div>);

  test(`the event is "sefaria:themechange"`, () => {
    expect(THEME_CHANGE_EVENT).toBe('sefaria:themechange');
  });

  test('choosing on the desktop control updates the mobile one', () => {
    both();
    click(desktop('dark'));
    expect(pressed(desktopGroup())).toEqual(PRESSED.dark);
    expect(pressed(mobileGroup())).toEqual(PRESSED.dark);
  });

  test('choosing on the mobile control updates the desktop one', () => {
    both();
    click(mobile('light'));
    expect(pressed(mobileGroup())).toEqual(PRESSED.light);
    expect(pressed(desktopGroup())).toEqual(PRESSED.light);
    click(desktop('auto'));
    expect(pressed(mobileGroup())).toEqual(PRESSED.auto);
    expect(pressed(desktopGroup())).toEqual(PRESSED.auto);
    // one store/apply/analytics per click, not one per mounted instance
    expect(writeStoredPreference).toHaveBeenCalledTimes(2);
    expect(applyTheme).toHaveBeenCalledTimes(2);
    expect(global.gtag).toHaveBeenCalledTimes(2);
  });

  test('after a change elsewhere, choosing the now-pressed option here does nothing (state really synced)', () => {
    both();
    click(desktop('dark'));
    click(mobile('dark'));
    expect(writeStoredPreference).toHaveBeenCalledTimes(1);
  });

  test(`a "${THEME_CHANGE_EVENT}" event from elsewhere updates both, and they only reflect it`, () => {
    both();
    act(() => {
      document.dispatchEvent(new CustomEvent(THEME_CHANGE_EVENT, { detail: { preference: 'dark', theme: 'dark', from: 'auto' } }));
    });
    expect(pressed(desktopGroup())).toEqual(PRESSED.dark);
    expect(pressed(mobileGroup())).toEqual(PRESSED.dark);
    expect(writeStoredPreference).not.toHaveBeenCalled();
    expect(applyTheme).not.toHaveBeenCalled();
    expect(global.gtag).not.toHaveBeenCalled();
  });

  test('the event carries the new preference, the theme shown and the previous preference', () => {
    setSystemDark(true);
    const listener = jest.fn();
    document.addEventListener(THEME_CHANGE_EVENT, listener);
    mount(<AppearanceToggle />);
    click(desktop('light'));
    click(desktop('auto'));
    document.removeEventListener(THEME_CHANGE_EVENT, listener);
    expect(listener).toHaveBeenCalledTimes(2);
    expect(listener.mock.calls[0][0].detail).toEqual({ preference: 'light', theme: 'light', from: 'auto' });
    expect(listener.mock.calls[1][0].detail).toEqual({ preference: 'auto', theme: 'dark', from: 'light' });
    expect(listener.mock.calls[0][0].target).toBe(document);
  });

  test('an event without a valid preference falls back to the cookie', () => {
    both();
    setCookie('dark');
    act(() => { document.dispatchEvent(new CustomEvent(THEME_CHANGE_EVENT, { detail: { preference: 'bogus' } })); });
    expect(pressed(desktopGroup())).toEqual(PRESSED.dark);
    setCookie('light');
    act(() => { document.dispatchEvent(new CustomEvent(THEME_CHANGE_EVENT)); });
    expect(pressed(mobileGroup())).toEqual(PRESSED.light);
  });

  test('the old two-state detail ({theme}) is not mistaken for a preference', () => {
    both();
    act(() => { document.dispatchEvent(new CustomEvent(THEME_CHANGE_EVENT, { detail: { theme: 'dark' } })); });
    expect(pressed(desktopGroup())).toEqual(PRESSED.auto);   // no cookie: auto
  });

  test('a control mounted later starts from the updated Sefaria.theme', () => {
    mount(<AppearanceToggle />);
    click(desktop('dark'));
    act(() => { ReactDOM.unmountComponentAtNode(container); });
    mount(<MobileAppearanceToggle />);
    expect(pressed(mobileGroup())).toEqual(PRESSED.dark);
  });

  test('unmounting removes the listener', () => {
    const spy = jest.spyOn(console, 'error').mockImplementation(() => {});
    const remove = jest.spyOn(document, 'removeEventListener');
    mount(<div><AppearanceToggle /><MobileAppearanceToggle /></div>);
    act(() => { ReactDOM.unmountComponentAtNode(container); });
    expect(remove.mock.calls.filter(([type]) => type === THEME_CHANGE_EVENT)).toHaveLength(2);
    act(() => {
      document.dispatchEvent(new CustomEvent(THEME_CHANGE_EVENT, { detail: { preference: 'dark' } }));
    });
    expect(spy).not.toHaveBeenCalled();  // no "state update on an unmounted component"
    spy.mockRestore();
    remove.mockRestore();
  });
});
