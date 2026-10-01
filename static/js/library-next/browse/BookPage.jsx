/** A book-level ref (`/Genesis`): about, contents (structures as tabs), versions and actions. */
import React, { useState } from 'react';
import { pick } from '../i18n';
import { Link } from '../router';
import { usePersona } from '../persona';
import { useCollection } from '../store';
import { BiTitle, Desc, Skeleton, useLangs } from './components';
import { useIndexDetails, useVersions, refPath, bookPath, categoryPath, categoryColor, lastReadIn, addToPlan, addToLesson, saveToShelf, isOnShelf } from './data';
import { structures, jaggedSections, schemaRows, altRows, sectionName, versionBuckets } from './bookToc';
import './styles.css';

function SectionGrid({ sections, lang }) {
  return (
    <ol className="ln-section-grid">
      {sections.map(s => (
        <li key={s.ref}><Link to={refPath(s.ref)} className="ln-section-cell">{lang === 'he' && s.he ? s.he : s.en}</Link></li>
      ))}
    </ol>
  );
}

function Contents({ details, lang, contentLang, t }) {
  const tabs = structures(details);
  const [active, setActive] = useState(tabs.length ? tabs[0].id : null);
  const tab = tabs.find(x => x.id === active) || tabs[0];
  if (!tab) { return null; }
  const schema = details.schema || {};
  let body = null;
  if (tab.kind === 'schema') {
    if (schema.nodes) {
      body = (
        <ul className="ln-schema">
          {schemaRows(schema, details.title).map((row, i) => (
            <li key={`${row.ref}-${i}`} className={`ln-schema-row depth-${Math.min(row.depth, 3)} ${row.leaf ? 'is-leaf' : ''}`}>
              {row.leaf
                ? <Link to={refPath(row.ref)}><BiTitle en={row.title.en || row.ref} he={row.title.he || row.ref} contentLang={contentLang} lang={lang} /></Link>
                : <BiTitle en={row.title.en} he={row.title.he} contentLang={contentLang} lang={lang} className="ln-schema-head" />}
              {row.sections && row.sections.length > 0 && <SectionGrid sections={row.sections} lang={lang} />}
            </li>
          ))}
        </ul>
      );
    } else {
      body = <SectionGrid sections={jaggedSections(schema, details.title)} lang={lang} />;
    }
  } else {
    body = (
      <ul className="ln-alt-list">
        {altRows(details.alts[tab.id], details.title).map(row => (
          <li key={row.ref} className="ln-alt-row">
            <Link to={refPath(row.ref)} className="ln-alt-title"><BiTitle en={row.title.en} he={row.title.he} contentLang={contentLang} lang={lang} /></Link>
            <span className="ln-small ln-muted ln-alt-ref">{row.ref}</span>
            {row.sections.length > 0 && <SectionGrid sections={row.sections} lang={lang} />}
          </li>
        ))}
      </ul>
    );
  }
  return (
    <section className="ln-book-contents" aria-labelledby="ln-book-contents">
      <h2 className="ln-section-title" id="ln-book-contents">{t('book.contents')}</h2>
      {tabs.length > 1 && (
        <div className="ln-segmented ln-structs" role="tablist">
          {tabs.map(x => (
            <button key={x.id} type="button" role="tab" aria-selected={x.id === tab.id} className={`ln-segment ${x.id === tab.id ? 'active' : ''}`} onClick={() => setActive(x.id)}>
              {x.kind === 'schema' ? (x.label ? t('book.structure.default', { section: pick(x.label) }) : t('book.structure.schema')) : pick(x.label)}
            </button>
          ))}
        </div>
      )}
      {body}
    </section>
  );
}

function Versions({ title, emphasis, lang, t }) {
  const versions = useVersions(title);
  const buckets = versions ? versionBuckets(versions) : null;
  const total = buckets ? buckets.he.length + buckets.en.length + buckets.other.length : 0;
  const list = (items) => (
    <ul className="ln-version-list">
      {items.map(v => (
        <li key={`${v.language}-${v.versionTitle}`} className="ln-version">
          <span className="ln-version-title">{lang === 'he' && v.versionTitleInHebrew ? v.versionTitleInHebrew : v.versionTitle}</span>
          {v.license && <span className="ln-small ln-muted"> · {v.license}</span>}
          {v.firstSectionRef && <Link className="ln-small ln-version-open" to={refPath(v.firstSectionRef)}>{t('act.open')}</Link>}
        </li>
      ))}
    </ul>
  );
  const body = !buckets ? <p className="ln-muted ln-small">{t('book.versions.loading')}</p> : (total === 0 ? <p className="ln-muted ln-small">{t('book.versions.none')}</p> : (
    <div className="ln-version-groups">
      {buckets.he.length > 0 && <div><h3 className="ln-version-lang">{t('book.lang.he')}</h3>{list(buckets.he)}</div>}
      {buckets.en.length > 0 && <div><h3 className="ln-version-lang">{t('book.lang.en')}</h3>{list(buckets.en)}</div>}
      {buckets.other.length > 0 && <div><h3 className="ln-version-lang">{t('book.lang.other')}</h3>{list(buckets.other)}</div>}
    </div>
  ));
  const heading = <>{t('book.versions')}{buckets && <span className="ln-muted ln-small"> · {t('book.versions.count', { n: total })}</span>}</>;
  if (emphasis) {
    return <section className="ln-book-versions" aria-labelledby="ln-book-versions"><h2 className="ln-section-title" id="ln-book-versions">{heading}</h2>{body}</section>;
  }
  return (
    <details className="ln-book-versions">
      <summary className="ln-section-title">{heading}</summary>
      {body}
    </details>
  );
}

const joinWords = (...parts) => parts.filter(Boolean).join(' ').replace(/\s+/g, ' ').trim();

function About({ details, persona, t }) {
  const authors = details.authors || [];
  const desc = { en: details.enDesc || details.enShortDesc || '', he: details.heDesc || details.heShortDesc || details.enDesc || '' };
  const meta = [];
  if (authors.length) { meta.push([authors.length > 1 ? t('book.authors') : t('book.author'), authors.map(a => <Link key={a.slug} to={`/topics/${a.slug}`}>{pick(a)}</Link>)]); }
  if (details.compDateString || details.compPlaceString) {
    meta.push([t('book.composed'), joinWords(pick(details.compPlaceString), pick(details.compDateString))]);
  }
  if (persona === 'scholar' && (details.pubDateString || details.pubPlaceString)) {
    meta.push([t('book.published'), joinWords(pick(details.pubPlaceString), pick(details.pubDateString))]);
  }
  if (details.era) { meta.push([t('book.era'), t(`era.${details.era}`)]); }
  if (details.base_text_titles && details.base_text_titles.length) {
    meta.push([t('book.commentaryOn'), details.base_text_titles.map(b => <Link key={b.en} to={bookPath(b.en)}>{pick(b)}</Link>)]);
  }
  const topics = (details.relatedTopics || []).slice(0, 8);
  if (!pick(desc) && !meta.length && !topics.length) { return null; }
  return (
    <section className="ln-book-about" aria-labelledby="ln-book-about">
      <h2 className="ln-section-title" id="ln-book-about">{t('book.about')}</h2>
      <Desc text={desc} className="ln-book-desc ln-read-width" />
      {meta.length > 0 && (
        <dl className="ln-meta">
          {meta.map(([label, value]) => (
            <div key={label} className="ln-meta-row"><dt>{label}</dt><dd>{Array.isArray(value) ? value.reduce((acc, v, i) => (i ? [...acc, ', ', v] : [v]), []) : value}</dd></div>
          ))}
        </dl>
      )}
      {topics.length > 0 && (
        <div className="ln-book-topics">
          <h3 className="ln-small ln-muted">{t('book.topics')}</h3>
          <ul className="ln-chips">{topics.map(tp => <li key={tp.slug}><Link className="ln-topic-chip" to={`/topics/${tp.slug}`}>{pick(tp.title)}</Link></li>)}</ul>
        </div>
      )}
    </section>
  );
}

export default function BookPage({ params, pathname }) {
  const { t, lang, contentLang } = useLangs();
  const { persona } = usePersona();
  const title = params.title;
  const { data: details, error, loading } = useIndexDetails(title);
  const { items: shelf } = useCollection('shelf');
  const { items: history } = useCollection('history');
  if (loading) {
    return <div className="ln-container ln-book"><h1 className="ln-page-title">{title}</h1><Skeleton lines={5} /></div>;
  }
  if (error || !details) {
    return (
      <div className="ln-container ln-book">
        <h1 className="ln-page-title">{title}</h1>
        <p className="ln-muted">{t('book.notFound')}</p>
        <a className="ln-btn" href={`${pathname}?library=classic`}>{t('placeholder.classic')}</a>
      </div>
    );
  }
  const cats = details.categories || [];
  const color = categoryColor(cats[0] || 'Other');
  const last = lastReadIn(details.title);
  const onShelf = isOnShelf(details.title) || shelf.some(i => i.ref === details.title);
  const source = { ref: details.title, title: details.title };
  const heCats = details.heCategories || [];
  return (
    <article className="ln-container ln-book" data-persona={persona} style={{ '--cat': color }}>
      <nav className="ln-crumbs" aria-label="Breadcrumb">
        <Link to="/texts">{t('texts.breadcrumb')}</Link>
        {cats.map((c, i) => (
          <React.Fragment key={c}><span className="ln-crumb-sep" aria-hidden="true">/</span><Link to={categoryPath(cats.slice(0, i + 1))}>{lang === 'he' && heCats[i] ? heCats[i] : c}</Link></React.Fragment>
        ))}
      </nav>
      <header className="ln-book-head ln-cat-rule">
        <h1 className="ln-page-title ln-book-title"><BiTitle en={details.title} he={details.heTitle} contentLang={contentLang} lang={lang} /></h1>
        {details.enShortDesc && <Desc text={{ en: details.enShortDesc, he: details.heShortDesc || details.enShortDesc }} className="ln-book-short ln-muted" />}
        <div className="ln-row ln-book-actions">
          {last && <Link className="ln-btn ln-btn-primary" to={refPath(last.ref)}>{t('book.continue')} · {last.ref}</Link>}
          {details.firstSectionRef && <Link className={`ln-btn ${last ? '' : 'ln-btn-primary'}`} to={refPath(details.firstSectionRef)}>{t('book.start')}</Link>}
          <button type="button" className="ln-btn" onClick={() => saveToShelf(source)} aria-pressed={onShelf}>{onShelf ? t('act.onShelf') : t('act.saveToShelf')}</button>
          {persona === 'learner' && <button type="button" className="ln-btn" onClick={() => addToPlan(source)}>{t('act.addToPlan')}</button>}
          {persona === 'educator' && <button type="button" className="ln-btn" onClick={() => addToLesson(source)}>{t('act.addToLesson')}</button>}
          {persona === 'educator' && <button type="button" className="ln-btn ln-btn-quiet" onClick={() => window.print()}>{t('act.print')}</button>}
        </div>
      </header>
      <div className={`ln-book-body ${persona === 'scholar' ? 'is-scholar' : ''}`}>
        <About details={details} persona={persona} t={t} />
        {persona === 'scholar' && <Versions title={details.title} emphasis lang={lang} t={t} />}
        <Contents details={details} lang={lang} contentLang={contentLang} t={t} />
        {persona !== 'scholar' && <Versions title={details.title} emphasis={false} lang={lang} t={t} />}
      </div>
    </article>
  );
}
