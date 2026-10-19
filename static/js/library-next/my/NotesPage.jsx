/** `/my/notes`: notes and highlights grouped by book, searchable, exportable as Markdown. */
import React, { useMemo, useState } from 'react';
import { useT } from '../i18n';
import { useCollection } from '../store';
import { toast } from '../overlays';
import { collectionOptions, addNote, updateNote, bookOf } from './collections';
import { notesToMarkdown, download } from './exportFormats';
import { RefLink, Empty, ConfirmButton, formatDate, hasHebrew } from './bits';

function NoteCard({ note, remove, t, lang }) {
  const [editing, setEditing] = useState(false);
  const [text, setText] = useState(note.text);
  const save = () => { try { updateNote(note.id, text); setEditing(false); } catch (e) { toast(t('my.notes.needText')); } };
  return (
    <li className="ln-card ln-my-note">
      <div className="ln-my-row">
        <RefLink item={note} className="ln-my-row-title" />
        <span className="ln-small ln-muted">{formatDate(note.ts, lang)}</span>
      </div>
      {editing ? (
        <div className="ln-my-stack">
          <textarea className="ln-input ln-my-textarea" value={text} onChange={e => setText(e.target.value)} rows={3} aria-label={t('my.notes.editLabel')} />
          <div className="ln-row">
            <button type="button" className="ln-btn ln-btn-primary" onClick={save}>{t('my.save')}</button>
            <button type="button" className="ln-btn ln-btn-quiet" onClick={() => { setText(note.text); setEditing(false); }}>{t('my.cancel')}</button>
          </div>
        </div>
      ) : (
        <p className={`ln-my-note-text ${hasHebrew(note.text) ? 'ln-text-he-ui' : ''}`}>{note.text}</p>
      )}
      {!editing && (
        <div className="ln-row ln-my-actions">
          <button type="button" className="ln-btn ln-btn-quiet" onClick={() => setEditing(true)}>{t('my.edit')}</button>
          <ConfirmButton onConfirm={() => remove(note.id)}>{t('my.delete')}</ConfirmButton>
        </div>
      )}
    </li>
  );
}

export default function NotesPage() {
  const { t, lang } = useT();
  const notes = useCollection('notes', collectionOptions('notes'));
  const highlights = useCollection('highlights', collectionOptions('highlights'));
  const [q, setQ] = useState('');
  const [showHighlights, setShowHighlights] = useState(true);
  const [ref, setRef] = useState('');
  const [text, setText] = useState('');

  const needle = q.trim().toLowerCase();
  const match = (row) => !needle || [row.ref, row.text, row.title, row.heTitle, row.book].some(s => (s || '').toLowerCase().includes(needle));
  const groups = useMemo(() => {
    const map = new Map();
    const add = (row, kind) => {
      const book = row.book || bookOf(row.ref);
      if (!map.has(book)) { map.set(book, { book, notes: [], highlights: [] }); }
      map.get(book)[kind].push(row);
    };
    notes.items.filter(match).forEach(n => add(n, 'notes'));
    if (showHighlights) { highlights.items.filter(match).forEach(h => add(h, 'highlights')); }
    return Array.from(map.values()).sort((a, b) => a.book.localeCompare(b.book));
  }, [notes.items, highlights.items, needle, showHighlights]);

  const total = notes.items.length + highlights.items.length;
  const exportMd = () => {
    const ok = download('sefaria-notes.md', notesToMarkdown({ notes: notes.items, highlights: highlights.items }, { title: t('my.notes.exportTitle') }), 'text/markdown');
    toast(ok ? t('my.notes.exported') : t('my.downloadUnavailable'));
  };
  const add = (e) => {
    e.preventDefault();
    try { addNote(ref.trim(), text); setRef(''); setText(''); toast(t('my.notes.saved')); } catch (err) { toast(t('my.notes.needBoth')); }
  };

  return (
    <div className="ln-my-notes">
      <div className="ln-my-toolbar">
        <input className="ln-input ln-my-search" type="search" value={q} onChange={e => setQ(e.target.value)} placeholder={t('my.notes.search')} aria-label={t('my.notes.search')} />
        <label className="ln-my-check"><input type="checkbox" checked={showHighlights} onChange={e => setShowHighlights(e.target.checked)} /> {t('my.notes.showHighlights')}</label>
        <button type="button" className="ln-btn" onClick={exportMd} disabled={!total}>{t('my.notes.export')}</button>
      </div>

      {total === 0 ? (
        <Empty>{t('my.notes.empty')}</Empty>
      ) : groups.length === 0 ? (
        <Empty>{t('my.notes.noMatch')}</Empty>
      ) : groups.map(g => (
        <section key={g.book} className="ln-my-section ln-my-book" aria-labelledby={`book-${g.book}`}>
          <h2 id={`book-${g.book}`} className="ln-my-book-title">{g.book} <span className="ln-small ln-muted">{t('my.notes.countInBook', { notes: g.notes.length, highlights: g.highlights.length })}</span></h2>
          <ul className="ln-my-list">
            {g.notes.map(n => <NoteCard key={n.id} note={n} remove={notes.remove} t={t} lang={lang} />)}
            {g.highlights.map(h => (
              <li key={h.id} className="ln-card ln-my-highlight" data-color={h.color}>
                <span className="ln-my-swatch" aria-label={t(`my.color.${h.color}`)} />
                <div className="ln-my-row-main">
                  <RefLink item={h} className="ln-my-row-title" />
                  {h.text && <p className={`ln-my-highlight-text ${hasHebrew(h.text) ? 'ln-text-he-ui' : ''}`}>{h.text}</p>}
                </div>
                <ConfirmButton onConfirm={() => highlights.remove(h.id)} className="ln-icon-button" confirmLabel="?">×</ConfirmButton>
              </li>
            ))}
          </ul>
        </section>
      ))}

      <details className="ln-my-details">
        <summary>{t('my.notes.add')}</summary>
        <form className="ln-my-form" onSubmit={add}>
          <label>{t('my.form.ref')}<input className="ln-input" value={ref} onChange={e => setRef(e.target.value)} placeholder="Genesis 1:1" required /></label>
          <label>{t('my.notes.text')}<textarea className="ln-input ln-my-textarea" value={text} onChange={e => setText(e.target.value)} rows={3} required /></label>
          <button type="submit" className="ln-btn ln-btn-primary">{t('my.save')}</button>
        </form>
      </details>
      <p className="ln-small ln-muted">{t('my.notes.readerHint')}</p>
    </div>
  );
}
