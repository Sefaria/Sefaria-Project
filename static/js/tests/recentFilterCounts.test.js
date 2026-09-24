/**
 * Connections sidebar: counts on recent filters and the "other commentaries" notice.
 *
 * With a commentary open in the sidebar, the reader can toggle between the commentaries they
 * opened recently (e.g. Malbim / Rashi / Radak). Moving to a new verse used to give no hint of
 * which of those actually comment on it, or whether some commentary they haven't opened does.
 * Recent filters now carry the same "(n)" count the Resources list shows, dim when they have
 * nothing on the selected refs, and a line below them names the other commentaries here.
 *
 * No React Testing Library in this repo -- react-dom directly, same pattern as
 * static/js/tests/searchResultCardAuxClick.test.js.
 */

const mockIndexes = {
  Rashi:  { title: 'Rashi',  heTitle: 'רש"י',  categories: ['Commentary'], primary_category: 'Commentary' },
  Radak:  { title: 'Radak',  heTitle: 'רד"ק',  categories: ['Commentary'], primary_category: 'Commentary' },
  Malbim: { title: 'Malbim', heTitle: 'מלבי"ם', categories: ['Commentary'], primary_category: 'Commentary' },
};

jest.mock('../sefaria/sefaria', () => {
  // A minimal stand-in for Sefaria._filterLinks: match on category or commentator name,
  // and require category "Commentary" when the filter names a commentator.
  const filterLinks = (links, filter) => {
    if (!filter.length) { return links; }
    const name = filter[0].split('|')[0];
    const isCommentary = ['Rashi', 'Radak', 'Malbim'].includes(name);
    return links.filter(l =>
      (!isCommentary || l.category === 'Commentary') &&
      (l.category === name || l.collectiveTitle.en === name));
  };
  return {
    __esModule: true,
    default: {
      _: (k) => k,
      site: null,
      interfaceLang: 'english',
      track: { event: () => {} },
      index: (t) => mockIndexes[t],
      hebrewTerm: (t) => t,
      normRef: (r) => r.replace(/ /g, '_').replace(/:/g, '.'),
      palette: { categoryColor: () => '#000' },
      util: { inArray: (x, arr) => arr.indexOf(x) },
      _siteSettings: { TORAH_SPECIFIC: true },
      _filterLinks: filterLinks,
      linkSummaryBookSort: (cat, a, b) => (a.book > b.book ? 1 : -1),
    },
  };
});

jest.mock('../Misc', () => ({
  __esModule: true,
  InterfaceText: ({ text }) => (text ? text.en : null),
}));
jest.mock('../ContentText', () => ({
  __esModule: true,
  ContentText: ({ text }) => text.en,
}));
// TextList pulls in TextRange and friends; the helpers under test don't need them.
jest.mock('../TextRange', () => ({ __esModule: true, default: () => null }));

import React from 'react';
import ReactDOM from 'react-dom';
import { act } from 'react-dom/test-utils';
import { RecentFilterSet, OtherCommentariesNotice } from '../ConnectionFilters.jsx';
import { countLinksByFilter, getOtherCommentaries } from '../TextList.jsx';

const link = (commentator, category = 'Commentary') => ({
  category,
  collectiveTitle: { en: commentator, he: `he-${commentator}` },
});

// Links touching I Chronicles 2:34: Malbim twice, Metzudat David once, Ralbag once.
const LINKS = [link('Malbim'), link('Malbim'), link('Metzudat David'), link('Ralbag')];

let container = null;
beforeEach(() => {
  container = document.createElement('div');
  document.body.appendChild(container);
});
afterEach(() => {
  ReactDOM.unmountComponentAtNode(container);
  container.remove();
  container = null;
});

const render = (el) => act(() => { ReactDOM.render(el, container); });
const filterEl = (name) => container.querySelector(`.textFilter[data-name="${name}"]`);

describe('countLinksByFilter', () => {
  test('counts matching links per filter, including zero', () => {
    expect(countLinksByFilter(LINKS, ['Malbim', 'Rashi', 'Radak'])).toEqual({ Malbim: 2, Rashi: 0, Radak: 0 });
  });
});

describe('getOtherCommentaries', () => {
  test('lists commentaries not already among the recent/current filters, with counts', () => {
    expect(getOtherCommentaries(LINKS, ['Malbim', 'Rashi'])).toEqual([
      { book: 'Metzudat David', heBook: 'he-Metzudat David', count: 1 },
      { book: 'Ralbag', heBook: 'he-Ralbag', count: 1 },
    ]);
  });

  test('ignores non-commentary links', () => {
    expect(getOtherCommentaries([link('Berakhot', 'Talmud')], [])).toEqual([]);
  });

  test('strips filter suffixes when excluding', () => {
    expect(getOtherCommentaries([link('Ralbag')], ['Ralbag|Quoting'])).toEqual([]);
  });

  test('returns nothing while viewing all commentary', () => {
    expect(getOtherCommentaries(LINKS, ['Commentary'])).toEqual([]);
  });
});

describe('RecentFilterSet', () => {
  const props = {
    srefs: ['I Chronicles 2:34'],
    filter: ['Malbim'],
    recentFilters: ['Malbim', 'Rashi', 'Radak'],
    setFilter: () => {},
  };

  test('without counts, renders as before: no counts, nothing dimmed', () => {
    render(<RecentFilterSet {...props} />);
    expect(container.querySelectorAll('.connectionsCount')).toHaveLength(0);
    expect(container.querySelectorAll('.textFilter.lowlight')).toHaveLength(0);
  });

  test('with counts, shows the count and dims filters with nothing here', () => {
    render(<RecentFilterSet {...props} counts={{ Malbim: 2, Rashi: 0, Radak: 0 }} />);
    expect(filterEl('Malbim').textContent).toContain('(2)');
    expect(filterEl('Malbim').classList.contains('lowlight')).toBe(false);
    expect(filterEl('Rashi').classList.contains('lowlight')).toBe(true);
    expect(filterEl('Radak').classList.contains('lowlight')).toBe(true);
    expect(filterEl('Rashi').querySelector('.connectionsCount')).toBeNull();
  });

  test('a filter missing from counts is treated as zero', () => {
    render(<RecentFilterSet {...props} counts={{ Malbim: 1 }} />);
    expect(filterEl('Radak').classList.contains('lowlight')).toBe(true);
  });
});

describe('OtherCommentariesNotice', () => {
  const others = [
    { book: 'Metzudat David', heBook: '', count: 1 },
    { book: 'Ralbag', heBook: '', count: 1 },
    { book: 'Chomat Anakh', heBook: '', count: 2 },
    { book: 'Metzudat Zion', heBook: '', count: 1 },
  ];

  test('renders nothing when there are no other commentaries', () => {
    render(<OtherCommentariesNotice srefs={['I Chronicles 2:34']} commentaries={[]} setFilter={() => {}} />);
    expect(container.innerHTML).toBe('');
  });

  test('names up to three commentaries with counts, and links the rest to the commentary list', () => {
    const setConnectionsCategory = jest.fn();
    render(<OtherCommentariesNotice srefs={['I Chronicles 2:34']} commentaries={others}
                                    setFilter={() => {}} setConnectionsCategory={setConnectionsCategory} />);
    const text = container.textContent;
    expect(text).toContain('4 other commentaries here');
    expect(text).toContain('Metzudat David');
    expect(text).toContain('(2)');
    expect(text).not.toContain('Metzudat Zion');
    const more = container.querySelector('.otherCommentariesMore');
    expect(more.textContent).toBe('+1 more');
    act(() => { more.dispatchEvent(new MouseEvent('click', { bubbles: true })); });
    expect(setConnectionsCategory).toHaveBeenCalledWith('Commentary');
  });

  test('clicking a named commentary opens it and adds it to recent filters', () => {
    const setFilter = jest.fn();
    render(<OtherCommentariesNotice srefs={['I Chronicles 2:34']} commentaries={others.slice(0, 1)} setFilter={setFilter} />);
    expect(container.textContent).toContain('1 other commentary here');
    act(() => {
      container.querySelector('.otherCommentary').dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });
    expect(setFilter).toHaveBeenCalledWith('Metzudat David', true);
  });
});
