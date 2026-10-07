import React, { useEffect, useState } from 'react';
import PropTypes from 'prop-types';
import Sefaria from './sefaria/sefaria';
import { InterfaceText } from './Misc';
import LibraryAssistantStar from './LibraryAssistantStar';

const CTA_HREFS = {
  sources: '/texts',
  books:   '/texts',
  authors: '/people',
  topics:  '/topics',
};

// The Sources null page offers the Library
// Assistant, which opens with a request built from the query that found nothing
export const assistantNoResultsPrompt = (query) => Sefaria.interfaceLang === 'hebrew'
  ? `חיפשתי את "${query}" בספריא ואין תוצאות. אפשר לעזור לי למצוא מקורות, ספרים, מחברים ו/או נושאים רלוונטיים?`
  : `I searched for "${query}" on Sefaria and got no results. Can you help me find relevant sources, books, authors and/or topics?`;
const askLibraryAssistant = (query) => document.dispatchEvent(new CustomEvent('chatbot:open', {
  detail: { source: 'search_no_results', question: assistantNoResultsPrompt(query) },
}));

function renderCaption() {
  const reportBugText = Sefaria._('search.null.caption.report_bug');
  const contactUsText = Sefaria._('search.null.caption.contact_us');
  const [before, middle, after] = Sefaria._('search.null.caption').split(/\{bug\}|\{contact\}/);
  return (
    <p className="noSearchResults-caption">
      {before}
      <a href={Sefaria._('search.null.caption.bug.link')} className="noSearchResults-captionLink">{reportBugText}</a>
      {middle}
      <a href={Sefaria._('search.null.caption.contact_us.href')} className="noSearchResults-captionLink">{contactUsText}</a>
      {after}
    </p>
  );
}

function NoSearchResults({ mode, query }) {
  const key = (type) => `search.null.${mode}.${type}`;
  // Only offer the assistant when its widget is on the page (checked after mount: SSR has no document)
  const [hasAssistant, setHasAssistant] = useState(false);
  useEffect(() => setHasAssistant(!!document.querySelector('lc-chatbot')), []);
  const heading = Sefaria._(key('h1')).replace(/\[query\]|\{userquery\}/g, query);

  return (
    <div className="noSearchResults">
      <img
        src={`/static/img/no-results-search-illustrations/NoResults${
          {sources: 'Source', books: 'Books', authors: 'Authors', topics: 'Topics'}[mode]
        }.svg`}
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
        <div className="noSearchResults-ctas">
          <a href={CTA_HREFS[mode]} className="noSearchResults-cta">
            <InterfaceText>{key('button')}</InterfaceText>
          </a>
          {mode === 'sources' && hasAssistant && (
            <button type="button" className="noSearchResults-cta noSearchResults-cta--assistant" onClick={() => askLibraryAssistant(query)}>
              <LibraryAssistantStar />
              <InterfaceText>search.null.button.library_assistant</InterfaceText>
            </button>
          )}
        </div>
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
