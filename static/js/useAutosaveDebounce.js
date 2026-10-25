import {useEffect, useRef} from 'react';

/*
 * Debounced autosave for the sheet editor.
 *
 * Calls `save(value)` once `value` (and whatever else is in `deps`) has been stable for `delayMs`.
 * A change within the delay clears the pending timer and restarts it.
 * `onSchedule` runs each time a save is scheduled (the editor uses it to mark unsaved changes).
 *
 * If the component unmounts while a save is still pending (for example, navigating away within
 * the delay), that save is run immediately so the last edit is not lost.
 */
export function useAutosaveDebounce(save, value, deps, {enabled = true, delayMs = 500, onSchedule} = {}) {
  // { value } while a save is scheduled and has not fired yet, otherwise null.
  const pendingRef = useRef(null);
  // Latest save, so the unmount flush does not use a stale closure.
  const saveRef = useRef(save);
  saveRef.current = save;

  useEffect(() => {
    if (!enabled) return;
    onSchedule && onSchedule();
    pendingRef.current = {value};
    const handler = setTimeout(() => {
      pendingRef.current = null;
      save(value);
    }, delayMs);
    // Cancel the timer when the value changes before it fires; a new timer is set by the next run.
    return () => clearTimeout(handler);
  }, deps);

  useEffect(() => () => {
    const pending = pendingRef.current;
    if (pending) {
      pendingRef.current = null;
      saveRef.current(pending.value);
    }
  }, []);
}
