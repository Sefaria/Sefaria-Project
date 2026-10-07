/**
 * The desktop header's "✦ Library Assistant" pill: shown when the assistant widget is on the
 * page, just before search, and it opens the widget through the `chatbot:open` event.
 */
jest.mock('../sefaria/sefaria', () => ({ __esModule: true, default: {
  LIBRARY_MODULE: 'library',
  VOICES_MODULE: 'voices',
  activeModule: 'library',
  _: (k) => k,
  _v: ({ en }) => en,
  _uid: null,
  interfaceLang: 'english',
  _siteSettings: { TORAH_SPECIFIC: false, HELP_CENTER_URLS: { EN_US: '/help', HE: '/help' } },
  breakpoints: { MOBILE: 'mobile', DESKTOP: 'desktop' },
  getBreakpoint: () => 'desktop',
  getLogoutUrl: () => '/logout',
}}));
jest.mock('../sefaria/util', () => ({ __esModule: true, default: {} }));
jest.mock('../HeaderAutocomplete', () => ({ HeaderAutocomplete: () => <div className="searchStub" /> }));
jest.mock('../ProfilePic', () => ({ ProfilePic: () => null }));
jest.mock('../common/Button', () => ({ __esModule: true, default: () => null }));
jest.mock('../common/DropdownMenu', () => ({
  DropdownMenu: () => null, DropdownMenuSeparator: () => null, DropdownMenuItem: () => null,
  DropdownModuleItem: () => null, DropdownLanguageToggle: () => null, NextRedirectAnchor: () => null,
}));
jest.mock('../Misc', () => ({
  InterfaceText: ({ children }) => children,
  DonateLink: ({ children, classes }) => <a className={classes}>{children}</a>,
  GlobalWarningMessage: () => null,
  InterfaceLanguageMenu: () => null,
  LanguageToggleButton: () => null,
  useOnceFullyVisible: () => null,
}));

import React from 'react';
import ReactDOM from 'react-dom';
import { act } from 'react-dom/test-utils';
import { Header } from '../Header';

describe('Header Library Assistant pill', () => {
  let container;
  beforeEach(() => {
    container = document.createElement('div');
    document.body.appendChild(container);
  });
  afterEach(() => { ReactDOM.unmountComponentAtNode(container); container.remove(); });

  const render = (props) => act(() => {
    ReactDOM.render(<Header multiPanel={true} module="library" libraryAssistant={true} {...props} />, container);
  });
  const item = () => container.querySelector('.libraryAssistantLink');
  const order = () => [...container.querySelectorAll('.textLink, .searchStub')]
    .map(el => el.classList.contains('searchStub') ? 'search'
      : el.classList.contains('libraryAssistantLink') ? 'assistant'
      : el.classList.contains('donate') ? 'donate' : 'link');

  it('is absent unless the assistant is on the page', () => {
    render({ libraryAssistant: false });
    expect(item()).toBeNull();
  });

  it('is a pill just before search', () => {
    render();
    expect(order()).toEqual(['link', 'link', 'donate', 'assistant', 'search']);
    expect(item().classList.contains('libraryAssistantPill')).toBe(true);
    expect(item().textContent).toBe('✦header.library_assistant');
  });

  it('opens the widget', () => {
    render();
    const onOpen = jest.fn();
    document.addEventListener('chatbot:open', onOpen);
    const click = new MouseEvent('click', { bubbles: true, cancelable: true });
    act(() => { item().dispatchEvent(click); });
    document.removeEventListener('chatbot:open', onOpen);
    expect(onOpen.mock.calls[0][0].detail).toEqual({ source: 'header' });
    // ReaderApp's in-app link handler skips clicks whose default was prevented
    expect(click.defaultPrevented).toBe(true);
  });

  it('is absent outside the library', () => {
    render({ module: 'voices' });
    expect(item()).toBeNull();
  });
});
