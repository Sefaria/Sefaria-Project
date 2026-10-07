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

// Every null tab (sources, books, authors, topics) offers the Library
// Assistant, which opens with a request built from the query that found nothing
export const assistantNoResultsPrompt = (query) => Sefaria.interfaceLang === 'hebrew'
  ? `חיפשתי "${query}" בספריא ואין תוצאות. אפשר לעזור לי למצוא מקורות, ספרים, מחברים ו/או נושאים רלוונטיים?`
  : `I searched for "${query}" on Sefaria and got no results. Can you help me find relevant sources, books, authors and/or topics?`;
const askLibraryAssistant = (query) => document.dispatchEvent(new CustomEvent('chatbot:open', {
  detail: { source: 'search_no_results', question: assistantNoResultsPrompt(query) },
}));

// PROTOTYPE switch for the phone no-results launcher (see NoSearchResults)
const NULL_PROTOTYPE_KEY = 'la_null_prototype';
const nullPrototypeVariant = () => {
  const variants = ['label', 'callout', 'side'];
  try {
    const fromUrl = new URLSearchParams(window.location.search).get(NULL_PROTOTYPE_KEY);
    if (variants.includes(fromUrl)) { localStorage.setItem(NULL_PROTOTYPE_KEY, fromUrl); }
    const saved = localStorage.getItem(NULL_PROTOTYPE_KEY);
    return variants.includes(saved) ? saved : 'label';
  } catch (e) {
    return 'label';
  }
};

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
  // PROTOTYPE: on phones the browse button stays, and the floating Ask button asks about
  // this search when tapped. Three variants, picked with ?la_null_prototype= (remembered):
  // "label" (default) relabels it "✦ Search with Library Assistant"; "callout" keeps "✦ Ask"
  // and shows a hint box above it; "side" shows the hint box beside it.
  const [isMobile, setIsMobile] = useState(false);
  useEffect(() => setIsMobile(Sefaria.getBreakpoint() === Sefaria.breakpoints.MOBILE), []);
  useEffect(() => {
    if (!hasAssistant || !isMobile) { return; }
    const variant = nullPrototypeVariant();
    const look = variant === 'label'
      ? {label: Sefaria._('search.null.launcher.library_assistant')}
      : {callout: Sefaria._('search.null.launcher.callout'), calloutPosition: variant === 'side' ? 'side' : 'above'};
    document.dispatchEvent(new CustomEvent('chatbot:launcher', {detail: {
      ...look,
      question: assistantNoResultsPrompt(query),
      source: 'search_no_results',
    }}));
    return () => document.dispatchEvent(new CustomEvent('chatbot:launcher', {detail: null}));
  }, [hasAssistant, isMobile, query]);
  const showAssistantButton = hasAssistant && !isMobile;
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
            {/* With the assistant on, one body for every tab that points to it */}
            <InterfaceText>{hasAssistant ? 'search.null.body.library_assistant' : key('body')}</InterfaceText>
          </p>
        </div>
        <div className="noSearchResults-ctas">
          {/* The assistant's button replaces the browse button when the assistant is on
              (logged out, or signed in with it on in settings); otherwise browse, as before */}
          {showAssistantButton ? (
            <button type="button" className="noSearchResults-cta noSearchResults-cta--assistant" onClick={() => askLibraryAssistant(query)}>
              <LibraryAssistantStar />
              <InterfaceText>search.null.button.library_assistant</InterfaceText>
            </button>
          ) : (
            <a href={CTA_HREFS[mode]} className="noSearchResults-cta">
              <InterfaceText>{key('button')}</InterfaceText>
            </a>
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
