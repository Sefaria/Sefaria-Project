/**
 * Render tests for the discover pages in English and Hebrew, with the data layer mocked.
 */
import React from 'react';
import ReactDOM from 'react-dom';
import { act } from 'react-dom/test-utils';
import Sefaria from '../../../sefaria/sefaria';
import '../../strings';
import '../../routes';
import App from '../../App';
import { setLang } from '../../i18n';
import { setPersona } from '../../persona';
import { setContentLang } from '../../contentLang';
import { navigate } from '../../router';
import { _resetStore, kv, flush } from '../../store';
import { _resetOverlays } from '../../overlays';
import fixture from './fixtures/search-wrapper.json';
import moses from './fixtures/topic-moses.json';

let container;
const flushPromises = () => act(() => new Promise(r => setTimeout(r, 0)));
const wait = (ms) => act(() => new Promise(r => setTimeout(r, ms)));
const click = el => act(() => { el.dispatchEvent(new MouseEvent('click', { bubbles: true })); });

beforeAll(() => {
  window.scrollTo = jest.fn();
  Sefaria._tocOrderLookup = {};
  Sefaria.virtualBooks = undefined;
  Sefaria.activeModule = Sefaria.LIBRARY_MODULE;   // processTopicsTabsData builds library tabs only in the library module
  Sefaria.interfaceLang = 'english';                // processTopicsTabsData reads it (Sefaria.setup() is not run in jest)
  Sefaria.topic_toc = [
    { slug: 'biblical-figures', primaryTitle: { en: 'Biblical Figures', he: 'דמויות מקראיות' }, categoryDescription: { en: 'People of the Bible.', he: 'אנשי המקרא.' }, children: [
      { slug: 'moses', primaryTitle: { en: 'Moses', he: 'משה' }, numSources: 6410, pools: ['library'] },
      { slug: 'aaron', primaryTitle: { en: 'Aaron', he: 'אהרן' }, numSources: 900, pools: ['library'] },
    ] },
    { slug: 'jewish-calendar2', primaryTitle: { en: 'Jewish Calendar', he: 'מועדי השנה' }, categoryDescription: { en: 'Festivals.', he: 'חגים.' }, children: [
      { slug: 'shabbat', primaryTitle: { en: 'Shabbat', he: 'שבת' }, numSources: 1202, pools: ['library'], description: { en: 'The day of rest.', he: 'יום המנוחה.' } },
    ] },
  ];
  Sefaria._topicTocPages = null; Sefaria._topicTocCategory = null; Sefaria._topicTocCategoryTitles = null;
  Sefaria.displayTopicTocCategory = (slug) => (slug === 'moses' ? { slug: 'biblical-figures', en: 'Biblical Figures', he: 'דמויות מקראיות' } : null);
  Sefaria.getName = jest.fn(() => Promise.resolve({ completion_objects: [{ type: 'PersonTopic', key: 'moses', title: 'Moses' }, { type: 'ref', key: 'Genesis', title: 'Genesis' }] }));
  Sefaria.getTopic = jest.fn((slug) => Promise.resolve(slug === 'moses' ? Sefaria.processTopicsTabsData(JSON.parse(JSON.stringify(moses))) : (slug === 'nope' ? { error: 'x' } : { slug, primaryTitle: { en: slug, he: slug }, description: { en: `About ${slug}.`, he: `על ${slug}.` }, numSources: 5 })));
  Sefaria.getTopicFromCache = () => null;
  Sefaria.getBulkText = jest.fn((refs) => Promise.resolve(Object.fromEntries(refs.map(r => [r, { ref: r, heRef: `he:${r}`, he: `<b>עברית</b> ${r}`, en: `English ${r}`, primary_category: 'Tanakh', url: r.replace(/ /g, '_') }]))));
  Sefaria.getFeaturedTopic = jest.fn(() => Promise.resolve({ topic: { slug: 'etrog', primaryTitle: { en: 'Etrog', he: 'אתרוג' }, description: { en: 'A citron.', he: 'פרי הדר.' }, image: { image_uri: 'https://img/etrog.gif', image_caption: { en: 'Etrog box', he: 'קופסת אתרוג' } } }, date: '2026-09-29' }));
  Sefaria.getTrendingLibraryTopics = jest.fn(() => Promise.resolve([{ slug: 'selichot', primaryTitle: { en: 'Selichot', he: 'סליחות' }, description: { en: 'Penitential prayers.', he: 'תפילות.' }, numSources: 87 }]));
  Sefaria.getTopicsByPool = jest.fn(() => Promise.resolve([{ slug: 'purim', primaryTitle: { en: 'Purim', he: 'פורים' }, numSources: 740 }]));
  Sefaria.getLangSpecificTopicPoolName = (p) => `${p}_en`;
  Sefaria.getUpcomingDay = jest.fn((d) => Promise.resolve(d === 'parasha'
    ? { title: { en: 'Parashat Hashavua', he: 'פרשת השבוע' }, displayValue: { en: 'Bereshit', he: 'בראשית' }, url: 'Genesis.1.1-6.8', ref: 'Genesis 1:1-6:8', heRef: 'בראשית א-ו', description: { en: 'In the beginning.', he: 'בראשית.' } }
    : { topic: { slug: 'hoshana-rabbah', primaryTitle: { en: 'Hoshana Rabbah', he: 'הושענא רבה' }, description: { en: 'Seventh day of Sukkot.', he: 'היום השביעי.' } } }));
  Sefaria.topicList = jest.fn(() => Promise.resolve([
    { slug: 'moses', primaryTitle: { en: 'Moses', he: 'משה' }, titles: [{ text: 'Moses' }], shouldDisplay: true, pools: ['library'], numSources: 6410 },
    { slug: 'aaron', primaryTitle: { en: 'Aaron', he: 'אהרן' }, titles: [{ text: 'Aaron' }], shouldDisplay: true, pools: ['library'], numSources: 900 },
  ]));
  Sefaria.palette = { categoryColor: () => '#004e5f' };
  Sefaria.hebrewTerm = (x) => ({ Tanakh: 'תנ"ך', Torah: 'תורה', Talmud: 'תלמוד' }[x] || x);
});

beforeEach(() => {
  _resetStore(); _resetOverlays(); localStorage.clear();
  Sefaria.search = { execute_query: jest.fn((args) => { setTimeout(() => args.success(JSON.parse(JSON.stringify(fixture))), 0); return {}; }) };
  container = document.createElement('div');
  document.body.appendChild(container);
  window.history.replaceState({}, '', '/');
  window.dispatchEvent(new PopStateEvent('popstate'));   // the router caches the last match until it hears a navigation
});
afterEach(() => { ReactDOM.unmountComponentAtNode(container); container.remove(); setLang('en'); });

const render = () => act(() => { ReactDOM.render(<App props={{}} />, container); });
const go = async (url) => { act(() => { navigate(url); }); await flushPromises(); await flushPromises(); };
const text = sel => (container.querySelector(sel) || {}).textContent;

describe('search page', () => {
  test('learner, English: results, facets, sort, save search, in-page query edit', async () => {
    setLang('en'); setPersona('learner'); setContentLang('bi');
    render();
    await go('/search?q=light');
    expect(text('main h1')).toBe('Search: light');
    expect(container.querySelector('#ln-search-page-input').value).toBe('light');
    expect(Sefaria.search.execute_query).toHaveBeenCalledTimes(1);
    expect(Sefaria.search.execute_query.mock.calls[0][0]).toMatchObject({ query: 'light', type: 'text', field: 'naive_lemmatizer', aggregationsToUpdate: ['path'], sort_type: 'relevance', size: 20, start: 0 });
    const cards = container.querySelectorAll('.ln-sr');
    expect(cards).toHaveLength(6);   // 8 hits, Genesis 1:3 in three versions collapsed
    expect(cards[0].querySelector('.ln-sr-title').textContent).toContain('Genesis 1:3');
    expect(cards[0].querySelector('.ln-sr-title').textContent).toContain('בראשית א׳:ג׳');
    expect(cards[0].querySelector('.ln-sr-snippet b').textContent).toBe('light');
    expect(cards[0].querySelector('.ln-sr-title a').getAttribute('href')).toBe('/Genesis.1.3?qh=light');
    expect(cards[0].textContent).toContain('2 more versions');
    expect(text('.ln-search-total')).toBe('2,873 results');
    expect([...container.querySelectorAll('.ln-facets > li .ln-facet-label span')].map(e => e.textContent)).toEqual(['Halakhah', 'Kabbalah', 'Liturgy', 'Midrash', 'Talmud', 'Tanakh']);
    expect(container.querySelector('.ln-search-more button')).not.toBeNull();
    expect(container.querySelector('.ln-explainer')).toBeNull();          // newcomer only
    expect(container.querySelector('.ln-grade')).toBeNull();              // educator only

    // facet click → URL path filter, replace navigation, server re-query without aggs
    const tanakh = [...container.querySelectorAll('.ln-facet-label')].find(l => l.textContent === 'Tanakh').querySelector('input');
    click(tanakh);
    await flushPromises(); await flushPromises();
    expect(window.location.search).toBe('?q=light&path=Tanakh');
    expect(Sefaria.search.execute_query).toHaveBeenCalledTimes(2);
    expect(Sefaria.search.execute_query.mock.calls[1][0]).toMatchObject({ applied_filters: ['Tanakh'], appliedFilterAggTypes: ['path'] });

    // sort → URL
    act(() => { const sel = [...container.querySelectorAll('select')].find(s => s.value === 'relevance'); sel.value = 'chronological'; sel.dispatchEvent(new Event('change', { bubbles: true })); });
    await flushPromises(); await flushPromises();
    expect(window.location.search).toContain('sort=chronological');
    expect(Sefaria.search.execute_query.mock.calls[2][0].sort_type).toBe('chronological');

    // save this search
    const save = [...container.querySelectorAll('button')].find(b => b.textContent === 'Save this search');
    click(save);
    await flushPromises();
    expect(kv.get('savedSearches')[0]).toMatchObject({ q: 'light', sort: 'chronological', paths: ['Tanakh'] });
    expect(container.querySelector('.ln-toast').textContent).toBe('Search saved to My Library');
    expect([...container.querySelectorAll('button')].some(b => b.textContent === 'Saved')).toBe(true);

    // in-page query edit pushes a new URL and the header box follows
    act(() => {
      const input = container.querySelector('#ln-search-page-input');
      const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
      setter.call(input, 'dark'); input.dispatchEvent(new Event('input', { bubbles: true }));
    });
    act(() => { container.querySelector('.ln-search-form').dispatchEvent(new Event('submit', { bubbles: true, cancelable: true })); });
    await flushPromises(); await flushPromises();
    expect(window.location.search).toBe('?q=dark&sort=chronological&path=Tanakh');
    expect(container.querySelector('#ln-search-input').value).toBe('dark');
    expect(text('main h1')).toBe('Search: dark');
  });

  test('newcomer, Hebrew: simplified controls, topic explainer, rtl', async () => {
    setLang('hebrew'); setPersona('newcomer');
    render();
    await go('/search?q=moses');
    await flushPromises();
    expect(document.documentElement.getAttribute('dir')).toBe('rtl');
    expect(text('main h1')).toBe('חיפוש: moses');
    expect(container.querySelector('.ln-facets')).toBeNull();                    // chips, not a tree
    expect(container.querySelectorAll('.ln-search-aside .ln-chip-link').length).toBeGreaterThan(0);
    expect([...container.querySelectorAll('select')]).toHaveLength(0);          // no sort
    expect(container.querySelector('.ln-check')).toBeNull();                     // no exact toggle
    expect(Sefaria.getName).toHaveBeenCalledWith('moses', 8);
    expect(text('.ln-explainer h2')).toBe('משה');
    expect(text('.ln-explainer a')).toBe('לעמוד הנושא');
    expect(container.querySelector('.ln-explainer a').getAttribute('href')).toBe('/topics/moses');
    expect(text('.ln-search-hint')).toContain('התוצאות מדורגות');
    // English-first newcomer shows only the English ref title
    expect(container.querySelector('.ln-sr-title').textContent).toBe('Genesis 1:3');
    expect(container.querySelector('.ln-sr-path').textContent).toContain('תנ"ך');
  });

  test('educator: grade tags (simulated) and add result to lesson inbox', async () => {
    setLang('en'); setPersona('educator');
    render();
    await go('/search?q=light');
    expect(container.querySelector('.ln-grade .ln-badge-simulated').textContent).toBe('simulated');
    const add = container.querySelector('.ln-sr button.ln-btn');
    expect(add.textContent).toBe('Add to lesson');
    click(add);
    await flushPromises();
    expect(kv.get('lessonInbox')[0]).toMatchObject({ kind: 'ref', ref: 'Genesis 1:3', q: 'light', from: 'search' });
    expect(kv.get('lessonInbox')[0].snippet).not.toContain('<b>');
    expect(container.querySelector('.ln-sr button.ln-btn').disabled).toBe(true);
    expect(container.querySelector('.ln-sr button.ln-btn').textContent).toBe('Added to your lesson inbox');
  });

  test('scholar: era/version filters from the URL, export CSV, exact toggle', async () => {
    setLang('en'); setPersona('scholar');
    const clicks = [];
    const realCreate = document.createElement.bind(document);
    jest.spyOn(document, 'createElement').mockImplementation((tag) => { const el = realCreate(tag); if (tag === 'a') { el.click = () => clicks.push(el.download); } return el; });
    URL.createObjectURL = jest.fn(() => 'blob:x'); URL.revokeObjectURL = jest.fn();
    render();
    await go('/search?q=light&era=rishonim&exact=1');
    expect(Sefaria.search.execute_query.mock.calls[0][0]).toMatchObject({ field: 'exact', exact: true });
    expect(container.querySelectorAll('.ln-sr')).toHaveLength(3);
    expect(text('.ln-search-total')).toBe('2,873 results · Showing 3 of 6');
    expect(container.querySelector('.ln-sr .ln-sr-foot').textContent).toContain('Rishonim · 1075');
    const exp = [...container.querySelectorAll('button')].find(b => b.textContent === 'Export results (CSV)');
    click(exp);
    expect(clicks).toEqual(['sefaria-search-light.csv']);
    expect(container.querySelector('.ln-toast').textContent).toBe('Exported 3 results');
    const versionSelect = [...container.querySelectorAll('select')].find(s => s.querySelector('option').textContent === 'Any version');
    expect(versionSelect.querySelectorAll('option').length).toBeGreaterThan(2);
    document.createElement.mockRestore();
  });

  test('empty query, no results and errors', async () => {
    setLang('en'); setPersona('learner');
    render();
    await go('/search');
    expect(text('main h1')).toBe('Search');
    expect(text('.ln-disc-empty')).toBe('Type something to search the library.');
    expect(Sefaria.search.execute_query).not.toHaveBeenCalled();
    Sefaria.search.execute_query = jest.fn((args) => { setTimeout(() => args.success({ hits: { hits: [], total: { value: 0, relation: 'eq' } }, aggregations: { path: { buckets: [] } } }), 0); });
    await go('/search?q=zzz');
    expect(text('.ln-disc-empty')).toContain('No results for “zzz”.');
    Sefaria.search.execute_query = jest.fn((args) => { setTimeout(() => args.error({ textStatus: 'error' }), 0); });
    await go('/search?q=boom');
    expect(text('.ln-disc-empty p')).toBe('Search is not available right now.');
    expect(container.querySelector('.ln-disc-empty a').getAttribute('href')).toBe('/search?q=boom&library=classic');
  });
});

describe('topics landing', () => {
  test('newcomer, English: starter topics with explainers, featured, categories', async () => {
    setLang('en'); setPersona('newcomer');
    render();
    await go('/topics');
    await flushPromises();
    expect(text('main h1')).toBe('Topics');
    const heads = [...container.querySelectorAll('.ln-topics-section h2')].map(h => h.textContent);
    expect(heads).toEqual(['Good places to start', 'Featured today', 'Browse by category']);
    expect(Sefaria.getTopic).toHaveBeenCalledWith('shabbat', { annotated: false });
    expect(container.querySelectorAll('.ln-topics-section')[0].querySelectorAll('.ln-topic-card')).toHaveLength(7);
    expect(container.querySelectorAll('.ln-topics-section')[0].querySelector('.ln-topic-card p').textContent).toBe('About shabbat.');
    expect(text('.ln-featured h3')).toBe('Etrog');
    expect(container.querySelector('.ln-featured img').getAttribute('src')).toBe('https://img/etrog.gif');
    expect([...container.querySelectorAll('.ln-topics-section')[2].querySelectorAll('h3 a')].map(a => a.getAttribute('href'))).toEqual(['/topics/category/biblical-figures', '/topics/category/jewish-calendar2']);
    expect(Sefaria.getTrendingLibraryTopics).not.toHaveBeenCalled();
    expect(document.title).toBe('Topics | Sefaria Library');
  });

  test('scholar, Hebrew: categories with counts, A–Z index on demand, rtl', async () => {
    setLang('hebrew'); setPersona('scholar');
    render();
    await go('/topics');
    await flushPromises();
    expect(document.documentElement.getAttribute('dir')).toBe('rtl');
    expect(text('main h1')).toBe('נושאים');
    const heads = [...container.querySelectorAll('.ln-topics-section h2')].map(h => h.textContent);
    expect(heads).toEqual(['עיון לפי קטגוריה', 'כל הנושאים א–ת', 'הנושאים החמים השבוע']);
    expect(container.querySelectorAll('.ln-topics-section')[0].querySelector('.ln-note').textContent).toBe('2 נושאים');
    expect(Sefaria.topicList).not.toHaveBeenCalled();
    click([...container.querySelectorAll('button')].find(b => b.textContent === 'טעינת האינדקס המלא'));
    await flushPromises(); await flushPromises();
    expect(Sefaria.topicList).toHaveBeenCalled();
    expect([...container.querySelectorAll('.ln-az-group h3')].map(h => h.textContent)).toEqual(['א', 'מ']);
    expect(text('.ln-az-group a')).toBe('אהרן900');
  });

  test('educator and learner lenses', async () => {
    setLang('en'); setPersona('educator');
    render();
    await go('/topics');
    await flushPromises();
    let heads = [...container.querySelectorAll('.ln-topics-section h2')].map(h => h.textContent);
    expect(heads[0]).toBe('For this week’s class');
    expect(container.querySelectorAll('.ln-topics-section')[0].textContent).toContain('Bereshit');
    expect(container.querySelectorAll('.ln-topics-section')[0].textContent).toContain('Hoshana Rabbah');
    act(() => { setPersona('learner'); });
    kv.set('recentTopics', [{ slug: 'moses', title: { en: 'Moses', he: 'משה' }, ts: 1 }]);
    await flushPromises(); await flushPromises();
    heads = [...container.querySelectorAll('.ln-topics-section h2')].map(h => h.textContent);
    expect(heads).toEqual(['Topics you visited', 'Trending this week', 'Featured today', 'Browse by category', 'Something unexpected']);
    expect(container.querySelector('.ln-topics-section .ln-chip-link').getAttribute('href')).toBe('/topics/moses');
  });

  test('topic finder suggests topics only', async () => {
    setLang('en'); setPersona('learner');
    render();
    await go('/topics');
    act(() => {
      const input = container.querySelector('#ln-topic-finder');
      Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set.call(input, 'mos');
      input.dispatchEvent(new Event('input', { bubbles: true }));
    });
    expect(container.querySelector('.ln-topics-finder-list')).toBeNull();   // debounced
    await wait(250);
    const items = container.querySelectorAll('.ln-topics-finder-list a');
    expect(items).toHaveLength(1);
    expect(items[0].getAttribute('href')).toBe('/topics/moses');
  });
});

describe('topic page', () => {
  test('learner, English: title, description, tabs, previews, related, add to plan', async () => {
    setLang('en'); setPersona('learner'); setContentLang('bi');
    render();
    await go('/topics/moses');
    await flushPromises();
    expect(text('.ln-topic-title h1')).toBe('Moses');
    expect(text('.ln-topic-title-alt')).toBe('משה');
    expect(text('.ln-topic-desc')).toContain('Moses was the greatest prophet');
    expect(text('.ln-topic-desc')).not.toContain('](');
    expect(document.title).toBe('Moses | Sefaria Library');
    expect([...container.querySelectorAll('.ln-topic-crumbs a')].map(a => a.getAttribute('href'))).toEqual(['/topics', '/topics/category/biblical-figures']);
    const tabs = [...container.querySelectorAll('.ln-tab')];
    expect(tabs.map(x => x.textContent)).toEqual(['Notable sources3', 'All sources5']);
    expect(tabs[0].getAttribute('aria-selected')).toBe('true');
    const first = container.querySelector('.ln-source');
    expect(first.querySelector('.ln-source-ref').textContent).toContain('Deuteronomy 34:10-12');
    expect(first.querySelector('.ln-source-note h3').textContent).toBe('An Unmatched Prophet');
    expect(first.querySelector('.ln-preview-he').textContent).toContain('עברית');
    expect(first.querySelector('.ln-preview-en').textContent).toContain('English Deuteronomy 34:10-12');
    expect(first.querySelector('.ln-source-foot a').getAttribute('href')).toBe('/Deuteronomy.34.10-12');
    expect(container.querySelector('.ln-prompt')).toBeNull();
    expect([...container.querySelectorAll('.ln-related-group h3')].map(h => h.textContent)).toEqual(['Relationships', 'Child']);
    expect(container.querySelector('.ln-related-group .ln-chip-link').getAttribute('href')).toBe('/topics/aaron');
    expect(kv.get('recentTopics')[0].slug).toBe('moses');
    const add = [...container.querySelectorAll('button')].find(b => b.textContent === 'Add topic to my plan');
    click(add);
    await flushPromises();
    expect(kv.get('planInbox')[0]).toMatchObject({ kind: 'topic', topic: 'moses' });
    click(tabs[1]);
    await flushPromises(); await flushPromises();
    expect(container.querySelectorAll('.ln-source')).toHaveLength(5);
  });

  test('scholar, Hebrew: all sources first, chronological sort, notebook, dates', async () => {
    setLang('hebrew'); setPersona('scholar'); setContentLang('he');
    render();
    await go('/topics/moses');
    await flushPromises();
    expect(document.documentElement.getAttribute('dir')).toBe('rtl');
    expect(text('.ln-topic-title h1')).toBe('משה');
    expect(container.querySelector('.ln-tab[aria-selected="true"]').textContent).toBe('כל המקורות5');
    expect(container.querySelector('.ln-source .ln-preview-en')).toBeNull();
    expect(container.querySelector('.ln-source .ln-source-ref').textContent).toBe('he:Deuteronomy 34:10-12');
    act(() => { const sel = container.querySelector('.ln-topic-tabs select'); sel.value = 'chronological'; sel.dispatchEvent(new Event('change', { bubbles: true })); });
    await flushPromises();
    expect(container.querySelector('.ln-source .ln-source-ref').textContent).toBe('he:Exodus 2:1-10');
    expect(container.querySelector('.ln-source .ln-source-foot').textContent).toContain('1400 BCE');
    click([...container.querySelectorAll('button')].find(b => b.textContent === 'הוספת הנושא למחברת'));
    await flushPromises();
    expect(kv.get('notebookInbox')[0]).toMatchObject({ kind: 'topic', topic: 'moses' });
    expect(kv.get('notebookInbox')[0].citation).toContain('/topics/moses');
  });

  test('educator: discussion prompts and per-source add to lesson; newcomer explainer', async () => {
    setLang('en'); setPersona('educator');
    render();
    await go('/topics/moses');
    await flushPromises();
    expect(container.querySelector('.ln-prompt').textContent).toContain('What does this source add to our picture of Moses?');
    click(container.querySelector('.ln-source .ln-source-foot button'));
    await flushPromises();
    expect(kv.get('lessonInbox')[0]).toMatchObject({ kind: 'ref', ref: 'Deuteronomy 34:10-12', topic: 'moses', from: 'topic' });
    act(() => { setPersona('newcomer'); });
    await flushPromises();
    expect(text('.ln-explainer p')).toContain('Each source below');
    expect(container.querySelector('.ln-topic-tabs select')).toBeNull();
  });

  test('missing topic and category page', async () => {
    setLang('en'); setPersona('learner');
    render();
    await go('/topics/nope');
    await flushPromises();
    expect(text('.ln-disc-empty')).toBe('There is no topic called “nope”.');
    await go('/topics/category/jewish-calendar2');
    expect(text('main h1')).toBe('Topics in Jewish Calendar');
    expect(text('.ln-disc-lead')).toBe('Festivals.');
    expect(container.querySelector('.ln-topic-card h3 a').getAttribute('href')).toBe('/topics/shabbat');
    expect(text('.ln-topic-card p')).toBe('The day of rest.');
    expect(document.title).toBe('Jewish Calendar | Sefaria Library');
    setLang('hebrew');
    await go('/topics/category/jewish-calendar2?x=1');
    expect(text('main h1')).toBe('נושאים במועדי השנה');
    await go('/topics/all/A');
    expect(text('main h1')).toBe('נושאים');
  });
});

describe('topic source previews', () => {
  test('falls back to per-ref requests when the batch fails and marks missing refs', async () => {
    const { fetchTexts } = require('../TopicPage');
    const calls = [];
    Sefaria.getBulkText = jest.fn((refs) => {
      calls.push(refs);
      if (refs.length > 1) { return Promise.reject(new Error('403')); }
      return refs[0] === 'Bad; Ref 1' ? Promise.reject(new Error('403')) : Promise.resolve({ [refs[0]]: { en: 'ok', he: 'טוב' } });
    });
    const out = await fetchTexts(['Genesis 1:1', 'Bad; Ref 1']);
    expect(out).toEqual({ 'Genesis 1:1': { en: 'ok', he: 'טוב' }, 'Bad; Ref 1': null });
    expect(calls).toEqual([['Genesis 1:1', 'Bad; Ref 1'], ['Genesis 1:1'], ['Bad; Ref 1']]);
    expect(await fetchTexts([])).toEqual({});
    Sefaria.getBulkText = jest.fn((refs) => Promise.resolve(Object.fromEntries(refs.map(r => [r, { ref: r, heRef: `he:${r}`, he: `<b>עברית</b> ${r}`, en: `English ${r}`, primary_category: 'Tanakh', url: r.replace(/ /g, '_') }]))));
  });
});

describe('header search suggestions', () => {
  test('typing shows getName completions; Enter on a highlighted one navigates', async () => {
    setLang('en'); setPersona('learner');
    render();
    const input = container.querySelector('#ln-search-input');
    act(() => {
      Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set.call(input, 'mo');
      input.dispatchEvent(new Event('input', { bubbles: true }));
    });
    expect(container.querySelector('.ln-suggest')).toBeNull();   // debounced
    await wait(250);
    const items = container.querySelectorAll('.ln-suggest-item');
    expect([...items].map(i => i.textContent)).toEqual(['MosesTopic', 'GenesisText']);
    expect(input.getAttribute('aria-expanded')).toBe('true');
    act(() => { input.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true })); });
    expect(container.querySelector('.ln-suggest-item.active').textContent).toBe('MosesTopic');
    expect(input.getAttribute('aria-activedescendant')).toBe('ln-suggest-0');
    act(() => { container.querySelector('.ln-search').dispatchEvent(new Event('submit', { bubbles: true, cancelable: true })); });
    expect(window.location.pathname).toBe('/topics/moses');
    expect(container.querySelector('.ln-suggest')).toBeNull();
  });
});
