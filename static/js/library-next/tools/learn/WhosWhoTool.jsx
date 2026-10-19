/**
 * Who's who (newcomer): people named in the selection. The curated list (figures.js) answers
 * offline; "Rabbi X" names it does not know are resolved through `Sefaria.getName` (the topics
 * autocomplete) when the network allows. Each entry links to `/topics/<slug>`.
 */
import React, { useEffect, useMemo, useState } from 'react';
import Sefaria from '../../../sefaria/sefaria';
import { useT } from '../../i18n';
import { Link } from '../../router';
import { requestAssistant } from '../../assistant/events';
import { detectFigures, unknownRabbis, personFromName } from './figures';

const Person = () => (
  <svg className="ln-tool-icon" width="20" height="20" viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="12" cy="8" r="3.5" /><path d="M5 20c0-3.9 3.1-6.5 7-6.5s7 2.6 7 6.5" />
  </svg>
);
export const personIcon = <Person />;

export default function WhosWhoTool({ selection }) {
  const { t, lang } = useT();
  const found = useMemo(() => detectFigures({ en: selection.en, he: selection.he }), [selection.en, selection.he]);
  const [extra, setExtra] = useState([]);
  useEffect(() => {
    let live = true;
    setExtra([]);
    const names = unknownRabbis(selection.en, found.map(f => f.figure));
    if (!names.length || typeof Sefaria.getName !== 'function') { return undefined; }
    Promise.all(names.map(name => Promise.resolve(Sefaria.getName(name, 5)).then(personFromName).catch(() => null)))
      .then(people => { if (live) { setExtra(people.filter(Boolean).filter((p, i, arr) => arr.findIndex(q => q.slug === p.slug) === i)); } });
    return () => { live = false; };
  }, [selection.en]);   // eslint-disable-line react-hooks/exhaustive-deps
  const ask = (name) => requestAssistant(t('learn.whosWho.prompt', { name, ref: selection.ref }));
  if (!found.length && !extra.length) {
    return <div className="ln-tool-body ln-stack ln-learn"><p className="ln-muted">{t('learn.whosWho.none')}</p></div>;
  }
  return (
    <div className="ln-tool-body ln-learn">
      <ul className="ln-learn-figures">
        {found.map(({ figure }) => (
          <li key={figure.slug} className="ln-learn-figure">
            <div className="ln-learn-figure-head">
              <strong>{lang === 'he' ? figure.he : figure.en}</strong>
              <span className="ln-small ln-muted">{t(`learn.whosWho.era.${figure.era}`)}</span>
            </div>
            <p className="ln-learn-figure-blurb">{lang === 'he' ? figure.blurb.he : figure.blurb.en}</p>
            <div className="ln-row">
              <Link to={`/topics/${figure.slug}`} className="ln-btn ln-btn-quiet">{t('learn.whosWho.topic')}</Link>
              <button type="button" className="ln-btn ln-btn-quiet" onClick={() => ask(lang === 'he' ? figure.he : figure.en)}>{t('learn.ask')}</button>
            </div>
          </li>
        ))}
        {extra.map(p => (
          <li key={p.slug} className="ln-learn-figure">
            <div className="ln-learn-figure-head">
              <strong>{p.en}</strong>
              <span className="ln-small ln-muted">{t('learn.whosWho.fromTopics')}</span>
            </div>
            <div className="ln-row">
              <Link to={`/topics/${p.slug}`} className="ln-btn ln-btn-quiet">{t('learn.whosWho.topic')}</Link>
              <button type="button" className="ln-btn ln-btn-quiet" onClick={() => ask(p.en)}>{t('learn.ask')}</button>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
