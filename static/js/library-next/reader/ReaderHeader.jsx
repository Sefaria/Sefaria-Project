/**
 * Header strip: book title + position, breadcrumbs, book page link, copy link, and the version
 * switcher (versions grouped by language; Hebrew "source" and the "translation" family).
 */
import React from 'react';
import Sefaria from '../../sefaria/sefaria';
import { useT } from '../i18n';
import { Link } from '../router';
import { toast } from '../overlays';
import { groupVersions, splitVersionGroups, versionLabel, positionLabel, sectionParts } from './textData';

export async function copyToClipboard(text) {
  try {
    if (typeof navigator !== 'undefined' && navigator.clipboard && navigator.clipboard.writeText) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch (e) { /* fall through */ }
  try {
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.setAttribute('readonly', '');
    ta.style.position = 'fixed';
    ta.style.opacity = '0';
    document.body.appendChild(ta);
    ta.select();
    const ok = document.execCommand && document.execCommand('copy');
    ta.remove();
    return !!ok;
  } catch (e) {
    return false;
  }
}

function hebrewCategory(cat) {
  return (Sefaria.hebrewTerm && Sefaria.hebrewTerm(cat)) || cat;
}

function VersionSelect({ id, label, groups, value, onChange, lang, t }) {
  if (!groups.length) { return null; }
  return (
    <label className="ln-version-select">
      <span className="ln-version-select-label">{label}</span>
      <select id={id} className="ln-input" value={value || ''} onChange={e => onChange(e.target.value)}>
        {groups.map(g => (
          <optgroup key={g.lang} label={t(`reader.lang.${g.lang}`) === `reader.lang.${g.lang}` ? g.lang.toUpperCase() : t(`reader.lang.${g.lang}`)}>
            {g.versions.map(v => <option key={v.versionTitle} value={v.versionTitle}>{versionLabel(v, lang)}</option>)}
          </optgroup>
        ))}
      </select>
    </label>
  );
}

export default function ReaderHeader({ tref, data, current, onVersion, versionsOpen, onToggleVersions }) {
  const { t, lang } = useT();
  if (!data) {
    return (
      <header className="ln-reader-head">
        <h1 className="ln-reader-title"><span className="ln-reader-book">{tref}</span></h1>
      </header>
    );
  }
  const parts = sectionParts(data, lang);
  const pos = positionLabel(data);
  const bookPath = `/${(data.indexTitle || '').replace(/ /g, '_')}`;
  const groups = groupVersions(data.versions);
  const { source, translation } = splitVersionGroups(groups);
  const heCurrent = current.he || data.heVersionTitle;
  const enCurrent = current.en || data.versionTitle;
  const copyLink = async () => {
    const ok = await copyToClipboard(window.location.href);
    toast(t(ok ? 'reader.linkCopied' : 'tool.cite.copyFailed'));
  };
  const cats = (data.categories || []).map(c => (lang === 'he' ? hebrewCategory(c) : c));
  return (
    <header className="ln-reader-head" style={{ '--cat': Sefaria.palette.categoryColor(data.primary_category) }}>
      <div className="ln-reader-head-row">
        <h1 className="ln-reader-title ln-cat-rule">
          <span className="ln-reader-book">{parts.title}</span>
          {parts.position && <> <span className="ln-reader-pos">{parts.position}</span></>}
        </h1>
        <div className="ln-reader-head-tools">
          <button type="button" className="ln-btn ln-btn-quiet" onClick={copyLink}>{t('reader.copyLink')}</button>
          <button type="button" className={`ln-btn ln-btn-quiet ${versionsOpen ? 'is-active' : ''}`} aria-expanded={versionsOpen}
                  aria-controls="ln-versions" onClick={onToggleVersions}>
            {t('reader.versions')}
          </button>
        </div>
      </div>
      <p className="ln-reader-sub ln-muted">
        <span>{lang === 'he' ? pos.he : pos.en}</span>
        {cats.length > 0 && <span className="ln-reader-crumbs"> · {cats.join(' › ')}</span>}
        <span> · </span>
        <Link to={bookPath} className="ln-reader-booklink">{t('reader.bookPage')}</Link>
      </p>
      <div id="ln-versions" className="ln-versions" hidden={!versionsOpen}>
        <VersionSelect id="ln-version-he" label={t('reader.versions.source')} groups={source} value={heCurrent}
                       onChange={v => onVersion('he', v)} lang={lang} t={t} />
        <VersionSelect id="ln-version-en" label={t('reader.versions.translation')} groups={translation} value={enCurrent}
                       onChange={v => onVersion('en', v)} lang={lang} t={t} />
      </div>
      {!versionsOpen && (
        <p className="ln-reader-versions-now ln-small ln-muted">
          {[data.heVersionTitle && (lang === 'he' && data.heVersionTitleInHebrew ? data.heVersionTitleInHebrew : data.heVersionTitle),
            data.versionTitle && (lang === 'he' && data.versionTitleInHebrew ? data.versionTitleInHebrew : data.versionTitle)].filter(Boolean).join(' · ')}
        </p>
      )}
    </header>
  );
}
