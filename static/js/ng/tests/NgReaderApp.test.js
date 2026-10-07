/**
 * NgReaderApp in the browser (jsdom): hydrating the server HTML, and the reading mechanics
 * that run after mount. No React Testing Library in this repo: react-dom + act, as in
 * static/js/tests/searchResultCardPressState.test.js. The data layer is the real Sefaria
 * singleton, with its one network call (getTextFromCurrVersions) stubbed.
 */
import React from 'react';
import ReactDOM from 'react-dom';
import ReactDOMServer from 'react-dom/server';
import {act} from 'react-dom/test-utils';
import Sefaria from '../../sefaria/sefaria';
import {NgReaderApp, ngUnpackProps} from '../index';
import {OVERLAY, useNgReader} from '../context';
import {fixture, neighbourText, SHARED_DATA} from './helpers';

let container, errors, raf, rect;

// React warns about useLayoutEffect when renderToString runs where `window` exists, which only
// happens in this jsdom test (real SSR runs in Node, where NG uses useEffect). Anything else a
// render logs, a hydration mismatch included, fails the test.
const JSDOM_ONLY_WARNING = /useLayoutEffect does nothing on the server/;
const realErrors = () => errors.mock.calls.filter(args => !JSDOM_ONLY_WARNING.test(String(args[0])));

// jsdom has no layout: give segments a simple vertical stack so "the segment nearest the
// center" is meaningful (segment i spans [i*100, i*100+90)).
function stackSegments() {
  const original = Element.prototype.getBoundingClientRect;
  const box = (top, height) => ({top, bottom: top + height, left: 0, right: 0, width: 0, height});
  Element.prototype.getBoundingClientRect = function () {
    const kind = this.getAttribute && this.getAttribute('data-ng');
    if (kind === 'segment') {
      const i = Array.from(document.querySelectorAll('[data-ng="segment"]')).indexOf(this);
      return box(i * 100, 90);
    }
    if (kind === 'section') {
      // A section starts where its first segment does, less 60px for its title.
      const first = this.querySelector('[data-ng="segment"]');
      const i = Array.from(document.querySelectorAll('[data-ng="segment"]')).indexOf(first);
      return box(i * 100 - 60, this.querySelectorAll('[data-ng="segment"]').length * 100);
    }
    return original.call(this);
  };
  return () => { Element.prototype.getBoundingClientRect = original; };
}

function clearCookies() {
  document.cookie.split(';').forEach(c => {
    const name = c.split('=')[0].trim();
    if (name) { document.cookie = `${name}=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/`; }
  });
}

beforeEach(() => {
  clearCookies();
  errors = jest.spyOn(console, 'error').mockImplementation(() => {});
  raf = window.requestAnimationFrame;
  window.requestAnimationFrame = (cb) => setTimeout(cb, 0);
  window.scrollTo = jest.fn();
  window.scrollBy = jest.fn();
  document.title = 'Genesis 1 | Sefaria Library';
  window.history.replaceState(null, '', '/Genesis.1');
  rect = stackSegments();
  container = document.createElement('div');
  container.id = 's2';
  document.body.appendChild(container);
});

afterEach(() => {
  act(() => { ReactDOM.unmountComponentAtNode(container); });
  container.remove();
  window.requestAnimationFrame = raf;
  rect();
  jest.restoreAllMocks();
});

const flush = () => act(async () => { for (let i = 0; i < 5; i++) { await new Promise(r => setTimeout(r, 0)); } });
const $ = (sel) => container.querySelector(sel);
const $$ = (sel) => Array.from(container.querySelectorAll(sel));

/** Server-render, then hydrate the same props, the way client.jsx does. */
async function hydrate(props, extra = {}) {
  container.innerHTML = ReactDOMServer.renderToString(<NgReaderApp {...props} {...extra} />);
  Sefaria.setup(SHARED_DATA, props);  // what data.js and the bundle's import do in the browser
  ngUnpackProps(props);
  act(() => { ReactDOM.hydrate(<NgReaderApp {...props} {...extra} />, container); });
  await flush();
}

function stubText(responses) {
  return jest.spyOn(Sefaria, 'getTextFromCurrVersions').mockImplementation((ref) => {
    const data = responses[ref];
    return data ? Promise.resolve(data) : Promise.reject(new Error(`unexpected ${ref}`));
  });
}

const GENESIS_2 = neighbourText('genesis-1', {ref: 'Genesis 2', heRef: 'בראשית ב׳', prev: 'Genesis 1', next: null, marker: 'SECOND-CHAPTER'});

test('hydrates the server HTML without warnings and marks itself hydrated', async () => {
  stubText({'Genesis 2': GENESIS_2});
  await hydrate(fixture('genesis-1'));
  expect(realErrors()).toEqual([]);
  expect($('[data-ng="reader"]').getAttribute('data-hydrated')).toBe('true');
  expect($$('[data-ng="section"][data-ref="Genesis 1"] [data-ng="segment"]')).toHaveLength(31);
});

test('keeps the URL in the classic grammar and the title in step', async () => {
  stubText({'Genesis 2': GENESIS_2});
  await hydrate(fixture('genesis-1'));
  expect(window.location.pathname + window.location.search).toBe('/Genesis.1?lang=bi');
  expect(document.title).toBe('Genesis 1 | Sefaria Library');
  expect($('[data-ng="header-ref"]').textContent).toBe('Genesis1:4');  // the segment at the center (384px)
});

test('continuous reading: appends the next section through the data layer, with the reader\'s versions', async () => {
  // jsdom has no layout, so the document is always "near the bottom" and the mount check loads next.
  const getText = stubText({'Genesis 2': GENESIS_2});
  await hydrate(fixture('genesis-1'));
  expect(getText).toHaveBeenCalledWith('Genesis 2', {en: null, he: null}, null, true);
  expect($$('[data-ng="section"]').map(s => s.getAttribute('data-ref'))).toEqual(['Genesis 1', 'Genesis 2']);
  expect($('[data-ng="section"][data-ref="Genesis 2"]').textContent).toContain('SECOND-CHAPTER');
  expect($('[data-ng="next-edge"]').getAttribute('data-status')).toBe('done');  // Genesis 2 is last here
});

test('a failed load offers a retry', async () => {
  const getText = jest.spyOn(Sefaria, 'getTextFromCurrVersions')
    .mockRejectedValueOnce(new Error('offline'))
    .mockResolvedValueOnce(GENESIS_2);
  await hydrate(fixture('genesis-1'));
  expect($('[data-ng="next-edge"]').getAttribute('data-status')).toBe('error');
  act(() => { $('[data-ng="next-edge"] button').click(); });
  await flush();
  expect(getText).toHaveBeenCalledTimes(2);
  expect($$('[data-ng="section"]')).toHaveLength(2);
});

describe('taps on the text', () => {
  beforeEach(() => { stubText({'Genesis 2': GENESIS_2}); });

  test('a footnote marker opens and closes its note in place', async () => {
    await hydrate(fixture('genesis-1', {language: 'english'}));
    const marker = $('sup.footnote-marker');
    const note = marker.nextElementSibling;
    act(() => { marker.click(); });
    expect(note.classList.contains('ng-footnote-open')).toBe(true);
    expect(marker.getAttribute('aria-expanded')).toBe('true');
    act(() => { marker.click(); });
    expect(note.classList.contains('ng-footnote-open')).toBe(false);
  });

  test('tapping the text toggles the header', async () => {
    await hydrate(fixture('genesis-1'));
    const header = $('[data-ng="header"]');
    expect(header.getAttribute('data-visible')).toBe('true');
    act(() => { $('[data-ng="segment"] .ng-en').click(); });
    expect(header.getAttribute('data-visible')).toBe('false');
    act(() => { $('[data-ng="segment"] .ng-en').click(); });
    expect(header.getAttribute('data-visible')).toBe('true');
  });

  test('a named entity does not navigate away from the text', async () => {
    await hydrate(fixture('berakhot-2a', {language: 'hebrew'}));
    const link = $('a.namedEntityLink');
    const event = new MouseEvent('click', {bubbles: true, cancelable: true});
    act(() => { link.dispatchEvent(event); });
    expect(event.defaultPrevented).toBe(true);
  });
});

describe('settings (the config overlay stub)', () => {
  beforeEach(() => { stubText({'Genesis 2': GENESIS_2}); });

  test('switching to source only re-renders, writes the classic cookies and updates ?lang', async () => {
    await hydrate(fixture('genesis-1'));
    act(() => { $('[data-ng="header-settings"]').click(); });
    expect($('[data-ng="overlay"]').getAttribute('data-overlay')).toBe(OVERLAY.CONFIG);
    expect($('[data-ng="header"]').getAttribute('data-visible')).toBe('true');
    act(() => { $('[data-ng="setting-language-hebrew"]').click(); });
    await flush();
    expect($('[data-ng="stream"]').getAttribute('data-language')).toBe('hebrew');
    expect($('[data-ng="segment"] .ng-en')).toBeNull();
    expect(document.cookie).toContain('contentLang=hebrew');
    expect(window.location.search).toBe('?lang=he');
    act(() => { document.dispatchEvent(new KeyboardEvent('keydown', {key: 'Escape'})); });
    expect($('[data-ng="overlay"]').getAttribute('data-state')).toBe(OVERLAY.NONE);
    expect($('[data-ng="reader"]').getAttribute('data-overlay')).toBe(OVERLAY.NONE);
  });

  test('layout is stored per category: continuous Tanakh writes layoutTanakh', async () => {
    await hydrate(fixture('genesis-1', {language: 'english'}));
    act(() => { $('[data-ng="header-settings"]').click(); });
    act(() => { $('[data-ng="setting-layout-continuous"]').click(); });
    expect($('[data-ng="section"]').getAttribute('data-layout')).toBe('continuous');
    expect(document.cookie).toContain('layoutTanakh=continuous');
  });

  test('the classic-reader link opts out with ?ng=0', async () => {
    await hydrate(fixture('genesis-1'));
    act(() => { $('[data-ng="header-settings"]').click(); });
    expect($('[data-ng="classic-link"]').getAttribute('href')).toBe('/Genesis.1?lang=bi&ng=0');
  });
});

test('overlay panels plug in through useNgReader and anchor to the current segment', async () => {
  stubText({'Genesis 2': GENESIS_2});
  const seen = [];
  function TestConfig() {
    const {openAssociated} = useNgReader();
    return <button type="button" data-ng="open-associated" onClick={() => openAssociated()}>open</button>;
  }
  function TestAssociated({overlay, onClose}) {
    seen.push(overlay.ref);
    return <button type="button" data-ng="test-close" onClick={onClose}>{overlay.ref}</button>;
  }
  await hydrate(fixture('genesis-1'), {overlayPanels: {[OVERLAY.CONFIG]: TestConfig, [OVERLAY.ASSOCIATED]: TestAssociated}});
  act(() => { $('[data-ng="header-settings"]').click(); });
  act(() => { $('[data-ng="open-associated"]').click(); });
  expect($('[data-ng="overlay"]').getAttribute('data-overlay')).toBe(OVERLAY.ASSOCIATED);
  expect(seen[seen.length - 1]).toMatch(/^Genesis \d:\d+$/);
  act(() => { $('[data-ng="test-close"]').click(); });
  expect($('[data-ng="overlay"]').getAttribute('data-state')).toBe(OVERLAY.NONE);
  // The panel slides out, then unmounts.
  await act(() => new Promise(r => setTimeout(r, 450)));
  expect($('[data-ng="overlay"]').getAttribute('data-overlay')).toBe(OVERLAY.NONE);
  expect($('[data-ng="overlay"]').hidden).toBe(true);
});

test('a Hebrew interface hydrates mirrored, with Hebrew refs in the header', async () => {
  stubText({'Genesis 2': GENESIS_2});
  await hydrate(fixture('genesis-1', {interfaceLang: 'hebrew'}));
  expect(realErrors()).toEqual([]);
  expect($('[data-ng="reader"]').getAttribute('dir')).toBe('rtl');
  expect($('[data-ng="header-ref"]').textContent).toMatch(/^בראשית/);
});

test('scrolling up from the top inserts the previous section without moving the text', async () => {
  const GENESIS_1 = fixture('genesis-1').initialPanel.text;
  const props = fixture('genesis-1');
  props.initialPanel.ref = 'Genesis 2';
  props.initialPanel.refs = ['Genesis 2'];
  props.initialPanel.text = GENESIS_2;
  window.history.replaceState(null, '', '/Genesis.2');
  window.pageYOffset = 0;
  const getText = stubText({'Genesis 1': GENESIS_1});
  await hydrate(props);
  expect(getText).toHaveBeenCalledWith('Genesis 1', {en: null, he: null}, null, true);
  expect($$('[data-ng="section"]').map(s => s.getAttribute('data-ref'))).toEqual(['Genesis 1', 'Genesis 2']);
  // Genesis 2's top moved from -60 to 31 * 100 - 60: the page scrolls by exactly that much.
  expect(window.scrollBy).toHaveBeenCalledWith(0, 3100);
  expect($('[data-ng="prev-edge"]')).toBeNull();  // Genesis 1 opens the book
});

describe('the reader API for later panels: openRef and setCurrVersions', () => {
  let reader;
  function Grab() { reader = useNgReader(); return null; }
  const panels = {[OVERLAY.CONFIG]: Grab, [OVERLAY.ASSOCIATED]: Grab};

  test('openRef jumps to a segment: new stream, pushState, highlight, scroll', async () => {
    const segmentData = {...GENESIS_2, ref: 'Genesis 2:3', sections: ['2', '3'], toSections: ['2', '3']};
    const getText = stubText({'Genesis 2': GENESIS_2, 'Genesis 2:3': segmentData});
    const push = jest.spyOn(window.history, 'pushState');
    await hydrate(fixture('genesis-1'), {overlayPanels: panels});
    act(() => { $('[data-ng="header-settings"]').click(); });
    await act(async () => { await reader.openRef('Genesis 2:3'); });
    await flush();
    expect(getText).toHaveBeenCalledWith('Genesis 2:3', {en: null, he: null}, null, true);
    expect(push).toHaveBeenCalledWith(expect.objectContaining({ngRef: 'Genesis 2:3'}), '', '/Genesis.2.3?lang=bi');
    expect($$('[data-ng="section"]').map(s => s.getAttribute('data-ref'))[0]).toBe('Genesis 2');
    expect($('[data-highlighted="true"]').getAttribute('data-ref')).toBe('Genesis 2:3');
    expect($('[data-ng="section-title"]').textContent).toBe('Chapter 2');
    expect(window.location.pathname).toBe('/Genesis.2.3');
    expect(window.scrollTo).toHaveBeenLastCalledWith(0, expect.any(Number));
  });

  test('setCurrVersions reloads the section with the new versions and puts them in the URL', async () => {
    const getText = stubText({'Genesis 1': fixture('genesis-1').initialPanel.text, 'Genesis 2': GENESIS_2});
    await hydrate(fixture('genesis-1'), {overlayPanels: panels});
    act(() => { $('[data-ng="header-settings"]').click(); });
    const versions = {en: {languageFamilyName: 'english', versionTitle: 'The Koren Jerusalem Bible'}, he: null};
    await act(async () => { await reader.setCurrVersions(versions); });
    await flush();
    expect(getText).toHaveBeenCalledWith('Genesis 1', {en: versions.en, he: null}, null, true);
    expect(window.location.search).toBe('?ven=english|The_Koren_Jerusalem_Bible&lang=bi');
    expect($('[data-highlighted="true"]')).toBeNull();
  });
});
