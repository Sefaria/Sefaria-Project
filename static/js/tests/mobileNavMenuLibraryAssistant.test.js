/**
 * The mobile menu's Library Assistant item: shown only when ReaderApp renders the widget,
 * and it opens the widget through the `chatbot:open` document event.
 */
jest.mock('../sefaria/sefaria', () => ({ __esModule: true, default: {
  LIBRARY_MODULE: 'library',
  VOICES_MODULE: 'voices',
  _: (k) => k,
  _v: ({ en }) => en,
  _uid: null,
  interfaceLang: 'english',
  _siteSettings: { HELP_CENTER_URLS: { EN_US: '/help', HE: '/help' } },
}}));
jest.mock('../sefaria/util', () => ({ __esModule: true, default: {} }));
jest.mock('../HeaderAutocomplete', () => ({ HeaderAutocomplete: () => null }));
jest.mock('../ProfilePic', () => ({ ProfilePic: () => null }));
jest.mock('../common/Button', () => ({ __esModule: true, default: ({ children }) => children }));
jest.mock('../common/DropdownMenu', () => ({ NextRedirectAnchor: ({ children }) => children }));
jest.mock('../Misc', () => ({
  InterfaceText: ({ children }) => children,
  DonateLink: ({ children }) => children,
}));

import React from 'react';
import ReactDOM from 'react-dom';
import { act } from 'react-dom/test-utils';
import { MobileNavMenu } from '../Header';

describe('MobileNavMenu Library Assistant item', () => {
  let container;
  beforeEach(() => { container = document.createElement('div'); document.body.appendChild(container); });
  afterEach(() => { ReactDOM.unmountComponentAtNode(container); container.remove(); });

  const render = (props) => act(() => {
    ReactDOM.render(<MobileNavMenu visible={true} module="library" openURL={() => {}} close={() => {}} {...props} />, container);
  });
  const item = () => [...container.querySelectorAll('a')].find(a => a.textContent === 'header.library_assistant');

  it('is absent unless the assistant is on the page', () => {
    render({ libraryAssistant: false });
    expect(item()).toBeUndefined();
  });

  it('closes the menu and asks the widget to open', () => {
    const close = jest.fn();
    const onOpen = jest.fn();
    document.addEventListener('chatbot:open', onOpen);
    render({ libraryAssistant: true, close });

    const click = new MouseEvent('click', { bubbles: true, cancelable: true });
    act(() => { item().dispatchEvent(click); });

    expect(close).toHaveBeenCalled();
    expect(onOpen).toHaveBeenCalledTimes(1);
    expect(onOpen.mock.calls[0][0].detail).toEqual({ source: 'mobile_nav_menu' });
    // ReaderApp's in-app link handler skips clicks whose default was prevented
    expect(click.defaultPrevented).toBe(true);
    document.removeEventListener('chatbot:open', onOpen);
  });
});
