import React from 'react';
import ReactDOM from 'react-dom';
import { act } from 'react-dom/test-utils';
import Sefaria from '../../../sefaria/sefaria';
import '../../strings';
import '../../routes';
import App from '../../App';
import { setLang } from '../../i18n';
import { setPersona } from '../../persona';
import { _resetStore } from '../../store';
import { _resetOverlays } from '../../overlays';
import { navigate } from '../../router';
import { history, streak, shelf, todayISO } from '../collections';
import { NIKKUD_RE } from '../textData';
import genesis from './fixtures/genesis1.json';
import berakhot from './fixtures/berakhot2a.json';
import rashi from './fixtures/rashi.json';
import links from './fixtures/links.json';
import indexGenesis from './fixtures/indexGenesis.json';

const TEXTS = {
  'Genesis 1': genesis,
  'Genesis 1:2-4': { ...genesis, ref: 'Genesis 1:2-4', sections: [1, 2], toSections: [1, 4] },
  'Genesis 2': { ...genesis, ref: 'Genesis 2', sectionRef: 'Genesis 2', heRef: 'בראשית ב׳', heSectionRef: 'בראשית ב׳', prev: 'Genesis 1', next: 'Genesis 3', sections: [2], toSections: [2] },
  'Berakhot 2a': berakhot,
  'Rashi on Genesis 1:1:1': rashi,
};
const flush = () => new Promise(r => setTimeout(r, 0));
let container;

beforeAll(() => {
  window.scrollTo = jest.fn();
  window.scrollBy = jest.fn();
  Sefaria.virtualBooks = Sefaria.virtualBooks || [];
});
beforeEach(() => {
  _resetStore(); _resetOverlays(); localStorage.clear();
  jest.spyOn(Sefaria, 'getText').mockImplementation((ref) => {
    if (TEXTS[ref]) { return Promise.resolve(TEXTS[ref]); }
    if (/^Nope|^Genesis 3$/.test(ref)) { return Promise.reject(new Error('missing')); }
    return Promise.resolve({ ref, he: `<b>${ref}</b> עברית`, text: `${ref} english` });
  });
  jest.spyOn(Sefaria, 'getLinks').mockImplementation(() => Promise.resolve(links));
  jest.spyOn(Sefaria, 'getIndexDetails').mockImplementation(() => Promise.resolve(indexGenesis));
  jest.spyOn(Sefaria, 'getIndexDetailsFromCache').mockImplementation(() => null);
  container = document.createElement('div');
  document.body.appendChild(container);
});
afterEach(() => {
  ReactDOM.unmountComponentAtNode(container);
  container.remove();
  jest.restoreAllMocks();
  setLang('en');
});

async function open(path, { lang = 'english', persona = 'newcomer' } = {}) {
  setLang(lang);
  setPersona(persona);
  window.history.replaceState({}, '', path);
  window.dispatchEvent(new PopStateEvent('popstate'));   // the router caches the current match
  await act(async () => { ReactDOM.render(<App props={{ interfaceLang: lang }} />, container); await flush(); });
}
const $ = sel => container.querySelector(sel);
const $$ = sel => Array.from(container.querySelectorAll(sel));
const text = sel => ($(sel) ? $(sel).textContent.trim() : null);
const click = async (el, init = {}) => act(async () => {
  if (!el) { throw new Error('click: element not found'); }
  el.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, button: 0, ...init })); await flush(); });
const key = async (k, init = {}) => act(async () => { document.dispatchEvent(new KeyboardEvent('keydown', { key: k, bubbles: true, cancelable: true, ...init })); await flush(); });
const byText = (sel, re) => $$(sel).find(el => re.test(el.textContent));

test('newcomer, English: English-only text, numbers, explainer card, history and streak', async () => {
  await open('/Genesis.1');
  expect(text('main h1')).toBe('Genesis 1');
  expect(document.title).toBe('Genesis 1 | Sefaria Library');
  expect($$('.ln-seg')).toHaveLength(5);
  expect($$('.ln-seg-num').map(n => n.textContent)).toEqual(['1', '2', '3', '4', '5']);
  expect($('.ln-seg-he')).toBeNull();
  expect($('.ln-seg-en').textContent).toContain('When God began to create');
  expect(text('.ln-reader-sub')).toContain('Chapter 1');
  expect(text('.ln-reader-sub')).toContain('Tanakh › Torah');
  expect($('.ln-reader-booklink').getAttribute('href')).toBe('/Genesis');
  expect($('#ln-versions').hidden).toBe(true);
  expect(text('.ln-explainer-title')).toBe('What am I reading?');
  expect(text('.ln-explainer-orient')).toBe('You are reading Genesis, Chapter 1 of 50.');
  expect(text('.ln-explainer-desc')).toContain('Creation');
  expect(text('.ln-explainer-meta')).toContain('Composed c.1400  – c.400 BCE in Sinai/Canaan');
  expect(history().get('h:Genesis 1')).toMatchObject({ ref: 'Genesis 1', heRef: 'בראשית א׳', title: 'Genesis', heTitle: 'בראשית', persona: 'newcomer' });
  expect(streak().get(todayISO())).toBeTruthy();
  expect($('.ln-toolbelt')).toBeNull();
  await click(byText('.ln-explainer-hide', /Hide/));
  expect($('.ln-explainer')).toBeNull();
});

test('scholar, Hebrew interface: RTL, Hebrew numerals, Hebrew text, versions expanded', async () => {
  await open('/Genesis.1', { lang: 'hebrew', persona: 'scholar' });
  expect($('.ln-shell').getAttribute('dir')).toBe('rtl');
  expect(text('main h1')).toBe('בראשית א׳');
  expect(document.title).toBe('בראשית א׳ | ספריית ספריא');
  expect($$('.ln-seg-num').map(n => n.textContent)).toEqual(['א׳', 'ב׳', 'ג׳', 'ד׳', 'ה׳']);
  expect($('.ln-seg-en')).toBeNull();
  expect($('.ln-seg-he').getAttribute('lang')).toBe('he');
  expect($('.ln-explainer')).toBeNull();
  expect($('#ln-versions').hidden).toBe(false);
  expect($('#ln-version-he').value).toBe('Miqra according to the Masorah');
  expect($$('#ln-version-en option').length).toBeGreaterThan(1);
  expect(text('.ln-reader-sub')).toContain('פרק א׳');
});

test('learner, bilingual: layouts, continuous flow, vowels and text size', async () => {
  await open('/Genesis.1', { persona: 'learner' });
  expect($('.ln-seg-he')).not.toBeNull();
  expect($('.ln-seg-en')).not.toBeNull();
  expect($('.ln-seg-body.is-bi.is-stacked')).not.toBeNull();
  await click(byText('.ln-segment', /^Side by side$/));
  expect($('.ln-seg-body.is-bi.is-side')).not.toBeNull();
  await click(byText('.ln-segment', /^Continuous$/));
  expect($('.ln-stream.is-continuous')).not.toBeNull();
  expect($$('.ln-seg-inline')).toHaveLength(10);
  expect($('.ln-flow.ln-text-he').textContent).toMatch(NIKKUD_RE);
  await click(byText('.ln-segment', /^Vowels$/));
  expect($('.ln-flow.ln-text-he').textContent).not.toMatch(NIKKUD_RE);
  expect($('.ln-reader').dataset.fontScale).toBe('1');
  await click($('[aria-label="Larger text"]'));
  expect($('.ln-reader').dataset.fontScale).toBe('1.15');
  await click(byText('.ln-segment', /^Segmented$/));
  await click($$('.ln-seg-inline, .ln-seg')[1]);
  expect($('.ln-toolbelt')).not.toBeNull();
});

test('selection → toolbelt → shelf, cite and connections tools; Esc closes', async () => {
  const writeText = jest.fn(() => Promise.resolve());
  Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true });
  await open('/Genesis.1');
  const segs = $$('.ln-seg');
  await click(segs[1]);
  expect(text('.ln-toolbelt-ref')).toContain('Genesis 1:2');
  expect($$('.ln-tool').map(b => b.dataset.tool)).toEqual(['connections', 'shelf', 'cite']);
  await click(segs[3], { shiftKey: true });
  expect($$('.ln-seg.is-selected')).toHaveLength(3);
  expect(text('.ln-toolbelt-ref')).toContain('Genesis 1:2-4');

  // Save to shelf
  await click($('[data-tool="shelf"]'));
  const panel = $('.ln-reader-panel[data-tool="shelf"]');
  expect(panel).not.toBeNull();
  expect(panel.getAttribute('role')).toBe('dialog');
  expect(document.activeElement).toBe(panel.querySelector('.ln-panel-close'));
  const input = panel.querySelector('input[name="tags"]');
  await act(async () => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(input, 'creation, light');
    input.dispatchEvent(new Event('input', { bubbles: true }));
  });
  await act(async () => { panel.querySelector('form').dispatchEvent(new Event('submit', { bubbles: true, cancelable: true })); await flush(); });
  expect(shelf().get('s:Genesis 1:2-4')).toMatchObject({ ref: 'Genesis 1:2-4', heRef: 'בראשית א׳:ב׳-ד׳', title: 'Genesis', tags: ['creation', 'light'], persona: 'newcomer', type: 'ref' });
  expect(text('.ln-toast')).toBe('Saved to your shelf');
  expect($('.ln-reader-panel')).toBeNull();
  await click($('[data-tool="shelf"]'));
  expect(text('.ln-reader-panel p')).toBe('Already on your shelf');

  // Copy / cite (newcomer: English text, simple style)
  await click($('[data-tool="cite"]'));
  expect(text('.ln-cite-preview')).toBe('Genesis 1:2-4. THE JPS TANAKH: Gender-Sensitive Edition. Sefaria. https://www.sefaria.org/Genesis.1.2-4.');
  expect(text('.ln-cite-text')).toContain('God said');
  await click(byText('.ln-reader-panel .ln-btn', /^Copy citation$/));
  expect(writeText).toHaveBeenCalledWith('Genesis 1:2-4. THE JPS TANAKH: Gender-Sensitive Edition. Sefaria. https://www.sefaria.org/Genesis.1.2-4.');
  await click(byText('.ln-segment', /^Chicago$/));
  expect(text('.ln-cite-preview')).toMatch(/^Genesis 1:2-4, THE JPS TANAKH: Gender-Sensitive Edition, Sefaria, accessed /);

  // Connections: counts, categories, cited-by disclosure, drill down, text, open in reader
  expect(Sefaria.getLinks).not.toHaveBeenCalled();
  await click($('[data-tool="connections"]'));
  expect(Sefaria.getLinks).toHaveBeenCalledWith('Genesis 1:2-4');
  expect(text('.ln-conn-total')).toBe(`${links.length} connections`);
  expect(text('.ln-conn-cat-title')).toMatch(/^Commentary/);
  expect($$('.ln-conn-cat .ln-conn-book-title').slice(0, 2).map(e => e.textContent)).toEqual(['Ibn Ezra', 'Ramban']);
  expect($('.ln-conn-citedby').textContent).toBe('Show 2 later works that cite this passage');
  await click($('.ln-conn-citedby'));
  expect(text('.ln-conn-cited .ln-conn-cat-title')).toMatch(/^Cited by/);
  await click($$('.ln-conn-cat')[0].querySelector('.ln-conn-more'));   // Commentary shows 6 works until expanded
  await click(byText('.ln-conn-book', /Penei David/));
  expect(text('.ln-conn-book-view .ln-conn-ref')).toContain('Penei David');
  expect(text('.ln-conn-book-view .ln-conn-ref')).toContain('Hebrew only');
  expect($$('.ln-conn-link')).toHaveLength(2);
  await click($$('.ln-conn-link')[0]);
  expect(Sefaria.getText).toHaveBeenCalledWith(expect.stringMatching(/^Penei David/), { context: 0 });
  expect($('.ln-conn-body .ln-text-he').textContent).toContain('Penei David');
  expect($('.ln-conn-body .ln-text-en')).toBeNull();   // Hebrew only
  await click(byText('.ln-conn-text .ln-btn', /Back/));
  expect($('.ln-conn-book-view')).not.toBeNull();

  await key('Escape');
  expect($('.ln-reader-panel')).toBeNull();
  expect($$('.ln-seg.is-selected')).toHaveLength(3);
  await key('Escape');
  expect($$('.ln-seg.is-selected')).toHaveLength(0);
  expect($('.ln-toolbelt')).toBeNull();
});

test('keyboard: j/k and arrows move the selection, shift extends', async () => {
  await open('/Genesis.1', { persona: 'educator' });
  await key('j');
  expect($$('.ln-seg.is-selected').map(e => e.dataset.ref)).toEqual(['Genesis 1:1']);
  await key('j');
  expect($$('.ln-seg.is-selected').map(e => e.dataset.ref)).toEqual(['Genesis 1:2']);
  await key('ArrowDown', { shiftKey: true });
  expect($$('.ln-seg.is-selected').map(e => e.dataset.ref)).toEqual(['Genesis 1:2', 'Genesis 1:3']);
  await key('k');
  expect($$('.ln-seg.is-selected').map(e => e.dataset.ref)).toEqual(['Genesis 1:2']);
  expect(text('.ln-toolbelt-ref')).toContain('Genesis 1:2');
  await click($$('.ln-seg')[1]);   // clicking the only selected segment clears it
  expect($$('.ln-seg.is-selected')).toHaveLength(0);
});

test('?with= opens Connections on the highlighted range; ?lang= overrides the content language', async () => {
  await open('/Genesis.1.2-4?with=Ramban&lang=he', { persona: 'learner' });
  expect($$('.ln-seg.is-highlight').map(e => e.dataset.ref)).toEqual(['Genesis 1:2', 'Genesis 1:3', 'Genesis 1:4']);
  expect($('.ln-seg-en')).toBeNull();   // lang=he for this view, learner default is bi
  expect($('.ln-reader-panel[data-tool="connections"]')).not.toBeNull();
  expect(text('.ln-conn-book-view .ln-conn-ref')).toContain('Ramban');
  expect(text('.ln-panel-ref')).toBe('Genesis 1:2-4');
});

test('previous section prepends; a failing next load leaves the page intact', async () => {
  await open('/Genesis.2', { persona: 'learner' });
  expect(text('main h1')).toBe('Genesis 2');
  await click(byText('.ln-reader-more', /^Previous: Genesis 1$/));
  expect($$('.ln-section-head').map(e => e.textContent)).toEqual(['Genesis 1', 'Genesis 2']);
  expect($$('.ln-seg')).toHaveLength(10);
  expect(history().get('h:Genesis 1')).toBeTruthy();
  expect(text('.ln-reader-edge')).toBe('Beginning of the text');
  await click(byText('.ln-reader-more', /^Continue: Genesis 3$/));
  expect($$('.ln-section-head')).toHaveLength(2);
  expect($('[role="alert"]')).toBeNull();
});

test('error state with retry and the classic escape hatch', async () => {
  await open('/Nope.1');
  expect(text('main h1')).toBe('Nope 1');
  expect(text('[role="alert"] p')).toBe('This text could not be loaded.');
  expect($('[role="alert"] a').getAttribute('href')).toBe('/Nope.1?library=classic');
});

test('Talmud and commentary refs: section headers, highlight, Hebrew labels', async () => {
  await open('/Berakhot.2a', { persona: 'scholar' });
  expect(text('main h1')).toBe('Berakhot 2a');
  expect(text('.ln-reader-sub')).toContain('Daf 2a');
  expect($$('.ln-seg')).toHaveLength(3);
  await act(async () => { navigate('/Rashi_on_Genesis.1.1.1'); await flush(); });
  expect(text('main h1')).toBe('Rashi on Genesis 1:1');
  expect($$('.ln-seg.is-highlight').map(e => e.dataset.ref)).toEqual(['Rashi on Genesis 1:1:1']);
  expect(history().list().map(h => h.ref).sort()).toEqual(['Berakhot 2a', 'Rashi on Genesis 1:1']);
});
