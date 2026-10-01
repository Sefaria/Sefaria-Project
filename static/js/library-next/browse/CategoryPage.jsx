/** `/texts/<cats>` — one category: description, subcategories, books, persona actions. */
import React from 'react';
import { pick } from '../i18n';
import { Link } from '../router';
import { usePersona } from '../persona';
import { BiTitle, Desc, useLangs } from './components';
import {
  tocNode, splitContents, countBooks, categoryColor, bookColor, nodeTitle, nodeDesc, nodeShortDesc, bookPath,
  categoryPath, splitCategoryPath, addToPlan, addToLesson,
} from './data';
import './styles.css';

export function Breadcrumbs({ cats, t, lang }) {
  const crumbs = cats.map((c, i) => ({ cats: cats.slice(0, i + 1), label: c }));
  return (
    <nav className="ln-crumbs" aria-label="Breadcrumb">
      <Link to="/texts">{t('texts.breadcrumb')}</Link>
      {crumbs.map(({ cats: path, label }) => {
        const node = tocNode(path);
        return (
          <React.Fragment key={path.join('/')}>
            <span className="ln-crumb-sep" aria-hidden="true">/</span>
            {path.length === cats.length
              ? <span aria-current="page">{node ? pick(nodeTitle(node)) : label}</span>
              : <Link to={categoryPath(path)}>{node ? pick(nodeTitle(node)) : label}</Link>}
          </React.Fragment>
        );
      })}
    </nav>
  );
}

export function BookRow({ book, persona, lang, contentLang, t }) {
  const source = { ref: book.title, title: book.title };
  return (
    <li className="ln-book-row ln-cat-rule" style={{ '--cat': bookColor(book) }}>
      <Link to={bookPath(book.title)} className="ln-book-row-link">
        <BiTitle en={book.title} he={book.heTitle} contentLang={contentLang} lang={lang} className="ln-book-row-title" />
        {persona !== 'scholar' && <Desc text={nodeShortDesc(book)} className="ln-small ln-muted" />}
      </Link>
      <div className="ln-book-row-actions">
        {persona === 'learner' && <button type="button" className="ln-btn ln-btn-quiet" onClick={() => addToPlan(source)}>{t('act.addToPlan')}</button>}
        {persona === 'educator' && <button type="button" className="ln-btn ln-btn-quiet" onClick={() => addToLesson(source)}>{t('act.addToLesson')}</button>}
      </div>
    </li>
  );
}

export default function CategoryPage({ params }) {
  const { t, lang, contentLang } = useLangs();
  const { persona } = usePersona();
  const cats = splitCategoryPath(params.rest);
  const node = tocNode(cats);
  const heading = node ? pick(nodeTitle(node)) : (cats[cats.length - 1] || t('texts.title'));
  const { categories, books } = splitContents(node);
  const color = categoryColor(cats[0] || 'Other');
  const showCounts = persona === 'scholar' || persona === 'educator';
  return (
    <div className="ln-container ln-category" data-persona={persona} style={{ '--cat': color }}>
      <Breadcrumbs cats={cats} t={t} lang={lang} />
      <header className="ln-category-head ln-cat-rule">
        <h1 className="ln-page-title">{node ? <BiTitle {...nodeTitle(node)} contentLang={contentLang} lang={lang} as="span" /> : heading}</h1>
        {node && <Desc text={persona === 'newcomer' ? nodeShortDesc(node) : nodeDesc(node)} className="ln-category-desc ln-read-width" />}
        {persona === 'educator' && (
          <button type="button" className="ln-btn ln-btn-quiet ln-print" onClick={() => window.print()}>{t('act.print')}</button>
        )}
      </header>
      {!node && <p className="ln-muted">{t('texts.notFound')}</p>}
      {categories.length > 0 && (
        <section aria-labelledby="ln-subcats">
          <h2 className="ln-section-title" id="ln-subcats">{t('texts.subcategories')}</h2>
          <ul className="ln-cat-grid ln-cat-grid-dense">
            {categories.map(sub => (
              <li key={sub.category} className="ln-cat-card ln-cat-rule" style={{ '--cat': categoryColor(sub.category === 'Commentary' ? 'Commentary' : cats[0]) }}>
                <Link to={categoryPath(cats.concat([sub.category]))} className="ln-cat-card-link">
                  <BiTitle {...nodeTitle(sub)} contentLang={contentLang} lang={lang} className="ln-cat-card-title" as="h3" />
                  {persona !== 'scholar' && <Desc text={nodeShortDesc(sub)} className="ln-small ln-muted" />}
                </Link>
                {showCounts && <p className="ln-small ln-muted">{countBooks(sub) === 1 ? t('texts.book') : t('texts.books', { n: countBooks(sub) })}</p>}
              </li>
            ))}
          </ul>
        </section>
      )}
      {books.length > 0 && (
        <section aria-labelledby="ln-books">
          <h2 className="ln-section-title" id="ln-books">{t('texts.booksIn')}{showCounts && <span className="ln-muted ln-small"> · {books.length}</span>}</h2>
          <ul className="ln-book-list">
            {books.map(book => <BookRow key={book.title} book={book} persona={persona} lang={lang} contentLang={contentLang} t={t} />)}
          </ul>
        </section>
      )}
    </div>
  );
}
