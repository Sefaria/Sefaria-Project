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
  A publish (an explicit user action with its own promise) is never replaced or dropped: publishes are
  held in order and sent before the held autosave, and each settles its own promise with whether the
  server stored it.
  The queue is independent of the component, so a save requested while another is in flight (for
  example the flush when the editor unmounts) is still sent after the in-flight one finishes.
*/
export function createSaveQueue(send, { getRevision } = {}) {
  let inFlight = false;
  let held = null;
  let heldPublishes = [];

  // `send(payload, revision, kind)`; kind is 'autosave' or 'publish'.
  async function sendSafely(payload, revision, kind) {
    try {
      return (await send(payload, revision, kind)) === true;
    } catch (e) {
      return false;
    }
  }

  async function drain(stored) {
    inFlight = false;
    const publishes = heldPublishes;
    const next = held;
    heldPublishes = [];
    held = null;
    let lastStored = stored;
    // Publishes are explicit requests: they are sent whatever happened before them, so each one
    // reports its own outcome. The held autosave follows only while saves are being stored.
    for (const item of publishes) {
      inFlight = true;
      lastStored = await sendSafely(item.payload, item.revision, 'publish');
      inFlight = false;
      item.resolve(lastStored);
    }
    if (lastStored && next) {
      await run(next.doc, next.revision);
    }
  }

  async function run(doc, revision) {
    inFlight = true;
    await drain(await sendSafely(doc, revision, 'autosave'));
  }

  return {
    request(doc, revision) {
      if (inFlight) {
        held = { doc, revision };
        return Promise.resolve();
      }
      return run(doc, revision);
    },
    // Resolves to true when the server stored the publish, false otherwise. The revision defaults to
    // the current one (`getRevision`), the document state the publish was requested against.
    requestPublish(payload, revision = getRevision && getRevision()) {
      return new Promise((resolve) => {
        const item = { payload, revision, resolve };
        if (inFlight) {
          heldPublishes.push(item);
          return;
        }
        inFlight = true;
        sendSafely(payload, revision, 'publish').then((stored) => {
          item.resolve(stored);
          return drain(stored);
        });
      });
    },
    isInFlight: () => inFlight,
    hasHeld: () => held !== null || heldPublishes.length > 0,
  };
}
