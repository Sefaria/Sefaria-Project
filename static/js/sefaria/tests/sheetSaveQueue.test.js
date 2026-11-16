/* Testing done using Jest */
import { createSaveQueue } from '../sheetSaveQueue';

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
