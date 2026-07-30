import React from 'react';
import PropTypes from 'prop-types';
import Sefaria from './sefaria/sefaria';
import { InterfaceText } from './Misc';

const NO_RESULTS_CONTENT = {
  sources: {
    h1Key:     'search.null.sources.h1',
    bodyKey:   'search.null.sources.body',
    buttonKey: 'search.null.sources.button',
    ctaHref:   '/texts',
  },
  books: {
    h1Key:     'search.null.books.h1',
    bodyKey:   'search.null.books.body',
    buttonKey: 'search.null.books.button',
    ctaHref:   '/texts',
  },
  authors: {
    h1Key:     'search.null.authors.h1',
    bodyKey:   'search.null.authors.body',
    buttonKey: 'search.null.authors.button',
    ctaHref:   '/people',
  },
  topics: {
    h1Key:     'search.null.topics.h1',
    bodyKey:   'search.null.topics.body',
    buttonKey: 'search.null.topics.button',
    ctaHref:   '/topics',
  },
};

function renderCaption() {
  const reportBugText = Sefaria._('search.null.caption.report_bug');
  const contactUsText = Sefaria._('search.null.caption.contact_us');
  const [before, middle, after] = Sefaria._('search.null.caption').split(/\[report_bug\]|\[contact_us\]/);
  return (
    <p className="noSearchResults-caption">
      {before}
      <a href={Sefaria._('search.null.caption.report_bug.href')} className="noSearchResults-captionLink">{reportBugText}</a>
      {middle}
      <a href={Sefaria._('search.null.caption.contact_us.href')} className="noSearchResults-captionLink">{contactUsText}</a>
      {after}
    </p>
  );
}

function NoSearchResults({ mode, query }) {
  const { h1Key, bodyKey, buttonKey, ctaHref } = NO_RESULTS_CONTENT[mode] || {};
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
        {renderCaption()}
      </div>
    </div>
  );
}

NoSearchResults.propTypes = {
  mode:  PropTypes.oneOf(['sources', 'books', 'authors', 'topics']).isRequired,
  query: PropTypes.string,
};

export default NoSearchResults;
