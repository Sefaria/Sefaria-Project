/**
 * Mark as read / Add to plan: which plan holds the section in view, and the unit to add when
 * none does. Plans are my-library's (`units[{ ref, label, heLabel }]`, `done[]`).
 */
import { collection } from '../../my/collections';

/** `{ plan, done }` for the first plan with a unit for `ref`, or null. */
export function planFor(ref) {
  for (const plan of collection('plans').list()) {
    if ((plan.units || []).some(u => u.ref === ref)) { return { plan, done: (plan.done || []).includes(ref) }; }
  }
  return null;
}

/** The most recently created plan, or null. */
export function newestPlan() {
  const list = collection('plans').list().filter(p => Array.isArray(p.units));
  return list.length ? list.reduce((a, b) => ((a.ts || 0) >= (b.ts || 0) ? a : b)) : null;
}

/** The plan unit for the section in view. */
export function sectionUnit(book) {
  return { ref: book.sectionRef, label: book.sectionRef, heLabel: book.heSectionRef || book.sectionRef };
}
