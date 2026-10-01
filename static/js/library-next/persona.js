/**
 * Personas: who the visitor is learning as. Chosen in onboarding (first visit) or from the
 * header chip; persisted in the store (`kv.persona`). Unset means "not chosen yet": the
 * onboarding modal opens and `newcomer` is used meanwhile.
 *
 *   import { usePersona, PERSONAS, PERSONA_IDS } from '../persona';
 *   const { persona, setPersona, def, chosen } = usePersona();
 *   def.homeModules   // ordered module ids for the home page
 *   def.readerTools   // reader tool ids this persona sees by default
 *   def.contentLang   // default content language (he|en|bi)
 */
import React, { useEffect, useState } from 'react';
import { kv } from './store';

export const PERSONA_KEY = 'persona';
export const PERSONA_IDS = ['newcomer', 'learner', 'educator', 'scholar'];
export const DEFAULT_PERSONA = 'newcomer';

const stroke = { fill: 'none', stroke: 'currentColor', strokeWidth: 1.6, strokeLinecap: 'round', strokeLinejoin: 'round' };

/** 24px line icons; `aria-hidden`, the label carries the meaning. */
export const PersonaIcon = ({ persona, size = 24, className = '' }) => {
  const paths = {
    // a sprout: two leaves on a stem
    newcomer: <><path d="M12 21v-9" /><path d="M12 12c0-4 3-6 7-6 0 4-3 6-7 6z" /><path d="M12 15c0-3-2.5-5-6-5 0 3 2.5 5 6 5z" /></>,
    // an open book
    learner: <><path d="M12 6c-2-1.5-5-2-8-2v14c3 0 6 .5 8 2 2-1.5 5-2 8-2V4c-3 0-6 .5-8 2z" /><path d="M12 6v14" /></>,
    // a board with a pointer
    educator: <><rect x="3" y="4" width="18" height="12" rx="1.5" /><path d="M8 20h8" /><path d="M12 16v4" /><path d="M7 12l3-3 3 2 4-4" /></>,
    // a magnifier over a page
    scholar: <><circle cx="10.5" cy="10.5" r="5.5" /><path d="M14.5 14.5L20 20" /><path d="M8 10.5h5" /><path d="M10.5 8v5" /></>,
  };
  return (
    <svg className={`ln-persona-icon ${className}`} width={size} height={size} viewBox="0 0 24 24" aria-hidden="true" {...stroke}>
      {paths[persona] || paths.newcomer}
    </svg>
  );
};

export const PERSONAS = {
  newcomer: {
    id: 'newcomer',
    label: { en: 'Newcomer', he: 'מתחיל/ה' },
    tagline: { en: 'Start with plain explanations and English first.', he: 'התחלה עם הסברים פשוטים ואנגלית תחילה.' },
    contentLang: 'en',
    homeModules: ['startHere', 'parashaExplained', 'glossary', 'fiveMinuteReads', 'calendarToday'],
    readerTools: ['explainer', 'glossary', 'about'],
  },
  learner: {
    id: 'learner',
    label: { en: 'Learner', he: 'לומד/ת' },
    tagline: { en: 'Keep a rhythm: plans, streaks, notes and review.', he: 'לשמור על קצב: תוכניות, רצף, הערות וחזרה.' },
    contentLang: 'bi',
    homeModules: ['continueReading', 'plans', 'calendarToday', 'recommendations', 'topics'],
    readerTools: ['notes', 'highlights', 'flashcards', 'markRead', 'connections'],
  },
  educator: {
    id: 'educator',
    label: { en: 'Educator', he: 'מורה' },
    tagline: { en: 'Build lessons and handouts from any text.', he: 'לבנות שיעורים ודפי מקורות מכל טקסט.' },
    contentLang: 'bi',
    homeModules: ['lessons', 'sourceCollections', 'buildLesson', 'parashaForClass', 'calendarToday'],
    readerTools: ['lessonBuilder', 'discussionPrompts', 'handout', 'translations', 'connections'],
  },
  scholar: {
    id: 'scholar',
    label: { en: 'Scholar', he: 'חוקר/ת' },
    tagline: { en: 'Hebrew first, versions side by side, citations ready.', he: 'עברית תחילה, נוסחים זה לצד זה, ציטוטים מוכנים.' },
    contentLang: 'he',
    homeModules: ['notebook', 'recentRefs', 'comparisons', 'advancedSearch', 'calendarToday'],
    readerTools: ['versions', 'manuscripts', 'apparatus', 'lexicon', 'cite', 'connections'],
  },
};

export function isPersona(id) {
  return PERSONA_IDS.includes(id);
}

/** The stored persona id, or null when none was chosen yet. */
export function getChosenPersona() {
  const stored = kv.get(PERSONA_KEY);
  return isPersona(stored) ? stored : null;
}

/** The effective persona id (falls back to `newcomer`). */
export function getPersona() {
  return getChosenPersona() || DEFAULT_PERSONA;
}

export function getPersonaDef(id = getPersona()) {
  return PERSONAS[isPersona(id) ? id : DEFAULT_PERSONA];
}

export function setPersona(id) {
  if (!isPersona(id)) { throw new Error(`Unknown persona: ${id}`); }
  kv.set(PERSONA_KEY, id);
}

export function clearPersona() {
  kv.remove(PERSONA_KEY);
}

/** `{ persona, setPersona, def, chosen }`; re-renders when the persona changes (any tab). */
export function usePersona() {
  const [chosen, setChosen] = useState(getChosenPersona);
  useEffect(() => kv.subscribe(() => setChosen(getChosenPersona())), []);
  const persona = chosen || DEFAULT_PERSONA;
  return { persona, setPersona, def: PERSONAS[persona], chosen: chosen !== null };
}
