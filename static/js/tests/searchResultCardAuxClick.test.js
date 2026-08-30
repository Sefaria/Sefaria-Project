/**
 * SearchResultCard: middle-click reporting.
 *
 * Browsers dispatch `auxclick` -- not `click` -- for non-primary mouse buttons, and React's
 * onClick maps to native click. So before onAuxClick was added, middle-clicking a result
 * opened it in a new tab and reported nothing at all: a silent undercount in the one metric
 * this whole feature exists to collect.
 *
 * The important half of the behaviour is what middle-click must NOT do. It leaves the user
 * on the search page, so the flow has to stay open -- exactly like a cmd/ctrl-click, and
 * unlike a plain left click.
 *
 * No React Testing Library in this repo -- react-dom directly, same pattern as
 * static/js/auth/tests/AuthCard.test.js.
 */

jest.mock('../sefaria/sefaria', () => ({
  __esModule: true,
  default: {
    _: (k) => k,
    interfaceLang: 'english',
    track: { event: () => {} },
    parseRef: () => ({ index: [] }),
    getRef: async (r) => ({ ref: r }),
    humanRef: (r) => r,
  },
}));

// Misc.jsx pulls in most of the app (TopicPage -> Promotions -> ...), and the card uses
// exactly one thing from it. Stubbing it keeps this test about the card.
jest.mock('../Misc', () => ({
  __esModule: true,
  InterfaceText: ({ text, children }) => (text ? (text.en ?? '') : (children ?? null)),
}));

import React from 'react';
import ReactDOM from 'react-dom';
import { act } from 'react-dom/test-utils';
import SearchResultCard from '../SearchResultCard.jsx';
import SearchAnalytics from '../sefaria/searchAnalytics';

// BreadcrumbPath measures itself with a ResizeObserver, which jsdom does not implement.
// Nothing here depends on the truncation it drives, so a no-op stub is enough.
global.ResizeObserver = class { observe() {} unobserve() {} disconnect() {} };

let container = null;

const CARD_PROPS = {
  name: 'Genesis 44:1',
  tref: 'Genesis 44:1',
  href: '/Genesis.44.1',
  query: 'joseph',
  analyticsPosition: 3,          // opting the card into analytics; without it it stays silent
  snippet: 'and he commanded',
  versionName: 'The Koren Jerusalem Bible',
  crumbs: [{ label: 'Tanakh', href: '/texts/Tanakh' },
           { label: 'Torah',  href: '/texts/Tanakh/Torah' }],
  secondaryAuthor: 'Rashi',
  secondaryAuthorHref: '/topics/rashi',
  onResultClick: () => {},
};

function mount(props = {}) {
  container = document.createElement('div');
  document.body.appendChild(container);
  act(() => {
    ReactDOM.render(React.createElement(SearchResultCard, { ...CARD_PROPS, ...props }), container);
  });
}

afterEach(() => {
  if (!container) return;
  act(() => { ReactDOM.unmountComponentAtNode(container); });
  document.body.removeChild(container);
  container = null;
});

// Dispatch a real auxclick the way a browser does for the middle button. React listens for
// auxclick natively, so this reaches onAuxClick through its normal delegation.
const middleClick = (el) => act(() => {
  el.dispatchEvent(new MouseEvent('auxclick', { bubbles: true, cancelable: true, button: 1 }));
});

const leftClick = (el) => act(() => {
  el.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, button: 0 }));
});

const titleLink = () => container.querySelector('a.searchResultCard-titleLink');
// BreadcrumbPath renders the crumbs twice: an aria-hidden measurement copy (deliberately
// given no link props) and the interactive copy. Scope to the interactive one.
const crumbLink = () =>
  container.querySelector('.searchResultCard-breadcrumbs-inner a.searchResultCard-crumb--link');
const measureCopyCrumbLink = () =>
  container.querySelector('.searchResultCard-breadcrumbs-measure a.searchResultCard-crumb--link');
const authorLink = () => container.querySelector('a[href="/topics/rashi"]');

let elementClicked, endFlow;
beforeEach(() => {
  // Spy on the analytics seam rather than on gtag, so these tests describe the card's
  // behaviour and stay independent of how the events are shaped.
  SearchAnalytics._flow = { flowId: 'flow-1' };   // a flow must be active or everything no-ops
  SearchAnalytics._query = null;
  elementClicked = jest.spyOn(SearchAnalytics, 'elementClicked').mockImplementation(() => {});
  endFlow = jest.spyOn(SearchAnalytics, 'endFlow').mockImplementation(() => {});
});

afterEach(() => {
  elementClicked.mockRestore();
  endFlow.mockRestore();
  SearchAnalytics._flow = null;
});

describe('middle-clicking a result', () => {
  test('reports the click', () => {
    mount();
    middleClick(titleLink());

    expect(elementClicked).toHaveBeenCalledTimes(1);
    expect(elementClicked).toHaveBeenCalledWith(expect.objectContaining({
      elementType: 'result',
      elementValue: 'Genesis 44:1',
      resultPosition: 3,
    }));
  });

  test('does NOT end the flow -- the user is still on the search page', () => {
    mount();
    middleClick(titleLink());

    expect(endFlow).not.toHaveBeenCalled();
  });

  test('works on the breadcrumb links too', () => {
    mount();
    middleClick(crumbLink());

    expect(elementClicked).toHaveBeenCalledWith(expect.objectContaining({ elementValue: 'Tanakh' }));
    expect(endFlow).not.toHaveBeenCalled();
  });

  test('works on the secondary author link too', () => {
    mount();
    middleClick(authorLink());

    expect(elementClicked).toHaveBeenCalledWith(expect.objectContaining({ elementValue: 'Rashi' }));
    expect(endFlow).not.toHaveBeenCalled();
  });

  test('does not double-report from the breadcrumb measurement copy', () => {
    // BreadcrumbPath renders a hidden second copy of the crumbs to measure truncation. It
    // is given no link props precisely so it can never emit a duplicate event.
    mount();
    middleClick(measureCopyCrumbLink());

    expect(elementClicked).not.toHaveBeenCalled();
  });

  test('is ignored for the back/forward mouse buttons, which are not link clicks', () => {
    mount();
    act(() => {
      titleLink().dispatchEvent(new MouseEvent('auxclick', { bubbles: true, button: 3 }));
      titleLink().dispatchEvent(new MouseEvent('auxclick', { bubbles: true, button: 4 }));
    });

    expect(elementClicked).not.toHaveBeenCalled();
  });

  test('stays silent on a card that is not opted into analytics', () => {
    // Compare-panel and sidebar-search cards pass no analyticsPosition and are out of scope.
    mount({ analyticsPosition: undefined });
    middleClick(titleLink());

    expect(elementClicked).not.toHaveBeenCalled();
  });
});

describe('left-clicking a result (guarding against a regression)', () => {
  test('still reports AND ends the flow', () => {
    mount();
    leftClick(titleLink());

    expect(elementClicked).toHaveBeenCalledTimes(1);
    // The contrast with middle-click is the whole point: a plain click navigates away, so
    // the visit to the search page is over.
    expect(endFlow).toHaveBeenCalledTimes(1);
  });

  test('a cmd-click reports without ending the flow, as before', () => {
    mount();
    act(() => {
      titleLink().dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, button: 0, metaKey: true }));
    });

    expect(elementClicked).toHaveBeenCalledTimes(1);
    expect(endFlow).not.toHaveBeenCalled();
  });
});
