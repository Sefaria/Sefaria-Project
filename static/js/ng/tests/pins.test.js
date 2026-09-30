/**
 * Pinned commentators (pins.js): per corpus, at most two, kept in localStorage and read only
 * after mount. The SSR side (no window, no storage) is covered in NgReaderApp.ssr.test.js.
 */
import React from 'react';
import ReactDOM from 'react-dom';
import {act} from 'react-dom/test-utils';
import {MAX_PINS, PINS_KEY, isPinned, pinScope, readPins, togglePin, usePins, writePins} from '../pins';

const RASHI = {title: 'Rashi', heTitle: 'רש"י', category: 'Commentary'};
const RAMBAN = {title: 'Ramban', heTitle: 'רמב"ן', category: 'Commentary'};
const SFORNO = {title: 'Sforno', heTitle: 'ספורנו', category: 'Commentary'};
const STEINSALTZ = {title: 'Steinsaltz', heTitle: 'שטיינזלץ', category: 'Commentary'};
const ONKELOS = {title: 'Onkelos Genesis', heTitle: 'x', shortTitle: 'Onkelos', heShortTitle: 'אונקלוס', category: 'Targum'};

beforeEach(() => { window.localStorage.clear(); });

test('pins are kept per corpus', () => {
  expect(pinScope({primaryCategory: 'Tanakh'}, 'Tanakh')).toBe('Tanakh');
  expect(pinScope({primaryCategory: 'Halakhah', categories: ['Halakhah']}, null)).toBe('Halakhah');
  expect(pinScope(null, null)).toBe('other');
  let pins = togglePin({}, 'Tanakh', RASHI);
  pins = togglePin(pins, 'Talmud', STEINSALTZ);
  expect(isPinned(pins, 'Tanakh', RASHI)).toBe(true);
  expect(isPinned(pins, 'Talmud', RASHI)).toBe(false);
  expect(isPinned(pins, 'Talmud', STEINSALTZ)).toBe(true);
});

test('one or two per corpus: a third is refused, not swapped in', () => {
  expect(MAX_PINS).toBe(2);
  let pins = togglePin(togglePin({}, 'Tanakh', RASHI), 'Tanakh', RAMBAN);
  const full = togglePin(pins, 'Tanakh', SFORNO);
  expect(full).toBe(pins);
  expect(pins.Tanakh.map(p => p.title)).toEqual(['Rashi', 'Ramban']);
  pins = togglePin(pins, 'Tanakh', RASHI);
  expect(pins.Tanakh.map(p => p.title)).toEqual(['Ramban']);
  pins = togglePin(pins, 'Tanakh', RAMBAN);
  expect(pins).toEqual({});
});

test('a pin keeps the display title of a major commentator', () => {
  expect(togglePin({}, 'Tanakh', ONKELOS).Tanakh[0]).toEqual({
    title: 'Onkelos Genesis', heTitle: 'x', category: 'Targum', shortTitle: 'Onkelos', heShortTitle: 'אונקלוס',
  });
});

test('storage round trip, and garbage in storage is ignored', () => {
  writePins({Tanakh: [RASHI]});
  expect(JSON.parse(window.localStorage.getItem(PINS_KEY))).toEqual({Tanakh: [RASHI]});
  expect(readPins()).toEqual({Tanakh: [RASHI]});
  window.localStorage.setItem(PINS_KEY, '{not json');
  expect(readPins()).toEqual({});
  window.localStorage.setItem(PINS_KEY, JSON.stringify({Tanakh: [RASHI, {title: 3}, RAMBAN, SFORNO], Talmud: 'x', bad: []}));
  expect(readPins()).toEqual({Tanakh: [RASHI, RAMBAN]});
});

test('storage that throws (private mode) leaves pins working for the visit', () => {
  const spy = jest.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('QuotaExceeded'); });
  expect(() => writePins({Tanakh: [RASHI]})).not.toThrow();
  spy.mockRestore();
});

test('usePins is empty on the first render (as on the server) and loads after mount', () => {
  writePins({Tanakh: [RASHI]});
  const seen = [];
  let toggle;
  function Probe() {
    const [pins, t] = usePins();
    toggle = t;
    seen.push(pins);
    return null;
  }
  const el = document.createElement('div');
  act(() => { ReactDOM.render(<Probe />, el); });
  expect(seen[0]).toEqual({});
  expect(seen[seen.length - 1]).toEqual({Tanakh: [RASHI]});
  act(() => { toggle('Tanakh', RAMBAN); });
  expect(readPins().Tanakh.map(p => p.title)).toEqual(['Rashi', 'Ramban']);
  act(() => { ReactDOM.unmountComponentAtNode(el); });
});
