import React from 'react';
import ReactDOM from 'react-dom';
import {act} from 'react-dom/test-utils';
import {edgeRef, initialStreamState, pickLoad, streamReducer, useSectionStream, LOAD_MARGIN_VIEWPORTS} from '../infiniteLoad';

const sec = (ref, prev, next) => ({ref, prev, next, segments: []});
const G1 = sec('Genesis 1', null, 'Genesis 2');
const G2 = sec('Genesis 2', 'Genesis 1', 'Genesis 3');
const G3 = sec('Genesis 3', 'Genesis 2', 'Genesis 4');
const LAST = sec('Genesis 50', 'Genesis 49', null);

const metrics = (y, {viewportHeight = 800, documentHeight = 10000, idle = false} = {}) => ({y, viewportHeight, documentHeight, idle});

describe('streamReducer', () => {
  test('starts with the server section; edges idle or done', () => {
    expect(initialStreamState(G2)).toMatchObject({sections: [G2], next: {status: 'idle'}, prev: {status: 'idle'}});
    expect(initialStreamState(G1).prev.status).toBe('done');
    expect(initialStreamState(LAST).next.status).toBe('done');
    expect(edgeRef(initialStreamState(G2), 'next')).toBe('Genesis 3');
  });

  test('appends the next section and moves the edge on', () => {
    let s = initialStreamState(G2);
    s = streamReducer(s, {type: 'request', dir: 'next'});
    expect(s.next.status).toBe('loading');
    s = streamReducer(s, {type: 'loaded', dir: 'next', section: G3});
    expect(s.sections.map(x => x.ref)).toEqual(['Genesis 2', 'Genesis 3']);
    expect(edgeRef(s, 'next')).toBe('Genesis 4');
    expect(s.next.status).toBe('idle');
  });

  test('reaching the end of the book', () => {
    const s = streamReducer(initialStreamState(sec('Genesis 49', 'Genesis 48', 'Genesis 50')), {type: 'loaded', dir: 'next', section: LAST});
    expect(s.next.status).toBe('done');
  });

  test('drops stale and duplicate responses', () => {
    const s = initialStreamState(G2);
    expect(streamReducer(s, {type: 'loaded', dir: 'next', section: sec('Exodus 1', null, null)}).sections).toEqual([G2]);
    expect(streamReducer(s, {type: 'loaded', dir: 'next', section: G2}).sections).toEqual([G2]);
  });

  test('prev is held until inserted, then prepended', () => {
    let s = streamReducer(initialStreamState(G2), {type: 'loaded', dir: 'prev', section: G1});
    expect(s.sections).toEqual([G2]);
    expect(s.prev).toMatchObject({status: 'ready', pending: G1});
    s = streamReducer(s, {type: 'insertPrev'});
    expect(s.sections.map(x => x.ref)).toEqual(['Genesis 1', 'Genesis 2']);
    expect(s.prev.status).toBe('done');  // Genesis 1 has no prev
  });

  test('a failed load waits for a retry instead of looping', () => {
    const s = streamReducer(initialStreamState(G2), {type: 'failed', dir: 'next'});
    expect(s.next.status).toBe('error');
    expect(pickLoad(s, metrics(9000))).toBeNull();
  });
});

describe('pickLoad', () => {
  const s = initialStreamState(G2);
  test('loads next within the margin of the bottom', () => {
    const margin = 800 * LOAD_MARGIN_VIEWPORTS;
    expect(pickLoad(s, metrics(10000 - 800 - margin + 1))).toBe('next');
    expect(pickLoad(s, metrics(5000))).toBeNull();
  });

  test('fetches prev near the top, but inserts it only when scrolling is idle', () => {
    expect(pickLoad(s, metrics(100))).toBe('prev');
    const ready = streamReducer(s, {type: 'loaded', dir: 'prev', section: G1});
    expect(pickLoad(ready, metrics(100, {idle: false}))).toBeNull();
    expect(pickLoad(ready, metrics(100, {idle: true}))).toBe('insertPrev');
    expect(pickLoad(ready, metrics(5000, {idle: true}))).toBeNull();  // scrolled away meanwhile
  });

  test('next wins when a short document is near both edges', () => {
    expect(pickLoad(s, metrics(0, {documentHeight: 900}))).toBe('next');
  });

  test('nothing to load at the edges of the book', () => {
    expect(pickLoad(initialStreamState(sec('Obadiah 1', null, null)), metrics(0, {documentHeight: 900, idle: true}))).toBeNull();
  });
});

describe('useSectionStream', () => {
  let container, api, raf;
  function Probe(props) { api = useSectionStream(props); return null; }
  const flush = () => act(async () => { await new Promise(r => setTimeout(r, 0)); });

  beforeEach(() => {
    raf = window.requestAnimationFrame;
    window.requestAnimationFrame = (cb) => { cb(); return 1; };
    Object.defineProperty(window, 'innerHeight', {value: 800, configurable: true});
    Object.defineProperty(document.documentElement, 'scrollHeight', {value: 10000, configurable: true});
    container = document.createElement('div');
  });
  afterEach(() => {
    act(() => { ReactDOM.unmountComponentAtNode(container); });
    window.requestAnimationFrame = raf;
  });
  const scrollTo = (y) => act(() => { window.pageYOffset = y; window.dispatchEvent(new Event('scroll')); });

  test('scrolling near the bottom loads and appends the next section, once', async () => {
    const loadSection = jest.fn(ref => Promise.resolve(ref === 'Genesis 3' ? G3 : null));
    window.pageYOffset = 3000;
    act(() => { ReactDOM.render(<Probe initialSection={G2} loadSection={loadSection} />, container); });
    scrollTo(8500);
    scrollTo(8600);                       // still loading: no second request
    expect(loadSection).toHaveBeenCalledTimes(1);
    expect(loadSection).toHaveBeenCalledWith('Genesis 3');
    await flush();
    expect(api.state.sections.map(s => s.ref)).toEqual(['Genesis 2', 'Genesis 3']);
  });

  test('a rejected load reports an error and retry loads again', async () => {
    const loadSection = jest.fn().mockRejectedValueOnce(new Error('offline')).mockResolvedValueOnce(G3);
    window.pageYOffset = 3000;
    act(() => { ReactDOM.render(<Probe initialSection={G2} loadSection={loadSection} />, container); });
    scrollTo(8500);
    await flush();
    expect(api.state.next.status).toBe('error');
    act(() => api.retry('next'));
    await flush();
    expect(api.state.sections).toHaveLength(2);
  });

  test('prev is inserted on an idle scroll event, after the anchor callback', async () => {
    const order = [];
    const loadSection = jest.fn(() => Promise.resolve(G1));
    const onBeforeInsertPrev = () => order.push('anchor');
    window.pageYOffset = 3000;
    act(() => { ReactDOM.render(<Probe initialSection={G2} loadSection={loadSection} onBeforeInsertPrev={onBeforeInsertPrev} />, container); });
    scrollTo(200);
    await flush();
    expect(api.state.prev.status).toBe('ready');
    act(() => api.check(metrics(200, {idle: true})));
    order.push(api.state.sections.map(s => s.ref).join(','));
    expect(order).toEqual(['anchor', 'Genesis 1,Genesis 2']);
  });
});
