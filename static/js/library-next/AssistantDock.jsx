/**
 * The assistant dock: a floating button (mobile) or header action (desktop) that opens a side
 * panel holding the persona greeting, starter prompts and the embedded `<lc-chatbot>`
 * (see assistant/AssistantBody.jsx and docs/library-next/ASSISTANT.md).
 *
 *   import { openAssistant, closeAssistant, toggleAssistant } from '../AssistantDock';
 *   window.dispatchEvent(new CustomEvent('library-next:assistant', { detail: { prompt } }));
 */
import React, { useEffect, useState } from 'react';
import { useT } from './i18n';
import { usePersona } from './persona';
import AssistantBody from './assistant/AssistantBody';
import { ASSISTANT_EVENT, setPendingPrompt } from './assistant/events';

export { AssistantBody };

const listeners = new Set();
let isOpen = false;

function set(next) {
  if (next === isOpen) { return; }
  isOpen = next;
  listeners.forEach(fn => fn(isOpen));
}

export const openAssistant = () => set(true);
export const closeAssistant = () => set(false);
export const toggleAssistant = () => set(!isOpen);
export const isAssistantOpen = () => isOpen;

export function useAssistantOpen() {
  const [open, setOpen] = useState(isOpen);
  useEffect(() => { listeners.add(setOpen); return () => listeners.delete(setOpen); }, []);
  return open;
}

/** `library-next:assistant` → open the dock and queue `detail.prompt` for the body to send. */
export function useAssistantEvents() {
  useEffect(() => {
    const onRequest = (e) => {
      const prompt = e && e.detail && e.detail.prompt;
      if (prompt) { setPendingPrompt(prompt); }
      openAssistant();
    };
    window.addEventListener(ASSISTANT_EVENT, onRequest);
    return () => window.removeEventListener(ASSISTANT_EVENT, onRequest);
  }, []);
}

const ChatIcon = () => (
  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M4 5.5A2.5 2.5 0 0 1 6.5 3h11A2.5 2.5 0 0 1 20 5.5v8a2.5 2.5 0 0 1-2.5 2.5H10l-4.5 4v-4A2.5 2.5 0 0 1 4 13.5z" />
    <path d="M8.5 8.5h7M8.5 11.5h4" />
  </svg>
);

/** Desktop header action (the floating button is hidden there; see assistant.css). */
export function AssistantHeaderButton() {
  const { t } = useT();
  const open = useAssistantOpen();
  return (
    <button type="button" className={`ln-icon-button ln-dock-header-button ${open ? 'is-open' : ''}`} onClick={toggleAssistant}
            aria-expanded={open} aria-controls="ln-assistant-panel" aria-label={open ? t('assistant.close') : t('assistant.open')}>
      <ChatIcon />
      <span>{t('assistant.headerButton')}</span>
    </button>
  );
}

export default function AssistantDock({ user }) {
  const { t, lang } = useT();
  const { persona } = usePersona();
  const open = useAssistantOpen();
  useAssistantEvents();
  useEffect(() => {
    if (!open) { return undefined; }
    const esc = (e) => { if (e.key === 'Escape') { closeAssistant(); } };
    document.addEventListener('keydown', esc);
    return () => document.removeEventListener('keydown', esc);
  }, [open]);
  return (
    <>
      <button type="button" className={`ln-dock-button ${open ? 'is-open' : ''}`} onClick={toggleAssistant}
              aria-expanded={open} aria-controls="ln-assistant-panel" aria-label={open ? t('assistant.close') : t('assistant.open')}>
        <ChatIcon />
      </button>
      <aside id="ln-assistant-panel" className={`ln-assistant ${open ? 'is-open' : ''}`} aria-label={t('assistant.title')} aria-hidden={!open}>
        <div className="ln-assistant-head">
          <h2 className="ln-assistant-title">{t('assistant.title')}</h2>
          <button type="button" className="ln-icon-button" onClick={closeAssistant} aria-label={t('assistant.close')}>×</button>
        </div>
        {open && <AssistantBody persona={persona} lang={lang} user={user} />}
      </aside>
    </>
  );
}
