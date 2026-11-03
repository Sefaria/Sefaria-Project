/**
 * Educator: a print-ready bilingual card for the selection. Copy as HTML / Markdown, or open a
 * minimal print page. The grade level is a simulated tag (type size + translation-style note).
 */
import React, { useState } from 'react';
import { useT } from '../../i18n';
import { toast } from '../../overlays';
import { useKv } from '../../store';
import { useContentLang } from '../../contentLang';
import { Simulated } from '../../my/bits';
import { copyToClipboard } from '../../reader/ReaderHeader';
import { GRADE_LEVELS, HANDOUT_CSS, handoutModel, handoutHtml, handoutMarkdown, openPrintView } from './handout';

const LINE_OPTIONS = [0, 3, 5, 8];

export default function HandoutTool({ selection, book }) {
  const { t, lang } = useT();
  const [contentLang] = useContentLang();
  const [vowels] = useKv('reader.vowels', true);
  const [cantillation] = useKv('reader.cantillation', true);
  const [grade, setGrade] = useState('high');
  const [lines, setLines] = useState(0);
  const model = handoutModel({ selection, book, grade, contentLang, vowels, cantillation });
  const strings = {
    source: t('teach.handout.source'), translation: t('teach.handout.translation'), from: t('teach.handout.from'),
    gradeNote: t(`teach.handout.note.${grade}`), notesLabel: t('teach.handout.notesLabel'),
  };
  const copy = async (text) => {
    const ok = await copyToClipboard(text);
    toast(t(ok ? 'teach.handout.copied' : 'teach.handout.copyFailed'));
  };
  const print = () => {
    const w = openPrintView(handoutHtml(model, strings, { document: true, lang, writingLines: lines }));
    if (!w) { toast(t('teach.handout.popup')); }
  };
  return (
    <div className="ln-tool-body ln-stack ln-handout-tool">
      <div className="ln-row">
        <span className="ln-small ln-muted">{t('teach.handout.grade')}</span>
        <div className="ln-segmented compact" role="radiogroup" aria-label={t('teach.handout.grade')}>
          {GRADE_LEVELS.map(g => (
            <button key={g} type="button" role="radio" aria-checked={grade === g} className={`ln-segment ${grade === g ? 'active' : ''}`} onClick={() => setGrade(g)}>
              {t(`teach.handout.grade.${g}`)}
            </button>
          ))}
        </div>
        <Simulated />
      </div>
      <label className="ln-row ln-small">
        <span className="ln-muted">{t('teach.handout.lines')}</span>
        <select className="ln-input ln-input-compact" value={lines} onChange={e => setLines(Number(e.target.value))} aria-label={t('teach.handout.lines')}>
          {LINE_OPTIONS.map(n => <option key={n} value={n}>{n}</option>)}
        </select>
      </label>
      <div className="ln-handout-preview" aria-label={t('teach.handout.preview')}>
        <style>{HANDOUT_CSS}</style>
        <div dangerouslySetInnerHTML={{ __html: handoutHtml(model, strings, { lang }) }} />
      </div>
      <div className="ln-row">
        <button type="button" className="ln-btn ln-btn-primary" onClick={print}>{t('teach.handout.print')}</button>
        <button type="button" className="ln-btn" onClick={() => copy(handoutHtml(model, strings, { lang }))}>{t('teach.handout.copyHtml')}</button>
        <button type="button" className="ln-btn" onClick={() => copy(handoutMarkdown(model, strings))}>{t('teach.handout.copyMd')}</button>
      </div>
    </div>
  );
}
