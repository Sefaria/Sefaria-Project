/**
 * SearchResultCard: the touch "pressed" state.
 *
 * On mobile web the card has to light up when you tap it and stay in its default state when
 * you merely scroll past it -- and a finger landing on a card is the first half of both
 * gestures. The card tells them apart by waiting: it only lights up once the finger has
 * stayed put for PRESS_DELAY_MS, and a finger that drifts before then is a scroll and gets
 * no highlight at all. A tap shorter than the delay still lights up on release, for
 * PRESS_MIN_MS, so quick taps aren't left with no feedback.
 *
 * No React Testing Library in this repo -- react-dom directly, same pattern as
 * static/js/tests/searchResultCardAuxClick.test.js.
 */

jest.mock('../sefaria/sefaria', () => ({
  __esModule: true,
  default: {
    _: (k) => k,
    interfaceLang: 'english',
    track: { event: () => {} },
    parseRef: () => ({ index: [] }),
    getRef: async (r) => ({ ref: r }),
    humanRef: (r) => r,
    palette: { refColor: () => '#000000' },
  },
}));

jest.mock('../Misc', () => ({
  __esModule: true,
  InterfaceText: ({ text, children }) => (text ? (text.en ?? '') : (children ?? null)),
}));

import React from 'react';
import ReactDOM from 'react-dom';
import { act } from 'react-dom/test-utils';
import SearchResultCard from '../SearchResultCard.jsx';

global.ResizeObserver = class { observe() {} unobserve() {} disconnect() {} };

// Mirrors the constants in SearchResultCard.jsx.
const PRESS_DELAY_MS = 100;
const PRESS_MIN_MS   = 150;

let container = null;

const CARD_PROPS = {
  mode: 'sources',
  name: 'Genesis 44:1',
  tref: 'Genesis 44:1',
  href: '/Genesis.44.1',
  onResultClick: () => {},
};

function mount(props = {}) {
  container = document.createElement('div');
  document.body.appendChild(container);
  act(() => {
    ReactDOM.render(React.createElement(SearchResultCard, { ...CARD_PROPS, ...props }), container);
  });
}

const card = () => container.querySelector('.searchResultCard');
const isPressed = () => card().classList.contains('is-pressed');

// jsdom has no TouchEvent constructor, and the card only ever reads touches[0].clientX/Y.
const touch = (type, x = 0, y = 0) => act(() => {
  const e = new Event(type, { bubbles: true });
  e.touches = [{ clientX: x, clientY: y }];
  card().dispatchEvent(e);
});

// Jest 24's fake timers don't touch Date.now, which the card uses to decide how much of the
// minimum display time is left -- so move the clock by hand alongside the timers.
let now;
const advance = (ms) => act(() => { now += ms; jest.advanceTimersByTime(ms); });

beforeEach(() => {
  jest.useFakeTimers();
  now = 1600000000000;
  jest.spyOn(Date, 'now').mockImplementation(() => now);
});

afterEach(() => {
  Date.now.mockRestore();
  jest.useRealTimers();
  if (!container) return;
  act(() => { ReactDOM.unmountComponentAtNode(container); });
  document.body.removeChild(container);
  container = null;
});

describe('scrolling past a card', () => {
  test('never shows the pressed state, even for an instant', () => {
    mount();
    touch('touchstart', 100, 300);
    expect(isPressed()).toBe(false);        // nothing yet -- this could still be a scroll

    touch('touchmove', 102, 260);           // the finger is dragging: it's a scroll
    advance(PRESS_DELAY_MS + PRESS_MIN_MS);
    expect(isPressed()).toBe(false);

    touch('touchend');
    expect(isPressed()).toBe(false);        // and releasing after a scroll doesn't light it up
  });

  test('a finger that drifts a few pixels is still a tap', () => {
    mount();
    touch('touchstart', 100, 300);
    touch('touchmove', 103, 304);           // under the 10px tolerance
    advance(PRESS_DELAY_MS);
    expect(isPressed()).toBe(true);
  });

  test('an interrupted gesture (touchcancel) clears the pressed state', () => {
    mount();
    touch('touchstart', 100, 300);
    advance(PRESS_DELAY_MS);
    expect(isPressed()).toBe(true);

    touch('touchcancel');
    expect(isPressed()).toBe(false);
  });
});

describe('tapping a card', () => {
  test('lights up once the finger has stayed put, and stays lit while it is down', () => {
    mount();
    touch('touchstart', 100, 300);
    advance(PRESS_DELAY_MS - 1);
    expect(isPressed()).toBe(false);

    advance(1);
    expect(isPressed()).toBe(true);

    advance(2000);                          // a long press stays lit; it doesn't time out
    expect(isPressed()).toBe(true);

    touch('touchend');
    expect(isPressed()).toBe(false);        // already shown well past the minimum, so clears now
  });

  test('a tap quicker than the delay still flashes, then clears', () => {
    mount();
    touch('touchstart', 100, 300);
    advance(30);
    touch('touchend');                      // released before the card ever lit up
    expect(isPressed()).toBe(true);         // show it now so the tap gets its feedback

    advance(PRESS_MIN_MS - 1);
    expect(isPressed()).toBe(true);
    advance(1);
    expect(isPressed()).toBe(false);
  });
});
