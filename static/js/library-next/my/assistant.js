/**
 * Hand a prompt to the assistant dock. Dispatches the `library-next:assistant` window event
 * (`detail: { prompt, source }`), which the dock listens for to prefill its input, then opens
 * the dock. Documented in docs/library-next/COLLECTIONS.md ("Assistant hand-off event").
 *
 *   import { askAssistant } from '../my/assistant';
 *   askAssistant('Suggest three discussion questions for Genesis 1:1.', { source: 'lesson' });
 */
import { openAssistant } from '../AssistantDock';

export const ASSISTANT_EVENT = 'library-next:assistant';

export function askAssistant(prompt, { source = 'my-library', open = true } = {}) {
  if (typeof prompt !== 'string' || !prompt.trim()) { throw new TypeError('prompt must be a non-empty string'); }
  if (typeof window === 'undefined') { return; }
  window.dispatchEvent(new CustomEvent(ASSISTANT_EVENT, { detail: { prompt: prompt.trim(), source } }));
  if (open) { openAssistant(); }
}
