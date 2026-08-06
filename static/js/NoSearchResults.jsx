import React from 'react';
import PropTypes from 'prop-types';
import Sefaria from './sefaria/sefaria';
import { InterfaceText } from './Misc';

const CTA_HREFS = {
  sources: '/texts',
  books:   '/texts',
  authors: '/people',
  topics:  '/topics',
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
  const key = (type) => `search.null.${mode}.${type}`;
  const heading = Sefaria._(key('h1')).replace(/\[query\]|\{userquery\}/g, query);

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
            <InterfaceText>{key('body')}</InterfaceText>
          </p>
        </div>
        <a href={CTA_HREFS[mode]} className="noSearchResults-cta">
          <InterfaceText>{key('button')}</InterfaceText>
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
