/**
 * Educator: three templated discussion questions for the selection (my-library's `questions`
 * templates, by primary category), editable, added to a lesson with `addQuestion`, or handed to
 * the assistant with the segment quoted.
 */
import React, { useMemo, useState } from 'react';
import { useT } from '../../i18n';
import { toast } from '../../overlays';
import { addQuestion } from '../../my/collections';
import { generateQuestions } from '../../my/questions';
import { Simulated } from '../../my/bits';
import { requestAssistant } from '../../assistant/events';
import { copyToClipboard } from '../../reader/ReaderHeader';
import { discussionPrompt } from './discussion';
import LessonPicker, { useLessonChoice } from './LessonPicker';

export default function DiscussionTool({ selection, book }) {
  const { t, lang } = useT();
  const { items, id, setId, lesson } = useLessonChoice();
  const [offset, setOffset] = useState(0);
  const [edits, setEdits] = useState({});
  const generated = useMemo(() => generateQuestions(book.primaryCategory, selection.ref, { count: 3, offset }), [book.primaryCategory, selection.ref, offset]);
  const other = lang === 'he' ? 'en' : 'he';
  const questions = generated.map((q, i) => {
    const key = `${offset}:${i}`;
    const text = key in edits ? edits[key] : q[lang];
    return { key, text, value: { [lang]: text, [other]: key in edits ? text : q[other] } };
  });
  const addOne = (q, i) => {
    if (!lesson || !q.text.trim()) { return; }
    addQuestion(lesson.id, q.value);
    toast(t('teach.discussion.addedOne', { title: lesson.title }));
  };
  const addAll = () => {
    if (!lesson) { return; }
    const kept = questions.filter(q => q.text.trim());
    kept.forEach(q => addQuestion(lesson.id, q.value));
    toast(t('teach.discussion.added', { n: kept.length, title: lesson.title }));
  };
  const ask = () => requestAssistant(discussionPrompt({ selection, book, lang, current: questions.map(q => q.text) }));
  const copy = async () => {
    const ok = await copyToClipboard(questions.map((q, i) => `${i + 1}. ${q.text}`).join('\n'));
    toast(t(ok ? 'teach.discussion.copied' : 'teach.handout.copyFailed'));
  };
  return (
    <div className="ln-tool-body ln-stack ln-discussion">
      <div className="ln-row">
        <Simulated>{t('teach.discussion.templated')}</Simulated>
        <button type="button" className="ln-btn ln-btn-quiet" onClick={() => setOffset(n => n + 3)}>{t('teach.discussion.more')}</button>
      </div>
      <ol className="ln-q-list">
        {questions.map((q, i) => (
          <li key={q.key} className="ln-q-item">
            <textarea className="ln-input ln-q-text" rows={2} value={q.text} aria-label={t('teach.discussion.edit', { n: i + 1 })} dir="auto"
                      onChange={e => setEdits({ ...edits, [q.key]: e.target.value })} />
            <button type="button" className="ln-icon-button ln-q-add" aria-label={t('teach.discussion.addOne', { n: i + 1 })} title={t('teach.discussion.addOne', { n: i + 1 })}
                    disabled={!lesson} onClick={() => addOne(q, i)}>+</button>
          </li>
        ))}
      </ol>
      <LessonPicker items={items} value={id} onChange={setId} />
      <div className="ln-row">
        <button type="button" className="ln-btn ln-btn-primary" disabled={!lesson} onClick={addAll}>{t('teach.discussion.addAll')}</button>
        <button type="button" className="ln-btn" onClick={copy}>{t('teach.discussion.copy')}</button>
      </div>
      <button type="button" className="ln-btn ln-ask-assistant" onClick={ask}>{t('teach.discussion.ask')}</button>
    </div>
  );
}
