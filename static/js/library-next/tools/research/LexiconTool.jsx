/** Scholar: tap a Hebrew word of the selection (or type one) for dictionary entries. */
import React, { useMemo, useState } from 'react';
import { useT } from '../../i18n';
import { Link } from '../../router';
import { refToPath } from '../../reader/refKind';
import { wordsOf, lookupEntries } from '../lexiconApi';

export default function LexiconTool({ selection }) {
  const { t, lang } = useT();
  const segments = useMemo(() => (selection.segments || []).map(s => ({ ref: s.ref, label: lang === 'he' ? s.heLabel : s.label, words: wordsOf(s.he) })).filter(s => s.words.length), [selection, lang]);
  const [query, setQuery] = useState('');
  const [state, setState] = useState({ word: '', entries: null, loading: false });
  const lookup = (word, ref) => {
    if (!word) { return; }
    setState({ word, entries: null, loading: true });
    lookupEntries(word, ref).then(entries => setState(s => (s.word === word ? { word, entries, loading: false } : s)));
  };
  return (
    <div className="ln-tool-body ln-stack ln-lexicon">
      {segments.length ? (
        <div className="ln-lex-words" role="group" aria-label={t('research.lexicon.tap')}>
          <p className="ln-small ln-muted">{t('research.lexicon.tap')}</p>
          {segments.map(seg => (
            <p key={seg.ref} className="ln-lex-line ln-text-he" lang="he" dir="rtl">
              <span className="ln-lex-n">{seg.label}</span>
              {seg.words.map((w, i) => (
                <button key={i} type="button" className={`ln-lex-word ${state.word === w.lookup ? 'is-active' : ''}`} onClick={() => lookup(w.lookup, seg.ref)} lang="he">{w.display}</button>
              ))}
            </p>
          ))}
        </div>
      ) : <p className="ln-small ln-muted">{t('research.lexicon.noHebrew')}</p>}
      <form className="ln-row" onSubmit={e => { e.preventDefault(); lookup(query.trim(), selection.ref); }}>
        <input className="ln-input ln-lex-input" value={query} onChange={e => setQuery(e.target.value)} placeholder={t('research.lexicon.search')} aria-label={t('research.lexicon.search')} dir="rtl" lang="he" />
        <button type="submit" className="ln-btn" disabled={!query.trim()}>{t('research.lexicon.go')}</button>
      </form>
      {state.loading && <p className="ln-small ln-muted" role="status">{t('research.lexicon.loading', { word: state.word })}</p>}
      {state.entries && !state.entries.length && <p className="ln-muted" role="status">{t('research.lexicon.none', { word: state.word })}</p>}
      {state.entries && state.entries.length > 0 && (
        <ul className="ln-lex-entries">
          {state.entries.map(e => (
            <li key={e.id} className="ln-lex-entry">
              <div className="ln-row ln-lex-head">
                <strong className="ln-text-he ln-lex-headword" lang="he" dir="rtl">{e.headword}</strong>
                {e.morphology && <span className="ln-small ln-muted">{e.morphology}</span>}
                {e.transliteration && <span className="ln-small ln-muted">{e.transliteration}</span>}
                <span className="ln-lex-source ln-small">{e.lexicon}</span>
              </div>
              <ol className="ln-lex-senses">
                {e.senses.map((s, i) => <li key={i} className={`ln-lex-sense depth-${Math.min(s.depth, 2)}`} dangerouslySetInnerHTML={{ __html: `${s.number ? `${s.number}. ` : ''}${s.text}` }} />)}
              </ol>
              {e.refs.length > 0 && (
                <p className="ln-small ln-muted ln-lex-refs">{t('research.lexicon.refs')}: {e.refs.slice(0, 5).map((r, i) => <React.Fragment key={r}>{i ? ', ' : ''}<Link to={refToPath(r)}>{r}</Link></React.Fragment>)}</p>
              )}
            </li>
          ))}
        </ul>
      )}
      <p className="ln-small ln-muted">{t('research.lexicon.live')}</p>
    </div>
  );
}
