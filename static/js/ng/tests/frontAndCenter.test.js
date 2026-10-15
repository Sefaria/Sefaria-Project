/**
 * Associated texts, round three (jsdom, the hydrated reader):
 *   - the panel's first list: no heading, the reader's pins first (even works outside the
 *     corpus's defaults), each unpinnable there;
 *   - Open: an associated text becomes the reader's primary text, front and center, with a
 *     history entry, so Back returns to the text and the spot the reader left;
 *   - pinned comments under the text: three lines per language, and a tap on that comment
 *     expands it (and another collapses it), without toggling the header.
 * The data layer is the real Sefaria singleton with its network methods stubbed by real
 * sefaria.org responses (trimmed fixtures).
 */
import {act} from 'react-dom/test-utils';
import Sefaria from '../../sefaria/sefaria';
import {OVERLAY} from '../context';
import {resetAssociatedCaches} from '../associatedData';
import {PINS_KEY} from '../pins';
import {fixture, neighbourText, v3} from './helpers';
import {flush, hydrate, realErrors, setupBrowser} from './browser';

const GENESIS_LINKS = require('./fixtures/links-genesis-1-1.json');
const GENESIS_2 = neighbourText('genesis-1', {ref: 'Genesis 2', heRef: 'בראשית ב׳', prev: 'Genesis 1', next: null});
const RASHI_1_1 = fixture('rashi-on-genesis-1-1-1').initialPanel.text;
const SA_668 = {...fixture('shulchan-arukh-oc-1-1').initialPanel.text, ref: 'Shulchan Arukh, Orach Chayim 668:2',
  sectionRef: 'Shulchan Arukh, Orach Chayim 668', heSectionRef: 'שולחן ערוך, אורח חיים תרס״ח', sections: ['668', '2'],
  toSections: ['668', '2'], next: null, prev: null};

const MEI = {title: 'Mei HaShiloach', heTitle: 'מי השלוח', category: 'Chasidut'};
const SA = {title: 'Shulchan Arukh, Orach Chayim', heTitle: 'שולחן ערוך, אורח חיים', category: 'Halakhah'};
const RASHI = {title: 'Rashi', heTitle: 'רש"י', category: 'Commentary'};
const RAMBAN = {title: 'Ramban', heTitle: 'רמב"ן', category: 'Commentary'};

const env = setupBrowser();
const $ = (sel) => env.container.querySelector(sel);
const $$ = (sel) => Array.from(env.container.querySelectorAll(sel));
const overlayState = () => $('[data-ng="reader"]').getAttribute('data-overlay');
const here = () => window.location.pathname + window.location.search;
const topKeys = () => $$('[data-ng="top-commentators"] [data-ng="book-row"]').map(r => r.getAttribute('data-key'));
const setPins = (pins) => window.localStorage.setItem(PINS_KEY, JSON.stringify(pins));
const click = (el) => act(() => { el.click(); });

/** Links: Genesis 1:1's (by chunk), nothing elsewhere. */
function stubLinks() {
  return jest.spyOn(Sefaria, 'getLinks').mockImplementation((ref) => Promise.resolve(
    ref === 'Genesis 1:1' || ref === 'Genesis 1:1-8' ? GENESIS_LINKS : []));
}

/** Comment text named after its ref; whole commentary sections (for pins) from `sections`. */
function stubTexts(sections = {}) {
  return jest.spyOn(Sefaria, 'getTextsFromAPIV3').mockImplementation((ref) => {
    if (sections[ref]) { return Promise.resolve(sections[ref]); }
    const range = /^(.*:)(\d+)-(\d+)$/.exec(ref);
    const refs = range ? Array.from({length: range[3] - range[2] + 1}, (_, i) => `${range[1]}${Number(range[2]) + i}`) : [ref];
    const he = refs.map(r => `HE ${r}`);
    const en = refs.map(r => `EN ${r}`);
    return Promise.resolve(v3(ref, range ? he : he[0], range ? en : en[0]));
  });
}

/** The reader's own texts: Genesis (first/next sections), and what Open lands on. */
function stubReaderTexts() {
  const GENESIS_1 = fixture('genesis-1').initialPanel.text;
  return jest.spyOn(Sefaria, 'getTextFromCurrVersions').mockImplementation((ref) => {
    if (ref === 'Genesis 1') { return Promise.resolve(GENESIS_1); }
    if (ref === 'Genesis 2') { return Promise.resolve(GENESIS_2); }
    if (ref.startsWith('Rashi on Genesis 1:1:')) {
      const [from, to] = ref.slice('Rashi on Genesis 1:1:'.length).split('-');
      return Promise.resolve({...RASHI_1_1, ref, sections: ['1', '1', from], toSections: ['1', '1', to || from]});
    }
    if (ref === 'Shulchan Arukh, Orach Chayim 668:2') { return Promise.resolve(SA_668); }
    return Promise.reject(new Error(`unexpected ${ref}`));
  });
}

beforeEach(() => {
  resetAssociatedCaches();
  stubLinks();
  stubReaderTexts();
});

async function openGenesis11(props = fixture('genesis-1')) {
  await hydrate(env.container, props);
  await flush();
  click($('[data-ng="segment-badge"][data-ref="Genesis 1:1"]'));
  await flush();
}

// ------------------------------------------------------------------ the first list

describe('the first list: no heading, pins first', () => {
  beforeEach(() => { stubTexts(); });

  test('without pins: the corpus defaults, and no "Major commentators" heading', async () => {
    await openGenesis11();
    expect(topKeys()).toEqual(['Commentary|Rashi', 'Commentary|Ramban', 'Commentary|Ibn Ezra', 'Commentary|Sforno', 'Targum|Onkelos Genesis']);
    expect($('[data-ng="top-commentators"] h3')).toBeNull();
    expect($('[data-ng="panel-associated"]').textContent).not.toMatch(/Major commentators/i);
    expect($('[data-ng="categories"] h3').textContent).toBe('By category');
    expect($('[data-ng="top-commentators"] [data-ng="unpin"]')).toBeNull();
  });

  test('two pins from outside the defaults (Chasidut, Halakhah) lead the list, which grows to hold them', async () => {
    setPins({Tanakh: [MEI, SA]});
    await openGenesis11();
    expect(topKeys()).toEqual(['Chasidut|Mei HaShiloach', 'Halakhah|Shulchan Arukh, Orach Chayim',
      'Commentary|Rashi', 'Commentary|Ramban', 'Commentary|Ibn Ezra', 'Commentary|Sforno', 'Targum|Onkelos Genesis']);
    // Each pinned row carries its pin, pressed; the defaults don't.
    const unpins = $$('[data-ng="top-commentators"] [data-ng="unpin"]');
    expect(unpins.map(b => b.getAttribute('data-key'))).toEqual(['Chasidut|Mei HaShiloach', 'Halakhah|Shulchan Arukh, Orach Chayim']);
    expect(unpins[0].getAttribute('aria-pressed')).toBe('true');
    expect(unpins[1].getAttribute('aria-label')).toBe('Unpin Shulchan Arukh, Orach Chayim');
    // The pinned rows open their work like any other row.
    click($('[data-ng="book-row"][data-key="Chasidut|Mei HaShiloach"]'));
    await flush();
    expect($('[data-ng="panel-associated"]').getAttribute('data-view')).toBe('book');
    expect($('[data-ng="pin-toggle"]').getAttribute('aria-pressed')).toBe('true');
  });

  test('unpinning from the list: the row leaves the top (a default returns to its place), and it persists', async () => {
    setPins({Tanakh: [SA, {...RAMBAN}]});
    await openGenesis11();
    expect(topKeys().slice(0, 3)).toEqual(['Halakhah|Shulchan Arukh, Orach Chayim', 'Commentary|Ramban', 'Commentary|Rashi']);
    click($('[data-ng="unpin"][data-key="Halakhah|Shulchan Arukh, Orach Chayim"]'));
    expect(topKeys()).toEqual(['Commentary|Ramban', 'Commentary|Rashi', 'Commentary|Ibn Ezra', 'Commentary|Sforno', 'Targum|Onkelos Genesis']);
    click($('[data-ng="unpin"][data-key="Commentary|Ramban"]'));
    expect(topKeys()).toEqual(['Commentary|Rashi', 'Commentary|Ramban', 'Commentary|Ibn Ezra', 'Commentary|Sforno', 'Targum|Onkelos Genesis']);
    expect(JSON.parse(window.localStorage.getItem(PINS_KEY))).toEqual({});
    expect(overlayState()).toBe(OVERLAY.ASSOCIATED);  // unpinning never leaves the panel
  });

  test('pin a work found under its category: next time it is at the top', async () => {
    await openGenesis11();
    click($('[data-ng="category-row"][data-category="Chasidut"]'));
    click($('[data-ng="book-row"][data-key="Chasidut|Mei HaShiloach"]'));
    await flush();
    click($('[data-ng="pin-toggle"]'));
    click($('[data-ng="crumb"][data-index="0"]'));
    await flush();
    expect(topKeys()[0]).toBe('Chasidut|Mei HaShiloach');
  });

  test('a pinned work with nothing on this segment is still at the top, muted, and can be unpinned', async () => {
    setPins({Tanakh: [{title: 'Sfat Emet', heTitle: 'שפת אמת', category: 'Chasidut'}]});
    await openGenesis11();
    const row = $('[data-ng="top-commentators"] [data-ng="book-row"]');
    expect(row.getAttribute('data-key')).toBe('Chasidut|Sfat Emet');
    expect(row.getAttribute('data-absent')).toBe('true');
    expect(row.textContent).toContain('Nothing on this passage');
    click($('[data-ng="unpin"][data-key="Chasidut|Sfat Emet"]'));
    expect(topKeys()[0]).toBe('Commentary|Rashi');
  });
});

// ------------------------------------------------------------------ Open, front and center

describe('Open: an associated text front and center', () => {
  beforeEach(() => { stubTexts(); });
  const KOREN = {languageFamilyName: 'english', versionTitle: 'The Koren Jerusalem Bible'};

  function withVersions() {
    const props = fixture('genesis-1');
    props.initialPanel.currVersions = {en: KOREN, he: null};
    window.history.replaceState(null, '', '/Genesis.1?ven=english|The_Koren_Jerusalem_Bible&lang=bi');
    return props;
  }

  test('from a commentator: its comments on the segment become the primary text; Back returns to the spot', async () => {
    Object.defineProperty(window, 'pageYOffset', {value: 1234, configurable: true});
    const push = jest.spyOn(window.history, 'pushState');
    await openGenesis11(withVersions());
    click($('[data-ng="top-commentators"] [data-ng="book-row"][data-key="Commentary|Rashi"]'));
    await flush();
    const open = $('[data-ng="book-open"]');
    expect(open.textContent).toBe('Open');
    expect(open.getAttribute('aria-label')).toBe('Open Rashi on Genesis 1:1:1-3 front and center');
    const entriesBefore = window.history.length;
    click(open);
    await flush(16);
    expect(realErrors(env.errors)).toEqual([]);
    expect(overlayState()).toBe(OVERLAY.NONE);
    // Another book: its default versions, not the reader's Genesis translation.
    expect(Sefaria.getTextFromCurrVersions).toHaveBeenCalledWith('Rashi on Genesis 1:1:1-3', {en: null, he: null}, null, true);
    expect(Sefaria.getTextFromCurrVersions).not.toHaveBeenCalledWith('Rashi on Genesis 1:1:1-3', expect.objectContaining({en: KOREN}), null, true);
    expect(here()).toBe('/Rashi_on_Genesis.1.1.1-3?lang=bi');
    expect($$('[data-ng="section"]')[0].getAttribute('data-ref')).toBe('Rashi on Genesis 1:1');
    expect($$('[data-highlighted="true"]').map(s => s.getAttribute('data-ref')))
      .toEqual(['Rashi on Genesis 1:1:1', 'Rashi on Genesis 1:1:2', 'Rashi on Genesis 1:1:3']);
    expect($('[data-ng="header"] .ng-header-book').textContent).toBe('Rashi on Genesis');
    expect($('[data-ng="header-toc"]').getAttribute('href')).toBe('/Rashi_on_Genesis');
    expect(document.title).toBe('Rashi on Genesis 1:1:1-3 | Sefaria Library');
    // One new history entry, pushed after stepping back over the panel's two (home, Rashi).
    expect(push).toHaveBeenLastCalledWith(expect.objectContaining({ngRef: 'Rashi on Genesis 1:1:1-3'}), '', '/Rashi_on_Genesis.1.1.1-3?lang=bi');
    expect(window.history.length).toBe(entriesBefore - 1);
    // The first comment opens the book: the page goes to the top, book title and all.
    expect(window.scrollTo).toHaveBeenLastCalledWith(0, 0);

    // Back: Genesis 1 again, in the reader's versions, at the segment (and height) they left.
    window.scrollTo.mockClear();
    window.history.back();
    await flush(16);
    expect(here()).toBe('/Genesis.1?ven=english|The_Koren_Jerusalem_Bible&lang=bi');
    expect(Sefaria.getTextFromCurrVersions).toHaveBeenLastCalledWith('Genesis 1', {en: KOREN, he: null}, null, true);
    expect($$('[data-ng="section"]')[0].getAttribute('data-ref')).toBe('Genesis 1');
    // The fake layout puts Genesis 1:4 (the segment nearest the center) at 300px: it goes back there.
    expect(window.history.state.ngFocus).toEqual({ref: 'Genesis 1:4', top: 300});
    expect(window.scrollTo).toHaveBeenLastCalledWith(0, 1234);
    expect($('[data-highlighted="true"]')).toBeNull();
    delete window.pageYOffset;
  });

  test('from one comment: that comment, highlighted; its button names it', async () => {
    await openGenesis11();
    click($('[data-ng="book-row"][data-key="Commentary|Rashi"]'));
    await flush();
    const buttons = $$('[data-ng="comment-open"]');
    expect(buttons.map(b => b.getAttribute('data-open-ref'))).toEqual(
      ['Rashi on Genesis 1:1:1', 'Rashi on Genesis 1:1:2', 'Rashi on Genesis 1:1:3']);
    expect(buttons[1].textContent).toBe('Rashi on Genesis 1:1:2');
    click(buttons[1]);
    await flush(16);
    expect(here()).toBe('/Rashi_on_Genesis.1.1.2?lang=bi');
    expect($$('[data-highlighted="true"]').map(s => s.getAttribute('data-ref'))).toEqual(['Rashi on Genesis 1:1:2']);
    expect($('[data-ng="header"] .ng-header-address').textContent).toMatch(/^1:1:\d$/);
  });

  test('from another corpus: a Halakhah work opens as its own text, then Back', async () => {
    const saLinks = GENESIS_LINKS.filter(l => l.collectiveTitle.en === SA.title);
    expect(saLinks.length).toBeGreaterThan(0);
    await openGenesis11();
    click($('[data-ng="category-row"][data-category="Halakhah"]'));
    click($('[data-ng="book-row"][data-key="Halakhah|Shulchan Arukh, Orach Chayim"]'));
    await flush();
    const first = $('[data-ng="comment-open"]');
    expect(first.getAttribute('data-open-ref')).toBe('Shulchan Arukh, Orach Chayim 668:2');
    click(first);
    await flush(16);
    expect(here()).toBe('/Shulchan_Arukh,_Orach_Chayim.668.2?lang=bi');
    expect($('[data-ng="section"]').getAttribute('data-ref')).toBe('Shulchan Arukh, Orach Chayim 668');
    expect($('[data-ng="section"]').getAttribute('data-category')).toBe('Halakhah');
    expect($('[data-highlighted="true"]').getAttribute('data-ref')).toBe('Shulchan Arukh, Orach Chayim 668:2');
    window.history.back();
    await flush(16);
    expect(here()).toBe('/Genesis.1?lang=bi');
    expect($('[data-ng="section"]').getAttribute('data-ref')).toBe('Genesis 1');
  });

  test('the tangent\'s Open (a text cited inside a comment) is the same action', async () => {
    const cite = (r) => `HE ${r} <a class="refLink" data-ref="Rashi on Genesis 1:1:3" href="Rashi_on_Genesis.1.1.3">רש"י</a>`;
    Sefaria.getTextsFromAPIV3.mockImplementation((ref) => {
      const range = /^(.*:)(\d+)-(\d+)$/.exec(ref);
      const refs = range ? Array.from({length: range[3] - range[2] + 1}, (_, i) => `${range[1]}${Number(range[2]) + i}`) : [ref];
      return Promise.resolve(v3(ref, range ? refs.map(cite) : cite(ref), range ? refs.map(r => `EN ${r}`) : `EN ${ref}`));
    });
    await openGenesis11();
    click($('[data-ng="book-row"][data-key="Commentary|Ramban"]'));
    await flush();
    click($('[data-ng="comment"] a.refLink'));
    await flush();
    expect($('[data-ng="panel-associated"]').getAttribute('data-view')).toBe('ref');
    const open = $('[data-ng="open-in-reader"]');
    expect(open.textContent).toBe('Open');
    click(open);
    await flush(16);
    expect(here()).toBe('/Rashi_on_Genesis.1.1.3?lang=bi');
    expect(overlayState()).toBe(OVERLAY.NONE);
  });
});

// ------------------------------------------------------------------ pinned comments under the text

describe('pinned comments under the text: three lines per language, a tap expands', () => {
  let restore;
  // jsdom has no layout. A run of text "overflows" its three lines while its pin is collapsed,
  // unless it says SHORT; expanded, nothing is clipped.
  beforeEach(() => {
    const sh = Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'scrollHeight');
    const ch = Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'clientHeight');
    const run = (el) => el.getAttribute && el.getAttribute('data-ng') === 'pin-run';
    const collapsed = (el) => el.closest('[data-ng="pin"]').getAttribute('data-expanded') === 'false';
    Object.defineProperty(HTMLElement.prototype, 'scrollHeight', {configurable: true, get() {
      if (!run(this)) { return 0; }
      return collapsed(this) && !/SHORT/.test(this.textContent) ? 240 : 80;
    }});
    Object.defineProperty(HTMLElement.prototype, 'clientHeight', {configurable: true, get() { return run(this) ? 80 : 0; }});
    restore = () => {
      if (sh) { Object.defineProperty(HTMLElement.prototype, 'scrollHeight', sh); } else { delete HTMLElement.prototype.scrollHeight; }
      if (ch) { Object.defineProperty(HTMLElement.prototype, 'clientHeight', ch); } else { delete HTMLElement.prototype.clientHeight; }
    };
    setPins({Tanakh: [RASHI, RAMBAN]});
    stubTexts({
      'Rashi on Genesis 1': v3('Rashi on Genesis 1', [['<b>בראשית.</b> רש"י א', 'רש"י ב', 'רש"י ג']], [['IN THE BEGINNING — long', 'second', 'third']]),
      'Ramban on Genesis 1': v3('Ramban on Genesis 1', [['SHORT א', 'SHORT ב', 'SHORT ג', 'SHORT ד']], [['SHORT a', 'SHORT b', 'SHORT c', 'SHORT d']]),
    });
  });
  afterEach(() => restore());

  const pin = (title) => $(`[data-ng="segment"][data-ref="Genesis 1:1"] [data-ng="pin"][data-pin-key="Commentary|${title}"]`);
  async function readGenesis(props = fixture('genesis-1')) {
    await hydrate(env.container, props);
    await flush(16);
  }

  test('each language is its own clamped run; a clipped comment shows the expand affordance, a short one doesn\'t', async () => {
    await readGenesis();
    const rashi = pin('Rashi');
    const runs = Array.from(rashi.querySelectorAll('[data-ng="pin-run"]'));
    expect(runs.map(r => [r.getAttribute('lang'), r.getAttribute('dir')])).toEqual([['he', 'rtl'], ['en', 'ltr']]);
    // All three of Rashi's comments on the verse, in one run per language.
    expect(runs[0].querySelectorAll('.ng-pin-part')).toHaveLength(3);
    expect(runs[1].textContent).toBe('IN THE BEGINNING — long second third');
    expect(rashi.getAttribute('data-expanded')).toBe('false');
    expect(rashi.getAttribute('data-clipped')).toBe('true');
    expect(rashi.querySelector('[data-ng="pin-expand"]').getAttribute('aria-expanded')).toBe('false');
    const ramban = pin('Ramban');
    expect(ramban.getAttribute('data-clipped')).toBe('false');
    expect(ramban.querySelector('[data-ng="pin-expand"]')).toBeNull();
    // Open is always there: the comments on this verse, front and center.
    expect(rashi.querySelector('[data-ng="pin-open"]').getAttribute('data-open-ref')).toBe('Rashi on Genesis 1:1:1-3');
  });

  test('a tap on the comment expands it, another collapses it; the state is that comment\'s alone; the header stays put', async () => {
    await readGenesis();
    const header = () => $('[data-ng="header"]').getAttribute('data-visible');
    expect(header()).toBe('true');
    click(pin('Rashi').querySelector('[data-ng="pin-body"] .ng-pin-part'));
    expect(pin('Rashi').getAttribute('data-expanded')).toBe('true');
    expect(pin('Rashi').querySelector('[data-ng="pin-expand"]').getAttribute('aria-expanded')).toBe('true');
    expect(pin('Ramban').getAttribute('data-expanded')).toBe('false');
    expect(header()).toBe('true');                  // not the text's tap-to-toggle-the-header
    expect(overlayState()).toBe(OVERLAY.NONE);      // and not the panel
    click(pin('Rashi').querySelector('[data-ng="pin-body"]'));
    expect(pin('Rashi').getAttribute('data-expanded')).toBe('false');
    expect(pin('Rashi').getAttribute('data-clipped')).toBe('true');
    // The chevron does the same, for keyboards and screen readers.
    click(pin('Rashi').querySelector('[data-ng="pin-expand"]'));
    expect(pin('Rashi').getAttribute('data-expanded')).toBe('true');
    // A comment that isn't clipped has nothing to expand: a tap does nothing at all.
    click(pin('Ramban').querySelector('[data-ng="pin-body"]'));
    expect(pin('Ramban').getAttribute('data-expanded')).toBe('false');
    expect(header()).toBe('true');
    // The text itself still toggles the header.
    click($('[data-ng="segment"][data-ref="Genesis 1:2"] .ng-en'));
    expect(header()).toBe('false');
  });

  test('a tap that ends a text selection selects; it doesn\'t expand', async () => {
    await readGenesis();
    const had = window.getSelection;
    window.getSelection = () => ({isCollapsed: false, toString: () => 'רש"י'});
    click(pin('Rashi').querySelector('[data-ng="pin-body"]'));
    window.getSelection = had;
    expect(pin('Rashi').getAttribute('data-expanded')).toBe('false');
  });

  test('the name opens the work in the panel; Open makes the comments the primary text', async () => {
    await readGenesis();
    click(pin('Rashi').querySelector('[data-ng="pin-name"]'));
    await flush();
    expect(overlayState()).toBe(OVERLAY.ASSOCIATED);
    expect($('[data-ng="panel-associated"]').getAttribute('data-view')).toBe('book');
    expect($('[data-ng="panel-title"]').textContent).toBe('Rashi');
    act(() => { document.dispatchEvent(new KeyboardEvent('keydown', {key: 'Escape'})); });
    await flush(12);
    expect(overlayState()).toBe(OVERLAY.NONE);
    click(pin('Rashi').querySelector('[data-ng="pin-open"]'));
    await flush(16);
    expect(here()).toBe('/Rashi_on_Genesis.1.1.1-3?lang=bi');
    expect($('[data-ng="section"]').getAttribute('data-ref')).toBe('Rashi on Genesis 1:1');
    expect(realErrors(env.errors)).toEqual([]);
  });

  test('side by side: the pinned comment\'s languages sit side by side too', async () => {
    const props = fixture('genesis-1');
    props.initialSettings.biLayout = 'heRight';
    await readGenesis(props);
    const body = pin('Rashi').querySelector('[data-ng="pin-body"]');
    expect(body.getAttribute('data-sbs')).toBe('true');
    expect(body.getAttribute('dir')).toBe('ltr');
    expect(pin('Rashi').getAttribute('data-clipped')).toBe('true');
    click(body);
    expect(pin('Rashi').getAttribute('data-expanded')).toBe('true');
  });

  test('source only: one Hebrew run, clamped; a Hebrew interface labels the actions in Hebrew', async () => {
    await readGenesis(fixture('genesis-1', {language: 'hebrew', interfaceLang: 'hebrew'}));
    const runs = Array.from(pin('Rashi').querySelectorAll('[data-ng="pin-run"]'));
    expect(runs.map(r => r.getAttribute('lang'))).toEqual(['he']);
    expect(pin('Rashi').querySelector('[data-ng="pin-expand"]').getAttribute('aria-label')).toBe('הצגת הפירוש המלא');
    expect(pin('Rashi').querySelector('[data-ng="pin-name"]').textContent).toBe('רש"י');
  });
});
