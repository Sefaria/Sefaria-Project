/**
 * The header's table-of-contents and search sheets, in the hydrated reader (jsdom): the header
 * tap target, the TOC for a chapter book, a tractate and a schema book, navigation from both
 * sheets, search debounce / results / paging / empty and error states, history (Back closes a
 * sheet), focus, and the drag-to-dismiss rules.
 *
 * The data layer is the real Sefaria singleton. Its network edges are stubbed: getIndexDetails
 * (index fixtures captured from sefaria.org), getTextFromCurrVersions, bookSearchPathFilterAPI,
 * and either Sefaria.search.execute_query or, in one test, the jQuery $.ajax under it, so the
 * real execute_query builds the request sent to /api/search-wrapper/es8.
 */
import React from 'react';
import {act} from 'react-dom/test-utils';
import Sefaria from '../../sefaria/sefaria';
import $ from '../../sefaria/sefariaJquery';
import {OVERLAY} from '../context';
import {DEBOUNCE_MS, PAGE_SIZE} from '../searchData';
import {DRAG, dragDismisses, dragMovesSheet} from '../sheets/BottomSheet';
import {fixture, indexFixture, neighbourText} from './helpers';
import {flush, hydrate, realErrors, setupBrowser, wait} from './browser';

const env = setupBrowser();
const $1 = (sel) => env.container.querySelector(sel);
const $$ = (sel) => Array.from(env.container.querySelectorAll(sel));
const click = (el) => act(() => { el.click(); });
const RESPONSE = require('./fixtures/search-genesis-light.json');

const GENESIS_2 = neighbourText('genesis-1', {ref: 'Genesis 2', heRef: 'בראשית ב׳', prev: 'Genesis 1', next: null});
const GENESIS_12 = neighbourText('genesis-1', {ref: 'Genesis 12', heRef: 'בראשית י״ב', prev: 'Genesis 11', next: 'Genesis 13', marker: 'CHAPTER-TWELVE'});

let getText, getIndex, pathFilter;
beforeEach(() => {
  window.matchMedia = () => ({matches: true});  // reduced motion: sheets move without waiting on transitions
  getText = jest.spyOn(Sefaria, 'getTextFromCurrVersions').mockImplementation((ref) => {
    if (ref === 'Genesis 2') { return Promise.resolve(GENESIS_2); }
    if (ref === 'Genesis 12') { return Promise.resolve(GENESIS_12); }
    if (/^Genesis 1:\d+$/.test(ref)) {
      return Promise.resolve({...fixture('genesis-1').initialPanel.text, ref, sections: ['1', ref.split(':')[1]]});
    }
    if (/^Genesis 6:9$/.test(ref)) {
      const six = neighbourText('genesis-1', {ref: 'Genesis 6', heRef: 'בראשית ו׳', prev: 'Genesis 5', next: 'Genesis 7'});
      return Promise.resolve({...six, ref, sections: ['6', '9']});
    }
    return Promise.reject(new Error(`unexpected ${ref}`));
  });
  getIndex = jest.spyOn(Sefaria, 'getIndexDetails').mockImplementation((title) => Promise.resolve(indexFixture(title)));
  jest.spyOn(Sefaria, 'getIndexDetailsFromCache').mockReturnValue(undefined);
  jest.spyOn(Sefaria, 'getLinks').mockImplementation(() => Promise.resolve([]));  // the stream's link counts
  pathFilter = jest.spyOn(Sefaria, 'bookSearchPathFilterAPI').mockImplementation(
    (title) => Promise.resolve({Genesis: 'Tanakh/Torah/Genesis', Berakhot: 'Talmud/Bavli/Seder Zeraim/Berakhot'}[title]));
});

const overlayState = () => $1('[data-ng="reader"]').getAttribute('data-overlay');
const sheet = () => $1('[data-ng="bottom-sheet"]');

async function openToc() {
  click($1('[data-ng="header-toc"]'));
  await flush();
}

async function openSearch() {
  click($1('[data-ng="header-search"]'));
  await flush();
}

function type(input, value) {
  // React tracks the input's value; set it through the native setter so onChange fires.
  const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set;
  act(() => {
    setter.call(input, value);
    input.dispatchEvent(new Event('input', {bubbles: true}));
  });
}

describe('the header', () => {
  test('the contents icon and the ref are one control, with no separate contents button', async () => {
    await hydrate(env.container, fixture('genesis-1'));
    const ref = $1('[data-ng="header-ref"]');
    const toc = $1('[data-ng="header-toc"]');
    expect(ref.contains(toc)).toBe(true);
    expect(toc.querySelector('svg.ng-icon')).not.toBeNull();
    expect(toc.textContent).toBe(ref.textContent);
    expect(toc.textContent).toMatch(/^Genesis1:\d+$/);
    expect(toc.getAttribute('aria-haspopup')).toBe('dialog');
    expect(toc.getAttribute('aria-expanded')).toBe('false');
    expect($$('[data-ng="header-toc"]')).toHaveLength(1);
    expect($$('.ng-header-actions [data-ng]').map(el => el.getAttribute('data-ng')))
      .toEqual(['header-search', 'header-browse', 'header-settings']);
    expect(realErrors(env.errors)).toEqual([]);
  });

  test('tapping it opens the contents sheet in the reader (no page load), and marks itself expanded', async () => {
    await hydrate(env.container, fixture('genesis-1'));
    const event = new MouseEvent('click', {bubbles: true, cancelable: true});
    act(() => { $1('[data-ng="header-toc"]').dispatchEvent(event); });
    await flush();
    expect(event.defaultPrevented).toBe(true);
    expect(overlayState()).toBe(OVERLAY.TOC);
    expect(sheet().getAttribute('role')).toBe('dialog');
    expect(sheet().getAttribute('aria-modal')).toBe('true');
    expect($1('[data-ng="header-toc"]').getAttribute('aria-expanded')).toBe('true');
    expect(window.history.state.ngOverlay).toMatchObject({type: OVERLAY.TOC, depth: 1});
  });

  test('a Hebrew interface: Hebrew ref, and the icon leads it (on the right, as the row is rtl)', async () => {
    await hydrate(env.container, fixture('genesis-1', {interfaceLang: 'hebrew'}));
    expect($1('[data-ng="reader"]').getAttribute('dir')).toBe('rtl');
    const toc = $1('[data-ng="header-toc"]');
    expect(toc.firstElementChild.className).toBe('ng-header-toc-icon');
    expect(toc.textContent).toMatch(/^בראשית/);
    expect(realErrors(env.errors)).toEqual([]);
  });
});

describe('table of contents', () => {
  test('Genesis: loads the index on first open only, marks the current chapter, lists parashot', async () => {
    await hydrate(env.container, fixture('genesis-1'));
    expect(getIndex).not.toHaveBeenCalled();
    await openToc();
    expect(getIndex).toHaveBeenCalledWith('Genesis');
    expect($1('[data-ng="toc"]').getAttribute('data-status')).toBe('ready');
    expect(sheet().getAttribute('aria-labelledby')).toBe('ng-sheet-toc-label');
    expect(document.getElementById('ng-sheet-toc-label').textContent).toContain('Genesis');
    expect($1('[data-ng="toc-title"]').textContent).toBe('Genesisבראשית');
    const cells = $$('[data-ng="toc-section"]');
    expect(cells).toHaveLength(50);
    expect(cells.filter(c => c.getAttribute('aria-current') === 'location').map(c => c.getAttribute('data-ref'))).toEqual(['Genesis 1']);
    click($1('[data-ng="toc-tab-Parasha"]'));
    const parashot = $$('[data-ng="toc-alt-item"]');
    expect(parashot).toHaveLength(12);
    expect(parashot[0].getAttribute('aria-current')).toBe('location');
    expect(parashot[1].textContent).toContain('Noach');
  });

  test('choosing a chapter navigates in the reader: new stream, URL, history entry; the sheet closes', async () => {
    await hydrate(env.container, fixture('genesis-1'));
    await openToc();
    const push = jest.spyOn(window.history, 'pushState');
    click($1('[data-ng="toc-section"][data-ref="Genesis 12"]'));
    await wait(450);
    await flush();
    expect(getText).toHaveBeenCalledWith('Genesis 12', {en: null, he: null}, null, true);
    expect(overlayState()).toBe(OVERLAY.NONE);
    expect(sheet()).toBeNull();
    expect($$('[data-ng="section"]').map(s => s.getAttribute('data-ref'))[0]).toBe('Genesis 12');
    expect($1('[data-ng="section"]').textContent).toContain('CHAPTER-TWELVE');
    expect(window.location.pathname + window.location.search).toBe('/Genesis.12?lang=bi');
    expect(push).toHaveBeenLastCalledWith({ngRef: 'Genesis 12'}, '', '/Genesis.12?lang=bi');
    expect($1('[data-highlighted="true"]')).toBeNull();
  });

  test('choosing a parasha opens at its first verse and flashes it', async () => {
    await hydrate(env.container, fixture('genesis-1'));
    await openToc();
    click($1('[data-ng="toc-tab-Parasha"]'));
    click($$('[data-ng="toc-alt-item"]')[1]);
    await wait(450);
    await flush();
    expect(getText).toHaveBeenCalledWith('Genesis 6:9', {en: null, he: null}, null, true);
    expect(window.location.pathname).toBe('/Genesis.6.9');
    expect($1('[data-ng="segment"][data-ref="Genesis 6:9"]').getAttribute('data-flash')).toBe('true');
    expect($1('[data-highlighted="true"]')).toBeNull();
  });

  test('Berakhot: a grid of amudim from 2a, the current one marked; Hebrew labels in a Hebrew interface', async () => {
    await hydrate(env.container, fixture('berakhot-2a', {interfaceLang: 'hebrew'}));
    await openToc();
    expect(getIndex).toHaveBeenCalledWith('Berakhot');
    const cells = $$('[data-ng="toc-section"]');
    expect(cells[0].getAttribute('data-ref')).toBe('Berakhot 2a');
    expect(cells[0].textContent).toBe('ב.');
    expect(cells[1].textContent).toBe('ב:');
    expect(cells[0].getAttribute('aria-current')).toBe('location');
    expect($1('[data-ng="toc-grid"]').getAttribute('data-talmud')).toBe('true');
    expect($1('[data-ng="toc-tab-Chapters"]').textContent).toBe('פרקים');
    expect(realErrors(env.errors)).toEqual([]);
  });

  test('a schema book: a tree opened along the current part; branches toggle; a part navigates', async () => {
    getText.mockImplementation((ref) => (ref === 'Pesach Haggadah, Barech, Birkat Hamazon'
      ? Promise.resolve({...fixture('haggadah-four-sons').initialPanel.text, ref, sectionRef: ref, next: null, prev: null})
      : Promise.reject(new Error(`not in this test: ${ref}`))));
    window.history.replaceState(null, '', '/Pesach_Haggadah,_Magid,_The_Four_Sons');
    await hydrate(env.container, fixture('haggadah-four-sons'));
    await openToc();
    expect(getIndex).toHaveBeenCalledWith('Pesach Haggadah');
    expect($1('[data-ng="toc-tree"]')).not.toBeNull();
    const magid = $1('[data-ng="toc-toggle"][data-ref="Pesach Haggadah, Magid"]');
    expect(magid.getAttribute('aria-expanded')).toBe('true');
    const current = $$('[aria-current="location"]');
    expect(current.map(el => el.getAttribute('data-ref'))).toEqual(['Pesach Haggadah, Magid, The Four Sons']);
    const barech = $1('[data-ng="toc-toggle"][data-ref="Pesach Haggadah, Barech"]');
    expect(barech.getAttribute('aria-expanded')).toBe('false');
    expect($1('[data-ng="toc-node"][data-ref="Pesach Haggadah, Barech, Birkat Hamazon"]')).toBeNull();
    click(barech);
    expect(barech.getAttribute('aria-expanded')).toBe('true');
    click($1('[data-ng="toc-node"][data-ref="Pesach Haggadah, Barech, Birkat Hamazon"]'));
    await wait(450);
    await flush();
    expect(getText).toHaveBeenCalledWith('Pesach Haggadah, Barech, Birkat Hamazon', {en: null, he: null}, null, true);
    expect(window.location.pathname).toBe('/Pesach_Haggadah,_Barech,_Birkat_Hamazon');
    expect(overlayState()).toBe(OVERLAY.NONE);
  });

  test('a failed index load offers a retry', async () => {
    getIndex.mockRejectedValueOnce(new Error('offline'));
    await hydrate(env.container, fixture('genesis-1'));
    await openToc();
    expect($1('[data-ng="toc"]').getAttribute('data-status')).toBe('error');
    click($1('[data-ng="toc-retry"]'));
    await flush();
    expect(getIndex).toHaveBeenCalledTimes(2);
    expect($1('[data-ng="toc"]').getAttribute('data-status')).toBe('ready');
  });
});

describe('search in the book', () => {
  let query;
  const respond = (response) => (args) => { setTimeout(() => args.success(JSON.parse(JSON.stringify(response))), 0); return {abort() {}}; };
  async function ready(props = fixture('genesis-1')) {
    await hydrate(env.container, props);
    query = jest.spyOn(Sefaria.search, 'execute_query').mockImplementation(respond(RESPONSE));
    await openSearch();
    return $1('[data-ng="search-input"]');
  }

  test('opens focused on its input, labelled for the book', async () => {
    const input = await ready();
    expect(overlayState()).toBe(OVERLAY.SEARCH);
    expect(document.activeElement).toBe(input);
    expect(sheet().getAttribute('aria-label')).toBe('Search in Genesis');
    expect(input.getAttribute('aria-label')).toBe('Search in Genesis');
    expect($1('[data-ng="search"]').getAttribute('data-status')).toBe('idle');
  });

  test('debounced: typing runs one query, after the pause, filtered to the book path', async () => {
    const input = await ready();
    type(input, 'l');
    type(input, 'li');
    type(input, 'lig');
    type(input, 'light');
    await flush(2);
    expect(query).not.toHaveBeenCalled();
    expect($1('[data-ng="search"]').getAttribute('data-status')).toBe('loading');
    await wait(DEBOUNCE_MS + 40);
    await flush();
    expect(pathFilter).toHaveBeenCalledWith('Genesis');
    expect(query).toHaveBeenCalledTimes(1);
    expect(query.mock.calls[0][0]).toMatchObject({
      query: 'light', type: 'text', applied_filters: ['Tanakh/Torah/Genesis'], appliedFilterAggTypes: ['path'],
      field: 'naive_lemmatizer', size: PAGE_SIZE, sort_type: 'chronological',
    });
  });

  test('results: one row per passage, with its ref and highlighted Hebrew and English snippets', async () => {
    const input = await ready();
    type(input, 'light');
    await wait(DEBOUNCE_MS + 40);
    await flush();
    expect($1('[data-ng="search"]').getAttribute('data-status')).toBe('ready');
    const rows = $$('[data-ng="search-result"]');
    expect(rows.map(r => r.getAttribute('data-ref'))).toEqual(['Genesis 1:3', 'Genesis 1:4', 'Genesis 1:5']);
    expect(rows[0].querySelector('.ng-search-ref').textContent).toBe('Genesis 1:3');
    const he = rows[0].querySelector('.ng-search-snippet-he');
    expect(he.getAttribute('dir')).toBe('rtl');
    expect(Array.from(he.querySelectorAll('mark')).map(m => m.textContent)).toEqual(['אור', 'אור']);
    expect(Array.from(rows[0].querySelectorAll('.ng-search-snippet-en mark')).map(m => m.textContent)).toEqual(['light', 'light']);
    // Markup inside a snippet is text, never HTML.
    expect(rows[2].querySelector('script, i')).toBeNull();
    expect(rows[2].textContent).toContain('the darkness He called Night &');
    expect($1('[data-ng="search-status"]').textContent).toBe('3 passages');
    expect($1('[data-ng="search-more"]')).toBeNull();
  });

  test('a Hebrew interface shows Hebrew refs', async () => {
    const input = await ready(fixture('genesis-1', {interfaceLang: 'hebrew'}));
    type(input, 'light');
    await wait(DEBOUNCE_MS + 40);
    await flush();
    expect($1('[data-ng="search-result"] .ng-search-ref').textContent).toBe('בראשית א׳:ג׳');
    expect(sheet().getAttribute('aria-label')).toBe('חיפוש בבראשית');
  });

  test('pages: a full page asks for the next from where it ended, until the total', async () => {
    const hit = (i) => ({_id: `h${i}`, _source: {ref: `Genesis ${1 + Math.floor(i / 30)}:${1 + (i % 30)}`, heRef: 'x', lang: 'en', version: 'v'},
      highlight: {naive_lemmatizer: [`<b>w</b> ${i}`]}});
    const all = Array.from({length: 150}, (_, i) => hit(i));
    const input = await ready();
    query.mockImplementation((args) => {
      const start = args.start || 0;
      // execute_query hands back everything so far on later pages.
      setTimeout(() => args.success({hits: {total: {value: 150}, hits: all.slice(0, start + PAGE_SIZE)}}), 0);
      return {abort() {}};
    });
    type(input, 'word');
    await wait(DEBOUNCE_MS + 40);
    await flush(12);
    // jsdom has no layout, so the list never fills the sheet: the next page loads straight away.
    expect(query.mock.calls.map(c => c[0].start)).toEqual([undefined, 100]);
    expect($$('[data-ng="search-result"]')).toHaveLength(150);
    expect($1('[data-ng="search-more"]')).toBeNull();
  });

  test('no results, and a failed search that can be retried', async () => {
    const input = await ready();
    query.mockImplementation(respond({hits: {total: {value: 0}, hits: []}}));
    type(input, 'zzzz');
    await wait(DEBOUNCE_MS + 40);
    await flush();
    expect($1('[data-ng="search"]').getAttribute('data-status')).toBe('ready');
    expect($1('[data-ng="search-status"]').textContent).toBe('Nothing for “zzzz” in Genesis.');
    query.mockImplementation((args) => { setTimeout(() => args.error({textStatus: 'error'}), 0); return {abort() {}}; });
    type(input, 'light');
    await wait(DEBOUNCE_MS + 40);
    await flush();
    expect($1('[data-ng="search"]').getAttribute('data-status')).toBe('error');
    query.mockImplementation(respond(RESPONSE));
    click($1('[data-ng="search-retry"]'));
    await flush();
    expect($$('[data-ng="search-result"]')).toHaveLength(3);
  });

  test('choosing a result goes to that verse, scrolls to it, flashes it, and closes the sheet', async () => {
    const input = await ready();
    type(input, 'light');
    await wait(DEBOUNCE_MS + 40);
    await flush();
    click($1('[data-ng="search-result"][data-ref="Genesis 1:4"]'));
    await wait(450);
    await flush();
    expect(getText).toHaveBeenCalledWith('Genesis 1:4', {en: null, he: null}, null, true);
    expect(overlayState()).toBe(OVERLAY.NONE);
    expect(window.location.pathname + window.location.search).toBe('/Genesis.1.4?lang=bi');
    const segment = $1('[data-ng="segment"][data-ref="Genesis 1:4"]');
    expect(segment.getAttribute('data-flash')).toBe('true');
    expect(segment.getAttribute('data-highlighted')).toBeNull();
    expect(window.scrollTo).toHaveBeenLastCalledWith(0, expect.any(Number));
  });

  test('the query comes back when the sheet reopens in the same book', async () => {
    const input = await ready();
    type(input, 'light');
    await wait(DEBOUNCE_MS + 40);
    await flush();
    act(() => { document.dispatchEvent(new KeyboardEvent('keydown', {key: 'Escape', bubbles: true})); });
    await wait(450);
    await openSearch();
    expect($1('[data-ng="search-input"]').value).toBe('light');
  });

  test('through the real execute_query: the POST to /api/search-wrapper/es8 carries the book filter', async () => {
    await hydrate(env.container, fixture('genesis-1'));
    const ajax = jest.spyOn($, 'ajax').mockImplementation((options) => {
      setTimeout(() => options.success(JSON.parse(JSON.stringify(RESPONSE))), 0);
      return {abort() {}};
    });
    await openSearch();
    type($1('[data-ng="search-input"]'), 'light');
    await wait(DEBOUNCE_MS + 40);
    await flush();
    expect(ajax).toHaveBeenCalledTimes(1);
    const request = ajax.mock.calls[0][0];
    expect(request.url).toMatch(/\/api\/search-wrapper\/es8$/);
    expect(request.type).toBe('POST');
    expect(JSON.parse(request.data)).toMatchObject({
      query: 'light', type: 'text', field: 'naive_lemmatizer', filters: ['Tanakh/Torah/Genesis'], filter_fields: ['path'],
      size: PAGE_SIZE, sort_method: 'sort', sort_fields: ['comp_date', 'order'], aggs: [],
    });
    expect($$('[data-ng="search-result"]').map(r => r.getAttribute('data-ref'))).toEqual(['Genesis 1:3', 'Genesis 1:4', 'Genesis 1:5']);
  });
});

describe('history, focus and exclusivity', () => {
  test('Back closes a sheet and stays on the text; focus returns to the header control', async () => {
    await hydrate(env.container, fixture('genesis-1'));
    const toc = $1('[data-ng="header-toc"]');
    act(() => { toc.focus(); });
    await openToc();
    expect(sheet().contains(document.activeElement)).toBe(true);
    act(() => { window.history.back(); });
    await wait(80);
    await flush();
    expect(overlayState()).toBe(OVERLAY.NONE);
    expect(sheet()).toBeNull();
    expect(window.location.pathname).toBe('/Genesis.1');
    expect(document.activeElement).toBe(toc);
    expect(getText).not.toHaveBeenCalledWith('Genesis 1', expect.anything(), expect.anything(), expect.anything());
  });

  test('the close button, Escape and the backdrop each close it', async () => {
    await hydrate(env.container, fixture('genesis-1'));
    for (const close of [
      () => click($1('[data-ng="sheet-close"]')),
      () => act(() => { document.dispatchEvent(new KeyboardEvent('keydown', {key: 'Escape', bubbles: true})); }),
      () => click($1('[data-ng="sheet-backdrop"]')),
    ]) {
      await openToc();
      expect(overlayState()).toBe(OVERLAY.TOC);
      close();
      await wait(450);
      await flush();
      expect(overlayState()).toBe(OVERLAY.NONE);
      expect(sheet()).toBeNull();
    }
  });

  test('Tab stays inside the dialog', async () => {
    await hydrate(env.container, fixture('genesis-1'));
    await openToc();
    const focusable = Array.from(sheet().querySelectorAll('button:not([disabled])'));
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    act(() => { last.focus(); });
    act(() => { document.dispatchEvent(new KeyboardEvent('keydown', {key: 'Tab', bubbles: true, cancelable: true})); });
    expect(document.activeElement).toBe(first);
    act(() => { document.dispatchEvent(new KeyboardEvent('keydown', {key: 'Tab', shiftKey: true, bubbles: true, cancelable: true})); });
    expect(document.activeElement).toBe(last);
  });

  test('a sheet is exclusive with the drawers: none is shown, and the reader has one overlay', async () => {
    await hydrate(env.container, fixture('genesis-1'));
    await openSearch();
    expect($1('[data-ng="overlay"]').hidden).toBe(true);
    expect($1('[data-ng="sheet"]')).toBeNull();
    expect($1('[data-ng="sheets"]').getAttribute('data-state')).toBe(OVERLAY.SEARCH);
    // Opening the contents from here replaces search: still one sheet.
    click($1('[data-ng="header-toc"]'));
    await flush();
    await wait(300);
    expect($$('[data-ng="bottom-sheet"]').map(s => s.getAttribute('data-sheet'))).toEqual(['toc']);
  });
});

describe('drag to dismiss', () => {
  test('the head drags either way; the body only downward, and only from its top', () => {
    expect(dragMovesSheet({dy: 30, zone: 'head', bodyAtTop: false})).toBe(true);
    expect(dragMovesSheet({dy: 30, zone: 'body', bodyAtTop: true})).toBe(true);
    expect(dragMovesSheet({dy: 30, zone: 'body', bodyAtTop: false})).toBe(false);
    expect(dragMovesSheet({dy: -30, zone: 'body', bodyAtTop: true})).toBe(false);
    expect(dragMovesSheet({dy: DRAG.lock - 1, zone: 'head'})).toBe(false);
    expect(dragMovesSheet({dy: 20, dx: 40, zone: 'head'})).toBe(false);  // sideways
  });

  test('release dismisses past a quarter of the height or on a downward flick', () => {
    expect(dragDismisses({dy: 220, height: 800, velocity: 0})).toBe(true);
    expect(dragDismisses({dy: 120, height: 800, velocity: 0.2})).toBe(false);
    expect(dragDismisses({dy: 60, height: 800, velocity: 0.9})).toBe(true);
  });

  test('a finger dragging the head down closes the sheet', async () => {
    await hydrate(env.container, fixture('genesis-1'));
    await openToc();
    const grip = $1('.ng-bsheet-grip');
    const touch = (type, y) => {
      const event = new Event(type, {bubbles: true, cancelable: true});
      const point = {clientX: 200, clientY: y};
      Object.defineProperty(event, 'touches', {value: type === 'touchend' ? [] : [point]});
      Object.defineProperty(event, 'changedTouches', {value: [point]});
      act(() => { grip.dispatchEvent(event); });
      return event;
    };
    touch('touchstart', 100);
    const move = touch('touchmove', 140);
    for (let y = 180; y <= 500; y += 40) { touch('touchmove', y); }
    touch('touchend', 500);
    expect(move.defaultPrevented).toBe(true);  // the page doesn't scroll under a moving sheet
    await wait(450);
    await flush();
    expect(overlayState()).toBe(OVERLAY.NONE);
  });
});
