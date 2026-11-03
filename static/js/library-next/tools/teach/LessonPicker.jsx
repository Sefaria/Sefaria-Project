/**
 * Pick a lesson (newest first) or create one inline. Shared by "Add to lesson" and
 * "Discussion questions". `useLessonChoice()` keeps the chosen id valid as lessons change.
 */
import React, { useEffect, useState } from 'react';
import { useT } from '../../i18n';
import { useCollection } from '../../store';
import { collectionOptions, createLesson } from '../../my/collections';
import { toast } from '../../overlays';
import { hasHebrew } from '../../my/bits';

export function useLessonChoice() {
  const { items } = useCollection('lessons', collectionOptions('lessons'));
  const [id, setId] = useState('');
  const lesson = items.find(l => l.id === id) || null;
  useEffect(() => { if (!lesson && items.length) { setId(items[0].id); } }, [lesson, items]);
  return { items, id, setId, lesson };
}

export default function LessonPicker({ items, value, onChange }) {
  const { t } = useT();
  const [creating, setCreating] = useState(false);
  const [title, setTitle] = useState('');
  const create = (e) => {
    e.preventDefault();
    e.stopPropagation();
    try {
      const lesson = createLesson({ title });
      onChange(lesson.id);
      setTitle('');
      setCreating(false);
    } catch (err) {
      toast(t('teach.lesson.needTitle'));
    }
  };
  const showForm = creating || !items.length;
  return (
    <div className="ln-lesson-picker ln-stack">
      {items.length > 0 && (
        <label className="ln-field">
          <span className="ln-field-label">{t('teach.lesson.pick')}</span>
          <select className="ln-input" value={showForm ? '__new' : value} aria-label={t('teach.lesson.pick')}
                  onChange={e => { if (e.target.value === '__new') { setCreating(true); } else { setCreating(false); onChange(e.target.value); } }}>
            {items.map(l => <option key={l.id} value={l.id} className={hasHebrew(l.title) ? 'ln-text-he-ui' : ''}>{l.title}</option>)}
            <option value="__new">{t('teach.lesson.new')}</option>
          </select>
        </label>
      )}
      {!items.length && <p className="ln-small ln-muted">{t('teach.lesson.none')}</p>}
      {showForm && (
        <div className="ln-row ln-lesson-new">
          <input className="ln-input" value={title} onChange={e => setTitle(e.target.value)} placeholder={t('teach.lesson.newTitle')} aria-label={t('teach.lesson.newTitle')}
                 onKeyDown={e => { if (e.key === 'Enter') { create(e); } }} />
          <button type="button" className="ln-btn" onClick={create} disabled={!title.trim()}>{t('teach.lesson.create')}</button>
        </div>
      )}
    </div>
  );
}
