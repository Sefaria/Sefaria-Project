/**
 * Vocabulary (learner): the Hebrew words of the selection as chips; tapping one looks it up in
 * the dictionaries (lexiconApi.js → /api/words) and shows the definitions, each addable as a
 * flashcard (`addFlashcard(headword, definition)`).
 */
import React, { useEffect, useMemo, useState } from 'react';
import { useT } from '../../i18n';
import { toast } from '../../overlays';
import { useKv } from '../../store';
import { addFlashcard } from '../../my/collections';
import { stripHebrewMarks } from '../../reader/textData';
import { hebrewWords, lookupWord } from './lexiconApi';

export default function VocabTool({ selection }) {
  const { t } = useT();
  const [vowels] = useKv('reader.vowels', true);
  const words = useMemo(() => hebrewWords(selection.he), [selection.he]);
  const [word, setWord] = useState(null);
  const [state, setState] = useState({ status: 'idle', entries: [] });
  useEffect(() => {
    if (!word) { return undefined; }
    let live = true;
    setState({ status: 'loading', entries: [] });
    lookupWord(word, selection.segments[0] && selection.segments[0].ref)
      .then(entries => { if (live) { setState({ status: entries.length ? 'ready' : 'empty', entries }); } })
      .catch(() => { if (live) { setState({ status: 'error', entries: [] }); } });
    return () => { live = false; };
  }, [word]);   // eslint-disable-line react-hooks/exhaustive-deps
  const addCard = (entry, sense) => {
    addFlashcard(entry.headword, sense, { ref: selection.ref });
    toast(t('learn.vocab.cardAdded'));
  };
  const show = w => stripHebrewMarks(w, { vowels, cantillation: false });
  if (!words.length) {
    return <div className="ln-tool-body ln-stack ln-learn"><p className="ln-muted">{t('learn.vocab.noHebrew')}</p></div>;
  }
  return (
    <div className="ln-tool-body ln-stack ln-learn">
      <p className="ln-small ln-muted">{t('learn.vocab.hint')}</p>
      <div className="ln-learn-chips ln-text-he" role="listbox" aria-label={t('learn.vocab.words')} dir="rtl">
        {words.map(w => (
          <button key={w} type="button" role="option" aria-selected={word === w} lang="he" className={`ln-learn-chip ${word === w ? 'is-active' : ''}`} onClick={() => setWord(w)}>{show(w)}</button>
        ))}
      </div>
      {state.status === 'loading' && <p className="ln-small ln-muted" role="status">{t('learn.loading')}</p>}
      {state.status === 'empty' && <p className="ln-muted">{t('learn.vocab.none', { word: show(word) })}</p>}
      {state.status === 'error' && <p className="ln-muted" role="alert">{t('learn.vocab.error')}</p>}
      {state.status === 'ready' && (
        <ul className="ln-learn-entries">
          {state.entries.map((entry, i) => (
            <li key={`${entry.lexicon}-${i}`} className="ln-learn-entry">
              <div className="ln-learn-entry-head">
                <strong className="ln-text-he" lang="he" dir="rtl">{entry.headword}</strong>
                {entry.transliteration && <span className="ln-small ln-muted">{entry.transliteration}</span>}
                {entry.morphology && <span className="ln-small ln-muted">{entry.morphology}</span>}
              </div>
              <ol className="ln-learn-senses">
                {entry.senses.slice(0, 4).map((s, j) => (
                  <li key={j} className="ln-learn-sense">
                    <span>{s}</span>
                    <button type="button" className="ln-btn ln-btn-quiet ln-learn-sense-add" onClick={() => addCard(entry, s)}>{t('learn.vocab.addCard')}</button>
                  </li>
                ))}
              </ol>
              <p className="ln-small ln-muted">{t('learn.vocab.source', { lexicon: entry.lexicon })}</p>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
