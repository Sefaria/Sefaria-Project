import React, {useRef} from 'react';
import ReactDOM from 'react-dom';
import {act} from 'react-dom/test-utils';
import {findCurrentSegment, nearestIndex, useCurrentSegment} from '../currentSegment';

const rects = (...pairs) => pairs.map(([top, bottom]) => ({top, bottom}));
const at = (list) => (i) => list[i];

describe('nearestIndex: the segment nearest the vertical center', () => {
  const blocks = rects([0, 100], [120, 300], [320, 400]);
  test('a segment that contains the point', () => {
    expect(nearestIndex(3, at(blocks), 150)).toBe(1);
    expect(nearestIndex(3, at(blocks), 0)).toBe(0);
  });
  test('in the gap between two segments, the closer one', () => {
    expect(nearestIndex(3, at(blocks), 105)).toBe(0);
    expect(nearestIndex(3, at(blocks), 116)).toBe(1);
  });
  test('above the first and below the last', () => {
    expect(nearestIndex(3, at(blocks), -50)).toBe(0);
    expect(nearestIndex(3, at(blocks), 999)).toBe(2);
  });
  test('overlapping inline segments (continuous prose)', () => {
    const inline = rects([0, 60], [30, 120], [90, 150]);
    expect(nearestIndex(3, at(inline), 100)).toBe(2);
    expect(nearestIndex(3, at(inline), 50)).toBe(1);
  });
  test('no segments', () => {
    expect(nearestIndex(0, at([]), 10)).toBe(-1);
  });
  test('reads O(log n) rects', () => {
    const many = Array.from({length: 1024}, (_, i) => ({top: i * 10, bottom: i * 10 + 8}));
    let reads = 0;
    expect(nearestIndex(many.length, (i) => { reads++; return many[i]; }, 5123)).toBe(512);
    expect(reads).toBeLessThan(16);
  });
});

function segmentDom(tops) {
  const root = document.createElement('div');
  tops.forEach((top, i) => {
    const el = document.createElement('div');
    el.setAttribute('data-ng', 'segment');
    el.setAttribute('data-ref', `Genesis 1:${i + 1}`);
    el.setAttribute('data-he-ref', `he ${i + 1}`);
    el.setAttribute('data-section-ref', 'Genesis 1');
    el.getBoundingClientRect = () => ({top, bottom: top + 80});
    root.appendChild(el);
  });
  return root;
}

test('findCurrentSegment reads refs off the DOM', () => {
  const root = segmentDom([0, 100, 200, 300]);
  expect(findCurrentSegment(root, 250)).toEqual({ref: 'Genesis 1:3', heRef: 'he 3', sectionRef: 'Genesis 1'});
  expect(findCurrentSegment(null, 0)).toBeNull();
});

test('useCurrentSegment tracks the center as the page scrolls', () => {
  const root = segmentDom([0, 100, 200, 300, 400]);
  let current = null;
  function Probe() {
    const ref = useRef(root);
    current = useCurrentSegment(ref, []);
    return null;
  }
  const originalRaf = window.requestAnimationFrame;
  window.requestAnimationFrame = (cb) => { cb(); return 1; };
  Object.defineProperty(window, 'innerHeight', {value: 400, configurable: true});
  const container = document.createElement('div');
  act(() => { ReactDOM.render(<Probe />, container); });
  expect(current.ref).toBe('Genesis 1:3');   // center at 200
  root.childNodes.forEach(el => { const top = el.getBoundingClientRect().top - 200; el.getBoundingClientRect = () => ({top, bottom: top + 80}); });
  act(() => { window.dispatchEvent(new Event('scroll')); });
  expect(current.ref).toBe('Genesis 1:5');
  act(() => { ReactDOM.unmountComponentAtNode(container); });
  window.requestAnimationFrame = originalRaf;
});
