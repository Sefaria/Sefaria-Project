/**
 * The three built-in reader tools: Connections (all personas), Save to shelf (writes the shared
 * `shelf` collection) and Copy / cite (plain text + a citation; scholars default to Chicago style).
 * Importing this module registers them; `registerBuiltinTools()` re-registers after a reset.
 */
import React, { useState } from 'react';
import { registerReaderTool } from './registry';
import ConnectionsPanel from '../ConnectionsPanel';
import { useT } from '../../i18n';
import { Link } from '../../router';
import { toast } from '../../overlays';
import { usePersona } from '../../persona';
import { useContentLang } from '../../contentLang';
import { useCollection, useKv } from '../../store';
import { isOnShelf, saveToShelf, removeFromShelf, shelf } from '../collections';
import { selectionText, citation } from '../textData';
import { copyToClipboard } from '../ReaderHeader';

export function ShelfTool({ selection, book, close }) {
  const { t } = useT();
  const { persona } = usePersona();
  shelf();
  useCollection('shelf');   // re-render when the shelf changes (any tab)
  const [tags, setTags] = useState('');
  const saved = isOnShelf(selection.ref);
  const save = (e) => {
    e.preventDefault();
    saveToShelf({
      ref: selection.ref, heRef: selection.heRef, title: book.title, heTitle: book.heTitle, persona,
      tags: tags.split(',').map(s => s.trim()).filter(Boolean),
    });
    toast(t('tool.shelf.saved'));
    close();
  };
  if (saved) {
    return (
      <div className="ln-tool-body ln-stack">
        <p>{t('tool.shelf.already')}</p>
        <div className="ln-row">
          <button type="button" className="ln-btn" onClick={() => { removeFromShelf(selection.ref); toast(t('tool.shelf.removed')); }}>{t('tool.shelf.remove')}</button>
          <Link to="/my" className="ln-btn ln-btn-quiet">{t('tool.shelf.open')}</Link>
        </div>
        <p className="ln-small ln-muted">{t('tool.shelf.local')}</p>
      </div>
    );
  }
  return (
    <form className="ln-tool-body ln-stack" onSubmit={save}>
      <label className="ln-field">
        <span className="ln-field-label">{t('tool.shelf.tags')}</span>
        <input className="ln-input" name="tags" value={tags} onChange={e => setTags(e.target.value)} />
      </label>
      <div className="ln-row">
        <button type="submit" className="ln-btn ln-btn-primary">{t('tool.shelf.save')}</button>
      </div>
      <p className="ln-small ln-muted">{t('tool.shelf.local')}</p>
    </form>
  );
}

export function CiteTool({ selection, book }) {
  const { t, lang } = useT();
  const { persona } = usePersona();
  const [contentLang] = useContentLang();
  const [vowels] = useKv('reader.vowels', true);
  const [cantillation] = useKv('reader.cantillation', true);
  const [style, setStyle] = useState(persona === 'scholar' ? 'chicago' : 'simple');
  const text = selectionText(selection.segments, { vowels, cantillation });
  const body = contentLang === 'he' ? (text.he || text.en) : contentLang === 'en' ? (text.en || text.he) : [text.he, text.en].filter(Boolean).join('\n\n');
  const versionTitle = contentLang === 'he' ? book.heVersionTitle
    : contentLang === 'en' ? book.versionTitle
      : [book.heVersionTitle, book.versionTitle].filter(Boolean).join(' / ');
  const cite = citation({ ref: selection.ref, book: book.title, versionTitle, style, lang, accessedWord: t('tool.cite.accessed') });
  const copy = async (s) => {
    const ok = await copyToClipboard(s);
    toast(t(ok ? 'tool.cite.copied' : 'tool.cite.copyFailed'));
  };
  return (
    <div className="ln-tool-body ln-stack">
      <div className="ln-row">
        <button type="button" className="ln-btn ln-btn-primary" onClick={() => copy(`${body}\n\n${cite}`)}>{t('tool.cite.copyText')}</button>
        <button type="button" className="ln-btn" onClick={() => copy(cite)}>{t('tool.cite.copyCitation')}</button>
      </div>
      <div className="ln-row">
        <span className="ln-small ln-muted">{t('tool.cite.citation')}</span>
        <div className="ln-segmented compact" role="radiogroup" aria-label={t('tool.cite.citation')}>
          {['simple', 'chicago'].map(s => (
            <button key={s} type="button" role="radio" aria-checked={style === s} className={`ln-segment ${style === s ? 'active' : ''}`} onClick={() => setStyle(s)}>
              {t(`tool.cite.style.${s}`)}
            </button>
          ))}
        </div>
      </div>
      <p className="ln-cite-preview" dir="auto">{cite}</p>
      <p className="ln-cite-text" dir="auto">{body}</p>
    </div>
  );
}

export function registerBuiltinTools() {
  registerReaderTool({ id: 'connections', personas: 'all', icon: 'connections', label: 'tool.connections.label', component: ConnectionsPanel });
  registerReaderTool({ id: 'shelf', personas: 'all', icon: 'shelf', label: 'tool.shelf.label', component: ShelfTool });
  registerReaderTool({ id: 'cite', personas: 'all', icon: 'cite', label: 'tool.cite.label', component: CiteTool });
}

registerBuiltinTools();
