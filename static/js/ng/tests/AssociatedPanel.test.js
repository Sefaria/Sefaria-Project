/**
 * The associated-texts overlay in the hydrated reader (jsdom): count badges, the panel's
 * screens and order, the tangent stack and browser history, the in-panel language, pins
 * inline under the text, `with=` deep links, and the swipes that open and close the panels.
 * The data layer is the real Sefaria singleton; its network methods are stubbed with real
 * sefaria.org responses (trimmed fixtures).
 */
import Sefaria from '../../sefaria/sefaria';
import {OVERLAY} from '../context';
import {resetAssociatedCaches} from '../associatedData';
import {PINS_KEY} from '../pins';
import {fixture, neighbourText, v3} from './helpers';
import {fingerDrag, flush, hydrate, pointer, realErrors, setupBrowser, touch, wait} from './browser';

const GENESIS_LINKS = require('./fixtures/links-genesis-1-1.json');
const BERAKHOT_LINKS = require('./fixtures/links-berakhot-2a-1.json');
const GENESIS_2 = neighbourText('genesis-1', {ref: 'Genesis 2', heRef: 'בראשית ב׳', prev: 'Genesis 1', next: null});

const env = setupBrowser();
const $ = (sel) => env.container.querySelector(sel);
const $$ = (sel) => Array.from(env.container.querySelectorAll(sel));
const overlayState = () => $('[data-ng="reader"]').getAttribute('data-overlay');
const here = () => window.location.pathname + window.location.search;

/** Links: the fixture for the segment or its chunk, nothing elsewhere. */
function stubLinks(bySegment = {'Genesis 1:1': GENESIS_LINKS}) {
  return jest.spyOn(Sefaria, 'getLinks').mockImplementation((ref) => {
    const hit = Object.keys(bySegment).find(seg => ref === seg || (ref.startsWith(seg.replace(/\d+$/, '')) && inRange(ref, seg)));
    return Promise.resolve(hit ? bySegment[hit] : []);
  });
}
function inRange(chunkRef, segRef) {
  const m = /(\d+)-(\d+)$/.exec(chunkRef);
  const n = Number(/(\d+)$/.exec(segRef)[1]);
  return !!m && n >= Number(m[1]) && n <= Number(m[2]);
}

/** Text: comments named after their refs, English only where `english(ref)` says so. */
function stubTexts({english = () => true, sections = {}} = {}) {
  return jest.spyOn(Sefaria, 'getTextsFromAPIV3').mockImplementation((ref) => {
    if (sections[ref]) { return Promise.resolve(sections[ref]); }
    const range = /^(.*:)(\d+)-(\d+)$/.exec(ref);
    const refs = range ? Array.from({length: range[3] - range[2] + 1}, (_, i) => `${range[1]}${Number(range[2]) + i}`) : [ref];
    const he = refs.map(r => `<b>HE</b> ${r} <a class="refLink" data-ref="Psalms 111:6" href="Psalms.111.6">Psalms 111:6</a>`);
    const en = refs.map(r => (english(r) ? `EN ${r}` : ''));
    return Promise.resolve(v3(ref, range ? he : he[0], range ? en : en[0]));
  });
}

beforeEach(() => {
  resetAssociatedCaches();
  jest.spyOn(Sefaria, 'getTextFromCurrVersions').mockImplementation((ref) => (ref === 'Genesis 2'
    ? Promise.resolve(GENESIS_2) : Promise.reject(new Error(`unexpected ${ref}`))));
});

async function openGenesis11(props = fixture('genesis-1'), extra = {}) {
  await hydrate(env.container, props, extra);
  await flush();
  act(() => { $('[data-ng="segment-badge"][data-ref="Genesis 1:1"]').click(); });
  await flush();
}
const {act} = require('react-dom/test-utils');

describe('count badges (I2)', () => {
  test('load for segments on screen, by chunk, with no text; quiet and compact', async () => {
    const getLinks = stubLinks();
    stubTexts();
    await hydrate(env.container, fixture('genesis-1'));
    await flush();
    expect(getLinks.mock.calls.map(c => c[0]).slice(0, 4)).toEqual(['Genesis 1:1-8', 'Genesis 1:9-16', 'Genesis 1:17-24', 'Genesis 1:25-31']);
    const badges = $$('[data-ng="segment-badge"]');
    // Links on a range (a few of Genesis 1:1's cover 1:1-3) count for every segment they cover.
    expect(badges.map(b => b.getAttribute('data-ref'))).toEqual(['Genesis 1:1', 'Genesis 1:2', 'Genesis 1:3']);
    expect(Number(badges[1].textContent)).toBe(GENESIS_LINKS.filter(l => l.type !== 'essay' && l.anchorRefExpanded.includes('Genesis 1:2')).length);
    expect(badges[0].textContent).toBe(String(GENESIS_LINKS.filter(l => l.type !== 'essay').length));
    expect(badges[0].getAttribute('aria-label')).toMatch(/^\d+ associated texts$/);
    expect(realErrors(env.errors)).toEqual([]);
  });

  test('without IntersectionObserver nothing loads (and nothing breaks)', async () => {
    window.IntersectionObserver = undefined;
    const getLinks = stubLinks();
    await hydrate(env.container, fixture('genesis-1'));
    expect(getLinks).not.toHaveBeenCalled();
    expect($('[data-ng="segment-badge"]')).toBeNull();
  });

  test('tapping a badge opens the panel on that segment, marks it, and pushes a history entry', async () => {
    stubLinks();
    stubTexts();
    const push = jest.spyOn(window.history, 'pushState');
    await openGenesis11();
    expect(overlayState()).toBe(OVERLAY.ASSOCIATED);
    expect($('[data-ng="panel-associated"]').getAttribute('data-ref')).toBe('Genesis 1:1');
    expect($('[data-ng="segment"][data-anchor="true"]').getAttribute('data-ref')).toBe('Genesis 1:1');
    expect(push).toHaveBeenCalledTimes(1);
    expect(here()).toBe('/Genesis.1.1?with=all&lang=bi');
    expect($('[data-ng="sheet"]').getAttribute('data-side')).toBe('right');
  });
});

describe('the first screen: major commentators, categories, Cited by', () => {
  beforeEach(() => { stubLinks(); });

  test('top five first, then the category groups; Cited by is collapsed until asked for', async () => {
    stubTexts();
    await openGenesis11();
    await flush();
    const top = $$('[data-ng="top-commentators"] [data-ng="book-row"] .ng-row-title').map(e => e.textContent);
    expect(top).toEqual(['Rashi', 'Ramban', 'Ibn Ezra', 'Sforno', 'Onkelos']);
    const cats = $$('[data-ng="categories"] [data-ng="category-row"]').map(e => e.getAttribute('data-category'));
    expect(cats.slice(0, 5)).toEqual(['Commentary', 'Targum', 'Talmud', 'Midrash', 'Halakhah']);
    expect(cats).not.toContain('Quoting Commentary');
    expect($('[data-ng="cited-by"] .ng-row-title').textContent).toBe('Cited by');
    expect($('[data-ng="cited-by-list"]')).toBeNull();
    act(() => { $('[data-ng="cited-by-toggle"]').click(); });
    expect($('[data-ng="cited-by-toggle"]').getAttribute('aria-expanded')).toBe('true');
    expect($$('[data-ng="cited-by-list"] [data-ng="book-row"]').length).toBeGreaterThan(50);
    // The anchor: the verse itself, for orientation.
    expect($('[data-ng="panel-anchor"]').textContent).toContain('When God began to create');
  });

  test('previews of the top five load one commentator at a time, after the counts', async () => {
    const getText = stubTexts();
    await openGenesis11();
    await flush(20);
    const order = getText.mock.calls.map(c => c[0]);
    expect(order).toEqual(['Rashi on Genesis 1:1:1-3', 'Ramban on Genesis 1:1:1-4', 'Ibn Ezra on Genesis 1:1:1-5',
      'Sforno on Genesis 1:1:1-5', 'Onkelos Genesis 1:1']);
    expect($$('[data-ng="top-commentators"] .ng-row-preview').map(e => e.textContent)[0]).toBe('EN Rashi on Genesis 1:1:1');
  });
});

describe('drilling in: category -> work -> a cited text, with history', () => {
  beforeEach(() => { stubLinks(); stubTexts(); });

  test('the stack, its breadcrumb, with= in the URL, and Back walking it', async () => {
    await openGenesis11();
    act(() => { $('[data-ng="category-row"][data-category="Commentary"]').click(); });
    expect($('[data-ng="panel-associated"]').getAttribute('data-view')).toBe('category');
    expect(here()).toBe('/Genesis.1.1?with=Commentary&lang=bi');
    const rows = $$('[data-ng="book-row"] .ng-row-title').map(e => e.textContent);
    expect(rows.slice(0, 5)).toEqual(['Rashi', 'Ramban', 'Ibn Ezra', 'Sforno', 'Abarbanel']);

    act(() => { $('[data-ng="book-row"][data-key="Commentary|Rashi"]').click(); });
    await flush();
    expect(here()).toBe('/Genesis.1.1?with=Rashi&lang=bi');
    expect($$('[data-ng="comment"]').map(c => c.getAttribute('data-ref'))).toEqual(
      ['Rashi on Genesis 1:1:1', 'Rashi on Genesis 1:1:2', 'Rashi on Genesis 1:1:3']);
    expect($$('[data-ng="crumbs"] > *').map(c => c.textContent)).toEqual(['Genesis 1:1', 'Commentary', 'Rashi']);

    // A citation inside a comment opens on top of the stack, not as a page navigation.
    const cite = $('[data-ng="comment"] a.refLink');
    const click = new MouseEvent('click', {bubbles: true, cancelable: true});
    act(() => { cite.dispatchEvent(click); });
    await flush();
    expect(click.defaultPrevented).toBe(true);
    expect($('[data-ng="panel-associated"]').getAttribute('data-view')).toBe('ref');
    expect($('[data-ng="tangent"]').getAttribute('data-ref')).toBe('Psalms 111:6');
    expect($('[data-ng="panel-title"]').textContent).toBe('Psalms 111:6');

    // Browser Back walks the stack: tangent -> Rashi -> Commentary -> home -> closed.
    window.history.back();
    await flush();
    expect($('[data-ng="panel-associated"]').getAttribute('data-view')).toBe('book');
    act(() => { $('[data-ng="panel-back"]').click(); });  // the panel's own back button
    await flush();
    expect($('[data-ng="panel-associated"]').getAttribute('data-view')).toBe('category');
    window.history.back();
    await flush();
    expect($('[data-ng="panel-associated"]').getAttribute('data-view')).toBe('home');
    expect(here()).toBe('/Genesis.1.1?with=all&lang=bi');
    window.history.back();
    await flush();
    expect(overlayState()).toBe(OVERLAY.NONE);
    expect(here()).toBe('/Genesis.1?lang=bi');
    // Leaving the overlay never reloads the text.
    expect(Sefaria.getTextFromCurrVersions.mock.calls.map(c => c[0])).toEqual(['Genesis 2']);
  });

  test('a crumb jumps back several levels at once; Escape closes everything', async () => {
    await openGenesis11();
    act(() => { $('[data-ng="category-row"][data-category="Commentary"]').click(); });
    act(() => { $('[data-ng="book-row"][data-key="Commentary|Rashi"]').click(); });
    await flush();
    act(() => { $('[data-ng="crumb"][data-index="0"]').click(); });
    await flush();
    expect($('[data-ng="panel-associated"]').getAttribute('data-view')).toBe('home');
    expect(here()).toBe('/Genesis.1.1?with=all&lang=bi');
    act(() => { $('[data-ng="category-row"][data-category="Midrash"]').click(); });
    act(() => { document.dispatchEvent(new KeyboardEvent('keydown', {key: 'Escape'})); });
    await flush();
    expect(overlayState()).toBe(OVERLAY.NONE);
    expect(here()).toBe('/Genesis.1?lang=bi');
  });

  test('"Open in the reader" leaves the panel for the cited text', async () => {
    const GENESIS_1 = fixture('genesis-1').initialPanel.text;
    Sefaria.getTextFromCurrVersions.mockImplementation((ref) => Promise.resolve(
      ref === 'Genesis 2' ? GENESIS_2 : {...GENESIS_1, ref: 'Psalms 111:6', sectionRef: 'Psalms 111', sections: ['111', '6']}));
    await openGenesis11();
    act(() => { $('[data-ng="top-commentators"] [data-ng="book-row"]').click(); });
    await flush();
    act(() => { $('[data-ng="comment"] a.refLink').click(); });
    await flush();
    act(() => { $('[data-ng="open-in-reader"]').click(); });
    await flush(12);
    expect(overlayState()).toBe(OVERLAY.NONE);
    expect(Sefaria.getTextFromCurrVersions).toHaveBeenCalledWith('Psalms 111:6', expect.anything(), null, true);
    expect(window.location.pathname).toBe('/Psalms.111.6');
  });
});

describe('languages inside the panel', () => {
  beforeEach(() => { stubLinks(); });

  test('translation-only: works without English say "Hebrew only"; a comment without English shows its Hebrew, labelled', async () => {
    stubTexts({english: (ref) => !ref.endsWith(':2')});
    await openGenesis11(fixture('genesis-1', {language: 'english'}));
    act(() => { $('[data-ng="category-row"][data-category="Commentary"]').click(); });
    const aderet = $('[data-ng="book-row"][data-key="Commentary|Aderet Eliyahu"]');
    expect(aderet.querySelector('[data-ng="hebrew-only"]').textContent).toBe('Hebrew only');
    expect($('[data-ng="book-row"][data-key="Commentary|Rashi"] [data-ng="hebrew-only"]')).toBeNull();
    act(() => { $('[data-ng="book-row"][data-key="Commentary|Rashi"]').click(); });
    await flush();
    const [c1, c2] = $$('[data-ng="comment"]');
    expect(c1.textContent).toBe('EN Rashi on Genesis 1:1:1');
    expect(c2.querySelector('.ng-assoc-he').textContent).toContain('HE Rashi on Genesis 1:1:2');
    expect(c2.querySelector('[data-ng="hebrew-only"]')).not.toBeNull();
  });

  test('the panel follows the reader\'s language, and its toggle changes the panel alone', async () => {
    stubTexts();
    await openGenesis11();
    act(() => { $('[data-ng="top-commentators"] [data-ng="book-row"]').click(); });
    await flush();
    const comment = () => $('[data-ng="comment"]');
    expect($('[data-ng="panel-lang-bilingual"]').getAttribute('aria-pressed')).toBe('true');
    expect(comment().querySelector('.ng-assoc-he')).not.toBeNull();
    expect(comment().querySelector('.ng-assoc-en')).not.toBeNull();
    act(() => { $('[data-ng="panel-lang-hebrew"]').click(); });
    expect(comment().querySelector('.ng-assoc-en')).toBeNull();
    act(() => { $('[data-ng="panel-lang-english"]').click(); });
    expect(comment().querySelector('.ng-assoc-he')).toBeNull();
    expect($('[data-ng="stream"]').getAttribute('data-language')).toBe('bilingual');  // the reader is untouched
    expect(document.cookie).not.toContain('contentLang');
  });

  test('a Hebrew interface mirrors the panel and sorts aleph–tav', async () => {
    stubTexts();
    await openGenesis11(fixture('genesis-1', {interfaceLang: 'hebrew'}));
    expect($('[data-ng="sheet"]').getAttribute('data-side')).toBe('left');
    expect($('[data-ng="panel-title"]').textContent).toBe('בראשית א׳:א׳');
    act(() => { $('[data-ng="category-row"][data-category="Midrash"]').click(); });
    const titles = $$('[data-ng="book-row"] .ng-row-title').map(e => e.textContent.replace(/["'״׳]/g, ''));
    expect(titles).toEqual(titles.slice().sort((a, b) => a.localeCompare(b, 'he')));
    expect($('[data-ng="panel-title"]').textContent).toBe('מדרש');
  });
});

describe('pins (I1)', () => {
  test('pin a commentator from the panel: it shows under every segment it comments on, and persists', async () => {
    stubLinks({'Berakhot 2a:1': BERAKHOT_LINKS});
    stubTexts({sections: {'Steinsaltz on Berakhot 2a': v3('Steinsaltz on Berakhot 2a', ['<b>מאימתי</b> ביאור', 'שני'], ['When do we recite', ''])}});
    window.history.replaceState(null, '', '/Berakhot.2a');
    await hydrate(env.container, fixture('berakhot-2a', {language: 'hebrew'}));
    await flush();
    act(() => { $('[data-ng="segment-badge"][data-ref="Berakhot 2a:1"]').click(); });
    await flush();
    act(() => { $('[data-ng="book-row"][data-key="Commentary|Steinsaltz"]').click(); });
    await flush();
    const pin = $('[data-ng="pin-toggle"]');
    expect(pin.getAttribute('aria-pressed')).toBe('false');
    act(() => { pin.click(); });
    expect($('[data-ng="pin-toggle"]').getAttribute('aria-pressed')).toBe('true');
    expect(JSON.parse(window.localStorage.getItem(PINS_KEY))).toEqual({Talmud: [{title: 'Steinsaltz', heTitle: 'ביאור שטיינזלץ', category: 'Commentary'}]});
    act(() => { $('[data-ng="overlay-close"]').click(); });
    await flush(12);
    const pinned = $('[data-ng="segment"][data-ref="Berakhot 2a:1"] [data-ng="pin"]');
    expect(pinned.querySelector('.ng-pin-name').textContent).toBe('Steinsaltz');
    expect(pinned.querySelector('.ng-pin-he').textContent).toBe('מאימתי ביאור');
    expect(pinned.querySelector('.ng-pin-en')).toBeNull();  // source-only reader: source only
    // Tapping the pinned comment opens that work in the panel on its segment.
    act(() => { pinned.click(); });
    await flush();
    expect($('[data-ng="panel-associated"]').getAttribute('data-view')).toBe('book');
    expect($('[data-ng="panel-title"]').textContent).toBe('Steinsaltz');
  });

  test('pins are read after mount, and two is the limit', async () => {
    window.localStorage.setItem(PINS_KEY, JSON.stringify({Tanakh: [
      {title: 'Ramban', heTitle: 'רמב"ן', category: 'Commentary'}, {title: 'Sforno', heTitle: 'ספורנו', category: 'Commentary'}]}));
    stubLinks();
    stubTexts({sections: {
      'Ramban on Genesis 1': v3('Ramban on Genesis 1', [['r1', 'r2', 'r3', 'r4']], [['R1', 'R2', 'R3', 'R4']]),
      'Sforno on Genesis 1': v3('Sforno on Genesis 1', [['s1', 's2', 's3', 's4', 's5']], [['S1', 'S2', 'S3', 'S4', 'S5']]),
    }});
    await openGenesis11();
    await flush(12);
    const names = $$('[data-ng="segment"][data-ref="Genesis 1:1"] [data-ng="pin"] .ng-pin-name').map(e => e.textContent);
    expect(names).toEqual(['Ramban', 'Sforno']);
    act(() => { $('[data-ng="book-row"][data-key="Commentary|Rashi"]').click(); });
    await flush();
    expect($('[data-ng="pin-toggle"]').disabled).toBe(true);
    expect($('[data-ng="pin-full"]').textContent).toMatch(/Two commentators are pinned/);
  });
});

describe('with= deep links', () => {
  function withProps(filter, name = 'genesis-1-3') {
    const props = fixture(name);
    props.initialPanel.filter = filter;
    return props;
  }

  test('?with=Rashi opens the panel on the segment, resolves to Rashi, and Back steps out to the text', async () => {
    stubLinks({'Genesis 1:3': GENESIS_LINKS.map(l => ({...l, anchorRefExpanded: ['Genesis 1:3']}))});
    stubTexts();
    window.history.replaceState(null, '', '/Genesis.1.3?with=Rashi&lang=bi');
    const props = withProps(['Rashi']);
    await hydrate(env.container, props);
    await flush();
    expect(realErrors(env.errors)).toEqual([]);
    expect(overlayState()).toBe(OVERLAY.ASSOCIATED);
    expect($('[data-ng="panel-associated"]').getAttribute('data-ref')).toBe('Genesis 1:3');
    expect($('[data-ng="panel-associated"]').getAttribute('data-view')).toBe('book');
    expect($('[data-ng="panel-title"]').textContent).toBe('Rashi');
    expect(here()).toBe('/Genesis.1.3?with=Rashi&lang=bi');
    window.history.back();
    await flush();
    expect($('[data-ng="panel-associated"]').getAttribute('data-view')).toBe('home');
    expect(here()).toBe('/Genesis.1.3?with=all&lang=bi');
    window.history.back();
    await flush();
    expect(overlayState()).toBe(OVERLAY.NONE);
    expect(here()).toBe('/Genesis.1.3?lang=bi');
  });

  test('?with=all opens the first screen; a with= that matches nothing falls back to it', async () => {
    stubLinks({'Genesis 1:3': []});
    stubTexts();
    await hydrate(env.container, withProps([]));
    expect($('[data-ng="panel-associated"]').getAttribute('data-view')).toBe('home');
    expect($('.ng-assoc-empty').textContent).toMatch(/Nothing is linked/);
    act(() => { require('react-dom').unmountComponentAtNode(env.container); });
    window.history.replaceState(null, '', '/Genesis.1.3?with=Nonesuch');
    await hydrate(env.container, withProps(['Nonesuch']));
    await flush();
    expect($('[data-ng="panel-associated"]').getAttribute('data-view')).toBe('home');
  });
});

describe('swipes (touch events)', () => {
  beforeEach(() => { stubLinks(); stubTexts(); });
  const W = () => window.innerWidth;

  test('right to left on the text opens associated texts on the segment nearest the center', async () => {
    await hydrate(env.container, fixture('genesis-1'));
    const seg = $('[data-ng="segment"][data-ref="Genesis 1:4"]');
    await fingerDrag(seg, {x: W() - 80, y: 400}, {x: 120, y: 406});
    expect(overlayState()).toBe(OVERLAY.ASSOCIATED);
    expect($('[data-ng="panel-associated"]').getAttribute('data-ref')).toBe('Genesis 1:4');  // center (384px) of the fake layout
    expect(here()).toBe('/Genesis.1.4?with=all&lang=bi');
    // Dragging the panel back toward its edge closes it, through history.
    await fingerDrag($('[data-ng="panel-body"]'), {x: 200, y: 300}, {x: W() - 40, y: 302});
    await wait(420);
    expect(overlayState()).toBe(OVERLAY.NONE);
    expect(here()).toBe('/Genesis.1?lang=bi');
    expect($('[data-ng="overlay"]').hidden).toBe(true);
  });

  test('left to right opens the config panel, from the leading side', async () => {
    await hydrate(env.container, fixture('genesis-1'));
    await fingerDrag($('[data-ng="segment"]'), {x: 60, y: 400}, {x: 500, y: 396});
    expect(overlayState()).toBe(OVERLAY.CONFIG);
    expect($('[data-ng="sheet"]').getAttribute('data-side')).toBe('left');
    expect($('[data-ng="panel-config"]')).not.toBeNull();
  });

  test('a Hebrew interface mirrors the directions', async () => {
    await hydrate(env.container, fixture('genesis-1', {interfaceLang: 'hebrew'}));
    await fingerDrag($('[data-ng="segment"]'), {x: 80, y: 400}, {x: 600, y: 400});
    expect(overlayState()).toBe(OVERLAY.ASSOCIATED);
    expect($('[data-ng="sheet"]').getAttribute('data-side')).toBe('left');
  });

  test('edge zones, vertical drags, mouse drags and a text selection never open a panel', async () => {
    await hydrate(env.container, fixture('genesis-1'));
    const seg = $('[data-ng="segment"]');
    await fingerDrag(seg, {x: W() - 8, y: 400}, {x: 100, y: 400});       // from the edge: the OS back gesture
    await fingerDrag(seg, {x: 500, y: 600}, {x: 520, y: 200});             // a scroll
    pointer(seg, 'pointerdown', {x: 800, y: 400, pointerType: 'mouse', t: 1});
    pointer(seg, 'pointermove', {x: 200, y: 400, pointerType: 'mouse', t: 50});
    pointer(seg, 'pointerup', {x: 200, y: 400, pointerType: 'mouse', t: 60});
    // This jsdom has no Selection API: stand one in for a reader adjusting a text selection.
    const hadSelection = window.getSelection;
    window.getSelection = () => ({isCollapsed: false, toString: () => 'In the beginning'});
    await fingerDrag(seg, {x: 800, y: 400}, {x: 100, y: 400});
    window.getSelection = hadSelection;
    await flush();
    expect(overlayState()).toBe(OVERLAY.NONE);
    expect($('[data-ng="overlay"]').hidden).toBe(true);
  });

  test('a short slow drag pulls the panel under the finger, then settles back without opening', async () => {
    await hydrate(env.container, fixture('genesis-1'));
    const seg = $('[data-ng="segment"]');
    touch(seg, 'touchstart', {x: 800, y: 400, t: 0});
    touch(seg, 'touchmove', {x: 780, y: 400, t: 300});
    touch(seg, 'touchmove', {x: 760, y: 400, t: 600});
    await flush(2);
    // The panel is mounted and moved by transform only.
    expect($('[data-ng="overlay"]').getAttribute('data-phase')).toBe('pulling');
    expect($('[data-ng="sheet"]').style.transform).toMatch(/^translate3d\(\d+(\.\d+)?px, 0(px)?, 0(px)?\)$/);
    touch(seg, 'touchend', {x: 760, y: 400, t: 900});
    await wait(420);
    expect(overlayState()).toBe(OVERLAY.NONE);
    expect($('[data-ng="overlay"]').hidden).toBe(true);
  });
});

test('the signed-in reader\'s own notes appear with the associated texts', async () => {
  stubLinks();
  stubTexts();
  const api = jest.spyOn(Sefaria, '_ApiPromise').mockResolvedValue([{_id: 'n1', title: 'On creation', text: 'My note on the first verse'}]);
  const props = fixture('genesis-1');
  props._uid = 42;
  await openGenesis11(props);
  expect(api).toHaveBeenCalledWith('/api/notes/Genesis.1.1?private=1');
  expect($('[data-ng="notes"] [data-ng="note"]').textContent).toBe('On creationMy note on the first verse');
});
