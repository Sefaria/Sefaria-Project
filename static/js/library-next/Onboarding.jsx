/**
 * First-visit onboarding: "Who are you learning as today?" with the four personas. Skipping
 * picks `newcomer`. Opens automatically when no persona was chosen yet; `openOnboarding()`
 * re-opens it (the persona chip's last menu item does).
 */
import React, { useEffect } from 'react';
import { useT, pick } from './i18n';
import { PERSONA_IDS, PERSONAS, PersonaIcon, usePersona, getChosenPersona, setPersona, DEFAULT_PERSONA } from './persona';
import { openModal, closeModal } from './overlays';

export function OnboardingDialog() {
  const { t } = useT();
  const { persona, chosen } = usePersona();
  const choose = (id) => { setPersona(id); closeModal(); };
  const skip = () => { if (!getChosenPersona()) { setPersona(DEFAULT_PERSONA); } closeModal(); };
  return (
    <div className="ln-onboarding">
      <h2 className="ln-onboarding-title">{t('onboarding.title')}</h2>
      <p className="ln-onboarding-body">{t('onboarding.body')}</p>
      <div className="ln-persona-grid">
        {PERSONA_IDS.map(id => (
          <button key={id} type="button" className={`ln-persona-card ${chosen && id === persona ? 'is-current' : ''}`}
                  data-persona={id} onClick={() => choose(id)} aria-pressed={chosen && id === persona}>
            <PersonaIcon persona={id} size={28} />
            <span className="ln-persona-card-label">{pick(PERSONAS[id].label)}</span>
            <span className="ln-persona-card-tagline">{pick(PERSONAS[id].tagline)}</span>
          </button>
        ))}
      </div>
      <div className="ln-onboarding-actions">
        <button type="button" className="ln-btn ln-btn-quiet" onClick={skip}>{t('onboarding.skip')}</button>
      </div>
    </div>
  );
}

export function openOnboarding() {
  openModal(<OnboardingDialog />, {
    label: 'Choose how you learn',
    dismissible: true,
    onClose: () => { if (!getChosenPersona()) { setPersona(DEFAULT_PERSONA); } },
  });
}

/** Mounted once by the shell: opens the dialog on first visit. */
export default function Onboarding() {
  useEffect(() => {
    if (!getChosenPersona()) { openOnboarding(); }
  }, []);
  return null;
}
