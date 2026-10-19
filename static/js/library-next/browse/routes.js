/**
 * Route registry for the `browse` feature (owned by the `browse` agent). Imported by ../routes.js.
 * Registers `home`, `texts`, `texts-category`, `calendars` and `book` (book-level refs only; see
 * refKind.js, which the reader's `ref` catch-all can import to stay out of the way).
 */
import { registerRoute } from '../router';
import { t } from '../i18n';
import HomePage from './HomePage';
import TextsPage from './TextsPage';
import CategoryPage from './CategoryPage';
import BookPage from './BookPage';
import CalendarsPage from './CalendarsPage';
import { matchBook } from './refKind';
import { splitCategoryPath } from './data';
import './strings';

registerRoute({ name: 'home', path: '/', component: HomePage, title: () => t('page.home') });
registerRoute({ name: 'texts', path: '/texts', component: TextsPage, title: () => t('texts.title') });
registerRoute({
  name: 'texts-category', path: '/texts/*', component: CategoryPage,
  title: (params) => { const cats = splitCategoryPath(params.rest); return cats.length ? cats[cats.length - 1] : t('texts.title'); },
});
registerRoute({ name: 'calendars', path: '/calendars', component: CalendarsPage, title: () => t('cal.title') });
registerRoute({ name: 'book', match: matchBook, component: BookPage, title: (params) => params.title });
