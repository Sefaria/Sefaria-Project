/** Educator: add the selection as a source to a lesson (`lessons` collection via `addSourceToLesson`). */
import React, { useState } from 'react';
import { useT } from '../../i18n';
import { Link } from '../../router';
import { toast } from '../../overlays';
import { addSourceToLesson } from '../../my/collections';
import LessonPicker, { useLessonChoice } from './LessonPicker';

export default function AddToLessonTool({ selection, book }) {
  const { t } = useT();
  const { items, id, setId, lesson } = useLessonChoice();
  const [note, setNote] = useState('');
  const [done, setDone] = useState(null);
  const already = !!lesson && lesson.sources.some(s => s.ref === selection.ref);
  const add = (e) => {
    e.preventDefault();
    if (!lesson || already) { return; }
    addSourceToLesson(lesson.id, { ref: selection.ref, title: selection.ref, heTitle: selection.heRef, he: selection.he, en: selection.en, note, category: book.primaryCategory });
    toast(t('teach.add.added', { title: lesson.title }));
    setDone(lesson);
    setNote('');
  };
  if (done) {
    return (
      <div className="ln-tool-body ln-stack" data-state="added">
        <p>{t('teach.add.added', { title: done.title })}</p>
        <div className="ln-row">
          <Link to={`/my/lessons/${done.id}`} className="ln-btn ln-btn-primary">{t('teach.lesson.open')}</Link>
          <button type="button" className="ln-btn ln-btn-quiet" onClick={() => setDone(null)}>{t('teach.add.again')}</button>
        </div>
        <p className="ln-small ln-muted">{t('teach.lesson.local')}</p>
      </div>
    );
  }
  return (
    <form className="ln-tool-body ln-stack" onSubmit={add}>
      <LessonPicker items={items} value={id} onChange={setId} />
      <label className="ln-field">
        <span className="ln-field-label">{t('teach.add.note')}</span>
        <input className="ln-input" value={note} onChange={e => setNote(e.target.value)} />
      </label>
      {already && <p className="ln-small ln-muted" role="status">{t('teach.add.already', { title: lesson.title })}</p>}
      <div className="ln-row">
        <button type="submit" className="ln-btn ln-btn-primary" disabled={!lesson || already}>{t('teach.add.add')}</button>
        {lesson && <Link to={`/my/lessons/${lesson.id}`} className="ln-btn ln-btn-quiet">{t('teach.lesson.open')}</Link>}
      </div>
      <p className="ln-small ln-muted">{t('teach.lesson.local')}</p>
    </form>
  );
}
