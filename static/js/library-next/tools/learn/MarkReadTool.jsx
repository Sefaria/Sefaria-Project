/**
 * Mark as read / Add to plan (learner): when the section in view is a unit of one of your
 * study plans, toggle it done (`markPlanUnitDone`); otherwise add it to your newest plan
 * (`addToPlan`) or start a plan for this book (`createPlan`).
 */
import React from 'react';
import { useT } from '../../i18n';
import { Link } from '../../router';
import { toast } from '../../overlays';
import { useCollection } from '../../store';
import { addToPlan, createPlan, markPlanUnitDone, collectionOptions } from '../../my/collections';
import { planFor, newestPlan, sectionUnit } from './plans';

export default function MarkReadTool({ book }) {
  const { t, lang } = useT();
  useCollection('plans', collectionOptions('plans'));
  const ref = book.sectionRef;
  const hit = planFor(ref);
  const sectionLabel = lang === 'he' ? (book.heSectionRef || ref) : ref;
  const planTitle = p => (lang === 'he' ? (p.heTitle || p.title) : p.title);
  if (hit) {
    const { plan, done } = hit;
    const total = (plan.units || []).length;
    const doneCount = (plan.done || []).length;
    const toggle = () => { markPlanUnitDone(plan.id, ref, !done); toast(t(done ? 'learn.markRead.undone' : 'learn.markRead.done')); };
    return (
      <div className="ln-tool-body ln-stack ln-learn">
        <p>{t('learn.markRead.inPlan', { plan: planTitle(plan) })}</p>
        <p className="ln-small ln-muted">{t('learn.markRead.progress', { done: doneCount, total })}</p>
        <div className="ln-row">
          <button type="button" className={`ln-btn ${done ? '' : 'ln-btn-primary'}`} aria-pressed={done} onClick={toggle}>
            {done ? t('learn.markRead.unmark') : t('learn.markRead.mark', { ref: sectionLabel })}
          </button>
          <Link to="/my/plans" className="ln-btn ln-btn-quiet">{t('learn.markRead.openPlans')}</Link>
        </div>
      </div>
    );
  }
  const newest = newestPlan();
  const add = () => { addToPlan(newest.id, sectionUnit(book)); toast(t('learn.markRead.added')); };
  const create = () => {
    createPlan({ title: book.title, heTitle: book.heTitle, book: book.title, units: [sectionUnit(book)] });
    toast(t('learn.markRead.created'));
  };
  return (
    <div className="ln-tool-body ln-stack ln-learn">
      <p>{t('learn.markRead.notInPlan')}</p>
      <div className="ln-row">
        {newest && <button type="button" className="ln-btn ln-btn-primary" onClick={add}>{t('learn.markRead.addTo', { plan: planTitle(newest) })}</button>}
        <button type="button" className={`ln-btn ${newest ? '' : 'ln-btn-primary'}`} onClick={create}>{t('learn.markRead.create', { book: lang === 'he' ? book.heTitle : book.title })}</button>
        <Link to="/my/plans" className="ln-btn ln-btn-quiet">{t('learn.markRead.openPlans')}</Link>
      </div>
      <p className="ln-small ln-muted">{t('learn.local')}</p>
    </div>
  );
}
