/**
 * Note (learner): a textarea with a Markdown-lite preview, saved through `addNote`; the notes
 * already written on this ref (or on any of its segments) are listed underneath.
 */
import React, { useState } from 'react';
import { useT } from '../../i18n';
import { Link } from '../../router';
import { toast } from '../../overlays';
import { useCollection } from '../../store';
import { addNote, collectionOptions } from '../../my/collections';
import { renderMarkdownLite } from './markdown';

export function notesFor(items, selection) {
  const refs = new Set([selection.ref, ...selection.segments.map(s => s.ref)]);
  return items.filter(n => refs.has(n.ref));
}

export default function NoteTool({ selection, book }) {
  const { t, lang } = useT();
  const { items } = useCollection('notes', collectionOptions('notes'));
  const [text, setText] = useState('');
  const [mode, setMode] = useState('write');
  const existing = notesFor(items, selection);
  const save = (e) => {
    e.preventDefault();
    if (!text.trim()) { return; }
    addNote(selection.ref, text.trim(), { title: book.title, heTitle: book.heTitle, book: book.title });
    setText(''); setMode('write');
    toast(t('learn.note.saved'));
  };
  return (
    <div className="ln-tool-body ln-stack ln-learn">
      <form className="ln-stack" onSubmit={save}>
        <div className="ln-segmented compact" role="radiogroup" aria-label={t('learn.note.label')}>
          {['write', 'preview'].map(m => (
            <button key={m} type="button" role="radio" aria-checked={mode === m} className={`ln-segment ${mode === m ? 'active' : ''}`} onClick={() => setMode(m)}>{t(`learn.note.${m}`)}</button>
          ))}
        </div>
        {mode === 'write' ? (
          <textarea className="ln-input ln-learn-textarea" name="note" rows={5} value={text} placeholder={t('learn.note.placeholder')} onChange={e => setText(e.target.value)} dir="auto" />
        ) : (
          text.trim()
            ? <div className="ln-learn-md" dir="auto" dangerouslySetInnerHTML={{ __html: renderMarkdownLite(text) }} />
            : <p className="ln-small ln-muted">{t('learn.note.empty')}</p>
        )}
        <div className="ln-row">
          <button type="submit" className="ln-btn ln-btn-primary" disabled={!text.trim()}>{t('learn.note.save')}</button>
          <Link to="/my/notes" className="ln-btn ln-btn-quiet">{t('learn.openMy')}</Link>
        </div>
      </form>
      {existing.length > 0 && (
        <section className="ln-learn-block">
          <h3 className="ln-learn-h">{t('learn.note.existing')}</h3>
          <ul className="ln-learn-notes">
            {existing.map(n => (
              <li key={n.id} className="ln-learn-note">
                <span className="ln-small ln-muted">{n.ref} · {new Date(n.ts).toLocaleDateString(lang === 'he' ? 'he-IL' : 'en-US')}</span>
                <div className="ln-learn-md" dir="auto" dangerouslySetInnerHTML={{ __html: renderMarkdownLite(n.text) }} />
              </li>
            ))}
          </ul>
        </section>
      )}
      <p className="ln-small ln-muted">{t('learn.local')}</p>
    </div>
  );
}
