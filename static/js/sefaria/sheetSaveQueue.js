/*
  Serializes sheet saves. Every save sends the sheet's last known modification time, and the server
  rejects a save whose time is behind the stored one. Two saves in flight at once would carry the same
  time, so the second one would be rejected after the first stored. So at most one request is sent at
  a time: a save requested meanwhile is held (only the latest is kept, since it holds the newest
  document) and sent when the pending request finishes with a stored save. `send` is called again at
  that point, so it can read the modification time the finished save just produced.

  `send(doc, revision)` returns a promise of true when the server stored the save, false otherwise
  (error, conflict, network failure). After a save that was not stored the held save is dropped:
  a conflict must surface and block editing, and a lost connection is retried by the editor's polling.
  The queue is independent of the component, so a save requested while another is in flight (for
  example the flush when the editor unmounts) is still sent after the in-flight one finishes.
*/
export function createSaveQueue(send) {
  let inFlight = false;
  let held = null;

  async function run(doc, revision) {
    inFlight = true;
    let stored = false;
    try {
      stored = (await send(doc, revision)) === true;
    } catch (e) {
      stored = false;
    }
    inFlight = false;
    const next = held;
    held = null;
    if (stored && next) {
      await run(next.doc, next.revision);
    }
  }

  return {
    request(doc, revision) {
      if (inFlight) {
        held = { doc, revision };
        return Promise.resolve();
      }
      return run(doc, revision);
    },
    isInFlight: () => inFlight,
    hasHeld: () => held !== null,
  };
}
