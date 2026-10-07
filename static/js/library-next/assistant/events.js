/**
 * Ask the assistant from anywhere in Library Next:
 *
 *   import { requestAssistant } from '../assistant/events';
 *   requestAssistant('Quiz me on Genesis 1');
 *
 * or dispatch the DOM event yourself (any bundle, no import needed):
 *
 *   window.dispatchEvent(new CustomEvent('library-next:assistant', { detail: { prompt: '…' } }));
 *
 * The dock opens and sends the prompt once the widget is ready; without a signed-in user the
 * prompt is shown next to the sign-in notice. An event without `detail.prompt` just opens the dock.
 */
export const ASSISTANT_EVENT = 'library-next:assistant';

const listeners = new Set();
let pending = null;

export function requestAssistant(prompt) {
  if (typeof window === 'undefined') { return; }
  window.dispatchEvent(new CustomEvent(ASSISTANT_EVENT, { detail: { prompt } }));
}

export function setPendingPrompt(prompt) {
  pending = prompt ? String(prompt).trim() || null : null;
  listeners.forEach(fn => fn(pending));
}

export function takePendingPrompt() {
  const out = pending;
  pending = null;
  if (out !== null) { listeners.forEach(fn => fn(null)); }
  return out;
}

export function peekPendingPrompt() { return pending; }

export function subscribePending(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

export function _resetAssistantEvents() { pending = null; listeners.clear(); }
