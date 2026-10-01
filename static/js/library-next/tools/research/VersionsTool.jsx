/**
 * Scholar: two versions of the passage side by side with a word-level diff; the comparison can
 * be saved to the research notebook (`addNotebookEntry` with the versions compared).
 */
import React, { useEffect, useMemo, useState } from 'react';
import Sefaria from '../../../sefaria/sefaria';
import { useT } from '../../i18n';
import { Link } from '../../router';
import { toast } from '../../overlays';
import { addNotebookEntry, citationFor } from '../../my/collections';
import { versionsFor, defaultPair, fetchVersionText, versionName } from './versionText';
import { diffTokens, diffSummary, splitSides } from './diff';

function Side({ tokens, lang, label }) {
  return (
    <div className={`ln-diff-side ${lang === 'he' ? 'ln-text-he' : 'ln-text-en'}`} lang={lang} dir={lang === 'he' ? 'rtl' : 'ltr'} aria-label={label}>
      {tokens.map((tok, i) => <React.Fragment key={i}><span className={`ln-diff-token ${tok.changed ? 'is-changed' : ''}`}>{tok.text}</span>{' '}</React.Fragment>)}
    </div>
  );
}

export default function VersionsTool({ selection, book }) {
  const { t, lang: uiLang } = useT();
  const [lang, setLang] = useState('he');
  const [extra, setExtra] = useState(null);
  const versions = useMemo(() => versionsFor(extra || book, lang), [book, extra, lang]);
  const [pair, setPair] = useState(['', '']);
  const [ignoreMarks, setIgnoreMarks] = useState(true);
  const [texts, setTexts] = useState({});
  const [saved, setSaved] = useState(false);
  useEffect(() => {
    if (versions.length > 1 || !book.sectionRef || extra) { return; }
    Sefaria.getVersions(book.sectionRef).then(v => setExtra(v || {})).catch(() => setExtra({}));
  }, [versions.length, book.sectionRef, extra]);
  useEffect(() => { setPair(defaultPair(versions, lang === 'he' ? book.heVersionTitle : book.versionTitle)); }, [versions, lang, book.heVersionTitle, book.versionTitle]);
  useEffect(() => { setTexts({}); setSaved(false); }, [selection.ref, lang]);
  useEffect(() => {
    let live = true;
    pair.filter(title => title && !texts[title]).forEach(title => {
      setTexts(s => ({ ...s, [title]: { loading: true } }));
      fetchVersionText(selection.ref, title, lang)
        .then(r => { if (live) { setTexts(s => ({ ...s, [title]: { text: r.text, lines: r.lines } })); } })
        .catch(() => { if (live) { setTexts(s => ({ ...s, [title]: { text: '', lines: [], error: true } })); } });
    });
    return () => { live = false; };
  }, [pair, selection.ref, lang]);   // eslint-disable-line react-hooks/exhaustive-deps
  const [a, b] = pair;
  const ta = texts[a], tb = texts[b];
  const ready = ta && tb && !ta.loading && !tb.loading;
  const ops = useMemo(() => (ready ? diffTokens(ta.text, tb.text, { ignoreMarks }) : []), [ready, ta, tb, ignoreMarks]);
  const summary = diffSummary(ops);
  const sides = splitSides(ops);
  const save = () => {
    const entry = addNotebookEntry({
      ref: selection.ref, title: selection.ref, heTitle: selection.heRef, versions: [a, b],
      text: t('research.versions.entry', { a, b, ins: summary.insertions, del: summary.deletions }),
      citation: citationFor(selection.ref, { versionTitle: `${a} / ${b}` }),
    });
    setSaved(!!entry);
    toast(t('research.versions.saved'));
  };
  const select = (value, which) => setPair(which === 0 ? [value, b] : [a, value]);
  const name = title => versionName(versions.find(v => v.versionTitle === title), uiLang) || title;
  return (
    <div className="ln-tool-body ln-stack ln-versions">
      <div className="ln-row">
        <div className="ln-segmented compact" role="radiogroup" aria-label={t('research.versions.lang')}>
          {['he', 'en'].map(l => (
            <button key={l} type="button" role="radio" aria-checked={lang === l} className={`ln-segment ${lang === l ? 'active' : ''}`} onClick={() => setLang(l)}>{t(`research.versions.lang.${l}`)}</button>
          ))}
        </div>
        <label className="ln-row ln-small"><input type="checkbox" checked={ignoreMarks} onChange={e => setIgnoreMarks(e.target.checked)} /> {t('research.versions.ignoreMarks')}</label>
      </div>
      {!versions.length && <p className="ln-muted">{extra || book.data ? t('research.versions.none') : t('research.versions.loading')}</p>}
      {versions.length === 1 && <p className="ln-muted">{t('research.versions.tooFew')}</p>}
      {versions.length > 1 && (
        <>
          <div className="ln-compare-grid" style={{ '--cols': 2 }}>
            {[a, b].map((title, which) => (
              <label key={which} className="ln-field">
                <span className="ln-field-label">{t(which === 0 ? 'research.versions.a' : 'research.versions.b')}</span>
                <select className="ln-input" value={title} onChange={e => select(e.target.value, which)}>
                  {versions.map(v => <option key={v.versionTitle} value={v.versionTitle}>{versionName(v, uiLang)}</option>)}
                </select>
              </label>
            ))}
          </div>
          {!ready && <p className="ln-small ln-muted">{t('research.versions.loading')}</p>}
          {ready && (
            <>
              <p className="ln-small ln-muted ln-diff-summary">
                {summary.insertions + summary.deletions === 0 && !ta.error && !tb.error
                  ? t('research.versions.identical')
                  : t('research.versions.summary', { ins: summary.insertions, del: summary.deletions, pct: Math.round(summary.changed * 100) })}
                {' '}<span className="ln-diff-legend"><span className="ln-diff-token is-changed ln-diff-del">{t('research.versions.legendDel')}</span> <span className="ln-diff-token is-changed ln-diff-ins">{t('research.versions.legendIns')}</span></span>
              </p>
              <div className="ln-compare-grid ln-diff-grid" style={{ '--cols': 2 }}>
                <section className="ln-compare-col ln-diff-a">
                  <h3 className="ln-compare-title">{name(a)}</h3>
                  {ta.lines.length ? <Side tokens={sides.a} lang={lang} label={name(a)} /> : <p className="ln-small ln-muted">{t('research.versions.empty')}</p>}
                </section>
                <section className="ln-compare-col ln-diff-b">
                  <h3 className="ln-compare-title">{name(b)}</h3>
                  {tb.lines.length ? <Side tokens={sides.b} lang={lang} label={name(b)} /> : <p className="ln-small ln-muted">{t('research.versions.empty')}</p>}
                </section>
              </div>
              <div className="ln-row">
                <button type="button" className="ln-btn ln-btn-primary" onClick={save} disabled={saved}>{t('research.versions.save')}</button>
                {saved && <Link to="/my/notebook" className="ln-btn ln-btn-quiet">{t('research.versions.openNotebook')}</Link>}
              </div>
            </>
          )}
        </>
      )}
    </div>
  );
}
