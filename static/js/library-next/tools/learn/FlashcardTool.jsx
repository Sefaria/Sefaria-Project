/**
 * Flashcard (learner): front = the Hebrew or the ref, back = the English or your own answer,
 * saved through `addFlashcard`. "Quiz me" adds three deterministic cloze cards built from the
 * passage (cloze.js).
 */
import React, { useState } from 'react';
import { useT } from '../../i18n';
import { Link } from '../../router';
import { toast } from '../../overlays';
import { useKv } from '../../store';
import { useContentLang } from '../../contentLang';
import { addFlashcard } from '../../my/collections';
import { selectionText } from '../../reader/textData';
import { clozeCards } from './cloze';

export default function FlashcardTool({ selection, book }) {
  const { t, lang } = useT();
  const [contentLang] = useContentLang();
  const [vowels] = useKv('reader.vowels', true);
  const text = selectionText(selection.segments, { vowels, cantillation: false });
  const [front, setFront] = useState(text.he ? 'he' : 'ref');
  const [back, setBack] = useState(text.en ? 'en' : 'own');
  const [own, setOwn] = useState('');
  const [quiz, setQuiz] = useState(null);
  const ref = lang === 'he' ? selection.heRef : selection.ref;
  const frontText = front === 'he' ? text.he : ref;
  const backText = back === 'en' ? text.en : own.trim();
  const add = (e) => {
    e.preventDefault();
    if (!frontText || !backText) { return; }
    addFlashcard(frontText, backText, { ref: selection.ref });
    toast(t('learn.flashcard.added'));
  };
  const quizMe = () => {
    const source = contentLang === 'he' || !text.en ? text.he : text.en;
    const cards = clozeCards(source, { count: 3 });
    cards.forEach(c => addFlashcard(c.front, c.back, { ref: selection.ref }));
    setQuiz(cards);
    toast(cards.length ? t('learn.flashcard.quizAdded', { n: cards.length }) : t('learn.flashcard.quizNone'));
  };
  const choice = (name, value, set, options) => (
    <div className="ln-field">
      <span className="ln-field-label">{t(`learn.flashcard.${name}`)}</span>
      <div className="ln-segmented compact" role="radiogroup" aria-label={t(`learn.flashcard.${name}`)}>
        {options.map(o => (
          <button key={o} type="button" role="radio" aria-checked={value === o} className={`ln-segment ${value === o ? 'active' : ''}`} onClick={() => set(o)}>{t(`learn.flashcard.${name}.${o}`)}</button>
        ))}
      </div>
    </div>
  );
  return (
    <div className="ln-tool-body ln-stack ln-learn">
      <form className="ln-stack" onSubmit={add}>
        {choice('front', front, setFront, ['he', 'ref'])}
        {choice('back', back, setBack, ['en', 'own'])}
        {back === 'own' && <textarea className="ln-input ln-learn-textarea" name="own" rows={3} value={own} placeholder={t('learn.flashcard.ownPlaceholder')} onChange={e => setOwn(e.target.value)} dir="auto" />}
        <div className="ln-learn-card" aria-label={t('learn.flashcard.label')}>
          <div className={`ln-learn-card-face ${front === 'he' ? 'ln-text-he' : ''}`} dir="auto">{frontText}</div>
          <div className="ln-learn-card-face ln-learn-card-back" dir="auto">{backText || <span className="ln-muted">{t('learn.flashcard.ownPlaceholder')}</span>}</div>
        </div>
        <div className="ln-row">
          <button type="submit" className="ln-btn ln-btn-primary" disabled={!frontText || !backText}>{t('learn.flashcard.add')}</button>
          <button type="button" className="ln-btn" onClick={quizMe}>{t('learn.flashcard.quiz')}</button>
          <Link to="/my/flashcards" className="ln-btn ln-btn-quiet">{t('learn.flashcard.review')}</Link>
        </div>
        <p className="ln-small ln-muted">{t('learn.flashcard.quizHint')}</p>
      </form>
      {quiz && quiz.length > 0 && (
        <ol className="ln-learn-quiz">
          {quiz.map((c, i) => (
            <li key={i} className="ln-learn-quiz-card" dir="auto">
              <span>{c.front}</span>
              <span className="ln-small ln-muted">{t('learn.flashcard.answer', { word: c.back })}</span>
            </li>
          ))}
        </ol>
      )}
      <p className="ln-small ln-muted">{t('learn.local')}</p>
    </div>
  );
}
