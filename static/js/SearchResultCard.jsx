import React, { useState, useRef, useEffect } from 'react';
import PropTypes from 'prop-types';
import Sefaria from './sefaria/sefaria';
import { InterfaceText } from './Misc';
import BreadcrumbPath from './BreadcrumbPath';

// Tracks whether a touch gesture is a tap (no/minimal movement) so we can show
// a pressed state only for taps, not for scrolls that happen to start on a card.
function usePressState() {
  const ref = useRef(null);
  const [pressed, setPressed] = useState(false);
  const startPos = useRef(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    const onStart = (e) => {
      const t = e.touches[0];
      startPos.current = { x: t.clientX, y: t.clientY };
      setPressed(true);
    };
    const onMove = (e) => {
      if (!startPos.current) return;
      const t = e.touches[0];
      if (Math.abs(t.clientX - startPos.current.x) > 10 ||
          Math.abs(t.clientY - startPos.current.y) > 10) {
        setPressed(false);
        startPos.current = null;
      }
    };
    const onEnd = () => {
      setPressed(false);
      startPos.current = null;
    };

    el.addEventListener('touchstart',  onStart, { passive: true });
    el.addEventListener('touchmove',   onMove,  { passive: true });
    el.addEventListener('touchend',    onEnd,   { passive: true });
    el.addEventListener('touchcancel', onEnd,   { passive: true });
    return () => {
      el.removeEventListener('touchstart',  onStart);
      el.removeEventListener('touchmove',   onMove);
      el.removeEventListener('touchend',    onEnd);
      el.removeEventListener('touchcancel', onEnd);
    };
  }, []);

  return [ref, pressed];
}

const TYPE_ICONS = {
  author:     '/static/icons/iconmonstr-pen-17.svg',
  topic:      '/static/icons/topic.svg',
  text:       '/static/icons/book.svg',
  collection: '/static/icons/collection.svg',
};

const MODES_WITH_CATEGORY_COLOR = new Set(['books', 'sources']);

// Singular and plural are separate interface strings so each language can inflect its own way.
const versionsToggleLabel = (count) => Sefaria._bilingual(
  count === 1 ? 'search.result_card.one_more_version' : 'search.result_card.more_versions',
  { count }
);

function SearchResultCard({
  mode,
  name,
  hebrewName,
  altName,
  hebrewAltName,
  crumbs,
  secondaryDate,
  hebrewSecondaryDate,
  secondaryAuthor,
  hebrewSecondaryAuthor,
  secondaryAuthorHref,
  secondaryAuthorAlt,
  hebrewSecondaryAuthorAlt,
  description,
  hebrewDescription,
  descriptionHtml,
  icon,
  type = 'text',
  href,
  tref,
  onResultClick,
  query,
  accentColor,
  // Sources-mode specific props
  snippet,
  snippetLang,
  versionName,
  hebrewVersionName,
  versions,
  currVersions,
  textHighlights,
}) {
  const [versionsOpen, setVersionsOpen] = useState(false);
  const [pressRef, isPressed] = usePressState();

  // The single click path for every clickable part of the card. Opening a result has to
  // carry two things the ref alone can't: which version matched, and which words to
  // highlight once the panel renders. `target` says *which* result was clicked — the
  // card's own version, or one of the rows in the expanded versions list.
  const openResult = async (target) => {
    Sefaria.track.event('Search', 'Search Result Card Click', `${query} - ${name}`);
    if (!onResultClick) {
      window.location.href = target.href;
      return;
    }
    let ref = target.tref ?? target.href;
    if (target.tref) {
      // If a title was renamed since the last Elasticsearch reindex, there's no local
      // index entry for this ref, so ask the API to normalize it
      // (e.g. "Bereishit Rabbah 3" => "Bereshit Rabbah 3") before handing it to the reader.
      const parsedRef = Sefaria.parseRef(target.tref);
      ref = parsedRef.index?.length ? parsedRef.ref : (await Sefaria.getRef(target.tref)).ref;
    }
    onResultClick(
      ref,
      target.currVersions ?? null,
      target.textHighlights?.length ? { textHighlights: target.textHighlights } : null
    );
  };

  // The card's own result — the version named in searchResultCard-versionName.
  const ownResult = { tref, href, currVersions, textHighlights };

  const handleCardClick = () => {
    if (window.getSelection && window.getSelection().toString()) return;
    openResult(ownResult);
  };

  // Links inside the card keep a real href so Cmd/Ctrl-click still opens a new tab, but a
  // plain click runs the in-app handler — otherwise different parts of one card behave
  // differently depending on where you click.
  const handleLinkClick = (target) => (e) => {
    e.stopPropagation();  // the card's own onClick would fire too, opening the wrong version
    // Modified clicks, and modes with no in-app handler, fall through to the browser;
    // the href already points at the matched version with the query highlighted.
    if (!onResultClick || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
    e.preventDefault();
    openResult(target);
  };

  const handleCardKeyDown = (e) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      handleCardClick();
    }
  };

  // Books and sources derive their accent color from the Sefaria category palette.
  // An explicit accentColor prop always wins (useful for overrides / storybook).
  const resolvedAccentColor = accentColor
    || (MODES_WITH_CATEGORY_COLOR.has(mode) && name ? Sefaria.palette.refColor(name) : '#000');

  const isSourcesMode = mode === 'sources';
  // Sources cards don't show the icon circle — the colored bar and ref title are sufficient.
  const resolvedIcon = isSourcesMode ? null : (icon || TYPE_ICONS[type.toLowerCase()] || TYPE_ICONS.text);
  const hasDescription = !isSourcesMode && !!(descriptionHtml || description);

  return (
    <div
      ref={pressRef}
      className={`searchResultCard searchResultCard--${mode}${isPressed ? ' is-pressed' : ''}`}
      role="link"
      tabIndex={0}
      aria-label={name}
      onClick={handleCardClick}
      onKeyDown={handleCardKeyDown}
    >
      <div className="searchResultCard-bar" style={{ backgroundColor: resolvedAccentColor }} />
      <div className={`searchResultCard-content${hasDescription ? '' : ' searchResultCard-content--centered'}`}>
        {resolvedIcon && (
          <div className="searchResultCard-iconCircle">
            {(type === 'text' || type === 'collection') && MODES_WITH_CATEGORY_COLOR.has(mode) ? (
              <span
                className="searchResultCard-iconImg searchResultCard-iconImg--masked"
                role="img"
                aria-label={`${type} icon`}
                style={{
                  WebkitMaskImage: `url(${resolvedIcon})`,
                  maskImage: `url(${resolvedIcon})`,
                  backgroundColor: resolvedAccentColor,
                }}
              />
            ) : (
              <img
                src={resolvedIcon}
                alt={`${type} icon`}
                className={`searchResultCard-iconImg searchResultCard-iconImg--${type.toLowerCase()}`}
              />
            )}
          </div>
        )}
        <div className="searchResultCard-body">
          {crumbs && crumbs.length > 0 && (
            <BreadcrumbPath crumbs={crumbs} />
          )}
          <div className="searchResultCard-header">
            <a href={href} className="searchResultCard-titleLink" onClick={handleLinkClick(ownResult)}>
              <div className="searchResultCard-titleRow">
                <span className="searchResultCard-name">
                  <InterfaceText text={{ en: name, he: hebrewName }} />
                </span>
                {altName && (
                  <span className="searchResultCard-altName">
                    <InterfaceText text={{ en: altName, he: hebrewAltName }} />
                  </span>
                )}
              </div>
            </a>
            {!isSourcesMode && (secondaryDate || secondaryAuthor) && (
              <div className="searchResultCard-secondary">
                {secondaryDate && (
                  <span className="searchResultCard-secondary-date">
                    <InterfaceText text={{ en: secondaryDate, he: hebrewSecondaryDate }} />
                  </span>
                )}
                {secondaryDate && secondaryAuthor && (
                  <span className="searchResultCard-secondary-dot" aria-hidden="true">·</span>
                )}
                {secondaryAuthor && (
                  <span className="searchResultCard-secondary-author">
                    {secondaryAuthorHref ? (
                      <a href={secondaryAuthorHref} onClick={e => e.stopPropagation()}>
                        <InterfaceText text={{ en: secondaryAuthor, he: hebrewSecondaryAuthor }} />
                      </a>
                    ) : (
                      <InterfaceText text={{ en: secondaryAuthor, he: hebrewSecondaryAuthor }} />
                    )}
                  </span>
                )}
                {secondaryAuthor && secondaryAuthorAlt && (
                  <span className="searchResultCard-secondary-authorAlt">
                    <InterfaceText text={{ en: secondaryAuthorAlt, he: hebrewSecondaryAuthorAlt }} />
                  </span>
                )}
              </div>
            )}
          </div>

          {isSourcesMode && snippet && (
            <div
              className={`searchResultCard-snippet${snippetLang === 'he' ? ' he' : ' en'}`}
              dangerouslySetInnerHTML={{ __html: snippet }}
            />
          )}

          {isSourcesMode && versionName && (
            <div className="searchResultCard-versionName">
              <InterfaceText text={{ en: versionName, he: hebrewVersionName || versionName }} />
            </div>
          )}

          {isSourcesMode && versions && versions.length > 0 && (
            <div className="searchResultCard-versionsSection">
              <button
                type="button"
                className="searchResultCard-versionsToggle"
                onClick={(e) => { e.stopPropagation(); setVersionsOpen(o => !o); }}
                aria-expanded={versionsOpen}
              >
                <InterfaceText text={versionsToggleLabel(versions.length)} />
                <span
                  className={`searchResultCard-versionsChevron${versionsOpen ? ' open' : ''}`}
                  aria-hidden="true"
                />
              </button>
              {versionsOpen && (
                <div className="searchResultCard-versionsList">
                  {versions.map((v, i) => (
                    <a
                      key={i}
                      href={v.href}
                      className="searchResultCard-versionItem"
                      onClick={handleLinkClick(v)}
                    >
                      <div
                        className={`searchResultCard-snippet${v.snippetLang === 'he' ? ' he' : ' en'}`}
                        dangerouslySetInnerHTML={{ __html: v.snippet }}
                      />
                      <div className="searchResultCard-versionName">
                        <InterfaceText text={{ en: v.versionName, he: v.hebrewVersionName || v.versionName }} />
                      </div>
                    </a>
                  ))}
                </div>
              )}
            </div>
          )}

          {!isSourcesMode && (descriptionHtml || description) && (
            <div className="searchResultCard-description">
              {descriptionHtml
                ? <span dangerouslySetInnerHTML={{ __html: descriptionHtml }} />
                : <InterfaceText text={{ en: description, he: hebrewDescription }} />
              }
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

SearchResultCard.propTypes = {
  mode:                 PropTypes.oneOf(['books', 'authors', 'topics', 'sources']).isRequired,
  name:                 PropTypes.string.isRequired,
  hebrewName:           PropTypes.string,
  altName:              PropTypes.string,
  hebrewAltName:        PropTypes.string,
  crumbs:               PropTypes.arrayOf(PropTypes.shape({
    label:       PropTypes.string.isRequired,
    hebrewLabel: PropTypes.string,
    href:        PropTypes.string,
  })),
  secondaryDate:           PropTypes.string,
  hebrewSecondaryDate:     PropTypes.string,
  secondaryAuthor:         PropTypes.string,
  hebrewSecondaryAuthor:   PropTypes.string,
  secondaryAuthorHref:     PropTypes.string,
  secondaryAuthorAlt:      PropTypes.string,
  hebrewSecondaryAuthorAlt: PropTypes.string,
  description:          PropTypes.string,
  hebrewDescription:    PropTypes.string,
  icon:                 PropTypes.string,
  type:                 PropTypes.oneOf(['author', 'topic', 'text', 'collection']),
  href:                 PropTypes.string.isRequired,
  tref:                 PropTypes.string,
  onResultClick:        PropTypes.func,
  query:                PropTypes.string,
  accentColor:          PropTypes.string,   // explicit override; skips palette lookup
  // Sources mode
  snippet:              PropTypes.string,
  snippetLang:          PropTypes.oneOf(['en', 'he']),
  versionName:          PropTypes.string,
  hebrewVersionName:    PropTypes.string,
  versions:             PropTypes.arrayOf(PropTypes.shape({
    snippet:          PropTypes.string.isRequired,
    snippetLang:      PropTypes.oneOf(['en', 'he']),
    versionName:      PropTypes.string,
    hebrewVersionName: PropTypes.string,
    href:             PropTypes.string,
    // Each row opens its own version, so it needs its own ref/version/highlights.
    tref:             PropTypes.string,
    currVersions:     PropTypes.object,
    textHighlights:   PropTypes.arrayOf(PropTypes.string),
  })),
  // The version that matched, keyed by reader slot: 'he' = primary text, 'en' = translation.
  currVersions:         PropTypes.shape({
    en: PropTypes.shape({ versionTitle: PropTypes.string, languageFamilyName: PropTypes.string }),
    he: PropTypes.shape({ versionTitle: PropTypes.string, languageFamilyName: PropTypes.string }),
  }),
  // Matched words, re-highlighted in the reader after the panel opens.
  textHighlights:       PropTypes.arrayOf(PropTypes.string),
};

export { BreadcrumbPath };
export default SearchResultCard;
