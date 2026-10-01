/** `/my/notebook`: the scholar's research entries with versions compared and citations; exports BibTeX / CSV / JSON. */
import React, { useState } from 'react';
import { useT } from '../i18n';
import { useCollection } from '../store';
import { toast } from '../overlays';
import { collectionOptions, addNotebookEntry, citationFor } from './collections';
import { notebookToBibTeX, notebookToCSV, notebookToJSON, download } from './exportFormats';
import { fetchPreview } from './data';
import { RefLink, BiText, Empty, ConfirmButton, formatDate, copyText, hasHebrew } from './bits';

function EntryForm({ onDone, t }) {
  const [ref, setRef] = useState('');
  const [preview, setPreview] = useState(null);
  const [selected, setSelected] = useState([]);
  const [text, setText] = useState('');
  const [citation, setCitation] = useState('');
  const [touched, setTouched] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const lookup = async (e) => {
    e.preventDefault();
    setBusy(true); setError('');
    try {
      const p = await fetchPreview(ref.trim(), { maxChars: 600 });
      setPreview(p); setSelected([]);
      if (!touched) { setCitation(citationFor(p.ref, { versionTitle: p.versionTitle })); }
    } catch (err) {
      setPreview(null); setError(t('my.notebook.refNotFound', { ref: ref.trim() }));
    } finally {
      setBusy(false);
    }
  };
  const toggle = (title) => {
    const next = selected.includes(title) ? selected.filter(v => v !== title) : [...selected, title];
    setSelected(next);
    if (!touched && preview) { setCitation(citationFor(preview.ref, { versionTitle: next[0] || preview.versionTitle })); }
  };
  const save = (e) => {
    e.preventDefault();
    if (!preview) { return; }
    addNotebookEntry({ ref: preview.ref, heTitle: preview.heRef, text, versions: selected, citation });
    toast(t('my.notebook.saved'));
    onDone();
  };

  return (
    <form className="ln-card ln-my-form" onSubmit={preview ? save : lookup} aria-label={t('my.notebook.new')}>
      <h2 className="ln-section-title">{t('my.notebook.new')}</h2>
      <div className="ln-my-inline-form">
        <input className="ln-input" value={ref} onChange={e => { setRef(e.target.value); setPreview(null); setError(''); }} placeholder="Berakhot 2a:1" aria-label={t('my.form.ref')} required />
        <button type="button" className="ln-btn" onClick={lookup} disabled={busy || !ref.trim()}>{busy ? t('my.working') : t('my.notebook.lookup')}</button>
      </div>
      {error && <p className="ln-my-error" role="alert">{error}</p>}
      {preview && (
        <>
          <BiText he={preview.he} en={preview.en} compact />
          {preview.versions.length > 0 && (
            <fieldset className="ln-my-versions">
              <legend>{t('my.notebook.versions')} <span className="ln-small ln-muted">{t('my.notebook.versionsHint')}</span></legend>
              <div className="ln-my-version-list">
                {preview.versions.map(v => (
                  <label key={v.title} className="ln-my-check"><input type="checkbox" checked={selected.includes(v.title)} onChange={() => toggle(v.title)} /> <span>{v.title}</span> <span className="ln-small ln-muted">{v.lang}</span></label>
                ))}
              </div>
            </fieldset>
          )}
          <label>{t('my.notebook.note')}<textarea className="ln-input ln-my-textarea" rows={3} value={text} onChange={e => setText(e.target.value)} /></label>
          <label>{t('my.notebook.citation')}<input className="ln-input" value={citation} onChange={e => { setCitation(e.target.value); setTouched(true); }} /></label>
          <div className="ln-row">
            <button type="submit" className="ln-btn ln-btn-primary">{t('my.save')}</button>
            <button type="button" className="ln-btn ln-btn-quiet" onClick={onDone}>{t('my.cancel')}</button>
          </div>
        </>
      )}
    </form>
  );
}

export default function NotebookPage({ query = {} }) {
  const { t, lang } = useT();
  const { items, remove } = useCollection('notebook', collectionOptions('notebook'));
  const [creating, setCreating] = useState(query.new === '1');
  const showForm = creating || items.length === 0;
  const exportAs = (kind) => {
    const out = { bibtex: ['sefaria-notebook.bib', notebookToBibTeX(items), 'application/x-bibtex'], csv: ['sefaria-notebook.csv', notebookToCSV(items), 'text/csv'], json: ['sefaria-notebook.json', notebookToJSON(items), 'application/json'] }[kind];
    toast(download(...out) ? t('my.notebook.exported') : t('my.downloadUnavailable'));
  };
  return (
    <div className="ln-my-notebook">
      <div className="ln-row ln-my-toolbar">
        {!showForm && <button type="button" className="ln-btn ln-btn-primary" onClick={() => setCreating(true)}>{t('my.notebook.new')}</button>}
        <span className="ln-small ln-muted">{t('my.notebook.export')}</span>
        {['bibtex', 'csv', 'json'].map(k => <button key={k} type="button" className="ln-btn" disabled={!items.length} onClick={() => exportAs(k)}>{t(`my.notebook.export.${k}`)}</button>)}
      </div>
      {showForm && <EntryForm onDone={() => setCreating(false)} t={t} />}
      {items.length === 0 ? (
        <Empty>{t('my.notebook.empty')}</Empty>
      ) : (
        <ul className="ln-my-list">
          {items.map(e => (
            <li key={e.id} className="ln-card ln-my-entry">
              <div className="ln-my-row">
                <RefLink item={e} className="ln-my-row-title" />
                <span className="ln-small ln-muted">{formatDate(e.ts, lang)}</span>
              </div>
              {e.versions.length > 0 && (
                <p className="ln-my-tags"><span className="ln-small ln-muted">{t('my.notebook.compared')}</span>{e.versions.map(v => <span key={v} className="ln-my-tag is-static">{v}</span>)}</p>
              )}
              {e.text && <p className={`ln-my-note-text ${hasHebrew(e.text) ? 'ln-text-he-ui' : ''}`}>{e.text}</p>}
              <div className="ln-my-citation">
                <code dir="ltr">{e.citation}</code>
                <button type="button" className="ln-btn ln-btn-quiet" onClick={async () => toast((await copyText(e.citation)) ? t('my.copied') : t('my.copyUnavailable'))}>{t('my.copy')}</button>
              </div>
              <div className="ln-row ln-my-actions"><ConfirmButton onConfirm={() => remove(e.id)}>{t('my.delete')}</ConfirmButton></div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
