import React from 'react';
import PropTypes from 'prop-types';
import Sefaria from './sefaria/sefaria';
import { InterfaceText } from './Misc';

const NO_RESULTS_CONTENT = {
  sources: {
    h1Key:     'search.null.sources.h1',
    bodyKey:   'search.null.sources.body',
    buttonKey: 'search.null.sources.button',
    captionKey:'search.null.sources.caption',
    ctaHref:   '/texts',
  },
  books: {
    h1Key:     'search.null.books.h1',
    bodyKey:   'search.null.books.body',
    buttonKey: 'search.null.books.button',
    captionKey:'search.null.books.caption',
    ctaHref:   '/texts',
  },
  authors: {
    h1Key:     'search.null.authors.h1',
    bodyKey:   'search.null.authors.body',
    buttonKey: 'search.null.authors.button',
    captionKey:'search.null.authors.caption',
    ctaHref:   '/people',
  },
  topics: {
    h1Key:     'search.null.topics.h1',
    bodyKey:   'search.null.topics.body',
    buttonKey: 'search.null.topics.button',
    captionKey:'search.null.topics.caption',
    ctaHref:   '/topics',
  },
};

// The caption key value is "Something seem wrong? Report a bug or contact us."
// We split around the two link phrases to keep them clickable.
const CAPTION_LINK_PATTERN = /(Report a bug|contact us)/;

function renderCaption(captionKey) {
  const parts = Sefaria._(captionKey).split(CAPTION_LINK_PATTERN);
  return (
    <p className="noSearchResults-caption">
      {parts.map((part, i) =>
        part === 'Report a bug' || part === 'contact us'
          ? <a key={i} href="#" className="noSearchResults-captionLink">{part}</a>
          : part
      )}
    </p>
  );
}

function NoSearchResults({ mode, query }) {
  const { h1Key, bodyKey, buttonKey, captionKey, ctaHref } = NO_RESULTS_CONTENT[mode] || {};
  const heading = Sefaria._(h1Key).replace('[query]', query);

  return (
    <div className="noSearchResults">
      <img
        src="/static/img/placeholder3.svg"
        alt=""
        className="noSearchResults-image"
        aria-hidden="true"
      />
      <div className="noSearchResults-content">
        <div className="noSearchResults-textGroup">
          <p className="noSearchResults-heading serif">{heading}</p>
          <p className="noSearchResults-body">
            <InterfaceText>{bodyKey}</InterfaceText>
          </p>
        </div>
        <a href={ctaHref} className="noSearchResults-cta">
          <InterfaceText>{buttonKey}</InterfaceText>
        </a>
        {renderCaption(captionKey)}
      </div>
    </div>
  );
}

NoSearchResults.propTypes = {
  mode:  PropTypes.oneOf(['sources', 'books', 'authors', 'topics']).isRequired,
  query: PropTypes.string,
};

export default NoSearchResults;
