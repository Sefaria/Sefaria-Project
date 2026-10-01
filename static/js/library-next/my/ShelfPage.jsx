/** `/my/shelf`: saved refs and books with tags and filters. */
import React, { useMemo, useState } from 'react';
import { useT } from '../i18n';
import { useCollection } from '../store';
import { toast } from '../overlays';
import { collectionOptions, saveToShelf, removeFromShelf, setShelfTags } from './collections';
import { RefLink, Empty } from './bits';

function TagInput({ item, t }) {
  const [value, setValue] = useState('');
  const submit = (e) => {
    e.preventDefault();
    const tag = value.trim();
    if (tag) { setShelfTags(item.ref, [...item.tags, tag]); setValue(''); }
  };
  return (
    <form className="ln-my-tag-add" onSubmit={submit}>
      <input className="ln-input" value={value} onChange={e => setValue(e.target.value)} placeholder={t('my.shelf.addTag')} aria-label={t('my.shelf.addTagFor', { title: item.title })} />
    </form>
  );
}

export default function ShelfPage() {
  const { t } = useT();
  const { items } = useCollection('shelf', collectionOptions('shelf'));
  const [q, setQ] = useState('');
  const [tag, setTag] = useState(null);
  const [kind, setKind] = useState('all');
  const [ref, setRef] = useState('');
  const [tags, setTags] = useState('');

  const allTags = useMemo(() => Array.from(new Set(items.flatMap(i => i.tags || []))).sort(), [items]);
  const needle = q.trim().toLowerCase();
  const filtered = items.filter(i => (kind === 'all' || i.kind === kind)
    && (!tag || (i.tags || []).includes(tag))
    && (!needle || [i.title, i.heTitle, i.ref, ...(i.tags || [])].some(s => (s || '').toLowerCase().includes(needle))));

  const add = (e) => {
    e.preventDefault();
    try {
      saveToShelf({ ref: ref.trim(), kind: /\d/.test(ref) ? 'ref' : 'book', tags: tags.split(',').map(s => s.trim()).filter(Boolean) });
      setRef(''); setTags('');
      toast(t('my.shelf.saved'));
    } catch (err) {
      toast(t('my.shelf.needRef'));
    }
  };

  return (
    <div className="ln-my-shelf">
      <div className="ln-my-toolbar">
        <input className="ln-input ln-my-search" type="search" value={q} onChange={e => setQ(e.target.value)} placeholder={t('my.shelf.search')} aria-label={t('my.shelf.search')} />
        <div className="ln-segmented" role="radiogroup" aria-label={t('my.shelf.kind')}>
          {['all', 'ref', 'book'].map(k => (
            <button key={k} type="button" role="radio" aria-checked={kind === k} className={`ln-segment ${kind === k ? 'active' : ''}`} onClick={() => setKind(k)}>{t(`my.shelf.kind.${k}`)}</button>
          ))}
        </div>
      </div>
      {allTags.length > 0 && (
        <div className="ln-my-tags" role="group" aria-label={t('my.shelf.tags')}>
          {allTags.map(tg => (
            <button key={tg} type="button" className={`ln-my-tag ${tag === tg ? 'is-active' : ''}`} aria-pressed={tag === tg} onClick={() => setTag(tag === tg ? null : tg)}>{tg}</button>
          ))}
        </div>
      )}

      {items.length === 0 ? (
        <Empty>{t('my.shelf.empty')}</Empty>
      ) : filtered.length === 0 ? (
        <Empty>{t('my.shelf.noMatch')}</Empty>
      ) : (
        <ul className="ln-my-list">
          {filtered.map(item => (
            <li key={item.id} className="ln-card ln-my-row ln-my-shelf-item">
              <div className="ln-my-row-main">
                <RefLink item={item} className="ln-my-row-title" />
                <span className="ln-small ln-muted">{item.ref} · {t(`my.shelf.kind.${item.kind}`)}</span>
              </div>
              <div className="ln-my-tags">
                {(item.tags || []).map(tg => <button key={tg} type="button" className="ln-my-tag" onClick={() => setTag(tg)}>{tg}</button>)}
                <TagInput item={item} t={t} />
              </div>
              <button type="button" className="ln-icon-button" aria-label={t('my.shelf.remove', { title: item.title })} onClick={() => { removeFromShelf(item.ref); toast(t('my.shelf.removed')); }}>×</button>
            </li>
          ))}
        </ul>
      )}

      <details className="ln-my-details">
        <summary>{t('my.shelf.addByRef')}</summary>
        <form className="ln-my-form" onSubmit={add}>
          <label>{t('my.form.ref')}<input className="ln-input" value={ref} onChange={e => setRef(e.target.value)} placeholder="Genesis 1:1" required /></label>
          <label>{t('my.form.tags')}<input className="ln-input" value={tags} onChange={e => setTags(e.target.value)} placeholder={t('my.form.tagsHint')} /></label>
          <button type="submit" className="ln-btn ln-btn-primary">{t('my.shelf.save')}</button>
        </form>
      </details>
    </div>
  );
}
