import React, { useEffect } from 'react';
import PropTypes from 'prop-types';
import Sefaria from './sefaria/sefaria';
import { InterfaceText } from './Misc';

const CTA_HREFS = {
  sources: '/texts',
  books:   '/texts',
  authors: '/people',
  topics:  '/topics',
};

// The question the Library Assistant is asked about a search that found nothing. The floating
// button and the link in the body must send exactly the same text, so the widget can tell
// they're the same question and only ask it once.
const assistantNoResultsQuestion = (query) => Sefaria._('search.null.library_assistant_question').replace(/\{query\}/g, query);

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
      question: assistantNoResultsQuestion(query),
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
  const key = (type) => `search.null.${mode}.${type}`;
  const heading = Sefaria._(key('h1')).replace(/\[query\]|\{userquery\}/g, query);
  const hasAssistant = !!Sefaria.chatbot_enabled;

  // Turn the Library Assistant's "Ask" button into "Search with Library Assistant", which asks
  // about this search when clicked. The widget (ai-chatbot) owns the label; null puts back "Ask".
  useEffect(() => {
    const question = assistantNoResultsQuestion(query);
    document.dispatchEvent(new CustomEvent('chatbot:launcher', {detail: {source: 'search_no_results', question}}));
    return () => document.dispatchEvent(new CustomEvent('chatbot:launcher', {detail: null}));
  }, [query]);

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
              ? linkAssistantName(keepNameTogether(Sefaria._(key('body.library_assistant'))), query)
              : <InterfaceText>{key('body')}</InterfaceText>}
          </p>
        </div>
        {/* With the Library Assistant setting on, its "Search with Library Assistant" button takes this one's place */}
        {!hasAssistant &&
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
