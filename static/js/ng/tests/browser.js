/**
 * jsdom scaffolding for tests that hydrate NgReaderApp (the same setup NgReaderApp.test.js uses):
 * a fake vertical layout for segments, synchronous-ish animation frames, a fake
 * IntersectionObserver, and touch pointer events.
 */
import React from 'react';
import ReactDOM from 'react-dom';
import ReactDOMServer from 'react-dom/server';
import {act} from 'react-dom/test-utils';
import Sefaria from '../../sefaria/sefaria';
import {NgReaderApp, ngUnpackProps} from '../index';
import {SHARED_DATA} from './helpers';

// jsdom has no layout: segment i spans [i*100, i*100+90).
export function stackSegments() {
  const original = Element.prototype.getBoundingClientRect;
  const box = (top, height) => ({top, bottom: top + height, left: 0, right: 0, width: 0, height});
  Element.prototype.getBoundingClientRect = function () {
    const kind = this.getAttribute && this.getAttribute('data-ng');
    if (kind === 'segment') {
      const i = Array.from(document.querySelectorAll('[data-ng="segment"]')).indexOf(this);
      return box(i * 100, 90);
    }
    if (kind === 'section') {
      const first = this.querySelector('[data-ng="segment"]');
      const i = Array.from(document.querySelectorAll('[data-ng="segment"]')).indexOf(first);
      return box(i * 100 - 60, this.querySelectorAll('[data-ng="segment"]').length * 100);
    }
    return original.call(this);
  };
  return () => { Element.prototype.getBoundingClientRect = original; };
}

/** Every observed element is on screen at once. */
export class FakeIntersectionObserver {
  constructor(callback) { this.callback = callback; }
  observe(el) { setTimeout(() => this.callback([{target: el, isIntersecting: true}]), 0); }
  unobserve() {}
  disconnect() {}
}

export function clearCookies() {
  document.cookie.split(';').forEach(c => {
    const name = c.split('=')[0].trim();
    if (name) { document.cookie = `${name}=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/`; }
  });
}

export function setupBrowser({intersection = true} = {}) {
  const saved = {raf: window.requestAnimationFrame, io: window.IntersectionObserver};
  let restoreRects;
  const env = {container: null};
  beforeEach(() => {
    clearCookies();
    window.localStorage.clear();
    env.errors = jest.spyOn(console, 'error').mockImplementation(() => {});
    window.requestAnimationFrame = (cb) => setTimeout(cb, 0);
    window.scrollTo = jest.fn();
    window.scrollBy = jest.fn();
    if (intersection) { window.IntersectionObserver = FakeIntersectionObserver; }
    document.title = 'Genesis 1 | Sefaria Library';
    window.history.replaceState(null, '', '/Genesis.1');
    restoreRects = stackSegments();
    env.container = document.createElement('div');
    env.container.id = 's2';
    document.body.appendChild(env.container);
  });
  afterEach(() => {
    act(() => { ReactDOM.unmountComponentAtNode(env.container); });
    env.container.remove();
    window.requestAnimationFrame = saved.raf;
    window.IntersectionObserver = saved.io;
    restoreRects();
    jest.restoreAllMocks();
  });
  return env;
}

// React warns about useLayoutEffect when renderToString runs where `window` exists (jsdom only).
const JSDOM_ONLY_WARNING = /useLayoutEffect does nothing on the server/;
export const realErrors = (spy) => spy.mock.calls.filter(args => !JSDOM_ONLY_WARNING.test(String(args[0])));

export const flush = (rounds = 8) => act(async () => { for (let i = 0; i < rounds; i++) { await new Promise(r => setTimeout(r, 0)); } });
export const wait = (ms) => act(() => new Promise(r => setTimeout(r, ms)));

/** Server-render, then hydrate the same props, the way client.jsx does. */
export async function hydrate(container, props, extra = {}) {
  container.innerHTML = ReactDOMServer.renderToString(<NgReaderApp {...props} {...extra} />);
  Sefaria.setup(SHARED_DATA, props);
  ngUnpackProps(props);
  act(() => { ReactDOM.hydrate(<NgReaderApp {...props} {...extra} />, container); });
  await flush();
}

/** A pointer event as a finger produces it. `t` sets the event's timeStamp (ms). */
export function pointer(target, type, {x, y, t, id = 1, pointerType = 'touch'}) {
  const event = new Event(type, {bubbles: true, cancelable: true});
  Object.assign(event, {clientX: x, clientY: y, pointerId: id, pointerType});
  if (t !== undefined) { Object.defineProperty(event, 'timeStamp', {value: t}); }
  act(() => { target.dispatchEvent(event); });
  return event;
}

/** A finger drag from `from` to `to` over `ms`, on `target`. */
export async function fingerDrag(target, from, to, {ms = 240, steps = 12, t0 = 1000} = {}) {
  pointer(target, 'pointerdown', {...from, t: t0});
  for (let i = 1; i <= steps; i++) {
    const f = i / steps;
    pointer(target, 'pointermove', {x: from.x + (to.x - from.x) * f, y: from.y + (to.y - from.y) * f, t: t0 + ms * f});
  }
  await flush(2);
  pointer(target, 'pointerup', {...to, t: t0 + ms});
  await flush();
}
