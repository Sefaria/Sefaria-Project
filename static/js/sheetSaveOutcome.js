/**
 * Helpers for the sheet editor's save and refresh bookkeeping, kept free of React so they can be unit tested.
 */

// A save response that carries an error, or asks for a rebuild, did not store the edit as sent.
export function isFailedSave(res) {
  return !res || typeof res !== 'object' || !!res.error || res.rebuild === true;
}

// Remembers a refresh request that arrived while the editor held unsaved edits, so the sheet can be
// reloaded once those edits have been saved.
export function createDeferredRefresh() {
  let pending = false;
  return {
    defer() {
      pending = true;
    },
    isPending() {
      return pending;
    },
    // Returns true once if a refresh was deferred, and clears it.
    take() {
      const was = pending;
      pending = false;
      return was;
    },
  };
}

// Counts edits so a save acknowledgement can tell whether the document changed after the request was sent.
export function createChangeCounter() {
  let count = 0;
  return {
    bump() {
      count += 1;
    },
    mark() {
      return count;
    },
    isCurrent(mark) {
      return mark === count;
    },
  };
}
