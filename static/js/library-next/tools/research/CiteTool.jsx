/**
 * Copy / cite. Scholars get Chicago, MLA and BibTeX with the version and access date, selection
 * export (JSON / CSV) and "Save to notebook"; every other persona keeps the reader's built-in tool.
 * Registered under the built-in id `cite` for all personas, so the toolbelt shows one entry.
 */
import React, { useState } from 'react';
import { useT } from '../../i18n';
import { Link } from '../../router';
import { toast } from '../../overlays';
import { usePersona } from '../../persona';
import { useContentLang } from '../../contentLang';
import { useKv } from '../../store';
import { addNotebookEntry } from '../../my/collections';
import { download } from '../../my/exportFormats';
import { selectionText } from '../../reader/textData';
import { copyToClipboard } from '../../reader/ReaderHeader';
import { CiteTool as BuiltinCiteTool } from '../../reader/tools/builtin';
import { CITE_STYLES, formatCitation, selectionRows, rowsToCSV, rowsToJSON, fileStem } from './cite';

export function ScholarCiteTool({ selection, book }) {
  const { t, lang } = useT();
  const [contentLang] = useContentLang();
  const [vowels] = useKv('reader.vowels', true);
  const [cantillation] = useKv('reader.cantillation', true);
  const [style, setStyle] = useState('chicago');
  const [saved, setSaved] = useState(false);
  const versionTitle = contentLang === 'he' ? book.heVersionTitle : contentLang === 'en' ? book.versionTitle : [book.heVersionTitle, book.versionTitle].filter(Boolean).join(' / ');
  const common = { ref: selection.ref, book: book.title, versionTitle, lang, accessedWord: t('research.cite.accessed') };
  const cite = formatCitation({ ...common, style });
  const text = selectionText(selection.segments, { vowels, cantillation });
  const body = contentLang === 'he' ? (text.he || text.en) : contentLang === 'en' ? (text.en || text.he) : [text.he, text.en].filter(Boolean).join('\n\n');
  const copy = async (s) => { const ok = await copyToClipboard(s); toast(t(ok ? 'research.cite.copied' : 'research.cite.copyFailed')); };
  const rows = () => selectionRows(selection, book, { vowels, cantillation });
  const exportAs = (kind) => {
    const stem = fileStem(selection.ref);
    const ok = kind === 'csv' ? download(`${stem}.csv`, rowsToCSV(rows()), 'text/csv') : download(`${stem}.json`, rowsToJSON(rows(), { ref: selection.ref, citation: cite }), 'application/json');
    toast(t(ok ? 'research.cite.exported' : 'research.cite.copyFailed'));
  };
  const save = () => {
    addNotebookEntry({ ref: selection.ref, title: selection.ref, heTitle: selection.heRef, text: body, versions: [book.heVersionTitle, book.versionTitle].filter(Boolean), citation: cite });
    setSaved(true);
    toast(t('research.cite.saved'));
  };
  return (
    <div className="ln-tool-body ln-stack ln-cite-export">
      <div className="ln-row">
        <span className="ln-small ln-muted">{t('research.cite.style')}</span>
        <div className="ln-segmented compact" role="radiogroup" aria-label={t('research.cite.style')}>
          {CITE_STYLES.map(s => (
            <button key={s} type="button" role="radio" aria-checked={style === s} className={`ln-segment ${style === s ? 'active' : ''}`} onClick={() => setStyle(s)}>{t(`research.cite.style.${s}`)}</button>
          ))}
        </div>
      </div>
      <pre className="ln-cite-preview ln-cite-block" dir={style === 'bibtex' ? 'ltr' : 'auto'}>{cite}</pre>
      {versionTitle && <p className="ln-small ln-muted">{t('research.cite.version', { v: versionTitle })}</p>}
      <div className="ln-row">
        <button type="button" className="ln-btn ln-btn-primary" onClick={() => copy(cite)}>{t('research.cite.copy')}</button>
        <button type="button" className="ln-btn" onClick={() => copy(CITE_STYLES.map(s => formatCitation({ ...common, style: s })).join('\n\n'))}>{t('research.cite.copyAll')}</button>
        <button type="button" className="ln-btn" onClick={() => copy(`${body}\n\n${cite}`)}>{t('research.cite.copyText')}</button>
      </div>
      <div className="ln-row">
        <span className="ln-small ln-muted">{t('research.cite.export')}</span>
        <button type="button" className="ln-btn" onClick={() => exportAs('json')}>{t('research.cite.json')}</button>
        <button type="button" className="ln-btn" onClick={() => exportAs('csv')}>{t('research.cite.csv')}</button>
        <button type="button" className="ln-btn" onClick={save} disabled={saved}>{t('research.cite.notebook')}</button>
        {saved && <Link to="/my/notebook" className="ln-btn ln-btn-quiet">{t('research.versions.openNotebook')}</Link>}
      </div>
      <p className="ln-cite-text" dir="auto">{body}</p>
    </div>
  );
}

export default function CiteTool(props) {
  const { persona } = usePersona();
  return persona === 'scholar' ? <ScholarCiteTool {...props} /> : <BuiltinCiteTool {...props} />;
}
