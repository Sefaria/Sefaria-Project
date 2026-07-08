import React from 'react';
import PropTypes from 'prop-types';
import Sefaria from './sefaria/sefaria';
import { InterfaceText } from './Misc';
import BreadcrumbPath from './BreadcrumbPath';

const TYPE_ICONS = {
  author:     '/static/img/authors-icon.png',
  topic:      '/static/icons/topic.svg',
  text:       '/static/icons/book.svg',
  collection: '/static/icons/collection.svg',
};

const MODES_WITH_CATEGORY_COLOR = new Set(['books', 'sources']);

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
  secondaryAuthorAlt,
  hebrewSecondaryAuthorAlt,
  description,
  hebrewDescription,
  descriptionHtml,
  icon,
  type = 'text',
  href,
  onResultClick,
  query,
  accentColor,
}) {
  const handleClick = (e) => {
    if (onResultClick) {
      e.preventDefault();
      Sefaria.track.event('Search', 'Search Result Card Click', `${query} - ${name}`);
      onResultClick(href);
    }
  };

  // Books and sources derive their accent color from the Sefaria category palette.
  // An explicit accentColor prop always wins (useful for overrides / storybook).
  const resolvedAccentColor = accentColor
    || (MODES_WITH_CATEGORY_COLOR.has(mode) && name ? Sefaria.palette.refColor(name) : '#000');

  const resolvedIcon = icon || TYPE_ICONS[type.toLowerCase()] || TYPE_ICONS.text;

  return (
    <div className={`searchResultCard searchResultCard--${mode}`}>
      <div className="searchResultCard-bar" style={{ backgroundColor: resolvedAccentColor }} />
      <div className="searchResultCard-content">
        {resolvedIcon && (
          <div className="searchResultCard-iconCircle">
            <img src={resolvedIcon} alt={`${type} icon`} className="searchResultCard-iconImg" />
          </div>
        )}
        <div className="searchResultCard-body">
          {crumbs && crumbs.length > 0 && (
            <BreadcrumbPath crumbs={crumbs} />
          )}
          <div className="searchResultCard-header">
            <a href={href} onClick={handleClick} className="searchResultCard-titleLink">
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
            {(secondaryDate || secondaryAuthor) && (
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
                    <InterfaceText text={{ en: secondaryAuthor, he: hebrewSecondaryAuthor }} />
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
          {(descriptionHtml || description) && (
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
  secondaryAuthorAlt:      PropTypes.string,
  hebrewSecondaryAuthorAlt: PropTypes.string,
  description:          PropTypes.string,
  hebrewDescription:    PropTypes.string,
  icon:                 PropTypes.string,
  type:                 PropTypes.oneOf(['author', 'topic', 'text', 'collection']),
  href:                 PropTypes.string.isRequired,
  onResultClick:        PropTypes.func,
  query:                PropTypes.string,
  accentColor:          PropTypes.string,   // explicit override; skips palette lookup
};

export { BreadcrumbPath };
export default SearchResultCard;
