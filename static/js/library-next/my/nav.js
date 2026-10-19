/**
 * The hub's sections and their persona-aware order. Every section is reachable for every persona;
 * the order (and the overview's quick actions) follow the PLAN.md personas table.
 */
export const SECTIONS = {
  overview: { id: 'overview', path: '', key: 'my.nav.overview', titleKey: 'my.title.overview' },
  shelf: { id: 'shelf', path: 'shelf', key: 'my.nav.shelf', titleKey: 'my.title.shelf' },
  history: { id: 'history', path: 'history', key: 'my.nav.history', titleKey: 'my.title.history' },
  notes: { id: 'notes', path: 'notes', key: 'my.nav.notes', titleKey: 'my.title.notes' },
  plans: { id: 'plans', path: 'plans', key: 'my.nav.plans', titleKey: 'my.title.plans' },
  flashcards: { id: 'flashcards', path: 'flashcards', key: 'my.nav.flashcards', titleKey: 'my.title.flashcards' },
  lessons: { id: 'lessons', path: 'lessons', key: 'my.nav.lessons', titleKey: 'my.title.lessons' },
  notebook: { id: 'notebook', path: 'notebook', key: 'my.nav.notebook', titleKey: 'my.title.notebook' },
  data: { id: 'data', path: 'data', key: 'my.nav.data', titleKey: 'my.title.data' },
};

export const ORDER = {
  newcomer: ['overview', 'shelf', 'history', 'notes', 'plans', 'flashcards', 'lessons', 'notebook', 'data'],
  learner: ['overview', 'plans', 'flashcards', 'notes', 'shelf', 'history', 'lessons', 'notebook', 'data'],
  educator: ['overview', 'lessons', 'shelf', 'notes', 'history', 'plans', 'flashcards', 'notebook', 'data'],
  scholar: ['overview', 'notebook', 'notes', 'shelf', 'history', 'plans', 'flashcards', 'lessons', 'data'],
};

/** The sections this persona leads with (quick actions on the overview). */
export const FEATURED = {
  newcomer: ['shelf', 'history'],
  learner: ['plans', 'flashcards', 'notes'],
  educator: ['lessons', 'shelf'],
  scholar: ['notebook', 'notes', 'data'],
};

export function sectionsFor(persona) {
  return (ORDER[persona] || ORDER.newcomer).map(id => SECTIONS[id]);
}

/** The section id for a `/my/*` sub-path ('' → overview, 'lessons/abc/handout' → lessons); null when unknown. */
export function sectionFor(rest = '') {
  const head = rest.split('/')[0];
  if (head === '') { return 'overview'; }
  return SECTIONS[head] ? head : null;
}

export function pathFor(sectionId) {
  const s = SECTIONS[sectionId];
  return s ? (s.path ? `/my/${s.path}` : '/my') : '/my';
}
