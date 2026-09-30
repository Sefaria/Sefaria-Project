/**
 * WCAG 2.1 Level A checks for the dark mode controls (ThemeToggle.jsx): the desktop header
 * button and the mobile hamburger-menu switch, in English and Hebrew. Each describe names the
 * success criterion it gives evidence for; the compliance report cites these test names.
 *
 * Unlike ThemeToggle.test.js, `../sefaria/theme` is NOT mocked here: toggling runs the real
 * writeStoredTheme / applyTheme against jsdom, so the checks on <html lang>, navigation and focus
 * cover the whole client path. Only the Sefaria singleton is mocked.
 *
 * Contrast (1.4.3, 1.4.11) and link distinction (1.4.1) are covered by the token audit in
 * cssColorLiterals.test.js; in-browser behaviour (Tab order, focus rings, skip link, key presses)
 * by e2e-tests/library/theme-a11y.spec.ts and "e2e-tests/mobile web/theme-a11y.spec.ts".
 */
import React from 'react';
import ReactDOM from 'react-dom';
import ReactDOMServer from 'react-dom/server';
import { act } from 'react-dom/test-utils';

jest.mock('../sefaria/sefaria', () => {
  const en = require('../sefaria/i18n/interface/en.json');
  const he = require('../sefaria/i18n/interface/he.json');
  const Sefaria = {
    interfaceLang: 'english',
    theme: null,
    util: { getCookieDomain: () => null },
  };
  Sefaria._ = (key) => (Sefaria.interfaceLang === 'hebrew' ? he : en)[key] || key;
  return { __esModule: true, default: Sefaria };
});

import fs from 'fs';
import path from 'path';
import Sefaria from '../sefaria/sefaria';
import * as theme from '../sefaria/theme';
import { ThemeToggle, MobileThemeToggle } from '../ThemeToggle';

const REPO = path.resolve(__dirname, '../../..');
const en = require('../sefaria/i18n/interface/en.json');
const he = require('../sefaria/i18n/interface/he.json');
const LANGS = [['english', en['header.dark_mode']], ['hebrew', he['header.dark_mode']]];

let container;
const mount = (el) => act(() => { ReactDOM.render(el, container); });
const click = (el) => act(() => { el.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true })); });
const desktop = () => container.querySelector('button.themeToggle');
const mobile = () => container.querySelector('button.mobileThemeToggle');
const both = () => mount(<div><ThemeToggle /><MobileThemeToggle /></div>);

/** Accessible name, following the parts of accname 1.2 these controls can use. */
function accessibleName(el) {
  const ids = el.getAttribute('aria-labelledby');
  if (ids) return ids.split(/\s+/).map((id) => document.getElementById(id)).filter(Boolean).map((n) => n.textContent).join(' ').trim();
  const label = el.getAttribute('aria-label');
  if (label && label.trim()) return label.trim();
  const text = (node) => Array.from(node.childNodes).map((c) => {
    if (c.nodeType === 3) return c.nodeValue;
    if (c.nodeType !== 1 || c.getAttribute('aria-hidden') === 'true') return '';
    if (c.tagName === 'IMG') return c.getAttribute('alt') || '';
    return text(c);
  }).join('');
  const fromContent = text(el).replace(/\s+/g, ' ').trim();
  return fromContent || (el.getAttribute('title') || '').trim();
}

/** The text a sighted user sees on the control (everything not aria-hidden). */
const visibleText = (el) => Array.from(el.querySelectorAll('span:not([aria-hidden="true"])')).map((s) => s.textContent).join(' ').trim();

beforeEach(() => {
  container = document.createElement('div');
  document.body.appendChild(container);
  document.documentElement.removeAttribute('data-theme');
  document.documentElement.setAttribute('lang', 'en');
  document.documentElement.removeAttribute('dir');
  document.cookie = 'theme=; path=/; max-age=0';
  Sefaria.interfaceLang = 'english';
  Sefaria.theme = null;
});

afterEach(() => {
  act(() => { ReactDOM.unmountComponentAtNode(container); });
  container.remove();
  jest.restoreAllMocks();
});

describe.each(LANGS)('%s interface', (lang, label) => {
  beforeEach(() => {
    Sefaria.interfaceLang = lang;
    if (lang === 'hebrew') {
      document.documentElement.setAttribute('lang', 'he');
      document.documentElement.setAttribute('dir', 'rtl');
    }
  });

  describe('1.1.1 Non-text Content', () => {
    test('the icons are decorative: aria-hidden, not focusable, no <img> without alt; the button carries the name', () => {
      both();
      for (const btn of [desktop(), mobile()]) {
        for (const svg of btn.querySelectorAll('svg')) {
          expect(svg.getAttribute('aria-hidden')).toBe('true');
          expect(svg.getAttribute('focusable')).toBe('false');
          expect(svg.querySelector('title, desc')).toBeNull();
        }
        expect(btn.querySelectorAll('img:not([alt])')).toHaveLength(0);
        expect(accessibleName(btn)).toBe(label);
      }
    });

    test('the sun icon that replaces the moon in dark is decorative too', () => {
      both();
      click(desktop());
      const svg = desktop().querySelector('svg.themeToggleSun');
      expect(svg.getAttribute('aria-hidden')).toBe('true');
      expect(accessibleName(desktop())).toBe(label);
    });
  });

  describe('1.3.1 Info and Relationships / 4.1.2 Name, Role, Value', () => {
    test(`desktop: a native button (implicit role "button") named "${label}" with aria-pressed`, () => {
      mount(<ThemeToggle />);
      const btn = desktop();
      expect(btn.tagName).toBe('BUTTON');
      expect(btn.getAttribute('type')).toBe('button');
      expect(btn.hasAttribute('role')).toBe(false);
      expect(btn.getAttribute('aria-pressed')).toBe('false');
      expect(btn.hasAttribute('aria-checked')).toBe(false);
      expect(accessibleName(btn)).toBe(label);
    });

    test(`mobile: role="switch" named "${label}" with aria-checked, no aria-pressed`, () => {
      mount(<MobileThemeToggle />);
      const btn = mobile();
      expect(btn.tagName).toBe('BUTTON');
      expect(btn.getAttribute('role')).toBe('switch');
      expect(btn.getAttribute('aria-checked')).toBe('false');
      expect(btn.hasAttribute('aria-pressed')).toBe(false);
      expect(accessibleName(btn)).toBe(label);
    });

    test('the state attribute follows the theme; the name never changes', () => {
      both();
      click(desktop());
      expect(desktop().getAttribute('aria-pressed')).toBe('true');
      expect(mobile().getAttribute('aria-checked')).toBe('true');
      expect(document.documentElement.getAttribute('data-theme')).toBe('dark');
      expect([accessibleName(desktop()), accessibleName(mobile())]).toEqual([label, label]);
      click(mobile());
      expect(desktop().getAttribute('aria-pressed')).toBe('false');
      expect(mobile().getAttribute('aria-checked')).toBe('false');
      expect(document.documentElement.getAttribute('data-theme')).toBe('light');
    });

    test('server-rendered markup already has role, name and state (works before the bundle loads)', () => {
      Sefaria.theme = 'dark';
      const html = ReactDOMServer.renderToStaticMarkup(<div><ThemeToggle /><MobileThemeToggle /></div>);
      expect(html).toContain(`aria-pressed="true" aria-label="${label}" title="${label}"`);
      expect(html).toMatch(/role="switch"[^>]*aria-checked="true"/);
    });
  });

  describe('2.5.3 Label in Name', () => {
    test('mobile: the visible text is contained in the accessible name', () => {
      mount(<MobileThemeToggle />);
      const shown = visibleText(mobile());
      expect(shown).toBe(label);
      expect(accessibleName(mobile()).toLowerCase()).toContain(shown.toLowerCase());
    });

    test('desktop: no visible text; the tooltip (title) is the accessible name', () => {
      mount(<ThemeToggle />);
      expect(visibleText(desktop())).toBe('');
      expect(desktop().textContent.trim()).toBe('');
      expect(desktop().getAttribute('title')).toBe(accessibleName(desktop()));
    });
  });

  describe('3.1.1 Language of Page', () => {
    test('toggling keeps <html lang> (and dir) next to data-theme', () => {
      const before = [document.documentElement.getAttribute('lang'), document.documentElement.getAttribute('dir')];
      both();
      click(desktop());
      click(mobile());
      expect([document.documentElement.getAttribute('lang'), document.documentElement.getAttribute('dir')]).toEqual(before);
      expect(document.documentElement.getAttribute('data-theme')).toBe('light');
    });
  });
});

describe('1.3.2 Meaningful Sequence / 2.4.3 Focus Order', () => {
  test('mobile row reads icon (hidden), label, then the decorative switch', () => {
    mount(<MobileThemeToggle />);
    const kids = Array.from(mobile().children);
    expect(kids.map((k) => k.tagName.toLowerCase())).toEqual(['svg', 'span', 'span']);
    expect(kids[0].getAttribute('aria-hidden')).toBe('true');
    expect(kids[1].getAttribute('aria-hidden')).toBeNull();
    expect(kids[2].getAttribute('aria-hidden')).toBe('true');
  });

  test('no positive tabindex and no CSS reordering of the controls', () => {
    both();
    expect(container.querySelectorAll('[tabindex]')).toHaveLength(0);
    const css = ['static/css/header.scss', 'static/css/s2.css'].map((f) => fs.readFileSync(path.join(REPO, f), 'utf8'));
    const rules = css.flatMap((src) => src.match(/[^{}]*(themeToggle|mobileThemeToggle)[^{}]*\{[^}]*\}/g) || []);
    expect(rules.length).toBeGreaterThan(3);
    expect(rules.filter((r) => /(^|[\s;{])(order|flex-direction\s*:\s*\w+-reverse|position\s*:\s*(absolute|fixed))\s*:/.test(r.replace(/.*\{/, '{')))
      .filter((r) => !/::after|Switch/.test(r.split('{')[0]))).toEqual([]);
  });
});

describe('1.3.3 Sensory Characteristics', () => {
  test('the label names the function, not a shape, colour or position', () => {
    for (const [, label] of LANGS) {
      expect(label).not.toMatch(/moon|sun|icon|left|right|above|below|circle|black|white|ירח|שמש|סמל|ימין|שמאל/i);
    }
    expect(en['header.dark_mode']).toBe('Dark mode');
    expect(he['header.dark_mode']).toBe('מצב כהה');
  });
});

describe('1.4.1 Use of Color (state is not shown by colour alone)', () => {
  const s2 = fs.readFileSync(path.join(REPO, 'static/css/s2.css'), 'utf8');
  test('mobile: "on" moves the knob (inset-inline-start), not just the track colour', () => {
    expect(s2).toMatch(/\.mobileThemeToggle\[aria-checked="true"\] \.mobileThemeToggleSwitch::after \{\s*inset-inline-start: 24px;/);
    expect(s2).toMatch(/\.mobileThemeToggleSwitch::after \{[^}]*inset-inline-start: 2px;/);
  });

  test('desktop: the icon changes shape (moon when light, sun when dark) as well as aria-pressed', () => {
    mount(<ThemeToggle />);
    expect(desktop().querySelector('svg.themeToggleMoon')).not.toBeNull();
    click(desktop());
    expect(desktop().querySelector('svg.themeToggleMoon')).toBeNull();
    expect(desktop().querySelector('svg.themeToggleSun')).not.toBeNull();
  });
});

describe('2.1.1 Keyboard / 2.1.2 No Keyboard Trap', () => {
  test.each([['desktop', desktop], ['mobile', mobile]])('%s: focusable native button that leaves Enter, Space and Tab to the browser', (name, get) => {
    both();
    const btn = get();
    btn.focus();
    expect(document.activeElement).toBe(btn);
    expect(btn.disabled).toBe(false);
    expect(btn.tabIndex).toBe(0);
    for (const key of ['Enter', ' ', 'Tab']) {
      for (const type of ['keydown', 'keyup']) {
        const ev = new KeyboardEvent(type, { key, bubbles: true, cancelable: true, shiftKey: false });
        act(() => { btn.dispatchEvent(ev); });
        expect([name, type, key, ev.defaultPrevented]).toEqual([name, type, key, false]);
      }
    }
    const shiftTab = new KeyboardEvent('keydown', { key: 'Tab', shiftKey: true, bubbles: true, cancelable: true });
    act(() => { btn.dispatchEvent(shiftTab); });
    expect(shiftTab.defaultPrevented).toBe(false);
    // The click a browser dispatches for Enter/Space toggles it (the key press itself is covered in E2E).
    act(() => { btn.click(); });
    expect(document.documentElement.getAttribute('data-theme')).toBe('dark');
  });

  test('blurring is allowed: focus is never pulled back', () => {
    both();
    const other = document.createElement('button');
    document.body.appendChild(other);
    desktop().focus();
    other.focus();
    expect(document.activeElement).toBe(other);
    mobile().focus();
    other.focus();
    expect(document.activeElement).toBe(other);
    other.remove();
  });
});

describe('2.1.4 Character Key Shortcuts', () => {
  test('mounting adds no key listeners anywhere, and single characters do nothing', () => {
    const added = [];
    for (const target of [document, window, document.body]) {
      const orig = target.addEventListener.bind(target);
      jest.spyOn(target, 'addEventListener').mockImplementation((type, ...rest) => { added.push(type); return orig(type, ...rest); });
    }
    both();
    expect(added.filter((t) => /^key/.test(t))).toEqual([]);
    for (const key of ['d', 'D', 't', 'l', 'm', 'n', 'ד']) {
      act(() => { document.body.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true })); });
    }
    expect(document.documentElement.getAttribute('data-theme')).toBeNull();
    expect(desktop().getAttribute('aria-pressed')).toBe('false');
  });

  test('ThemeToggle.jsx defines no key handlers', () => {
    const src = fs.readFileSync(path.join(REPO, 'static/js/ThemeToggle.jsx'), 'utf8');
    expect(src).not.toMatch(/onKey(Down|Up|Press)|['"]key(down|up|press)['"]|accessKey/);
  });
});

describe('2.5.1 Pointer Gestures / 2.5.2 Pointer Cancellation', () => {
  test('activation is a single click (up event): press alone does nothing', () => {
    both();
    for (const btn of [desktop(), mobile()]) {
      for (const type of ['pointerdown', 'mousedown', 'touchstart']) {
        act(() => { btn.dispatchEvent(new Event(type, { bubbles: true, cancelable: true })); });
      }
    }
    expect(document.documentElement.getAttribute('data-theme')).toBeNull();
    click(desktop());
    expect(document.documentElement.getAttribute('data-theme')).toBe('dark');
  });

  test('ThemeToggle.jsx uses onClick only (no down, touch, drag or multi-point handlers)', () => {
    const src = fs.readFileSync(path.join(REPO, 'static/js/ThemeToggle.jsx'), 'utf8');
    expect(src).toMatch(/onClick=\{toggle\}/);
    expect(src).not.toMatch(/on(Pointer|Mouse|Touch)(Down|Start|Move|Up|End)|onDrag|onDoubleClick|onContextMenu/);
  });
});

describe('3.2.1 On Focus', () => {
  test('focusing either control changes nothing', () => {
    const write = jest.spyOn(theme, 'writeStoredTheme');
    const apply = jest.spyOn(theme, 'applyTheme');
    both();
    desktop().focus();
    mobile().focus();
    act(() => { mobile().dispatchEvent(new FocusEvent('focusin', { bubbles: true })); });
    expect(write).not.toHaveBeenCalled();
    expect(apply).not.toHaveBeenCalled();
    expect(document.documentElement.getAttribute('data-theme')).toBeNull();
    expect(desktop().getAttribute('aria-pressed')).toBe('false');
  });
});

describe('3.2.2 On Input', () => {
  test('toggling does not navigate, reload, submit or change history, and focus stays on the control', () => {
    const push = jest.spyOn(window.history, 'pushState');
    const replace = jest.spyOn(window.history, 'replaceState');
    const errors = jest.spyOn(console, 'error').mockImplementation(() => {});
    const href = window.location.href;
    const form = document.createElement('form');
    const submitted = jest.fn((e) => e.preventDefault());
    form.addEventListener('submit', submitted);
    container.appendChild(form);
    act(() => { ReactDOM.render(<div><ThemeToggle /><MobileThemeToggle /></div>, form); });
    const d = form.querySelector('button.themeToggle');
    const m = form.querySelector('button.mobileThemeToggle');
    d.focus();
    click(d);
    expect(document.activeElement).toBe(d);
    m.focus();
    click(m);
    expect(document.activeElement).toBe(m);
    expect(window.location.href).toBe(href);
    expect(push).not.toHaveBeenCalled();
    expect(replace).not.toHaveBeenCalled();
    expect(submitted).not.toHaveBeenCalled();   // type="button" never submits an enclosing form
    // jsdom reports any navigation or reload attempt as "Not implemented: navigation".
    expect(errors.mock.calls.flat().map(String).filter((s) => /navigation|reload/i.test(s))).toEqual([]);
    act(() => { ReactDOM.unmountComponentAtNode(form); });
  });

  test('the click is neither cancelled nor stopped, so a surrounding menu decides for itself (it stays open: headerThemeToggle.test.js)', () => {
    const outer = jest.fn();
    mount(<div onClick={outer}><MobileThemeToggle /></div>);
    const ev = new MouseEvent('click', { bubbles: true, cancelable: true });
    act(() => { mobile().dispatchEvent(ev); });
    expect(ev.defaultPrevented).toBe(false);
    expect(outer).toHaveBeenCalledTimes(1);
  });

  test('the theme is stored and applied in place: cookie written, data-theme set, no page load', () => {
    both();
    click(desktop());
    expect(theme.readStoredTheme()).toBe('dark');
    expect(document.documentElement.getAttribute('data-theme')).toBe('dark');
  });
});

describe('4.1.1 Parsing', () => {
  test('the controls add no ids (so none can collide), and SVG markup has no id-bearing defs', () => {
    both();
    click(desktop());   // sun icon too
    expect(container.querySelectorAll('[id]')).toHaveLength(0);
    const html = ReactDOMServer.renderToStaticMarkup(<div><ThemeToggle /><MobileThemeToggle /></div>);
    expect(html).not.toMatch(/\sid=|<defs|<use\b|url\(#/);
  });

  test('rendering the header pair twice (desktop header + mobile menu) still has no duplicate ids', () => {
    mount(<div><ThemeToggle /><MobileThemeToggle /><ThemeToggle /><MobileThemeToggle /></div>);
    const ids = Array.from(document.querySelectorAll('[id]')).map((e) => e.id);
    expect(ids.length).toBe(new Set(ids).size);
  });
});
