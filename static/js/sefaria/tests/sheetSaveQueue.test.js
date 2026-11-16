/* Testing done using Jest */
import { createSaveQueue } from '../sheetSaveQueue';
import { planSavedResponseApplication } from '../sheetSaveResponse';

// A send function whose requests stay open until the test settles them.
function makeSend(serverState) {
  const calls = [];
  let concurrent = 0;
  let maxConcurrent = 0;
  const send = (doc, revision) =>
    new Promise((resolve) => {
      concurrent += 1;
      maxConcurrent = Math.max(maxConcurrent, concurrent);
      calls.push({
        doc,
        revision,
        sentModified: serverState.dateModified,
        settle(stored) {
          concurrent -= 1;
          if (stored) {
            serverState.dateModified = `modified-by-${doc}`;
          }
          resolve(stored);
        },
      });
    });
  return { send, calls, maxConcurrent: () => maxConcurrent };
}

const tick = () => new Promise((r) => setTimeout(r, 0));

describe('createSaveQueue', function () {
  it('sends the newer save after the in-flight one, with the fresh modification time', async function () {
    const server = { dateModified: 't0' };
    const { send, calls } = makeSend(server);
    const queue = createSaveQueue(send);

    queue.request('A', 1);
    queue.request('B', 2);
    expect(calls).toHaveLength(1);

    calls[0].settle(true);
    await tick();

    expect(calls).toHaveLength(2);
    expect(calls[1].doc).toBe('B');
    expect(calls[1].revision).toBe(2);
    expect(calls[1].sentModified).toBe('modified-by-A');
  });

  it('never has two requests open at once and keeps only the latest held save', async function () {
    const server = { dateModified: 't0' };
    const { send, calls, maxConcurrent } = makeSend(server);
    const queue = createSaveQueue(send);

    queue.request('A', 1);
    queue.request('B', 2);
    queue.request('C', 3);
    calls[0].settle(true);
    await tick();
    expect(calls.map((c) => c.doc)).toEqual(['A', 'C']);
    calls[1].settle(true);
    await tick();

    expect(maxConcurrent()).toBe(1);
    expect(queue.isInFlight()).toBe(false);
    expect(queue.hasHeld()).toBe(false);
  });

  it('does not send the held save after a conflict or error, so the conflict surfaces', async function () {
    const server = { dateModified: 't0' };
    const { send, calls } = makeSend(server);
    const queue = createSaveQueue(send);

    queue.request('A', 1);
    queue.request('B', 2);
    calls[0].settle(false);
    await tick();

    expect(calls).toHaveLength(1);
    expect(queue.hasHeld()).toBe(false);

    queue.request('C', 3);
    expect(calls).toHaveLength(2);
  });

  it('still sends a save requested during the flush at unmount once the in-flight one finishes', async function () {
    const server = { dateModified: 't0' };
    const { send, calls } = makeSend(server);
    const queue = createSaveQueue(send);

    queue.request('A', 1);
    // The component unmounts here; its flush requests the pending edit.
    queue.request('flushed', 2);
    calls[0].settle(true);
    await tick();

    expect(calls.map((c) => c.doc)).toEqual(['A', 'flushed']);
    expect(calls[1].sentModified).toBe('modified-by-A');
  });

  it('treats a rejected send as not stored', async function () {
    const queue = createSaveQueue(() => Promise.reject(new Error('boom')));
    await expect(queue.request('A', 1)).resolves.toBeUndefined();
    expect(queue.isInFlight()).toBe(false);
  });
});

describe('publish through the save queue', function () {
  // A tiny stand-in for the editor: local state, a revision counter, and a fake server.
  function makeEditor() {
    const server = { status: 'unlisted', title: 'T0', summary: 'S0', dateModified: 0, requests: [] };
    const local = { status: 'unlisted', title: 'T0', summary: 'S0', revision: 0, unsaved: false };
    const open = [];
    let concurrent = 0;
    let maxConcurrent = 0;

    const post = (body, revision, kind) =>
      new Promise((resolve) => {
        concurrent += 1;
        maxConcurrent = Math.max(maxConcurrent, concurrent);
        server.requests.push({ ...body, kind });
        open.push(() => {
          concurrent -= 1;
          if (body.lastModified !== server.dateModified) {
            resolve(false); // genuine-looking conflict: sent with a stale modification time
            return;
          }
          Object.assign(server, { status: body.status, title: body.title, summary: body.summary });
          server.dateModified += 1;
          const plan = planSavedResponseApplication(
            { status: server.status, title: server.title, summary: server.summary },
            { kind, saveRevision: revision, currentRevision: local.revision }
          );
          if (plan.status !== undefined) local.status = plan.status;
          if (plan.markSaved) {
            local.title = plan.title;
            local.summary = plan.summary;
            local.unsaved = false;
          }
          resolve(true);
        });
      });

    const queue = createSaveQueue((payload, revision, kind) => {
      const body =
        kind === 'publish'
          ? { ...payload, lastModified: server.dateModified }
          : { status: local.status, title: payload.title, summary: payload.summary, lastModified: server.dateModified };
      return post(body, revision, kind);
    });

    return {
      server,
      local,
      queue,
      edit(title) {
        local.revision += 1;
        local.title = title;
        local.unsaved = true;
      },
      autosave() {
        return queue.request({ title: local.title, summary: local.summary }, local.revision);
      },
      publish() {
        return queue.requestPublish({ status: 'public', title: local.title, summary: local.summary }, local.revision);
      },
      finish() {
        open.shift()();
      },
      maxConcurrent: () => maxConcurrent,
    };
  }

  it('the autosave after a publish sends the published status', async function () {
    const editor = makeEditor();
    const published = editor.publish();
    editor.finish();
    await expect(published).resolves.toBe(true);
    expect(editor.local.status).toBe('public');

    editor.edit('T1');
    editor.autosave();
    expect(editor.server.requests[1].status).toBe('public');
    editor.finish();
    await tick();
    expect(editor.server.status).toBe('public');
  });

  it('a publish during an autosave is sent after it, with no overlap and a fresh modification time', async function () {
    const editor = makeEditor();
    editor.edit('T1');
    editor.autosave();
    const published = editor.publish();
    expect(editor.server.requests).toHaveLength(1);

    editor.finish();
    await tick();
    expect(editor.server.requests).toHaveLength(2);
    expect(editor.server.requests[1].kind).toBe('publish');
    expect(editor.server.requests[1].lastModified).toBe(1);
    editor.finish();
    await expect(published).resolves.toBe(true);
    expect(editor.maxConcurrent()).toBe(1);
    expect(editor.server.status).toBe('public');
  });

  it('an edit during a publish keeps the edit but still applies the published status', async function () {
    const editor = makeEditor();
    const published = editor.publish();
    editor.edit('typed meanwhile');
    editor.autosave();
    editor.finish();
    await expect(published).resolves.toBe(true);
    await tick();

    expect(editor.local.status).toBe('public');
    expect(editor.local.title).toBe('typed meanwhile');
    expect(editor.local.unsaved).toBe(true);
    // The held autosave was sent after the publish, with the published status and the edited title.
    expect(editor.server.requests[1]).toMatchObject({ kind: 'autosave', status: 'public', title: 'typed meanwhile' });
    editor.finish();
    await tick();
    expect(editor.local.unsaved).toBe(false);
    expect(editor.server.title).toBe('typed meanwhile');
  });

  it('a publish that is not stored resolves false', async function () {
    const queue = createSaveQueue(() => Promise.resolve(false));
    await expect(queue.requestPublish({}, 0)).resolves.toBe(false);
    expect(queue.isInFlight()).toBe(false);
  });
});
