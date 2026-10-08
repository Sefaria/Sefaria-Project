import React, { useEffect, useState } from 'react';
import PropTypes from 'prop-types';
import Sefaria from './sefaria/sefaria';
import { InterfaceText } from './Misc';

const CTA_HREFS = {
  sources: '/texts',
  books:   '/texts',
  authors: '/people',
  topics:  '/topics',
};

// With the assistant on, the floating Ask button becomes "✦ Search with Library Assistant"
// on a no-results page and asks the assistant about the search that found nothing
export const assistantNoResultsPrompt = (query) => Sefaria.interfaceLang === 'hebrew'
  ? `חיפשתי "${query}" בספריא ואין תוצאות. אפשר לעזור לי למצוא מקורות, ספרים, מחברים ו/או נושאים רלוונטיים?`
  : `I searched for "${query}" on Sefaria and got no results. Can you help me find relevant sources, books, authors and/or topics?`;

// Keep the assistant's name on one line wherever the text wraps
const keepNameTogether = (text) => text.replace(/Library Assistant/g, 'Library\u00a0Assistant').replace(/עוזר הספרייה/g, 'עוזר\u00a0הספרייה');

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
  useEffect(() => {
    if (!hasAssistant) { return; }
    document.dispatchEvent(new CustomEvent('chatbot:launcher', {detail: {
      label: Sefaria._('search.null.launcher.library_assistant'),
      question: assistantNoResultsPrompt(query),
      source: 'search_no_results',
    }}));
    return () => document.dispatchEvent(new CustomEvent('chatbot:launcher', {detail: null}));
  }, [hasAssistant, query]);
  const heading = Sefaria._(key('h1')).replace(/\[query\]|\{userquery\}/g, query);

  return (
    <div className={hasAssistant ? "noSearchResults noSearchResults--withAssistant" : "noSearchResults"}>
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
            {hasAssistant
              ? keepNameTogether(Sefaria._(key('body_library_assistant')))
              : <InterfaceText>{key('body')}</InterfaceText>}
          </p>
        </div>
        {/* With the assistant on, the floating button is the way forward; with it off, browse */}
        {!hasAssistant && (
          <div className="noSearchResults-ctas">
            <a href={CTA_HREFS[mode]} className="noSearchResults-cta">
              <InterfaceText>{key('button')}</InterfaceText>
            </a>
          </div>
        )}
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
