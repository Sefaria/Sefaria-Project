/** Scholar: manuscript page images linked to the passage, with the holding library and a link to the full image. */
import React, { useEffect, useState } from 'react';
import { useT } from '../../i18n';
import { fetchManuscripts } from './manuscriptsApi';

export default function ManuscriptsTool({ selection }) {
  const { t, lang } = useT();
  const [state, setState] = useState({ loading: true, pages: [] });
  useEffect(() => {
    let live = true;
    setState({ loading: true, pages: [] });
    fetchManuscripts(selection.ref)
      .then(pages => { if (live) { setState({ loading: false, pages }); } })
      .catch(() => { if (live) { setState({ loading: false, pages: [], error: true }); } });
    return () => { live = false; };
  }, [selection.ref]);
  if (state.loading) { return <div className="ln-tool-body"><p className="ln-muted">{t('research.manuscripts.loading')}</p></div>; }
  if (state.error) { return <div className="ln-tool-body"><p className="ln-muted">{t('research.manuscripts.error')}</p></div>; }
  if (!state.pages.length) { return <div className="ln-tool-body ln-ms-empty"><p className="ln-muted">{t('research.manuscripts.none')}</p></div>; }
  return (
    <div className="ln-tool-body ln-stack">
      <p className="ln-small ln-muted">{t('research.manuscripts.count', { n: state.pages.length })}</p>
      <ul className="ln-ms-grid">
        {state.pages.map(page => {
          const ms = page.manuscript || {};
          const title = (lang === 'he' && ms.he_title) || ms.title || page.manuscript_slug;
          return (
            <li key={page.image_url || page.page_id} className="ln-ms-card">
              <a href={page.image_url} target="_blank" rel="noopener noreferrer" className="ln-ms-thumb" aria-label={`${t('research.manuscripts.open')}: ${title}, ${page.page_id}`}>
                <img src={page.thumbnail_url || page.image_url} alt="" loading="lazy" onError={e => { e.currentTarget.parentNode.classList.add('is-broken'); }} />
              </a>
              <div className="ln-ms-meta">
                <strong className="ln-ms-title">{title}</strong>
                <span className="ln-small">{t('research.manuscripts.page')}: {page.page_id}</span>
                {page.anchorRef && <span className="ln-small ln-muted">{t('research.manuscripts.covers', { ref: page.anchorRef })}</span>}
                {ms.source && <a className="ln-small" href={ms.source} target="_blank" rel="noopener noreferrer">{t('research.manuscripts.source')}</a>}
                {ms.description && <span className="ln-small ln-muted ln-ms-desc">{(lang === 'he' && ms.he_description) || ms.description}</span>}
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
