/**
 * The reader's top header: the current ref (the most granular ref the reader is on, e.g.
 * "Genesis 1:5", "Berakhot 2a:3") and entry points for search in the book, the table of
 * contents, browsing the library, and text settings.
 *
 * It recedes (transform only, so no layout work) as reading moves forward and returns on a
 * reverse scroll, near the top, or when the text is tapped. The ref is not a control: the
 * table of contents is its own entry point.
 */
import React from 'react';
import {bookTocUrl, BROWSE_URL, searchInBookUrl} from './url';

const Icon = ({children}) => (
  <svg className="ng-icon" viewBox="0 0 24 24" width="24" height="24" aria-hidden="true" focusable="false"
       fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
    {children}
  </svg>
);

const SearchIcon = () => <Icon><circle cx="10.5" cy="10.5" r="6.25" /><path d="M15.25 15.25 20 20" /></Icon>;
const ContentsIcon = () => <Icon><path d="M9 6.5h11M9 12h11M9 17.5h11" /><path d="M4.5 6.5h.01M4.5 12h.01M4.5 17.5h.01" strokeWidth="2.4" /></Icon>;
const BrowseIcon = () => (
  <Icon>
    <path d="M4 19.5V5.5c0-.6.4-1 1-1h2.5c.6 0 1 .4 1 1v14" />
    <path d="M8.5 19.5V7.5c0-.6.4-1 1-1H12c.6 0 1 .4 1 1v12" />
    <path d="m14.2 7.9 2.4-.7c.5-.2 1.1.1 1.2.7l2.6 10.2" />
    <path d="M3 19.5h18" />
  </Icon>
);
const SettingsIcon = () => (
  <Icon>
    <path d="M2.8 18.5 7.6 5.5l4.8 13M4.6 13.9h6" />
    <path d="M20.6 11.6v6.9M20.6 15.05a2.95 2.95 0 1 1-5.9 0 2.95 2.95 0 0 1 5.9 0Z" />
  </Icon>
);

/** Split "Genesis 1:5" into the book and its address, so they can be set differently. */
export function splitRef(ref, title) {
  if (ref && title && ref.indexOf(title) === 0 && ref.length > title.length) {
    return [title, ref.slice(title.length).replace(/^[,\s]+/, '')];
  }
  return [ref || '', ''];
}

export default function ReaderHeader({visible, currentRef, currentHeRef, section, interfaceLang, strings, onOpenSettings}) {
  const hebrew = interfaceLang === 'hebrew';
  const ref = hebrew ? (currentHeRef || currentRef) : currentRef;
  const [book, address] = splitRef(ref, section ? (hebrew ? section.heIndexTitle : section.indexTitle) : null);
  return (
    <header className="ng-header" data-ng="header" data-visible={visible ? 'true' : 'false'}>
      <div className="ng-header-inner">
        <h1 className="ng-header-ref" data-ng="header-ref" aria-live="off">
          <span className="ng-header-book">{book}</span>
          {address ? <span className="ng-header-address">{address}</span> : null}
        </h1>
        <nav className="ng-header-actions" aria-label={strings.readerLabel}>
          {section ? (
            <a className="ng-header-button" data-ng="header-search" href={searchInBookUrl(section)}
               aria-label={strings.searchInBook} title={strings.searchInBook}><SearchIcon /></a>
          ) : null}
          {section ? (
            <a className="ng-header-button" data-ng="header-toc" href={bookTocUrl(section.indexTitle)}
               aria-label={strings.contents} title={strings.contents}><ContentsIcon /></a>
          ) : null}
          <a className="ng-header-button" data-ng="header-browse" href={BROWSE_URL}
             aria-label={strings.browse} title={strings.browse}><BrowseIcon /></a>
          <button type="button" className="ng-header-button" data-ng="header-settings" onClick={onOpenSettings}
                  aria-label={strings.textSettings} title={strings.textSettings}><SettingsIcon /></button>
        </nav>
      </div>
    </header>
  );
}
