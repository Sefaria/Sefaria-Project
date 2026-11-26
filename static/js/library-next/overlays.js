/**
 * Shell overlays: toasts and one modal, callable from anywhere (no context needed).
 *
 *   import { toast, openModal, closeModal } from '../overlays';   // also re-exported by Shell.jsx
 *   toast('Saved');                       // or toast({ en: 'Saved', he: 'נשמר' }), toast(msg, { duration })
 *   openModal(<MyDialog />, { label: 'Dialog name' });   closeModal();
 *
 * `<Shell>` renders the hosts; `useOverlays()` is for the hosts only.
 */
import { useEffect, useState } from 'react';
import { pick } from './i18n';

const state = { toasts: [], modal: null };
const listeners = new Set();
let toastId = 0;

function publish() {
  listeners.forEach(fn => fn({ ...state, toasts: state.toasts.slice() }));
}

/** Show a short message. `msg` is a string or `{ en, he }`. Returns the toast id. */
export function toast(msg, { duration = 3500 } = {}) {
  const id = ++toastId;
  state.toasts.push({ id, text: typeof msg === 'string' ? msg : pick(msg) });
  publish();
  if (duration > 0) { setTimeout(() => dismissToast(id), duration); }
  return id;
}

export function dismissToast(id) {
  const before = state.toasts.length;
  state.toasts = state.toasts.filter(t => t.id !== id);
  if (state.toasts.length !== before) { publish(); }
}

/** Open `node` in the shell's modal. `label` names the dialog for assistive tech; `dismissible` adds backdrop/escape closing. */
export function openModal(node, { label = '', dismissible = true, onClose = null } = {}) {
  state.modal = { node, label, dismissible, onClose };
  publish();
}

export function closeModal() {
  const closing = state.modal;
  state.modal = null;
  publish();
  if (closing && closing.onClose) { closing.onClose(); }
}

export function isModalOpen() {
  return state.modal !== null;
}

export function useOverlays() {
  const [snapshot, setSnapshot] = useState(() => ({ ...state, toasts: state.toasts.slice() }));
  useEffect(() => {
    listeners.add(setSnapshot);
    return () => listeners.delete(setSnapshot);
  }, []);
  return snapshot;
}

/** Test helper. */
export function _resetOverlays() {
  state.toasts = [];
  state.modal = null;
  listeners.clear();
}
