import React from 'react';
import PropTypes from 'prop-types';

const NO_RESULTS_CONTENT = {
  sources: {
    heading: (query) => `No sources found for “${query}”`,
    body:    'Try a different spelling or shorter search term, or browse the library',
    ctaText: 'Browse the library',
    ctaHref: '/texts',
  },
  books: {
    heading: (query) => `No books found for “${query}”`,
    body:    'Try a different spelling or shorter search term, or browse through all of our books',
    ctaText: 'Browse the library',
    ctaHref: '/texts',
  },
  authors: {
    heading: (query) => '',
    body:    'Lorem ipsum dolor sit amet, consectetur adipiscing elit.',
    ctaText: '',
    ctaHref: '',
  },
  topics: {
    heading: (query) => `No topics found for “${query}”`,
    body:    'Try a different or shorter search term, or browse topics.',
    ctaText: 'Browse Topics',
    ctaHref: '/topics',
  },
};

function NoSearchResults({ mode, query }) {
  const { heading: getHeading, body, ctaText, ctaHref } = NO_RESULTS_CONTENT[mode] || {};

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
          <p className="noSearchResults-heading serif">{getHeading?.(query)}</p>
          <p className="noSearchResults-body">{body}</p>
        </div>
        <a href={ctaHref} className="noSearchResults-cta">
          {ctaText}
        </a>
        <p className="noSearchResults-caption">
          {'Something seem wrong? '}
          <a href="#" className="noSearchResults-captionLink">{'Report a bug'}</a>
          {' or '}
          <a href="#" className="noSearchResults-captionLink">{'contact us'}</a>
          {'.'}
        </p>
      </div>
    </div>
  );
}

NoSearchResults.propTypes = {
  mode:  PropTypes.oneOf(['sources', 'books', 'authors', 'topics']).isRequired,
  query: PropTypes.string,
};

export default NoSearchResults;
