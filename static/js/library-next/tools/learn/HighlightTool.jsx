/**
 * Highlight (learner): one of four colours on every selected segment, written through
 * `addHighlight` (one row per segment so each renders exactly). Existing highlights on the
 * selection can be removed. Rendering is the decorator in highlights.js.
 */
import React, { useState } from 'react';
import { useT } from '../../i18n';
import { toast } from '../../overlays';
import { useContentLang } from '../../contentLang';
import { useCollection } from '../../store';
import { addHighlight, collection, collectionOptions } from '../../my/collections';
import { plainText } from '../../reader/textData';
import { HIGHLIGHT_COLORS, highlightsFor } from './highlights';

export default function HighlightTool({ selection, book, close }) {
  const { t } = useT();
  const [contentLang] = useContentLang();
  useCollection('highlights', collectionOptions('highlights'));
  const [color, setColor] = useState('yellow');
  const refs = selection.segments.map(s => s.ref);
  const existing = highlightsFor(refs);
  const apply = () => {
    selection.segments.forEach(seg => {
      const html = contentLang === 'he' ? (seg.he || seg.en) : (seg.en || seg.he);
      addHighlight(seg.ref, color, { text: plainText(html), book: book.title });
    });
    toast(t('learn.highlight.saved'));
    close();
  };
  const remove = () => {
    const col = collection('highlights');
    existing.forEach(h => col.remove(h.id));
    toast(t('learn.highlight.removed'));
  };
  return (
    <div className="ln-tool-body ln-stack ln-learn">
      <div className="ln-learn-swatches" role="radiogroup" aria-label={t('learn.highlight.color')}>
        {HIGHLIGHT_COLORS.map(c => (
          <button key={c} type="button" role="radio" aria-checked={color === c} aria-label={t(`learn.highlight.${c}`)}
                  className={`ln-learn-swatch ${color === c ? 'is-active' : ''}`} data-color={c} onClick={() => setColor(c)} />
        ))}
        <span className="ln-small ln-muted">{t(`learn.highlight.${color}`)}</span>
      </div>
      <div className="ln-row">
        <button type="button" className="ln-btn ln-btn-primary" onClick={apply}>
          {refs.length === 1 ? t('learn.highlight.applyOne') : t('learn.highlight.apply', { n: refs.length })}
        </button>
        {existing.length > 0 && <button type="button" className="ln-btn" onClick={remove}>{t('learn.remove')}</button>}
      </div>
      {existing.length > 0 && <p className="ln-small ln-muted">{t('learn.highlight.existing')}</p>}
      <p className="ln-small ln-muted">{t('learn.local')}</p>
    </div>
  );
}
