import React from 'react';
import ReactDOM from 'react-dom';
import {act} from 'react-dom/test-utils';
import {HEADER_THRESHOLDS as T, initialHeaderState, nextHeaderState, useHeaderVisibility} from '../headerScroll';

/** Feed a sequence of scroll offsets through the pure logic. */
function run(offsets, options, state = initialHeaderState()) {
  return offsets.reduce((s, y) => nextHeaderState(s, y, options), state);
}

describe('nextHeaderState', () => {
  test('visible at rest at the top', () => {
    expect(initialHeaderState().visible).toBe(true);
    expect(run([0, 5, T.topReveal]).visible).toBe(true);
  });

  test('does not hide before the page has scrolled past the header', () => {
    expect(run([10, 30, 50, T.hideAfter]).visible).toBe(true);
  });

  test('hides as forward reading proceeds', () => {
    expect(run([40, 80, 120]).visible).toBe(false);
  });

  test('a small upward wobble while reading does not bring it back', () => {
    const hidden = run([100, 300, 600]);
    expect(hidden.visible).toBe(false);
    expect(run([590, 580], {}, hidden).visible).toBe(false);          // 20px < upTravel
  });

  test('a deliberate reverse scroll brings it back; travel accumulates across events', () => {
    const hidden = run([100, 300, 600]);
    expect(run([590, 580, 570, 560], {}, hidden).visible).toBe(true);  // 40px >= upTravel
    expect(run([560], {}, hidden).visible).toBe(true);                 // one 40px jump
  });

  test('reversing direction resets the travel', () => {
    const hidden = run([100, 300, 600]);
    const s = run([580, 590, 570], {}, hidden);  // up 20, down 10, up 20: never 36 in a row
    expect(s.visible).toBe(false);
  });

  test('returns near the top even without enough upward travel', () => {
    const hidden = run([100, 300, 600]);
    expect(run([T.topReveal - 1], {}, hidden).visible).toBe(true);
  });

  test('returns at the very end of the book, but not at the bottom of a partial stream', () => {
    const hidden = run([100, 300, 900]);
    expect(run([1000], {maxY: 1000, atEnd: true}, hidden).visible).toBe(true);
    expect(run([1000], {maxY: 1000, atEnd: false}, hidden).visible).toBe(false);
  });

  test('no movement, no change', () => {
    const s = run([100, 300]);
    expect(nextHeaderState(s, 300)).toBe(s);
  });
});

describe('useHeaderVisibility (window scroll, rAF-coalesced)', () => {
  let container, api, raf;
  function Probe(props) { api = useHeaderVisibility(props); return <div data-visible={String(api.visible)} />; }

  beforeEach(() => {
    raf = window.requestAnimationFrame;
    window.requestAnimationFrame = (cb) => { cb(); return 1; };
    Object.defineProperty(document.documentElement, 'scrollHeight', {value: 10000, configurable: true});
    container = document.createElement('div');
    window.pageYOffset = 0;
    act(() => { ReactDOM.render(<Probe />, container); });
  });
  afterEach(() => {
    act(() => { ReactDOM.unmountComponentAtNode(container); });
    window.requestAnimationFrame = raf;
  });

  const scrollTo = (y) => act(() => { window.pageYOffset = y; window.dispatchEvent(new Event('scroll')); });

  test('flips with the scroll direction', () => {
    expect(container.firstChild.getAttribute('data-visible')).toBe('true');
    [50, 150, 300].forEach(scrollTo);
    expect(container.firstChild.getAttribute('data-visible')).toBe('false');
    [280, 250].forEach(scrollTo);
    expect(container.firstChild.getAttribute('data-visible')).toBe('true');
  });

  test('setVisible (a tap on the text) and rebase (a programmatic scroll)', () => {
    [50, 150, 300].forEach(scrollTo);
    act(() => api.setVisible(true));
    expect(container.firstChild.getAttribute('data-visible')).toBe('true');
    // Content was inserted above: the page jumps 2000px down without the user scrolling.
    act(() => api.rebase(2300));
    scrollTo(2300);
    expect(container.firstChild.getAttribute('data-visible')).toBe('true');
  });

  test('pinned keeps it visible (an overlay is open)', () => {
    act(() => { ReactDOM.render(<Probe pinned />, container); });
    [50, 150, 300].forEach(scrollTo);
    expect(container.firstChild.getAttribute('data-visible')).toBe('true');
  });
});
