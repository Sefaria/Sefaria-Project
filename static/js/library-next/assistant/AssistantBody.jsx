/**
 * The dock panel body: persona greeting, three starter prompts and the embedded `<lc-chatbot>`
 * (mode="panel", persona, interface-lang, origin="library-next"). Without a user token the chat
 * cannot run, so the panel keeps the prompts and shows a sign-in fallback.
 */
import React, { useEffect, useRef, useState } from 'react';
import { useT } from '../i18n';
import { starterPromptKeys } from './strings';
import { subscribePending, takePendingPrompt, peekPendingPrompt, setPendingPrompt } from './events';
import { ensureWidget, sendPrompt, widgetSupportsPanel } from './widget';
import './assistant.css';

function StarterPrompts({ persona, t, onPick, disabled }) {
  return (
    <div className="ln-assistant-starters" role="group" aria-label={t('assistant.suggestions')}>
      <span className="ln-assistant-starters-label">{t('assistant.suggestions')}</span>
      {starterPromptKeys(persona).map(key => (
        <button key={key} type="button" className="ln-assistant-starter" data-feature-name="starter_prompt"
                disabled={disabled} onClick={() => onPick(t(key))}>
          {t(key)}
        </button>
      ))}
    </div>
  );
}

export default function AssistantBody({ persona, lang, user }) {
  const { t } = useT();
  const token = user && user.chatbot_user_token;
  const apiBaseUrl = (user && user.chatbot_api_base_url) || 'https://chat-dev.sefaria.org/api';
  const origin = (user && user.chatbot_origin) || 'library-next';
  const [status, setStatus] = useState(() => (token ? 'loading' : 'signin'));   // loading | ready | legacy | signin | unavailable
  const [pending, setPending] = useState(peekPendingPrompt);
  const widgetRef = useRef(null);

  useEffect(() => subscribePending(setPending), []);

  useEffect(() => {
    if (!token) { setStatus('signin'); return undefined; }
    let alive = true;
    ensureWidget(apiBaseUrl).then((state) => {
      if (!alive) { return; }
      if (state !== 'ready') { setStatus('unavailable'); return; }
      setStatus(widgetSupportsPanel() ? 'ready' : 'legacy');
    });
    return () => { alive = false; };
  }, [token, apiBaseUrl]);

  // Deliver a queued prompt (starter click or `library-next:assistant` event) once the widget can take it.
  const canSend = status === 'ready' || status === 'legacy';
  useEffect(() => {
    if (!canSend || !pending || !widgetRef.current) { return; }
    const prompt = takePendingPrompt();
    if (prompt) { sendPrompt(widgetRef.current, prompt); }
  }, [canSend, pending]);

  const pick = (text) => {
    if (canSend && widgetRef.current) { sendPrompt(widgetRef.current, text); return; }
    // Not ready yet, or no user: queue it (sent on readiness, or shown in the sign-in notice).
    setPendingPrompt(text);
  };

  const loginHref = `/login?next=${encodeURIComponent(typeof window !== 'undefined' ? window.location.pathname + window.location.search : '/')}`;

  return (
    <div className={`ln-assistant-body ln-assistant-body--${status}`} data-persona={persona} data-interface-lang={lang}
         data-user-token={token ? 'present' : 'none'}>
      <p className="ln-assistant-greeting">{t(`assistant.greeting.${persona}`)}</p>
      <StarterPrompts persona={persona} t={t} onPick={pick} disabled={status === 'unavailable'} />

      {status === 'signin' && (
        <div className="ln-assistant-notice" role="status">
          <strong>{t('assistant.signin.title')}</strong>
          <p>{t('assistant.signin.body')}</p>
          {pending && <p className="ln-assistant-pending">{t('assistant.signin.pending', { prompt: pending })}</p>}
          <a className="ln-btn ln-btn-primary" href={loginHref}>{t('assistant.signin.action')}</a>
        </div>
      )}
      {status === 'loading' && <p className="ln-assistant-state">{t('assistant.loading')}</p>}
      {status === 'unavailable' && <p className="ln-assistant-state" role="status">{t('assistant.unavailable')}</p>}
      {status === 'legacy' && <p className="ln-assistant-state"><span className="ln-badge-simulated">{t('assistant.legacy')}</span></p>}

      {token && status !== 'unavailable' && (
        <div className={`ln-assistant-widget ${status === 'ready' ? 'is-inline' : ''}`}>
          <lc-chatbot ref={widgetRef}
                      user-id={token}
                      api-base-url={apiBaseUrl}
                      origin={origin}
                      persona={persona}
                      interface-lang={lang}
                      mode="panel"
                      default-open="true"
                      is-moderator={user && user.is_moderator ? 'true' : undefined} />
        </div>
      )}
    </div>
  );
}
