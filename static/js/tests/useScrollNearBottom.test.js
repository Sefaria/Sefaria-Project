/**
 * useScrollNearBottom: picking the element that actually scrolls.
 *
 * The bug is silent -- a `scroll` listener on a non-scrolling div never fires -- and the
 * scroller cannot be inferred from the breakpoint, so these pin down all four real cases.
 *
 * No React Testing Library in this repo -- react-dom directly, same pattern as
 * static/js/tests/searchResultCardAuxClick.test.js.
 */

import React from 'react';
import ReactDOM from 'react-dom';
import { act } from 'react-dom/test-utils';
import { useScrollNearBottom } from '../Hooks';

// jsdom does no layout, so scroll geometry is always 0. Stamp it on by hand.
const withGeometry = (el, {scrollHeight, clientHeight, scrollTop = 0}) => {
  Object.defineProperty(el, 'scrollHeight', {value: scrollHeight, configurable: true});
  Object.defineProperty(el, 'clientHeight', {value: clientHeight, configurable: true});
  Object.defineProperty(el, 'scrollTop', {value: scrollTop, writable: true, configurable: true});
  return el;
};

const setDocumentGeometry = ({scrollHeight, innerHeight, scrollY}) => {
  Object.defineProperty(document.documentElement, 'scrollHeight', {value: scrollHeight, configurable: true});
  Object.defineProperty(window, 'innerHeight', {value: innerHeight, writable: true, configurable: true});
  Object.defineProperty(window, 'scrollY', {value: scrollY, writable: true, configurable: true});
};

const Probe = ({candidate, onNearBottom, margin = 300}) => {
  useScrollNearBottom({getScrollCandidate: () => candidate, margin, onNearBottom});
  return null;
};

const renderProbe = (props) => {
  const host = document.createElement('div');
  document.body.appendChild(host);
  act(() => { ReactDOM.render(<Probe {...props} />, host); });
  return () => act(() => { ReactDOM.unmountComponentAtNode(host); });
};

describe('useScrollNearBottom', () => {
  let candidate;

  beforeEach(() => {
    candidate = document.createElement('div');
    document.body.appendChild(candidate);
    // A document far from its bottom, so any fire must have come from the element.
    setDocumentGeometry({scrollHeight: 10000, innerHeight: 800, scrollY: 0});
  });

  afterEach(() => { document.body.innerHTML = ''; });

  test('desktop: fires on the container that scrolls', () => {
    // .readerNavMenu .content on desktop -- fixed height, own scrollbar, overflowing.
    candidate.style.overflowY = 'scroll';
    withGeometry(candidate, {scrollHeight: 5000, clientHeight: 800, scrollTop: 4000});
    const onNearBottom = jest.fn();
    renderProbe({candidate, onNearBottom});

    act(() => { candidate.dispatchEvent(new Event('scroll')); });

    // 5000 - 4000 - 800 = 200px left, inside the 300px margin.
    expect(onNearBottom).toHaveBeenCalled();
  });

  test('desktop: stays quiet while the container is far from its bottom', () => {
    candidate.style.overflowY = 'scroll';
    withGeometry(candidate, {scrollHeight: 5000, clientHeight: 800, scrollTop: 0});
    const onNearBottom = jest.fn();
    renderProbe({candidate, onNearBottom});

    act(() => { candidate.dispatchEvent(new Event('scroll')); });

    expect(onNearBottom).not.toHaveBeenCalled();
  });

  test('mobile: falls back to the document when the container stops scrolling', () => {
    // .readerNavMenu .content on singlePanel: overflow-y: visible, height: auto.
    candidate.style.overflowY = 'visible';
    withGeometry(candidate, {scrollHeight: 5000, clientHeight: 5000});
    setDocumentGeometry({scrollHeight: 5000, innerHeight: 800, scrollY: 4000});
    const onNearBottom = jest.fn();
    renderProbe({candidate, onNearBottom});

    act(() => { window.dispatchEvent(new Event('scroll')); });

    expect(onNearBottom).toHaveBeenCalled();
  });

  test('mobile: a container whose overflow-y COMPUTES to auto but never scrolls is not the scroller', () => {
    // The .noOverflowX trap (s2.css:464): `overflow-y: visible` next to `overflow-x: hidden`
    // computes to `auto`, which is what TopicPage and UserProfile get on mobile. jsdom does
    // not implement that part of the cascade, so the computed result is set directly here.
    // Geometry is what disambiguates: the div grew to fit its content, so it cannot scroll.
    candidate.style.overflowY = 'auto';
    withGeometry(candidate, {scrollHeight: 5000, clientHeight: 5000});
    setDocumentGeometry({scrollHeight: 5000, innerHeight: 800, scrollY: 4000});
    const onNearBottom = jest.fn();
    renderProbe({candidate, onNearBottom});

    act(() => { window.dispatchEvent(new Event('scroll')); });

    expect(onNearBottom).toHaveBeenCalled();
  });

  test('mobile: a drawer that keeps its own scrollbar is still the scroller', () => {
    // .textList .texts.content -- the connections-panel "Search in this Text" drawer. The
    // singlePanel override never reaches it, so watching the document here would be wrong.
    candidate.style.overflowY = 'scroll';
    withGeometry(candidate, {scrollHeight: 5000, clientHeight: 400, scrollTop: 0});
    // Document sitting right at its bottom: if the hook watched it, this would fire.
    setDocumentGeometry({scrollHeight: 800, innerHeight: 800, scrollY: 0});
    const onNearBottom = jest.fn();
    renderProbe({candidate, onNearBottom});

    act(() => { window.dispatchEvent(new Event('scroll')); });

    expect(onNearBottom).not.toHaveBeenCalled();

    candidate.scrollTop = 4400;
    act(() => { candidate.dispatchEvent(new Event('scroll')); });

    expect(onNearBottom).toHaveBeenCalled();
  });

  test('watches the document when there is no container at all', () => {
    setDocumentGeometry({scrollHeight: 5000, innerHeight: 800, scrollY: 4000});
    const onNearBottom = jest.fn();
    renderProbe({candidate: null, onNearBottom});

    act(() => { window.dispatchEvent(new Event('scroll')); });

    expect(onNearBottom).toHaveBeenCalled();
  });

  test('unbinds on unmount', () => {
    candidate.style.overflowY = 'scroll';
    withGeometry(candidate, {scrollHeight: 5000, clientHeight: 800, scrollTop: 4000});
    const onNearBottom = jest.fn();
    const unmount = renderProbe({candidate, onNearBottom});

    unmount();
    act(() => { candidate.dispatchEvent(new Event('scroll')); });

    expect(onNearBottom).not.toHaveBeenCalled();
  });

  test('calls the latest callback without re-binding', () => {
    // Callers gate on state that changes every render (isLoading, loadedToEnd). The hook
    // must see the current one, or infinite scroll would act on a stale snapshot.
    candidate.style.overflowY = 'scroll';
    withGeometry(candidate, {scrollHeight: 5000, clientHeight: 800, scrollTop: 4000});
    const first = jest.fn();
    const second = jest.fn();
    const host = document.createElement('div');
    document.body.appendChild(host);

    act(() => { ReactDOM.render(<Probe candidate={candidate} onNearBottom={first} />, host); });
    act(() => { ReactDOM.render(<Probe candidate={candidate} onNearBottom={second} />, host); });
    act(() => { candidate.dispatchEvent(new Event('scroll')); });

    expect(first).not.toHaveBeenCalled();
    expect(second).toHaveBeenCalled();
  });
});
