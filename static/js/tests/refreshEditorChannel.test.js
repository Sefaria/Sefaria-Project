/**
 * refreshEditorChannel: the cross-tab "refresh the open sheet" broadcast.
 *
 * BroadcastChannel is replaced with a small in-test double so every channel
 * instance, its listeners and its close() calls can be observed directly.
 */
import {
  REFRESH_EDITOR_CHANNEL,
  postRefreshEditor,
  subscribeRefreshEditor,
} from '../refreshEditorChannel';

let instances;

class FakeBroadcastChannel {
  constructor(name) {
    this.name = name;
    this.listeners = [];
    this.closed = false;
    this.posted = [];
    instances.push(this);
  }
  addEventListener(type, fn) {
    if (type === 'message') { this.listeners.push(fn); }
  }
  removeEventListener(type, fn) {
    this.listeners = this.listeners.filter(l => l !== fn);
  }
  postMessage(data) { this.posted.push(data); }
  close() { this.closed = true; this.listeners = []; }
  // Test helper: deliver a message to every open listener on this channel.
  receive(data) { this.listeners.slice().forEach(fn => fn({ data })); }
}

beforeEach(() => {
  instances = [];
  global.BroadcastChannel = FakeBroadcastChannel;
});

afterEach(() => {
  delete global.BroadcastChannel;
});

test('postRefreshEditor broadcasts the sheet id on the refresh channel', () => {
  postRefreshEditor(123);
  expect(instances).toHaveLength(1);
  expect(instances[0].name).toBe(REFRESH_EDITOR_CHANNEL);
  expect(instances[0].posted).toEqual([{ type: 'refresh', sheetId: 123 }]);
  expect(instances[0].closed).toBe(true);
});

test('a refresh for another sheet id does not reload the open sheet', () => {
  const onRefresh = jest.fn();
  subscribeRefreshEditor({ sheetId: 1, canReload: () => true, onRefresh });
  instances[0].receive({ type: 'refresh', sheetId: 2 });
  expect(onRefresh).not.toHaveBeenCalled();
});

test('a refresh for the open sheet id reloads it', () => {
  const onRefresh = jest.fn();
  subscribeRefreshEditor({ sheetId: 1, canReload: () => true, onRefresh });
  instances[0].receive({ type: 'refresh', sheetId: 1 });
  expect(onRefresh).toHaveBeenCalledTimes(1);
});

test('ids are compared as strings so numeric and string forms match', () => {
  const onRefresh = jest.fn();
  subscribeRefreshEditor({ sheetId: 7, canReload: () => true, onRefresh });
  instances[0].receive({ type: 'refresh', sheetId: '7' });
  expect(onRefresh).toHaveBeenCalledTimes(1);
});

test('a refresh is skipped while the editor has unsaved changes', () => {
  const onRefresh = jest.fn();
  let dirty = true;
  subscribeRefreshEditor({ sheetId: 1, canReload: () => !dirty, onRefresh });
  instances[0].receive({ type: 'refresh', sheetId: 1 });
  expect(onRefresh).not.toHaveBeenCalled();

  dirty = false;
  instances[0].receive({ type: 'refresh', sheetId: 1 });
  expect(onRefresh).toHaveBeenCalledTimes(1);
});

test('an unscoped legacy message reloads only when the editor is clean', () => {
  const onRefresh = jest.fn();
  let dirty = true;
  subscribeRefreshEditor({ sheetId: 1, canReload: () => !dirty, onRefresh });
  instances[0].receive('refresh');
  expect(onRefresh).not.toHaveBeenCalled();

  dirty = false;
  instances[0].receive('refresh');
  expect(onRefresh).toHaveBeenCalledTimes(1);
});

test('unsubscribing closes the channel and stops delivery', () => {
  const onRefresh = jest.fn();
  const unsubscribe = subscribeRefreshEditor({
    sheetId: 1, canReload: () => true, onRefresh,
  });
  const channel = instances[0];
  unsubscribe();
  expect(channel.closed).toBe(true);
  channel.receive({ type: 'refresh', sheetId: 1 });
  expect(onRefresh).not.toHaveBeenCalled();
});
