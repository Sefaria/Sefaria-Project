/** SearchPage.maybeAutoSwitchFromEmptyTab, driven against a stub `this`. */

jest.mock('../sefaria/sefaria', () => ({
  __esModule: true,
  default: {
    _: (k) => k, _bilingual: (s) => ({ en: s, he: s }), interfaceLang: 'english', apiHost: '',
    hebrew: { isHebrew: () => false }, util: { clone: (x) => x }, terms: {}, _tocOrderLookup: {},
    toc: [], search: { entitySearch: jest.fn() },
  },
}));
jest.mock("../Misc", () => new Proxy({}, {
  get: (_t, prop) => (prop === "__esModule" ? true : () => null),
}));
jest.mock("../ImageCropper", () => new Proxy({}, {
  get: (_t, prop) => (prop === "__esModule" ? true : () => null),
}));

import SearchPage from '../SearchPage.jsx';
import { SearchTotal } from '../sefaria/searchTotal';

const proto = SearchPage.prototype;

// undefined count = no count for this search yet.
const makePage = ({ query = 'moses', tab = 'sources', sources, books, authors, topics, ...props } = {}) => {
  const page = {
    props: {
      query, tab, correctedQuery: null, disableAutoCorrect: false, setTab: jest.fn(),
      totalResults: new SearchTotal({ value: sources ?? 0 }),
      totalsFor: sources === undefined ? null : query,
      ...props,
    },
    state: { entityData: {} },
    _userSelectedTab: false,
    _autoSwitchDecidedFor: null,
    setState: jest.fn(),
    reportTabChange: jest.fn(),
  };
  page.activeTab = proto.activeTab.bind(page);
  page.searchedQuery = proto.searchedQuery.bind(page);
  page.entityResultsKey = proto.entityResultsKey.bind(page);
  page.setTab = proto.setTab.bind(page);
  const entry = total => total === undefined ? null : { total, forKey: page.entityResultsKey() };
  page.state.entityData = { book: entry(books), author: entry(authors), topic: entry(topics) };
  return page;
};
const run = page => proto.maybeAutoSwitchFromEmptyTab.call(page);

describe('maybeAutoSwitchFromEmptyTab', () => {
  test('does not leave Sources while its total is only the empty placeholder', () => {
    const page = makePage({ sources: undefined, books: 5 });
    run(page);
    expect(page.props.setTab).not.toHaveBeenCalled();
    expect(page._autoSwitchDecidedFor).toBeNull();
  });

  test('ignores a Sources total that was counted for a different search', () => {
    const page = makePage({ sources: 0, books: 5 });
    page.props.totalsFor = 'mosses';  // the correction changed under it
    run(page);
    expect(page.props.setTab).not.toHaveBeenCalled();
  });

  test('ignores entity totals left over from the previous search', () => {
    const page = makePage({ query: 'aaron', sources: 0, books: 5 });
    page.state.entityData.book.forKey = 'moses||0';
    run(page);
    expect(page.props.setTab).not.toHaveBeenCalled();
    expect(page._autoSwitchDecidedFor).toBeNull();
  });

  test('stays on Sources once it is known to have results, however the other tabs look', () => {
    const page = makePage({ sources: 12, books: 5 });
    run(page);
    expect(page.props.setTab).not.toHaveBeenCalled();
    expect(page._autoSwitchDecidedFor).toBe('moses||');
  });

  test('moves to the first tab with results once every count is in', () => {
    const page = makePage({ sources: 0, books: 0, authors: 3, topics: 9 });
    run(page);
    expect(page.props.setTab).toHaveBeenCalledWith('authors', true);
  });

  test('waits for an earlier tab before choosing a later one', () => {
    const page = makePage({ sources: 0, books: undefined, authors: 3 });
    run(page);
    expect(page.props.setTab).not.toHaveBeenCalled();
  });

  test('a tab the reader picked for this query is left alone', () => {
    const page = makePage({ sources: 0, books: 5 });
    page._userSelectedTab = true;
    run(page);
    expect(page.props.setTab).not.toHaveBeenCalled();
  });

  test('decides once per search', () => {
    const page = makePage({ sources: 0, books: 5 });
    run(page);
    run(page);
    expect(page.props.setTab).toHaveBeenCalledTimes(1);
  });
});
