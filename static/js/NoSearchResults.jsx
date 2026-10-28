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

// Keep the assistant's name on one line wherever the text wraps
const keepNameTogether = (text) => text.replace(/Library Assistant/g, 'Library Assistant').replace(/עוזר הספרייה/g, 'עוזר הספרייה');

// The assistant's name in the body is a link that opens it and asks the search, like the
// floating "Search with Library Assistant" button. The body breaks after its last "or" ("או").
function linkAssistantName(text, query) {
  const match = /Library Assistant|עוזר הספרייה/g;
  const all = [...text.matchAll(match)];
  if (!all.length) { return text; }
  const {index, 0: name} = all[all.length - 1];
  const open = (e) => {
    e.preventDefault();
    document.dispatchEvent(new CustomEvent('chatbot:open', {detail: {
      source: 'search_no_results',
      question: getAssistantNoResultsQuestion(query),
    }}));
  };
  const before = text.slice(0, index);
  const or = before.includes(' או ') ? ' או ' : ' or ';
  const orAt = before.lastIndexOf(or);
  // The space after "or" stays before the break: it's invisible at the end of a line, and keeps
  // the text reading "or ask" (not "orask") for screen readers and copying
  const lead = orAt === -1 ? before : <>{before.slice(0, orAt + or.length)}<br />{before.slice(orAt + or.length)}</>;
  return <>{lead}<a href="#" onClick={open} className="noSearchResults-assistantLink">{name}</a>{text.slice(index + name.length)}</>;
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
              ? linkAssistantName(keepNameTogether(Sefaria._(key('body.library_assistant'))), query)
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
