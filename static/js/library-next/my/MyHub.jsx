/**
 * `/my/*`: the My Library hub. One registered route; this component dispatches on `params.rest`
 * and wraps every section in the hub layout (title, persona tagline, persona-ordered nav).
 * The handout and shared-lesson views render without the hub chrome.
 */
import React from 'react';
import { useT } from '../i18n';
import { Link } from '../router';
import { usePersona } from '../persona';
import { sectionsFor, sectionFor, pathFor, SECTIONS } from './nav';
import OverviewPage from './OverviewPage';
import ShelfPage from './ShelfPage';
import HistoryPage from './HistoryPage';
import NotesPage from './NotesPage';
import PlansPage from './PlansPage';
import FlashcardsPage from './FlashcardsPage';
import { LessonsPage, LessonEditor, HandoutPage, SharedLessonPage } from './Lessons';
import NotebookPage from './NotebookPage';
import DataPage from './DataPage';
import './styles.css';

const PAGES = { overview: OverviewPage, shelf: ShelfPage, history: HistoryPage, notes: NotesPage, plans: PlansPage, flashcards: FlashcardsPage, lessons: LessonsPage, notebook: NotebookPage, data: DataPage };

/** The document-title key for a `/my/*` sub-path. */
export function titleKeyFor(rest = '') {
  const [head, second, third] = rest.replace(/\/+$/, '').split('/');
  if (head === 'lessons' && second) {
    if (second === 'shared') { return 'my.title.shared'; }
    if (second === 'new') { return 'my.title.newLesson'; }
    if (third === 'handout') { return 'my.title.handout'; }
    return 'my.title.lesson';
  }
  const id = sectionFor(rest);
  return id ? SECTIONS[id].titleKey : 'my.title.overview';
}

export function MyLayout({ section, children }) {
  const { t } = useT();
  const { persona } = usePersona();
  return (
    <div className="ln-container ln-my">
      <header className="ln-my-head">
        <h1 className="ln-page-title">{section ? t(SECTIONS[section].titleKey) : t('my.title.overview')}</h1>
        <p className="ln-my-tagline ln-muted">{t(`my.tagline.${persona}`)}</p>
      </header>
      <nav className="ln-my-nav" aria-label={t('my.nav.label')}>
        {sectionsFor(persona).map(s => (
          <Link key={s.id} to={pathFor(s.id)} aria-current={s.id === section ? 'page' : undefined}>{t(s.key)}</Link>
        ))}
      </nav>
      <div className="ln-my-body">{children}</div>
    </div>
  );
}

function NotFoundInHub({ path }) {
  const { t } = useT();
  return (
    <div className="ln-my-empty">
      <p>{t('my.notFound', { path })}</p>
      <Link className="ln-btn" to="/my">{t('my.nav.overview')}</Link>
    </div>
  );
}

export default function MyHub({ params = {}, pathname = '/my', query = {} }) {
  const rest = (params.rest || '').replace(/\/+$/, '');
  const [head, second, third] = rest.split('/');
  if (head === 'lessons' && second) {
    if (second === 'shared') { return <SharedLessonPage />; }
    if (second === 'new') { return <MyLayout section="lessons"><LessonEditor isNew /></MyLayout>; }
    if (third === 'handout') { return <HandoutPage lessonId={second} />; }
    return <MyLayout section="lessons"><LessonEditor lessonId={second} /></MyLayout>;
  }
  const id = sectionFor(rest);
  if (!id) { return <MyLayout section={null}><NotFoundInHub path={pathname} /></MyLayout>; }
  const Page = PAGES[id];
  return <MyLayout section={id}><Page query={query} /></MyLayout>;
}
