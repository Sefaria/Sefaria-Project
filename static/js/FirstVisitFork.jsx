import React from 'react';
import PropTypes from 'prop-types';
import { InterfaceText } from './Misc';

const LIBRARY_ASSISTANT_SOURCE = 'first_visit_fork';

// The Library Assistant listens for `chatbot:open` once <lc-chatbot> has mounted, so wait for the
// element to be defined and rendered before dispatching. If it never appears this is a no-op.
const openLibraryAssistant = (source = LIBRARY_ASSISTANT_SOURCE) => {
  if (typeof window === 'undefined' || !window.customElements) { return; }
  customElements.whenDefined('lc-chatbot').then(() => {
    requestAnimationFrame(() => {
      document.dispatchEvent(new CustomEvent('chatbot:open', {detail: {source}}));
    });
  });
};

// Proof of concept: a mobile-web first-visit screen that asks whether the visitor wants help
// finding something (Library Assistant) or wants to browse. Only shown with `?fork=1`.
const FirstVisitFork = ({ libraryAssistantAvailable, onBrowse }) => {
  // Without the assistant on the page, route through the enable flow (logging in if needed) and
  // come back to the homepage with the assistant opening on load.
  const enableAssistantUrl = '/enable-library-assistant?next=' + encodeURIComponent('/texts?open_assistant=1');

  const handleAskClick = (e) => {
    if (!libraryAssistantAvailable) { return; }
    e.preventDefault(); // keeps ReaderApp's in-app link handler off the click
    onBrowse();
    openLibraryAssistant();
  };

  const handleBrowseClick = (e) => {
    e.preventDefault();
    onBrowse();
  };

  return (
    <div className="readerNavMenu firstVisitFork sans-serif">
      <div className="content">
        <div className="firstVisitForkIntro">
          <h1 className="serif"><InterfaceText>first_visit_fork.title</InterfaceText></h1>
          <p><InterfaceText>first_visit_fork.subtitle</InterfaceText></p>
        </div>
        <div className="firstVisitForkOptions">
          <a
            href={enableAssistantUrl}
            className="firstVisitForkOption primary"
            onClick={handleAskClick}
            data-anl-event="first_visit_fork:click"
            data-anl-text="library_assistant"
          >
            <img src="/static/icons/lucide-message-square-white.svg" alt="" aria-hidden="true" />
            <span className="firstVisitForkOptionTitle"><InterfaceText>first_visit_fork.ask_title</InterfaceText></span>
            <span className="firstVisitForkOptionDescription"><InterfaceText>first_visit_fork.ask_description</InterfaceText></span>
          </a>
          <a
            href="/texts"
            className="firstVisitForkOption"
            onClick={handleBrowseClick}
            data-anl-event="first_visit_fork:click"
            data-anl-text="browse"
          >
            <img src="/static/icons/lucide-book-open-blue.svg" alt="" aria-hidden="true" />
            <span className="firstVisitForkOptionTitle"><InterfaceText>first_visit_fork.browse_title</InterfaceText></span>
            <span className="firstVisitForkOptionDescription"><InterfaceText>first_visit_fork.browse_description</InterfaceText></span>
          </a>
        </div>
        <p className="firstVisitForkFooter"><InterfaceText>first_visit_fork.switch_anytime</InterfaceText></p>
      </div>
    </div>
  );
};
FirstVisitFork.propTypes = {
  libraryAssistantAvailable: PropTypes.bool,
  onBrowse:                  PropTypes.func.isRequired,
};

export { FirstVisitFork, openLibraryAssistant };
