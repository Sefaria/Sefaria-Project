/** `/texts` — the library table of contents: one tile per top-level category, with a persona lens. */
import React from 'react';
import Sefaria from '../../sefaria/sefaria';
import { pick } from '../i18n';
import { Link } from '../router';
import { usePersona } from '../persona';
import { BiTitle, Desc, Skeleton, useLangs } from './components';
import { topCategories, countBooks, categoryColor, nodeTitle, nodeShortDesc, whereToStart, refPath, splitContents } from './data';
import './styles.css';

export function CategoryTile({ node, persona, lang, contentLang, t }) {
  const title = nodeTitle(node);
  const start = persona === 'newcomer' ? whereToStart(node.category) : null;
  const showCounts = persona === 'scholar' || persona === 'educator';
  const subcats = splitContents(node).categories.length;
  return (
    <li className="ln-cat-card ln-cat-rule" style={{ '--cat': categoryColor(node.category) }}>
      <Link to={`/texts/${encodeURIComponent(node.category)}`} className="ln-cat-card-link">
        <BiTitle {...title} contentLang={contentLang} lang={lang} className="ln-cat-card-title" as="h2" />
        <Desc text={nodeShortDesc(node)} className="ln-cat-card-desc" />
      </Link>
      {showCounts && (
        <p className="ln-small ln-muted ln-cat-card-counts">
          {countBooks(node) === 1 ? t('texts.book') : t('texts.books', { n: countBooks(node) })}
          {subcats > 0 && ` · ${t('texts.categories', { n: subcats })}`}
        </p>
      )}
      {start && (
        <p className="ln-small ln-cat-card-start">
          <span className="ln-muted">{t('texts.startWith')}: </span>
          <Link to={refPath(start)}>{start}</Link>
        </p>
      )}
    </li>
  );
}

export default function TextsPage() {
  const { t, lang, contentLang } = useLangs();
  const { persona } = usePersona();
  const cats = topCategories(Sefaria.toc);
  const intro = persona === 'newcomer' ? t('texts.intro.newcomer') : (persona === 'scholar' ? t('texts.intro.scholar') : null);
  return (
    <div className="ln-container ln-texts" data-persona={persona}>
      <h1 className="ln-page-title">{t('texts.title')}</h1>
      {intro && <p className="ln-muted ln-page-intro">{intro}</p>}
      {cats.length ? (
        <ul className="ln-cat-grid">
          {cats.map(node => <CategoryTile key={node.category} node={node} persona={persona} lang={lang} contentLang={contentLang} t={t} />)}
        </ul>
      ) : <div className="ln-card"><p className="ln-muted">{t('texts.loading')}</p><Skeleton lines={4} /></div>}
    </div>
  );
}
