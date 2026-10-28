import React, { useContext, useEffect, useState } from 'react';
import PropTypes from 'prop-types';
import Sefaria from './sefaria/sefaria';
import { InterfaceText } from './Misc';
import { LibraryAssistantContext } from './context';

const CTA_HREFS = {
  sources: '/texts',
  books:   '/texts',
  authors: '/people',
  topics:  '/topics',
};

// Put the search into a translation's {query}. A function as the replacement, so `$&` and the
// like in the search are kept as typed (in a replacement string they're special patterns).
const fillInQuery = (text, query) => text.replace(/\{query\}/g, () => query);

// The question the Library Assistant is asked about a search that found nothing. The floating
// button and the link in the body must send exactly the same text, so the widget can tell
// they're the same question and only ask it once.
const getAssistantNoResultsQuestion = (query) => fillInQuery(Sefaria._('search.no_results.library_assistant_question'), query);

// Whether the assistant can be offered on this page
const AssistantAvailability = Object.freeze({
  AVAILABLE: 'available',      // ReaderApp put the widget on the page and its script defined it
  UNAVAILABLE: 'unavailable',  // no widget on the page, or its script never loaded
  LOADING: 'loading',          // the widget is on the page but its script hasn't defined it yet
});
// How long to wait for a loading widget before falling back to the browse button
const WIDGET_LOAD_TIMEOUT_MS = 3000;
// Set once the first page has hydrated. Before that, the first render must match the server's,
// which can't know whether the widget's script has loaded.
let hasHydrated = false;

const getAssistantAvailability = (onPage) => {
  if (!onPage || !window.customElements) { return AssistantAvailability.UNAVAILABLE; }
  return window.customElements.get('lc-chatbot') ? AssistantAvailability.AVAILABLE : AssistantAvailability.LOADING;
};

// `onPage` is whether ReaderApp renders the widget (LibraryAssistantContext). While its script
// is still loading, waits for it; a script that fails to load would leave no way forward, so
// after a short wait it gives up and the page shows the browse button instead.
function useAssistantAvailability(onPage) {
  const [availability, setAvailability] = useState(() => {
    if (!onPage) { return AssistantAvailability.UNAVAILABLE; }
    return hasHydrated ? getAssistantAvailability(onPage) : AssistantAvailability.LOADING;
  });
  useEffect(() => {
    hasHydrated = true;
    const current = getAssistantAvailability(onPage);
    setAvailability(current);
    if (current !== AssistantAvailability.LOADING) { return; }
    let cancelled = false;
    let timer;
    const timeout = new Promise(resolve => {
      timer = setTimeout(() => resolve(AssistantAvailability.UNAVAILABLE), WIDGET_LOAD_TIMEOUT_MS);
    });
    Promise.race([window.customElements.whenDefined('lc-chatbot').then(() => AssistantAvailability.AVAILABLE), timeout])
      .then(result => { if (!cancelled) { setAvailability(result); } });
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [onPage]);
  return availability;
}

// The body that points to the assistant. Its translation marks where the line breaks ({br})
// and where the assistant's name goes ({assistant}); the name is a link that opens the
// assistant and asks about the search, like the floating "Search with Library Assistant" button.
function renderAssistantBody(text, query) {
  const open = (e) => {
    e.preventDefault();
    document.dispatchEvent(new CustomEvent('chatbot:open', {detail: {
      source: 'search_no_results',
      question: getAssistantNoResultsQuestion(query),
    }}));
  };
  return text.split(/(\{br\}|\{assistant\})/).map((part, i) => {
    if (part === '{br}') { return <br key={i} />; }
    if (part === '{assistant}') {
      return <a key={i} href="#" onClick={open} className="noSearchResults-assistantLink">{Sefaria._('header.library_assistant')}</a>;
    }
    return part;
  });
}

function NoSearchResults({ mode, query }) {
  const key = (type) => `search.no_results.${mode}.${type}`;
  const heading = fillInQuery(Sefaria._(key('h1')), query);
  // Don't show either version until we know whether the assistant is there, so switching tabs
  // never flashes the browse button
  const availability = useAssistantAvailability(useContext(LibraryAssistantContext));
  const hasAssistant = availability === AssistantAvailability.AVAILABLE;

  // Turn the Library Assistant's "Ask" button into "Search with Library Assistant", which asks
  // about this search when clicked. The widget (ai-chatbot) owns the label; null puts back "Ask".
  useEffect(() => {
    if (!hasAssistant) { return; }
    const question = getAssistantNoResultsQuestion(query);
    document.dispatchEvent(new CustomEvent('chatbot:launcher', {detail: {source: 'search_no_results', question}}));
    return () => document.dispatchEvent(new CustomEvent('chatbot:launcher', {detail: null}));
  }, [hasAssistant, query]);

  const classes = ['noSearchResults'];
  if (hasAssistant) { classes.push('noSearchResults--withAssistant'); }
  if (availability === AssistantAvailability.LOADING) { classes.push('noSearchResults--pending'); }

  return (
    <div className={classes.join(' ')}>
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
              ? renderAssistantBody(Sefaria._(key('body.library_assistant')), query)
              : <InterfaceText>{key('body')}</InterfaceText>}
          </p>
        </div>
        {/* With the assistant on, its "Search with Library Assistant" button takes this one's place */}
        {availability === AssistantAvailability.UNAVAILABLE &&
          <a href={CTA_HREFS[mode]} className="noSearchResults-cta">
            <InterfaceText>{key('button')}</InterfaceText>
          </a>
        }
      </div>
    </div>
  );
}

NoSearchResults.propTypes = {
  mode:  PropTypes.oneOf(['sources', 'books', 'authors', 'topics']).isRequired,
  query: PropTypes.string,
};

export default NoSearchResults;
