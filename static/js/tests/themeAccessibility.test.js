/**
 * WCAG 2.1 Level A checks for the Appearance controls (AppearanceToggle.jsx): the Auto / Light /
 * Dark group in the desktop account menus and the row in the mobile hamburger menu, in English
 * and Hebrew. Each describe names the success criterion it gives evidence for; the compliance
 * report cites these test names.
 *
 * Unlike AppearanceToggle.test.js, `../sefaria/theme` is NOT wrapped here: choosing runs the real
 * writeStoredPreference / applyTheme against jsdom, so the checks on <html lang>, navigation and
 * focus cover the whole client path. Only the Sefaria singleton is mocked.
 *
 * Contrast (1.4.3, 1.4.11, including the pressed chip) is covered by the token audit in
 * cssColorLiterals.test.js; the menu staying open by headerAppearance.test.js; in-browser
 * behaviour (Tab order, focus rings, key presses) by the E2E appearance-a11y specs.
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
import { AppearanceToggle, MobileAppearanceToggle } from '../AppearanceToggle';

const REPO = path.resolve(__dirname, '../../..');
const SOURCE = fs.readFileSync(path.join(REPO, 'static/js/AppearanceToggle.jsx'), 'utf8');
const en = require('../sefaria/i18n/interface/en.json');
const he = require('../sefaria/i18n/interface/he.json');
const OPTIONS = ['auto', 'light', 'dark'];
const labelsOf = (dict) => ({
  group: dict['header.appearance'],
  auto: dict['header.appearance_auto'],
  light: dict['header.appearance_light'],
  dark: dict['header.appearance_dark'],
});
const LANGS = [['english', labelsOf(en)], ['hebrew', labelsOf(he)]];

let container;
const mount = (el) => act(() => { ReactDOM.render(el, container); });
const click = (el) => act(() => { el.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true })); });
const desktopGroup = () => container.querySelector('.dropdownAppearanceToggle');
const mobileGroup = () => container.querySelector('.mobileAppearanceToggle');
const groups = () => [desktopGroup(), mobileGroup()].filter(Boolean);
const option = (group, value) => group.querySelector(`button[data-appearance="${value}"]`);
const allOptions = () => Array.from(container.querySelectorAll('button.appearanceOption'));
const both = () => mount(<div><AppearanceToggle /><MobileAppearanceToggle /></div>);
const shown = () => document.documentElement.getAttribute('data-theme');

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

/** The text a sighted user sees on an element (text nodes outside aria-hidden subtrees). */
const visibleText = (el) => {
  const walk = (node) => Array.from(node.childNodes).map((c) => {
    if (c.nodeType === 3) return c.nodeValue;
    if (c.nodeType !== 1 || c.getAttribute('aria-hidden') === 'true') return '';
    return walk(c);
  }).join('');
  return walk(el).replace(/\s+/g, ' ').trim();
};

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
  delete window.matchMedia;
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
    test('the icons are decorative: aria-hidden, not focusable, no <img> without alt; each button carries the name', () => {
      both();
      const svgs = container.querySelectorAll('svg');
      expect(svgs).toHaveLength(7);   // 3 options x 2 controls + the mobile row icon
      for (const svg of svgs) {
        expect(svg.getAttribute('aria-hidden')).toBe('true');
        expect(svg.getAttribute('focusable')).toBe('false');
        expect(svg.querySelector('title, desc')).toBeNull();
      }
      expect(container.querySelectorAll('img:not([alt])')).toHaveLength(0);
      for (const group of groups()) {
        for (const v of OPTIONS) expect(accessibleName(option(group, v))).toBe(label[v]);
      }
    });

    test('the pressed option\'s icon is decorative too, and its name does not change', () => {
      both();
      click(option(desktopGroup(), 'dark'));
      const btn = option(desktopGroup(), 'dark');
      expect(btn.querySelector('svg').getAttribute('aria-hidden')).toBe('true');
      expect(accessibleName(btn)).toBe(label.dark);
    });
  });

  describe('1.3.1 Info and Relationships / 4.1.2 Name, Role, Value', () => {
    test(`each control is a group named "${label.group}"`, () => {
      both();
      for (const group of groups()) {
        expect(group.getAttribute('role')).toBe('group');
        expect(accessibleName(group)).toBe(label.group);
      }
    });

    test('each option is a native button (implicit role "button") with a name and aria-pressed', () => {
      both();
      for (const group of groups()) {
        for (const v of OPTIONS) {
          const btn = option(group, v);
          expect(btn.tagName).toBe('BUTTON');
          expect(btn.getAttribute('type')).toBe('button');
          expect(btn.hasAttribute('role')).toBe(false);
          expect(btn.getAttribute('aria-pressed')).toBe(String(v === 'auto'));
          expect(btn.hasAttribute('aria-checked')).toBe(false);
          expect(accessibleName(btn)).toBe(label[v]);
        }
      }
    });

    test('exactly one option is pressed; the state follows the choice and the names never change', () => {
      both();
      const state = () => groups().map((g) => OPTIONS.filter((v) => option(g, v).getAttribute('aria-pressed') === 'true'));
      expect(state()).toEqual([['auto'], ['auto']]);
      click(option(desktopGroup(), 'dark'));
      expect(state()).toEqual([['dark'], ['dark']]);
      expect(shown()).toBe('dark');
      click(option(mobileGroup(), 'light'));
      expect(state()).toEqual([['light'], ['light']]);
      expect(shown()).toBe('light');
      expect(allOptions().map(accessibleName)).toEqual([...OPTIONS, ...OPTIONS].map((v) => label[v]));
    });

    test('server-rendered markup already has roles, names and state (works before the bundle loads)', () => {
      Sefaria.theme = 'dark';
      const html = ReactDOMServer.renderToStaticMarkup(<div><AppearanceToggle /><MobileAppearanceToggle /></div>);
      expect(html.match(new RegExp(`role="group" aria-label="${label.group}"`, 'g'))).toHaveLength(2);
      expect(html.match(new RegExp(`data-appearance="dark" aria-pressed="true" aria-label="${label.dark}" title="${label.dark}"`, 'g'))).toHaveLength(2);
      expect(html.match(/aria-pressed="false"/g)).toHaveLength(4);
    });
  });

  describe('2.5.3 Label in Name', () => {
    test('options: no visible text; the tooltip (title) is exactly the accessible name', () => {
      both();
      for (const btn of allOptions()) {
        expect(visibleText(btn)).toBe('');
        expect(btn.textContent.trim()).toBe('');
        expect(btn.getAttribute('title')).toBe(accessibleName(btn));
        expect(btn.getAttribute('title')).toBe(btn.getAttribute('aria-label'));
      }
    });

    test('desktop: the visible title above the group is the group\'s name', () => {
      mount(<AppearanceToggle />);
      const title = container.querySelector('.appearanceHeader');
      expect(visibleText(title)).toBe(label.group);
      expect(accessibleName(desktopGroup()).toLowerCase()).toContain(visibleText(title).toLowerCase());
    });

    test('mobile: the visible row text is contained in the group\'s name', () => {
      mount(<MobileAppearanceToggle />);
      const text = visibleText(mobileGroup());
      expect(text).toBe(label.group);
      expect(accessibleName(mobileGroup()).toLowerCase()).toContain(text.toLowerCase());
    });
  });

  describe('3.1.1 Language of Page', () => {
    test('choosing keeps <html lang> (and dir) next to data-theme', () => {
      const before = [document.documentElement.getAttribute('lang'), document.documentElement.getAttribute('dir')];
      both();
      click(option(desktopGroup(), 'dark'));
      click(option(mobileGroup(), 'light'));
      click(option(desktopGroup(), 'auto'));
      expect([document.documentElement.getAttribute('lang'), document.documentElement.getAttribute('dir')]).toEqual(before);
      expect(shown()).toBe('light');
    });

    test('the interface-language text is marked with the matching int-en / int-he class', () => {
      both();
      const cls = lang === 'hebrew' ? 'int-he' : 'int-en';
      const other = lang === 'hebrew' ? 'int-en' : 'int-he';
      expect(container.querySelectorAll(`span.${cls}`)).toHaveLength(2);
      expect(container.querySelectorAll(`span.${other}`)).toHaveLength(0);
    });
  });
});

describe('1.3.2 Meaningful Sequence / 2.4.3 Focus Order', () => {
  test('options are in the order Auto, Light, Dark in both controls', () => {
    both();
    for (const group of groups()) {
      expect(Array.from(group.querySelectorAll('button')).map((b) => b.getAttribute('data-appearance'))).toEqual(OPTIONS);
    }
  });

  test('desktop: the title comes right before the group it names', () => {
    mount(<AppearanceToggle />);
    expect(container.querySelector('.appearanceHeader').nextElementSibling).toBe(desktopGroup());
  });

  test('mobile row reads icon (hidden), label, then the options', () => {
    mount(<MobileAppearanceToggle />);
    const kids = Array.from(mobileGroup().children);
    expect(kids.map((k) => k.tagName.toLowerCase())).toEqual(['svg', 'span', 'span']);
    expect(kids[0].getAttribute('aria-hidden')).toBe('true');
    expect(kids[1].getAttribute('aria-hidden')).toBeNull();
    expect(kids[2].querySelectorAll('button')).toHaveLength(3);
  });

  test('no positive tabindex and no CSS reordering of the controls', () => {
    both();
    expect(container.querySelectorAll('[tabindex]')).toHaveLength(0);
    const css = ['static/css/header.scss', 'static/css/s2.css'].map((f) => fs.readFileSync(path.join(REPO, f), 'utf8'));
    const rules = css.flatMap((src) => src.match(/[^{}]*([aA]ppearance)[^{}]*\{[^}]*\}/g) || []);
    expect(rules.length).toBeGreaterThan(5);
    expect(rules.filter((r) => /(^|[\s;{])(order|flex-direction\s*:\s*\w+-reverse|position\s*:\s*(absolute|fixed))\s*:/.test(r.replace(/.*\{/, '{'))))
      .toEqual([]);
    expect(rules.filter((r) => /flex-direction\s*:\s*\w+-reverse|(^|[\s;{])order\s*:/.test(r))).toEqual([]);
  });
});

describe('1.3.3 Sensory Characteristics', () => {
  test('the labels name the function, not a shape, colour or position', () => {
    for (const [, label] of LANGS) {
      for (const text of Object.values(label)) {
        expect(text).not.toMatch(/moon|sun|screen|icon|left|right|above|below|circle|black|white|ירח|שמש|מסך|סמל|ימין|שמאל|שחור|לבן/i);
      }
    }
  });

  test('the strings exist in both languages, and the two-state "Dark mode" string is gone', () => {
    expect(labelsOf(en)).toEqual({ group: 'Appearance', auto: 'Auto', light: 'Light', dark: 'Dark' });
    expect(labelsOf(he)).toEqual({ group: 'מראה', auto: 'אוטומטי', light: 'בהיר', dark: 'כהה' });
    expect(en['header.dark_mode']).toBeUndefined();
    expect(he['header.dark_mode']).toBeUndefined();
  });
});

describe('1.4.1 Use of Color (state is not shown by colour alone)', () => {
  const s2 = fs.readFileSync(path.join(REPO, 'static/css/s2.css'), 'utf8');
  test('the pressed option is a filled chip: a background fill on the whole button, not only an icon colour', () => {
    const rule = s2.match(/\.appearanceOption\.active,\s*\.appearanceOption\.active:hover \{([^}]*)\}/);
    expect(rule).not.toBeNull();
    expect(rule[1]).toMatch(/background-color: var\(--color-accent-fill\);/);
    expect(rule[1]).toMatch(/color: var\(--color-text-on-accent\);/);
    // the unpressed options have no fill at rest (the chip is the difference; >= 3:1 in the token audit)
    expect(s2).toMatch(/\.appearanceOption \{[^}]*background: none;/);
  });

  test('every option has its own icon shape, so the choices are told apart without colour', () => {
    both();
    const shapes = OPTIONS.map((v) => option(desktopGroup(), v).querySelector('svg').innerHTML);
    expect(new Set(shapes).size).toBe(3);
  });

  test('the pressed class moves with aria-pressed', () => {
    both();
    click(option(desktopGroup(), 'light'));
    for (const btn of allOptions()) {
      expect(btn.classList.contains('active')).toBe(btn.getAttribute('aria-pressed') === 'true');
    }
  });
});

describe('2.1.1 Keyboard / 2.1.2 No Keyboard Trap', () => {
  test.each([['desktop', desktopGroup], ['mobile', mobileGroup]])('%s: focusable native buttons that leave Enter, Space and Tab to the browser', (name, getGroup) => {
    both();
    for (const v of OPTIONS) {
      const btn = option(getGroup(), v);
      btn.focus();
      expect(document.activeElement).toBe(btn);
      expect(btn.disabled).toBe(false);
      expect(btn.tabIndex).toBe(0);
      for (const key of ['Enter', ' ', 'Tab', 'ArrowLeft', 'ArrowRight']) {
        for (const type of ['keydown', 'keyup']) {
          const ev = new KeyboardEvent(type, { key, bubbles: true, cancelable: true, shiftKey: false });
          act(() => { btn.dispatchEvent(ev); });
          expect([name, v, type, key, ev.defaultPrevented]).toEqual([name, v, type, key, false]);
        }
      }
      const shiftTab = new KeyboardEvent('keydown', { key: 'Tab', shiftKey: true, bubbles: true, cancelable: true });
      act(() => { btn.dispatchEvent(shiftTab); });
      expect(shiftTab.defaultPrevented).toBe(false);
    }
    // The click a browser dispatches for Enter/Space chooses it (the key press itself is covered in E2E).
    act(() => { option(getGroup(), 'dark').click(); });
    expect(shown()).toBe('dark');
  });

  test('blurring is allowed: focus is never pulled back', () => {
    both();
    const other = document.createElement('button');
    document.body.appendChild(other);
    for (const btn of allOptions()) {
      btn.focus();
      other.focus();
      expect(document.activeElement).toBe(other);
    }
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
    for (const key of ['a', 'A', 'd', 'D', 'l', 'L', 't', 'm', 'n', 'ד', 'ב', 'א']) {
      act(() => { document.body.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true })); });
    }
    expect(shown()).toBeNull();
    expect(option(desktopGroup(), 'auto').getAttribute('aria-pressed')).toBe('true');
  });

  test('AppearanceToggle.jsx defines no key handlers or access keys', () => {
    expect(SOURCE).not.toMatch(/onKey(Down|Up|Press)|['"]key(down|up|press)['"]|accessKey/);
  });
});

describe('2.5.1 Pointer Gestures / 2.5.2 Pointer Cancellation', () => {
  test('activation is a single click (up event): press alone does nothing', () => {
    both();
    for (const btn of allOptions()) {
      for (const type of ['pointerdown', 'mousedown', 'touchstart']) {
        act(() => { btn.dispatchEvent(new Event(type, { bubbles: true, cancelable: true })); });
      }
    }
    expect(shown()).toBeNull();
    expect(document.cookie).toBe('');
    click(option(desktopGroup(), 'dark'));
    expect(shown()).toBe('dark');
  });

  test('AppearanceToggle.jsx uses onClick only (no down, touch, drag or multi-point handlers)', () => {
    expect(SOURCE).toMatch(/onClick=\{\(\) => choose\(value\)\}/);
    expect(SOURCE.match(/\bon[A-Z]\w*=/g)).toEqual(['onClick=']);
    expect(SOURCE).not.toMatch(/on(Pointer|Mouse|Touch)(Down|Start|Move|Up|End)|onDrag|onDoubleClick|onContextMenu/);
  });
});

describe('3.2.1 On Focus', () => {
  test('focusing any option changes nothing', () => {
    const write = jest.spyOn(theme, 'writeStoredPreference');
    const apply = jest.spyOn(theme, 'applyTheme');
    both();
    for (const btn of allOptions()) {
      btn.focus();
      act(() => { btn.dispatchEvent(new FocusEvent('focusin', { bubbles: true })); });
    }
    expect(write).not.toHaveBeenCalled();
    expect(apply).not.toHaveBeenCalled();
    expect(shown()).toBeNull();
    expect(document.cookie).toBe('');
    expect(option(desktopGroup(), 'auto').getAttribute('aria-pressed')).toBe('true');
  });
});

describe('3.2.2 On Input', () => {
  test('choosing does not navigate, reload, submit or change history, and focus stays on the option', () => {
    const push = jest.spyOn(window.history, 'pushState');
    const replace = jest.spyOn(window.history, 'replaceState');
    const errors = jest.spyOn(console, 'error').mockImplementation(() => {});
    const href = window.location.href;
    const form = document.createElement('form');
    const submitted = jest.fn((e) => e.preventDefault());
    form.addEventListener('submit', submitted);
    container.appendChild(form);
    act(() => { ReactDOM.render(<div><AppearanceToggle /><MobileAppearanceToggle /></div>, form); });
    for (const [sel, v] of [['.dropdownAppearanceToggle', 'dark'], ['.mobileAppearanceToggle', 'light'], ['.dropdownAppearanceToggle', 'auto']]) {
      const btn = form.querySelector(`${sel} [data-appearance="${v}"]`);
      btn.focus();
      click(btn);
      expect(document.activeElement).toBe(btn);
      expect(btn.isConnected).toBe(true);     // re-rendering keeps the same element (keyed by value)
      expect(btn.getAttribute('aria-pressed')).toBe('true');
    }
    expect(window.location.href).toBe(href);
    expect(push).not.toHaveBeenCalled();
    expect(replace).not.toHaveBeenCalled();
    expect(submitted).not.toHaveBeenCalled();   // type="button" never submits an enclosing form
    // jsdom reports any navigation or reload attempt as "Not implemented: navigation".
    expect(errors.mock.calls.flat().map(String).filter((s) => /navigation|reload/i.test(s))).toEqual([]);
    act(() => { ReactDOM.unmountComponentAtNode(form); });
  });

  test('the click is neither cancelled nor stopped, so a surrounding menu decides for itself (it stays open: headerAppearance.test.js)', () => {
    const outer = jest.fn();
    mount(<div onClick={outer}><AppearanceToggle /><MobileAppearanceToggle /></div>);
    for (const btn of [option(desktopGroup(), 'dark'), option(mobileGroup(), 'light')]) {
      const ev = new MouseEvent('click', { bubbles: true, cancelable: true });
      act(() => { btn.dispatchEvent(ev); });
      expect(ev.defaultPrevented).toBe(false);
    }
    expect(outer).toHaveBeenCalledTimes(2);
  });

  test('the desktop group asks its menu to stay open (data-prevent-close), so the change can be seen', () => {
    both();
    expect(desktopGroup().getAttribute('data-prevent-close')).toBe('true');
    for (const btn of desktopGroup().querySelectorAll('button')) {
      expect(btn.closest('[data-prevent-close="true"]')).toBe(desktopGroup());
      expect(btn.querySelector('path').closest('[data-prevent-close="true"]')).toBe(desktopGroup());
    }
  });

  test('the preference is stored and shown in place: cookie written, data-theme set, no page load', () => {
    window.matchMedia = (q) => ({ matches: q === '(prefers-color-scheme: dark)', media: q });
    both();
    click(option(desktopGroup(), 'light'));
    expect(theme.readStoredPreference()).toBe('light');
    expect(shown()).toBe('light');
    click(option(desktopGroup(), 'auto'));
    expect(theme.readStoredPreference()).toBe('auto');
    expect(shown()).toBe('dark');
  });
});

describe('4.1.1 Parsing', () => {
  test('the controls add no ids (so none can collide), and SVG markup has no id-bearing defs', () => {
    both();
    click(option(desktopGroup(), 'dark'));
    expect(container.querySelectorAll('[id]')).toHaveLength(0);
    for (const pref of [null, 'light', 'dark']) {
      Sefaria.theme = pref;
      const html = ReactDOMServer.renderToStaticMarkup(<div><AppearanceToggle /><MobileAppearanceToggle /></div>);
      expect(html).not.toMatch(/\sid=|<defs|<use\b|url\(#|aria-labelledby|aria-describedby/);
    }
  });

  test('rendering the pair twice (both account menus + the mobile menu) still has no duplicate ids', () => {
    mount(<div><AppearanceToggle /><MobileAppearanceToggle /><AppearanceToggle /><MobileAppearanceToggle /></div>);
    const ids = Array.from(document.querySelectorAll('[id]')).map((e) => e.id);
    expect(ids.length).toBe(new Set(ids).size);
  });

  test('aria-pressed is always the string "true" or "false"', () => {
    both();
    for (const btn of allOptions()) expect(['true', 'false']).toContain(btn.getAttribute('aria-pressed'));
  });
});
