/**
 * Educator lessons: `/my/lessons` (list), `/my/lessons/new`, `/my/lessons/<id>` (editor),
 * `/my/lessons/<id>/handout` (print view) and `/my/lessons/shared#<data>` (a lesson carried in
 * the URL hash: works offline, no account).
 */
import React, { useEffect, useState } from 'react';
import { useT } from '../i18n';
import { Link, navigate } from '../router';
import { useCollection } from '../store';
import { toast } from '../overlays';
import { collection, collectionOptions, createLesson, updateLesson, addSourceToLesson, classCode } from './collections';
import { generateQuestions, assistantPrompt } from './questions';
import { lessonShareUrl, decodeShare, shareToLesson } from './share';
import { askAssistant } from './assistant';
import { fetchPreview } from './data';
import { RefLink, BiText, Empty, ConfirmButton, Simulated, formatDate, copyText, hasHebrew } from './bits';
import InboxCard from './InboxCard';
import { INBOX, topicSourceRefs, lessonSourceFor } from './inbox';

const questionText = (q, lang) => (lang === 'he' ? q.he || q.en : q.en || q.he);

async function share(lesson, t) {
  const url = lessonShareUrl(lesson);
  if (await copyText(url)) { toast(t('my.lessons.linkCopied')); return null; }
  return url;
}

/**
 * Fold a lesson inbox item into `lesson` (or the newest / a new one): a ref becomes one source with
 * its text, a topic its notable sources. Resolves to the number of sources added.
 */
export async function drainLessonItem(item, { t, lang, lessonId }) {
  const refs = item.ref ? [item.ref] : await topicSourceRefs(item.topic, { lang, limit: 3 });
  if (!refs.length) { return 0; }
  const lessons = collection('lessons');   // read now: "add all" drains several in a row
  let target = (lessonId && lessons.get(lessonId)) || lessons.list()[0] || createLesson({ title: t('my.inbox.lessonTitle') });
  let added = 0;
  for (const ref of refs) {
    if (target.sources.some(s => s.ref === ref)) { continue; }
    const source = await lessonSourceFor(ref, { heRef: item.ref ? item.heRef : '' });   // eslint-disable-line no-await-in-loop
    target = addSourceToLesson(target.id, source) || target;
    added += 1;
  }
  return added || refs.length;   // already in the lesson: still drained
}

// ---- list ---------------------------------------------------------------------------------------

export function LessonsPage() {
  const { t, lang } = useT();
  const { items, remove } = useCollection('lessons', collectionOptions('lessons'));
  const [shown, setShown] = useState(null);
  return (
    <div className="ln-my-lessons">
      <div className="ln-row">
        <Link className="ln-btn ln-btn-primary" to="/my/lessons/new">{t('my.lessons.new')}</Link>
      </div>
      <InboxCard inboxKey={INBOX.lesson} hintKey="my.inbox.hint.lesson" addLabelKey="my.inbox.addToLesson" onAdd={item => drainLessonItem(item, { t, lang })} />
      {items.length === 0 ? (
        <Empty>{t('my.lessons.empty')}</Empty>
      ) : (
        <ul className="ln-my-list">
          {items.map(l => (
            <li key={l.id} className="ln-card ln-my-lesson">
              <div className="ln-my-row">
                <Link to={`/my/lessons/${l.id}`} className={`ln-my-row-title ${hasHebrew(l.title) ? 'ln-text-he-ui' : ''}`}>{l.title}</Link>
                <span className="ln-small ln-muted">{t('my.lessons.meta', { sources: l.sources.length, questions: l.questions.length })} · {formatDate(l.ts, lang)}</span>
              </div>
              <div className="ln-row ln-my-actions">
                <Link className="ln-btn" to={`/my/lessons/${l.id}`}>{t('my.edit')}</Link>
                <Link className="ln-btn" to={`/my/lessons/${l.id}/handout`}>{t('my.lessons.handout')}</Link>
                <button type="button" className="ln-btn" onClick={async () => setShown(await share(l, t))}>{t('my.lessons.share')}</button>
                <ConfirmButton onConfirm={() => remove(l.id)}>{t('my.delete')}</ConfirmButton>
              </div>
              {shown && shown.includes(`#`) && <input className="ln-input ln-my-share-url" readOnly value={shown} onFocus={e => e.target.select()} aria-label={t('my.lessons.shareUrl')} />}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

// ---- editor -------------------------------------------------------------------------------------

function NewLesson({ t }) {
  const [title, setTitle] = useState('');
  const submit = (e) => {
    e.preventDefault();
    try { const lesson = createLesson({ title }); navigate(`/my/lessons/${lesson.id}`, { replace: true }); } catch (err) { toast(t('my.lessons.needTitle')); }
  };
  return (
    <form className="ln-card ln-my-form" onSubmit={submit}>
      <h2 className="ln-section-title">{t('my.lessons.new')}</h2>
      <label>{t('my.lessons.title')}<input className="ln-input" value={title} onChange={e => setTitle(e.target.value)} placeholder={t('my.lessons.titleHint')} required autoFocus /></label>
      <div className="ln-row">
        <button type="submit" className="ln-btn ln-btn-primary">{t('my.lessons.create')}</button>
        <Link className="ln-btn ln-btn-quiet" to="/my/lessons">{t('my.cancel')}</Link>
      </div>
    </form>
  );
}

function SourceRow({ lesson, source, index, t }) {
  const [note, setNote] = useState(source.note || '');
  const sources = lesson.sources;
  const setSources = (next) => updateLesson(lesson.id, { sources: next });
  const move = (dir) => {
    const next = [...sources];
    const j = index + dir;
    if (j < 0 || j >= next.length) { return; }
    [next[index], next[j]] = [next[j], next[index]];
    setSources(next);
  };
  return (
    <li className="ln-card ln-my-source">
      <div className="ln-my-row">
        <RefLink item={source} className="ln-my-row-title" />
        <span className="ln-row ln-my-source-tools">
          <button type="button" className="ln-icon-button" aria-label={t('my.lessons.moveUp')} disabled={index === 0} onClick={() => move(-1)}>↑</button>
          <button type="button" className="ln-icon-button" aria-label={t('my.lessons.moveDown')} disabled={index === sources.length - 1} onClick={() => move(1)}>↓</button>
          <button type="button" className="ln-icon-button" aria-label={t('my.lessons.removeSource', { ref: source.ref })} onClick={() => setSources(sources.filter(s => s.id !== source.id))}>×</button>
        </span>
      </div>
      <BiText he={source.he} en={source.en} compact />
      <input className="ln-input ln-my-source-note" value={note} onChange={e => setNote(e.target.value)} placeholder={t('my.lessons.sourceNote')} aria-label={t('my.lessons.sourceNote')}
             onBlur={() => { if (note !== (source.note || '')) { setSources(sources.map(s => (s.id === source.id ? { ...s, note } : s))); } }} />
    </li>
  );
}

export function LessonEditor({ lessonId, isNew = false }) {
  const { t, lang } = useT();
  const { get } = useCollection('lessons', collectionOptions('lessons'));
  const lesson = lessonId ? get(lessonId) : null;
  const [title, setTitle] = useState(lesson ? lesson.title : '');
  const [notes, setNotes] = useState(lesson ? lesson.handoutNotes : '');
  const [ref, setRef] = useState('');
  const [custom, setCustom] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [offset, setOffset] = useState(0);
  const [shareUrl, setShareUrl] = useState(null);
  useEffect(() => { if (lesson) { setTitle(lesson.title); setNotes(lesson.handoutNotes); } }, [lessonId]);   // eslint-disable-line react-hooks/exhaustive-deps

  if (isNew) { return <NewLesson t={t} />; }
  if (!lesson) {
    return <Empty action={<Link className="ln-btn" to="/my/lessons">{t('my.nav.lessons')}</Link>}>{t('my.lessons.notFound')}</Empty>;
  }

  const addSource = async (e) => {
    e.preventDefault();
    setBusy(true); setError('');
    try {
      const p = await fetchPreview(ref.trim());
      addSourceToLesson(lesson.id, { ref: p.ref, title: p.ref, heTitle: p.heRef, he: p.he, en: p.en, category: p.category });
      setRef('');
    } catch (err) {
      setError(t('my.lessons.refNotFound', { ref: ref.trim() }));
    } finally {
      setBusy(false);
    }
  };
  const suggest = () => {
    const first = lesson.sources[0];
    const generated = generateQuestions(first ? first.category : '', first ? first.ref : lesson.title, { count: 3, offset });
    updateLesson(lesson.id, { questions: [...lesson.questions, ...generated] });
    setOffset(n => n + 3);
  };
  const addCustom = (e) => {
    e.preventDefault();
    if (!custom.trim()) { return; }
    updateLesson(lesson.id, { questions: [...lesson.questions, lang === 'he' ? { he: custom, en: '' } : { en: custom, he: '' }] });
    setCustom('');
  };
  const code = classCode(lesson.id);

  return (
    <div className="ln-my-editor">
      <div className="ln-my-editor-head">
        <label className="ln-my-title-field">
          <span className="ln-sr-only">{t('my.lessons.title')}</span>
          <input className="ln-input ln-my-title-input" value={title} onChange={e => setTitle(e.target.value)} onBlur={() => { if (title.trim() && title !== lesson.title) { updateLesson(lesson.id, { title }); } }} aria-label={t('my.lessons.title')} />
        </label>
        <div className="ln-row">
          <Link className="ln-btn" to={`/my/lessons/${lesson.id}/handout`}>{t('my.lessons.handout')}</Link>
          <button type="button" className="ln-btn" onClick={async () => setShareUrl(await share(lesson, t))}>{t('my.lessons.share')}</button>
          <span className="ln-my-code" title={t('my.lessons.classCodeHint')}>{t('my.lessons.classCode')} <code>{code}</code> <Simulated /></span>
        </div>
        {shareUrl && <input className="ln-input ln-my-share-url" readOnly value={shareUrl} onFocus={e => e.target.select()} aria-label={t('my.lessons.shareUrl')} />}
        <p className="ln-small ln-muted">{t('my.lessons.shareHint')}</p>
      </div>

      <section className="ln-my-section" aria-labelledby="lesson-sources">
        <h2 id="lesson-sources" className="ln-section-title">{t('my.lessons.sources')} <span className="ln-small ln-muted">({lesson.sources.length})</span></h2>
        {lesson.sources.length ? (
          <ul className="ln-my-list">{lesson.sources.map((s, i) => <SourceRow key={s.id} lesson={lesson} source={s} index={i} t={t} />)}</ul>
        ) : <Empty>{t('my.lessons.noSources')}</Empty>}
        <InboxCard inboxKey={INBOX.lesson} hintKey="my.inbox.hint.lessonHere" addLabelKey="my.inbox.addToThisLesson" onAdd={item => drainLessonItem(item, { t, lang, lessonId: lesson.id })} />
        <form className="ln-my-inline-form" onSubmit={addSource}>
          <input className="ln-input" value={ref} onChange={e => { setRef(e.target.value); setError(''); }} placeholder={t('my.lessons.addSourceHint')} aria-label={t('my.lessons.addSource')} required />
          <button type="submit" className="ln-btn" disabled={busy || !ref.trim()}>{busy ? t('my.working') : t('my.lessons.addSource')}</button>
        </form>
        {error && <p className="ln-my-error" role="alert">{error}</p>}
      </section>

      <section className="ln-my-section" aria-labelledby="lesson-questions">
        <h2 id="lesson-questions" className="ln-section-title">{t('my.lessons.questions')} <span className="ln-small ln-muted">({lesson.questions.length})</span></h2>
        {lesson.questions.length ? (
          <ol className="ln-my-questions">
            {lesson.questions.map(q => (
              <li key={q.id} className={hasHebrew(questionText(q, lang)) ? 'ln-text-he-ui' : ''}>
                <span>{questionText(q, lang)}</span>
                <button type="button" className="ln-icon-button" aria-label={t('my.lessons.removeQuestion')} onClick={() => updateLesson(lesson.id, { questions: lesson.questions.filter(x => x.id !== q.id) })}>×</button>
              </li>
            ))}
          </ol>
        ) : <Empty>{t('my.lessons.noQuestions')}</Empty>}
        <div className="ln-row">
          <button type="button" className="ln-btn" onClick={suggest}>{t('my.lessons.suggest')}</button>
          <Simulated>{t('my.lessons.templated')}</Simulated>
          <button type="button" className="ln-btn ln-btn-primary" onClick={() => askAssistant(assistantPrompt(lesson, lang), { source: 'lesson' })}>{t('my.lessons.askAssistant')}</button>
        </div>
        <form className="ln-my-inline-form" onSubmit={addCustom}>
          <input className="ln-input" value={custom} onChange={e => setCustom(e.target.value)} placeholder={t('my.lessons.customQuestion')} aria-label={t('my.lessons.customQuestion')} />
          <button type="submit" className="ln-btn" disabled={!custom.trim()}>{t('my.add')}</button>
        </form>
      </section>

      <section className="ln-my-section" aria-labelledby="lesson-notes">
        <h2 id="lesson-notes" className="ln-section-title">{t('my.lessons.handoutNotes')}</h2>
        <textarea className="ln-input ln-my-textarea" rows={4} value={notes} onChange={e => setNotes(e.target.value)} placeholder={t('my.lessons.handoutNotesHint')} aria-label={t('my.lessons.handoutNotes')}
                  onBlur={() => { if (notes !== lesson.handoutNotes) { updateLesson(lesson.id, { handoutNotes: notes }); } }} />
      </section>
    </div>
  );
}

// ---- handout + shared ---------------------------------------------------------------------------

export function HandoutView({ lesson }) {
  const { t, lang } = useT();
  return (
    <article className="ln-my-handout">
      <header className="ln-my-handout-head">
        <h1 className={hasHebrew(lesson.title) ? 'ln-text-he-ui' : ''}>{lesson.title}</h1>
        <p className="ln-small ln-muted">{t('my.handout.subtitle', { date: formatDate(lesson.ts || Date.now(), lang) })}</p>
      </header>
      {lesson.sources.map((s, i) => (
        <section key={s.id || i} className="ln-my-handout-source">
          <h2><span dir="ltr">{s.title || s.ref}</span>{s.heTitle && <span dir="rtl" lang="he" className="ln-my-handout-heref">{s.heTitle}</span>}</h2>
          <div className="ln-my-handout-text">
            {s.he && <p className="ln-text-he" lang="he" dir="rtl">{s.he}</p>}
            {s.en && <p className="ln-text-en" lang="en" dir="ltr">{s.en}</p>}
          </div>
          {s.note && <p className="ln-my-handout-note">{s.note}</p>}
        </section>
      ))}
      {lesson.questions.length > 0 && (
        <section className="ln-my-handout-questions">
          <h2>{t('my.lessons.questions')}</h2>
          <ol>
            {lesson.questions.map((q, i) => (
              <li key={q.id || i}>
                {q.en && <span dir="ltr" lang="en">{q.en}</span>}
                {q.he && q.he !== q.en && <span dir="rtl" lang="he" className="ln-my-handout-heq">{q.he}</span>}
              </li>
            ))}
          </ol>
        </section>
      )}
      {lesson.handoutNotes && (
        <section className="ln-my-handout-notes">
          <h2>{t('my.handout.notes')}</h2>
          <p>{lesson.handoutNotes}</p>
        </section>
      )}
      <footer className="ln-small ln-muted">{t('my.handout.credit')}</footer>
    </article>
  );
}

function usePrintMode() {
  useEffect(() => {
    document.body.classList.add('ln-handout-print');
    return () => document.body.classList.remove('ln-handout-print');
  }, []);
}

export function HandoutPage({ lessonId }) {
  const { t } = useT();
  const { get } = useCollection('lessons', collectionOptions('lessons'));
  const lesson = get(lessonId);
  usePrintMode();
  if (!lesson) {
    return <div className="ln-container ln-my"><Empty action={<Link className="ln-btn" to="/my/lessons">{t('my.nav.lessons')}</Link>}>{t('my.lessons.notFound')}</Empty></div>;
  }
  return (
    <div className="ln-container ln-my ln-my-handout-page">
      <div className="ln-row ln-my-noprint ln-my-handout-tools">
        <Link className="ln-btn" to={`/my/lessons/${lesson.id}`}>{t('my.handout.back')}</Link>
        <button type="button" className="ln-btn ln-btn-primary" onClick={() => window.print()}>{t('my.handout.print')}</button>
      </div>
      <HandoutView lesson={lesson} />
    </div>
  );
}

export function readSharedLesson(hash = typeof window !== 'undefined' ? window.location.hash : '') {
  return shareToLesson(decodeShare(hash.replace(/^#/, '')));
}

export function SharedLessonPage() {
  const { t } = useT();
  const [lesson, setLesson] = useState(readSharedLesson);
  usePrintMode();
  useEffect(() => {
    const onHash = () => setLesson(readSharedLesson());
    window.addEventListener('hashchange', onHash);
    return () => window.removeEventListener('hashchange', onHash);
  }, []);
  const save = () => {
    const saved = createLesson(lesson);
    toast(t('my.shared.saved'));
    navigate(`/my/lessons/${saved.id}`);
  };
  if (!lesson) {
    return (
      <div className="ln-container ln-my">
        <h1 className="ln-page-title">{t('my.title.shared')}</h1>
        <Empty action={<Link className="ln-btn" to="/my/lessons">{t('my.nav.lessons')}</Link>}>{t('my.shared.invalid')}</Empty>
      </div>
    );
  }
  return (
    <div className="ln-container ln-my ln-my-handout-page">
      <div className="ln-card ln-row ln-my-noprint ln-my-shared-bar">
        <span>{t('my.shared.intro')}</span>
        <button type="button" className="ln-btn ln-btn-primary" onClick={save}>{t('my.shared.save')}</button>
        <button type="button" className="ln-btn" onClick={() => window.print()}>{t('my.handout.print')}</button>
      </div>
      <HandoutView lesson={{ ...lesson, ts: Date.now() }} />
    </div>
  );
}
