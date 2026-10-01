/**
 * Educator: the English translations available for the passage (from the reader's `/api/texts`
 * payload, `Sefaria.getVersions` as a fallback), two or three side by side via `Sefaria.getText`
 * with `enVersion`.
 */
import React, { useEffect, useMemo, useState } from 'react';
import Sefaria from '../../../sefaria/sefaria';
import { useT } from '../../i18n';
import { englishTranslations, fetchVersionText, versionName } from '../research/versionText';

export const MAX_SIDE_BY_SIDE = 3;

export default function TranslationsTool({ selection, book }) {
  const { t, lang } = useT();
  const [extra, setExtra] = useState(null);
  const versions = useMemo(() => englishTranslations(extra || book), [book, extra]);
  const [picked, setPicked] = useState([]);
  const [texts, setTexts] = useState({});
  useEffect(() => {
    if (versions.length || !book.sectionRef || extra) { return; }
    Sefaria.getVersions(book.sectionRef).then(v => setExtra(v || {})).catch(() => setExtra({}));
  }, [versions.length, book.sectionRef, extra]);
  useEffect(() => {
    if (!versions.length) { return; }
    const titles = versions.map(v => v.versionTitle);
    const first = titles.includes(book.versionTitle) ? [book.versionTitle] : [];
    setPicked([...first, ...titles.filter(x => x !== book.versionTitle)].slice(0, MAX_SIDE_BY_SIDE));
  }, [versions, book.versionTitle]);
  useEffect(() => {
    let live = true;
    picked.filter(title => !texts[title]).forEach(title => {
      setTexts(s => ({ ...s, [title]: { loading: true } }));
      fetchVersionText(selection.ref, title, 'en')
        .then(r => { if (live) { setTexts(s => ({ ...s, [title]: { lines: r.lines } })); } })
        .catch(() => { if (live) { setTexts(s => ({ ...s, [title]: { error: true } })); } });
    });
    return () => { live = false; };
  }, [picked, selection.ref]);   // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { setTexts({}); }, [selection.ref]);
  const toggle = (title) => {
    if (picked.includes(title)) { setPicked(picked.filter(x => x !== title)); }
    else if (picked.length < MAX_SIDE_BY_SIDE) { setPicked([...picked, title]); }
    else { setPicked([...picked.slice(1), title]); }
  };
  if (!versions.length) {
    return <div className="ln-tool-body"><p className="ln-muted">{extra || book.data ? t('teach.translations.none') : t('teach.translations.loading')}</p></div>;
  }
  return (
    <div className="ln-tool-body ln-stack ln-translations">
      <p className="ln-small ln-muted">{t('teach.translations.count', { n: versions.length })} · {t('teach.translations.max')}</p>
      <div className="ln-chip-list" role="group" aria-label={t('teach.translations.pick')}>
        {versions.map(v => (
          <label key={v.versionTitle} className={`ln-chip ${picked.includes(v.versionTitle) ? 'is-on' : ''}`}>
            <input type="checkbox" checked={picked.includes(v.versionTitle)} onChange={() => toggle(v.versionTitle)} />
            <span>{versionName(v, lang)}</span>
            {v.versionTitle === book.versionTitle && <span className="ln-small ln-muted"> · {t('teach.translations.current')}</span>}
          </label>
        ))}
      </div>
      <div className="ln-compare-grid" style={{ '--cols': picked.length || 1 }}>
        {picked.map(title => {
          const state = texts[title] || { loading: true };
          const v = versions.find(x => x.versionTitle === title);
          return (
            <section key={title} className="ln-compare-col" aria-label={versionName(v, lang)}>
              <h3 className="ln-compare-title">{versionName(v, lang)}</h3>
              {state.loading && <p className="ln-small ln-muted">{t('teach.translations.loading')}</p>}
              {state.error && <p className="ln-small ln-muted">{t('teach.translations.error')}</p>}
              {state.lines && !state.lines.length && <p className="ln-small ln-muted">{t('teach.translations.empty')}</p>}
              {state.lines && state.lines.map((line, i) => <p key={i} className="ln-text-en ln-compare-line" lang="en" dir="ltr"><span className="ln-compare-n">{i + 1}</span>{line}</p>)}
            </section>
          );
        })}
      </div>
    </div>
  );
}
