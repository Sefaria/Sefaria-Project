import React from 'react';
import PropTypes from 'prop-types';
import { InterfaceText } from './Misc';
import Button from './common/Button';
import Modal from './common/modal';

const LIBRARY_ASSISTANT_SOURCE = 'first_visit_fork';

// The Library Assistant listens for `chatbot:open` once <lc-chatbot> has mounted, so wait for the
// element to be defined and rendered before dispatching. If it never appears this is a no-op.
const openLibraryAssistant = (source = LIBRARY_ASSISTANT_SOURCE) => {
  if (typeof window === 'undefined' || !window.customElements) { return; }
  customElements.whenDefined('lc-chatbot').then(() => {
    // A task, not a frame: hidden tabs don't run requestAnimationFrame callbacks.
    setTimeout(() => {
      document.dispatchEvent(new CustomEvent('chatbot:open', {detail: {source}}));
    }, 0);
  });
};

// Proof of concept: a mobile-web first-visit modal over the homepage that offers the Library
// Assistant or browsing. Only shown with `?fork=1`.
const FirstVisitFork = ({ libraryAssistantAvailable, close }) => {
  // Without the assistant on the page, route through the enable flow (logging in if needed) and
  // come back to the homepage with the assistant opening on load.
  const enableAssistantUrl = '/enable-library-assistant?next=' + encodeURIComponent('/texts?open_assistant=1');

  const handleAskClick = (e) => {
    if (!libraryAssistantAvailable) { return; }
    e.preventDefault(); // keeps ReaderApp's in-app link handler off the click
    close();
    openLibraryAssistant();
  };

  return (
    <Modal close={close}>
      <div className="firstVisitFork">
        <h2 className="serif sans-serif-in-hebrew"><InterfaceText>first_visit_fork.title</InterfaceText></h2>
        <p className="firstVisitForkSubtitle"><InterfaceText>first_visit_fork.subtitle</InterfaceText></p>
        <div className="firstVisitForkButtons">
          <Button size="fullwidth" href={enableAssistantUrl} onClick={handleAskClick}>
            <span className="firstVisitForkStar" aria-hidden="true">✦</span>
            <InterfaceText>first_visit_fork.ask</InterfaceText>
          </Button>
          <Button size="fullwidth" icon="lucide-book-open" className="firstVisitForkBrowse" onClick={close}>
            <InterfaceText>first_visit_fork.browse</InterfaceText>
          </Button>
        </div>
      </div>
    </Modal>
  );
};
FirstVisitFork.propTypes = {
  libraryAssistantAvailable: PropTypes.bool,
  close:                     PropTypes.func.isRequired,
};

export { FirstVisitFork, openLibraryAssistant };
