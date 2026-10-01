import React from 'react';
import ReactDOM from 'react-dom';
import { act } from 'react-dom/test-utils';
import { createCollection, useCollection, kv, exportAll, importAll, flush, PREFIX, _resetStore } from '../store';

beforeEach(() => {
  _resetStore();
  localStorage.clear();
  jest.useFakeTimers();
});
afterEach(() => { jest.useRealTimers(); });

test('put/get/list/remove with ids and timestamps, debounced write', () => {
  const notes = createCollection('notes', { version: 1 });
  const a = notes.put({ ref: 'Genesis 1:1', text: 'light', ts: 1 });
  const b = notes.put({ ref: 'Genesis 1:2', text: 'water', ts: 2 });
  expect(a.id).toBeTruthy();
  expect(notes.get(a.id).text).toBe('light');
  expect(notes.list().map(n => n.text)).toEqual(['water', 'light']);   // newest first
  expect(localStorage.getItem(PREFIX + 'notes')).toBeNull();           // not written yet
  jest.advanceTimersByTime(200);
  expect(JSON.parse(localStorage.getItem(PREFIX + 'notes'))).toEqual({ v: 1, items: { [a.id]: a, [b.id]: b } });
  expect(notes.remove(a.id)).toBe(true);
  expect(notes.remove('nope')).toBe(false);
  flush();
  expect(Object.keys(JSON.parse(localStorage.getItem(PREFIX + 'notes')).items)).toEqual([b.id]);
});

test('put with an existing id updates in place', () => {
  const c = createCollection('shelf');
  const x = c.put({ id: 'gen', title: 'Genesis' });
  c.put({ ...x, tags: ['torah'] });
  expect(c.list()).toHaveLength(1);
  expect(c.get('gen').tags).toEqual(['torah']);
});

test('same name returns the same collection; reload reads storage', () => {
  localStorage.setItem(PREFIX + 'history', JSON.stringify({ v: 1, items: { h1: { id: 'h1', ref: 'Exodus 1', ts: 5 } } }));
  const h = createCollection('history', { version: 1 });
  expect(h.list()).toEqual([{ id: 'h1', ref: 'Exodus 1', ts: 5 }]);
  expect(createCollection('history')).toBe(h);
});

test('version mismatch runs migrate and persists the new shape', () => {
  localStorage.setItem(PREFIX + 'plans', JSON.stringify({ v: 1, items: { p: { id: 'p', name: 'Daf', ts: 1 } } }));
  const migrate = jest.fn((items, from) => {
    expect(from).toBe(1);
    const out = {};
    for (const [id, item] of Object.entries(items)) { out[id] = { ...item, title: item.name }; }
    return out;
  });
  const plans = createCollection('plans', { version: 2, migrate });
  expect(migrate).toHaveBeenCalledTimes(1);
  expect(plans.get('p').title).toBe('Daf');
  expect(JSON.parse(localStorage.getItem(PREFIX + 'plans')).v).toBe(2);
});

test('subscribe fires on change and on storage events from other tabs', () => {
  const c = createCollection('highlights');
  const fn = jest.fn();
  const off = c.subscribe(fn);
  c.put({ ref: 'x', color: 'yellow' });
  expect(fn).toHaveBeenCalledTimes(1);
  localStorage.setItem(PREFIX + 'highlights', JSON.stringify({ v: 1, items: { z: { id: 'z', ref: 'z', ts: 9 } } }));
  window.dispatchEvent(new StorageEvent('storage', { key: PREFIX + 'highlights' }));
  expect(fn).toHaveBeenCalledTimes(2);
  expect(c.list()).toEqual([{ id: 'z', ref: 'z', ts: 9 }]);
  off();
  c.put({ ref: 'y' });
  expect(fn).toHaveBeenCalledTimes(2);
});

test('kv get/set/remove with fallback', () => {
  expect(kv.get('contentLang', 'bi')).toBe('bi');
  kv.set('contentLang', 'he');
  expect(kv.get('contentLang')).toBe('he');
  kv.set('contentLang', 'en');
  expect(kv.get('contentLang')).toBe('en');
  kv.remove('contentLang');
  expect(kv.get('contentLang', 'bi')).toBe('bi');
});

test('exportAll / importAll round-trip and merge', () => {
  createCollection('notes').put({ id: 'n1', text: 'a', ts: 1 });
  kv.set('persona', 'scholar');
  const json = exportAll();
  const parsed = JSON.parse(json);
  expect(parsed.format).toBe('sefaria.libnext');
  expect(Object.keys(parsed.data).sort()).toEqual(['kv', 'notes']);

  _resetStore();
  localStorage.clear();
  expect(importAll(json).sort()).toEqual(['kv', 'notes']);
  expect(createCollection('notes').get('n1').text).toBe('a');
  expect(kv.get('persona')).toBe('scholar');

  const notes = createCollection('notes');
  notes.put({ id: 'n2', text: 'b', ts: 2 });
  notes.put({ id: 'n1', text: 'changed', ts: 3 });
  importAll(json, { merge: true });
  expect(notes.get('n1').text).toBe('changed');   // existing wins on merge
  expect(notes.get('n2').text).toBe('b');
  importAll(json);
  expect(notes.get('n2')).toBeNull();              // replace drops what the export lacks
  expect(() => importAll('{"nope":1}')).toThrow();
});

test('useCollection re-renders on change', () => {
  const container = document.createElement('div');
  document.body.appendChild(container);
  function Probe() {
    const { items, put } = useCollection('flashcards');
    return <button onClick={() => put({ front: 'q', back: 'a' })}>{items.length}</button>;
  }
  act(() => { ReactDOM.render(<Probe />, container); });
  expect(container.textContent).toBe('0');
  act(() => { container.querySelector('button').dispatchEvent(new MouseEvent('click', { bubbles: true })); });
  expect(container.textContent).toBe('1');
  act(() => { createCollection('flashcards').put({ front: 'q2' }); });
  expect(container.textContent).toBe('2');
  ReactDOM.unmountComponentAtNode(container);
  container.remove();
});
