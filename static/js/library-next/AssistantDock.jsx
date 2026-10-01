/**
 * The assistant dock: a button at the inline-end edge that opens a side panel. The panel body
 * is a placeholder; the `assistant` agent replaces `<AssistantBody>` with `<lc-chatbot>`
 * (persona, interface-lang, mode="panel", origin="library-next" — see PLAN.md).
 *
 *   import { openAssistant, closeAssistant, toggleAssistant } from '../AssistantDock';
 */
import React, { useEffect, useState } from 'react';
import { useT } from './i18n';
import { usePersona } from './persona';

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

/** Placeholder body. The assistant agent mounts `<lc-chatbot>` here with the props below. */
export function AssistantBody({ persona, lang, user }) {
  const { t } = useT();
  return (
    <div className="ln-assistant-body" data-persona={persona} data-interface-lang={lang}
         data-user-token={user && user.chatbot_user_token ? 'present' : 'none'}>
      <p className="ln-assistant-coming">{t('assistant.comingSoon')}</p>
    </div>
  );
}

export default function AssistantDock({ user }) {
  const { t, lang } = useT();
  const { persona } = usePersona();
  const open = useAssistantOpen();
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
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M4 5.5A2.5 2.5 0 0 1 6.5 3h11A2.5 2.5 0 0 1 20 5.5v8a2.5 2.5 0 0 1-2.5 2.5H10l-4.5 4v-4A2.5 2.5 0 0 1 4 13.5z" />
          <path d="M8.5 8.5h7M8.5 11.5h4" />
        </svg>
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
