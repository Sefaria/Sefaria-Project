/**
 * The config panel in the browser (jsdom), mounted the way the reader mounts it: NgReaderApp
 * hydrated from the server HTML, the panel opened from the header. The data layer is the real
 * Sefaria singleton with its network calls stubbed: getVersions (the version lists) and
 * getTextFromCurrVersions (the text in the chosen versions).
 */
import React from 'react';
import ReactDOM from 'react-dom';
import ReactDOMServer from 'react-dom/server';
import {act} from 'react-dom/test-utils';
import Sefaria from '../../sefaria/sefaria';
import {NgReaderApp, ngUnpackProps} from '../index';
import {OVERLAY} from '../context';
import {fixture, neighbourText, SHARED_DATA} from './helpers';

let container, errors, raf, rect;

const JSDOM_ONLY_WARNING = /useLayoutEffect does nothing on the server/;
const realErrors = () => errors.mock.calls.filter(args => !JSDOM_ONLY_WARNING.test(String(args[0])));

// jsdom has no layout. Segment i spans [i * h, i * h + 0.9h), where h depends on the reading
// mode (translation only is shorter), so a language switch really does move the text.
const SEGMENT_HEIGHT = {bilingual: 100, hebrew: 70, english: 50};
function stackSegments() {
  const original = Element.prototype.getBoundingClientRect;
  const box = (top, height) => ({top, bottom: top + height, left: 0, right: 0, width: 0, height});
  Element.prototype.getBoundingClientRect = function () {
    const kind = this.getAttribute && this.getAttribute('data-ng');
    if (kind === 'segment') {
      const stream = document.querySelector('[data-ng="stream"]');
      const h = SEGMENT_HEIGHT[stream && stream.getAttribute('data-language')] || 100;
      const i = Array.from(document.querySelectorAll('[data-ng="segment"]')).indexOf(this);
      return box(i * h, h * 0.9);
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

/** name -> value, decoded the way $.cookie reads them. */
function cookies() {
  return Object.fromEntries(document.cookie.split(';').map(c => c.trim()).filter(Boolean).map(c => {
    const i = c.indexOf('=');
    return [decodeURIComponent(c.slice(0, i)), decodeURIComponent(c.slice(i + 1))];
  }));
}

const flush = () => act(async () => { for (let i = 0; i < 5; i++) { await new Promise(r => setTimeout(r, 0)); } });
const $ = (sel) => container.querySelector(sel);
const $$ = (sel) => Array.from(container.querySelectorAll(sel));
const click = (sel) => act(() => { const el = typeof sel === 'string' ? $(sel) : sel; el.click(); });
const pressed = (sel) => $(sel).getAttribute('aria-pressed') === 'true';

// Versions as Sefaria.getVersions resolves them: bucketed by actual language, in API order.
const V = (o) => ({license: 'CC-BY', versionNotes: '', shortVersionTitle: '', versionTitleInHebrew: '', ...o});
const GENESIS_VERSIONS = {
  he: [
    V({versionTitle: 'Miqra according to the Masorah', versionTitleInHebrew: 'מקרא על פי המסורה', languageFamilyName: 'hebrew', language: 'he', actualLanguage: 'he', isSource: true, isPrimary: true, priority: 2, license: 'CC-BY-SA'}),
    V({versionTitle: "Tanach with Ta'amei Hamikra", languageFamilyName: 'hebrew', language: 'he', actualLanguage: 'he', isSource: true, isPrimary: true, priority: 1, license: 'Public Domain'}),
  ],
  en: [
    V({versionTitle: 'THE JPS TANAKH: Gender-Sensitive Edition', shortVersionTitle: 'Revised JPS, 2023', languageFamilyName: 'english', language: 'en', actualLanguage: 'en', isSource: false, priority: 8, license: 'CC-BY-NC'}),
    V({versionTitle: 'Sefaria Community Translation', languageFamilyName: 'english', language: 'en', actualLanguage: 'en', isSource: false, license: 'CC0'}),
    V({versionTitle: 'The Koren Jerusalem Bible', languageFamilyName: 'english', language: 'en', actualLanguage: 'en', isSource: false, priority: 5, license: 'CC-BY-NC',
      versionNotes: 'Translated by <a href="https://example.org/koren">Harold Fisch</a>.', versionSource: 'https://korenpub.com'}),
  ],
  fr: [V({versionTitle: 'Bible du Rabbinat 1899 [fr]', languageFamilyName: 'french', language: 'en', actualLanguage: 'fr', isSource: false, priority: 1, license: 'Public Domain'})],
  es: [V({versionTitle: 'El Pentateuco [es]', languageFamilyName: 'spanish', language: 'en', actualLanguage: 'es', isSource: false, license: 'unknown'})],
};

const GENESIS_1 = () => fixture('genesis-1').initialPanel.text;
const GENESIS_2 = neighbourText('genesis-1', {ref: 'Genesis 2', heRef: 'בראשית ב׳', prev: 'Genesis 1', next: null});

/** The text API answering for Genesis 1 in whatever versions were asked for. */
function textIn(versionTitles) {
  const text = GENESIS_1();
  text.versions = text.versions.map(v => ({...v}));
  if (versionTitles.en) { text.versions[1].versionTitle = versionTitles.en; text.versions[1].shortVersionTitle = ''; }
  if (versionTitles.he) { text.versions[0].versionTitle = versionTitles.he; }
  return text;
}

let getVersions, getText;
function stubDataLayer({versions = GENESIS_VERSIONS, text = null} = {}) {
  getVersions = jest.spyOn(Sefaria, 'getVersions').mockImplementation(() => Promise.resolve(versions));
  getText = jest.spyOn(Sefaria, 'getTextFromCurrVersions').mockImplementation((ref, currVersions) => {
    if (ref === 'Genesis 2') { return Promise.resolve(GENESIS_2); }
    if (text) { return text(ref, currVersions); }
    if (ref === 'Genesis 1') {
      return Promise.resolve(textIn({en: currVersions.en && currVersions.en.versionTitle, he: currVersions.he && currVersions.he.versionTitle}));
    }
    return Promise.reject(new Error(`unexpected ${ref}`));
  });
}

beforeEach(() => {
  clearCookies();
  errors = jest.spyOn(console, 'error').mockImplementation(() => {});
  raf = window.requestAnimationFrame;
  window.requestAnimationFrame = (cb) => setTimeout(cb, 0);
  window.scrollTo = jest.fn();
  window.scrollBy = jest.fn();
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

async function hydrate(props) {
  container.innerHTML = ReactDOMServer.renderToString(<NgReaderApp {...props} />);
  Sefaria.setup(SHARED_DATA, props);
  ngUnpackProps(props);
  act(() => { ReactDOM.hydrate(<NgReaderApp {...props} />, container); });
  await flush();
}

async function openPanel(props = fixture('genesis-1')) {
  await hydrate(props);
  click('[data-ng="header-settings"]');
  await flush();
  expect($('[data-ng="overlay"]').getAttribute('data-overlay')).toBe(OVERLAY.CONFIG);
  expect($('[data-ng="panel-config"]')).not.toBeNull();
}

describe('language', () => {
  beforeEach(() => stubDataLayer());

  test('three reading modes, the current one pressed', async () => {
    await openPanel();
    const options = $$('[data-ng="field-language"] .ng-segment').map(b => b.getAttribute('data-ng'));
    expect(options).toEqual(['setting-language-hebrew', 'setting-language-english', 'setting-language-bilingual']);
    expect(pressed('[data-ng="setting-language-bilingual"]')).toBe(true);
    expect(pressed('[data-ng="setting-language-hebrew"]')).toBe(false);
    expect(realErrors()).toEqual([]);
  });

  test.each([
    ['english', 'en', '.ng-he', '.ng-en'],
    ['hebrew', 'he', '.ng-en', '.ng-he'],
  ])('%s: re-renders the text, writes contentLang and language, updates ?lang', async (value, short, gone, kept) => {
    await openPanel();
    click(`[data-ng="setting-language-${value}"]`);
    await flush();
    expect($('[data-ng="stream"]').getAttribute('data-language')).toBe(value);
    expect($(`[data-ng="segment"] ${gone}`)).toBeNull();
    expect($(`[data-ng="segment"] ${kept}`)).not.toBeNull();
    expect(cookies()).toMatchObject({contentLang: value, language: value});
    expect(window.location.search).toBe(`?lang=${short}`);
    expect(pressed(`[data-ng="setting-language-${value}"]`)).toBe(true);
  });

  test('bilingual layouts: stacked and side by side, only while bilingual', async () => {
    await openPanel();
    expect(pressed('[data-ng="setting-biLayout-stacked"]')).toBe(true);
    click('[data-ng="setting-biLayout-heRight"]');
    expect($('[data-ng="section"]').getAttribute('data-bilayout')).toBe('heRight');
    expect(cookies().biLayout).toBe('heRight');
    click('[data-ng="setting-biLayout-stacked"]');
    expect($('[data-ng="section"]').getAttribute('data-bilayout')).toBeNull();
    expect(cookies().biLayout).toBe('stacked');
    click('[data-ng="setting-language-english"]');
    expect($('[data-ng="field-biLayout"]')).toBeNull();
  });

  test('a classic heLeft cookie counts as side by side', async () => {
    const props = fixture('genesis-1');
    props.initialSettings.biLayout = 'heLeft';
    await openPanel(props);
    expect(pressed('[data-ng="setting-biLayout-heRight"]')).toBe(true);
  });

  test('the text being read stays put while the layout changes behind the panel', async () => {
    await openPanel();
    // The center (384px) is in segment 3 (Genesis 1:4) at 100px a segment: top 300.
    // Translation only is 50px a segment: its top moves to 150, so the page scrolls by -150.
    expect($('[data-ng="header-ref"]').textContent).toBe('Genesis1:4');
    window.scrollBy.mockClear();
    click('[data-ng="setting-language-english"]');
    expect(window.scrollBy).toHaveBeenCalledWith(0, -150);
  });
});

describe('text', () => {
  beforeEach(() => stubDataLayer());

  test('layout is per category and hidden while bilingual: Tanakh writes layoutTanakh', async () => {
    await openPanel(fixture('genesis-1', {language: 'english'}));
    expect($('[data-ng="setting-layout-segmented"]').textContent).toBe('Verse by verse');
    expect(pressed('[data-ng="setting-layout-segmented"]')).toBe(true);
    click('[data-ng="setting-layout-continuous"]');
    expect($('[data-ng="section"]').getAttribute('data-layout')).toBe('continuous');
    expect(cookies().layoutTanakh).toBe('continuous');
    expect(cookies().layoutTalmud).toBeUndefined();
    click('[data-ng="setting-language-bilingual"]');
    expect($('[data-ng="field-layout"]')).toBeNull();
  });

  test('Talmud: continuous by default, writes layoutTalmud, and offers punctuation', async () => {
    await openPanel(fixture('berakhot-2a', {language: 'hebrew'}));
    expect($('[data-ng="setting-layout-segmented"]').textContent).toBe('By segment');
    expect(pressed('[data-ng="setting-layout-continuous"]')).toBe(true);
    click('[data-ng="setting-layout-segmented"]');
    expect(cookies().layoutTalmud).toBe('segmented');
    expect($('[data-ng="section"]').getAttribute('data-layout')).toBe('segmented');
    const before = $('[data-ng="stream"]').textContent;
    expect(before).toMatch(/[.:,]/);
    click('[data-ng="setting-punctuationTalmud-punctuationOff"]');
    expect(cookies().punctuationTalmud).toBe('punctuationOff');
    expect($('[data-ng="section"] .ng-segments').textContent).not.toMatch(/[:]/);
  });

  test('font size steps like the classic reader (x1.15), within bounds, and persists', async () => {
    await openPanel();
    expect($('[data-ng="fontSize-value"]').textContent).toBe('100%');
    click('[data-ng="setting-fontSize-larger"]');
    expect(cookies().fontSize).toBe('71.875');
    expect($('[data-ng="fontSize-value"]').textContent).toBe('115%');
    // (The stream's --ng-font-scale follows; jsdom drops CSS custom properties, so the screenshots check it.)
    click('[data-ng="setting-fontSize-smaller"]');
    click('[data-ng="setting-fontSize-smaller"]');
    click('[data-ng="setting-fontSize-smaller"]');
    expect($('[data-ng="setting-fontSize-smaller"]').disabled).toBe(true);
    expect(Number(cookies().fontSize)).toBeCloseTo(62.5 / 1.15 / 1.15, 2);
  });

  test('vowels and cantillation for Tanakh: all, vowels only, none', async () => {
    await openPanel(fixture('genesis-1', {language: 'hebrew'}));
    const values = $$('[data-ng="field-vowels"] .ng-segment').map(b => b.getAttribute('data-ng'));
    expect(values).toEqual(['setting-vowels-all', 'setting-vowels-partial', 'setting-vowels-none']);
    expect(pressed('[data-ng="setting-vowels-all"]')).toBe(true);
    const he = () => $('[data-ng="segment"] .ng-he').textContent;
    expect(he()).toMatch(/[֑-֯]/);
    click('[data-ng="setting-vowels-partial"]');
    expect(cookies().vowels).toBe('partial');
    expect(he()).not.toMatch(/[֑-֯]/);
    expect(he()).toMatch(/[ְ-ּ]/);
    click('[data-ng="setting-vowels-none"]');
    expect(cookies().vowels).toBe('none');
    expect(he()).not.toMatch(/[֑-ׇ]/);
  });

  test('vowels: two choices for vocalized text without cantillation; hidden in translation only', async () => {
    await openPanel(fixture('berakhot-2a', {language: 'hebrew'}));
    expect($$('[data-ng="field-vowels"] .ng-segment').map(b => b.getAttribute('data-ng')))
      .toEqual(['setting-vowels-all', 'setting-vowels-none']);
    expect($('[data-ng="field-vowels"] .ng-config-label').textContent).toBe('Vowels');
    click('[data-ng="setting-language-english"]');
    expect($('[data-ng="field-vowels"]')).toBeNull();
    expect($('[data-ng="field-punctuationTalmud"]')).toBeNull();
  });

  test('the classic view link is the current URL with ?ng=0', async () => {
    await openPanel();
    expect($('[data-ng="classic-link"]').getAttribute('href')).toBe('/Genesis.1?lang=bi&ng=0');
    click('[data-ng="setting-language-hebrew"]');
    expect($('[data-ng="classic-link"]').getAttribute('href')).toBe('/Genesis.1?lang=he&ng=0');
  });

  test('closes from its close button', async () => {
    await openPanel();
    click('[data-ng="overlay-close"]');
    expect($('[data-ng="overlay"]').getAttribute('data-state')).toBe(OVERLAY.NONE);
    await act(() => new Promise(r => setTimeout(r, 450)));  // the drawer slides out, then unmounts
    expect($('[data-ng="panel-config"]')).toBeNull();
  });
});

describe('versions', () => {
  test('the lists come from the data layer, for the section being read', async () => {
    stubDataLayer();
    await openPanel();
    expect(getVersions).toHaveBeenCalledWith('Genesis 1');
    expect($('[data-ng="version-row-source"]').textContent).toContain('Miqra according to the Masorah');
    expect($('[data-ng="version-row-translation"]').textContent).toContain('Revised JPS, 2023');
    expect($('[data-ng="version-row-translation"]').textContent).toContain('English');
  });

  test('translations are grouped by language, the preferred language first, each by priority', async () => {
    stubDataLayer();
    const props = fixture('genesis-1');
    props.translationLanguagePreference = 'es';
    await openPanel(props);
    click('[data-ng="version-row-translation"]');
    const groups = $$('[data-ng="version-group"]');
    expect(groups.map(g => g.getAttribute('data-lang'))).toEqual(['es', 'en', 'fr']);
    expect(groups.map(g => g.querySelector('h3').textContent)).toEqual(['Spanish', 'English', 'French']);
    const english = groups[1].querySelectorAll('[data-ng="version"]');
    expect(Array.from(english).map(v => v.getAttribute('data-version-title'))).toEqual([
      'THE JPS TANAKH: Gender-Sensitive Edition', 'The Koren Jerusalem Bible', 'Sefaria Community Translation']);
    // Display titles: the short title when there is one, without the "[fr]" suffix.
    expect(groups[2].querySelector('.ng-version-title').textContent).toBe('Bible du Rabbinat 1899');
    // The version on screen is marked, as the text API reported it (not re-derived here).
    expect(english[0].getAttribute('data-selected')).toBe('true');
    expect($$('[data-ng="version"][data-selected="true"]')).toHaveLength(1);
  });

  test('without a preference, English leads', async () => {
    stubDataLayer();
    await openPanel();
    click('[data-ng="version-row-translation"]');
    expect($$('[data-ng="version-group"]').map(g => g.getAttribute('data-lang'))).toEqual(['en', 'fr', 'es']);
  });

  test('each version shows its license, and its notes and source on demand', async () => {
    stubDataLayer();
    await openPanel();
    click('[data-ng="version-row-translation"]');
    const koren = $('[data-ng="version"][data-version-title="The Koren Jerusalem Bible"]');
    expect(koren.querySelector('.ng-version-meta').textContent).toBe('CC-BY-NC');
    const info = koren.querySelector('[data-ng="version-info"]');
    expect(info.getAttribute('aria-expanded')).toBe('false');
    expect(koren.querySelector('[data-ng="version-about"]')).toBeNull();
    click(info);
    const about = koren.querySelector('[data-ng="version-about"]');
    expect(info.getAttribute('aria-expanded')).toBe('true');
    expect(info.getAttribute('aria-controls')).toBe(about.id);
    expect(about.querySelector('a[href="https://example.org/koren"]').textContent).toBe('Harold Fisch');
    expect(about.querySelector('.ng-version-source a').getAttribute('href')).toBe('https://korenpub.com');
    click(info);
    expect(koren.querySelector('[data-ng="version-about"]')).toBeNull();
  });

  test('choosing a translation: reloads through the data layer, updates ven, records the preference', async () => {
    stubDataLayer();
    const setPref = jest.spyOn(Sefaria, 'setVersionPreference').mockImplementation(() => {});
    const props = fixture('genesis-1');
    props.translationLanguagePreference = 'en';
    await openPanel(props);
    click('[data-ng="version-row-translation"]');
    click('[data-ng="version"][data-version-title="The Koren Jerusalem Bible"] [data-ng="version-choose"]');
    await flush();
    const koren = {en: {languageFamilyName: 'english', versionTitle: 'The Koren Jerusalem Bible'}, he: null};
    expect(getText).toHaveBeenCalledWith('Genesis 1', koren, 'en', true);
    expect(window.location.search).toBe('?ven=english|The_Koren_Jerusalem_Bible&lang=bi');
    expect(setPref).toHaveBeenCalledWith('Genesis 1', 'The Koren Jerusalem Bible', 'en');
    // Back on the main view, which now names the new translation; the panel stays open over the new text.
    expect($('[data-ng="config-main"]')).not.toBeNull();
    expect($('[data-ng="version-row-translation"]').textContent).toContain('The Koren Jerusalem Bible');
    expect($('[data-ng="overlay"]').getAttribute('data-overlay')).toBe(OVERLAY.CONFIG);
    // Later sections load in the new versions too.
    expect(getText).toHaveBeenLastCalledWith('Genesis 2', koren, 'en', true);
    expect(realErrors()).toEqual([]);
  });

  test('the preference lands in the classic version_preferences_by_corpus cookie', async () => {
    stubDataLayer();
    // What data.js provides in the browser: the book and its corpus.
    jest.spyOn(Sefaria, 'parseRef').mockImplementation(() => ({index: 'Genesis'}));
    jest.spyOn(Sefaria, 'index').mockImplementation(() => ({title: 'Genesis', corpus: 'Tanakh'}));
    const profile = jest.spyOn(Sefaria, 'editProfileAPI').mockImplementation(() => Promise.resolve());
    jest.spyOn(Sefaria.track, 'event').mockImplementation(() => {});
    await openPanel();
    click('[data-ng="version-row-translation"]');
    click('[data-ng="version"][data-version-title="The Koren Jerusalem Bible"] [data-ng="version-choose"]');
    await flush();
    expect(JSON.parse(cookies().version_preferences_by_corpus)).toEqual({Tanakh: {en: 'The Koren Jerusalem Bible'}});
    expect(profile).toHaveBeenCalledWith({version_preferences_by_corpus: {Tanakh: {en: 'The Koren Jerusalem Bible'}}});
  });

  test('choosing a source version sets vhe; the classic reader keeps no per-corpus preference for it', async () => {
    stubDataLayer();
    const setPref = jest.spyOn(Sefaria, 'setVersionPreference');
    const profile = jest.spyOn(Sefaria, 'editProfileAPI').mockImplementation(() => Promise.resolve());
    await openPanel();
    click('[data-ng="version-row-source"]');
    expect($$('[data-ng="version"]').map(v => v.getAttribute('data-version-title')))
      .toEqual(['Miqra according to the Masorah', "Tanach with Ta'amei Hamikra"]);
    click('[data-ng="version"][data-version-title="Tanach with Ta\'amei Hamikra"] [data-ng="version-choose"]');
    await flush();
    expect(getText).toHaveBeenCalledWith('Genesis 1',
      {en: null, he: {languageFamilyName: 'hebrew', versionTitle: "Tanach with Ta'amei Hamikra"}}, null, true);
    expect(decodeURIComponent(window.location.search)).toBe("?vhe=hebrew|Tanach_with_Ta'amei_Hamikra&lang=bi");
    expect(setPref).toHaveBeenCalledWith('Genesis 1', "Tanach with Ta'amei Hamikra", 'he');
    expect(profile).not.toHaveBeenCalled();
  });

  test('choosing a translation while reading the source only shows it (bilingual), as the classic reader does', async () => {
    stubDataLayer();
    jest.spyOn(Sefaria, 'setVersionPreference').mockImplementation(() => {});
    await openPanel(fixture('genesis-1', {language: 'hebrew'}));
    click('[data-ng="version-row-translation"]');
    click('[data-ng="version"][data-version-title="The Koren Jerusalem Bible"] [data-ng="version-choose"]');
    await flush();
    expect($('[data-ng="stream"]').getAttribute('data-language')).toBe('bilingual');
    expect(cookies().contentLang).toBe('bilingual');
    expect(window.location.search).toBe('?ven=english|The_Koren_Jerusalem_Bible&lang=bi');
  });

  test('choosing the version already on screen just goes back', async () => {
    stubDataLayer();
    await openPanel();
    const calls = getText.mock.calls.length;
    click('[data-ng="version-row-translation"]');
    click('[data-ng="version"][data-selected="true"] [data-ng="version-choose"]');
    await flush();
    expect(getText.mock.calls.length).toBe(calls);
    expect($('[data-ng="config-main"]')).not.toBeNull();
  });

  test('a failed switch says so and leaves the text and the URL alone', async () => {
    stubDataLayer({text: () => Promise.reject(new Error('offline'))});
    const setPref = jest.spyOn(Sefaria, 'setVersionPreference');
    await openPanel();
    click('[data-ng="version-row-translation"]');
    click('[data-ng="version"][data-version-title="The Koren Jerusalem Bible"] [data-ng="version-choose"]');
    await flush();
    expect($('[data-ng="version-error"]')).not.toBeNull();
    expect($('[data-ng="version"][data-selected="true"]').getAttribute('data-version-title')).toBe('THE JPS TANAKH: Gender-Sensitive Edition');
    expect(window.location.search).toBe('?lang=bi');
    expect(setPref).not.toHaveBeenCalled();
  });

  test('a failed version list offers a retry', async () => {
    stubDataLayer();
    getVersions.mockImplementationOnce(() => Promise.reject(new Error('offline')));
    await openPanel();
    click('[data-ng="version-row-source"]');
    expect($('[data-ng="versions-error"]')).not.toBeNull();
    click('[data-ng="versions-error"] button');
    await flush();
    expect(getVersions).toHaveBeenCalledTimes(2);
    expect($$('[data-ng="version"]')).toHaveLength(2);
  });

  test('the back button returns to the main view', async () => {
    stubDataLayer();
    await openPanel();
    click('[data-ng="version-row-source"]');
    expect($('[data-ng="panel-config"]').getAttribute('data-view')).toBe('source');
    click('[data-ng="config-back"]');
    expect($('[data-ng="panel-config"]').getAttribute('data-view')).toBe('main');
  });
});

describe('Hebrew interface', () => {
  test('the panel is localized and mirrored with the reader', async () => {
    stubDataLayer();
    await openPanel(fixture('genesis-1', {interfaceLang: 'hebrew', language: 'bilingual'}));
    expect($('[data-ng="reader"]').getAttribute('dir')).toBe('rtl');
    expect($('[data-ng="config-title"]').textContent).toBe('הגדרות טקסט');
    expect($('[data-ng="setting-language-hebrew"]').textContent).toContain('מקור');
    expect($('[data-ng="version-row-source"]').textContent).toContain('מקרא על פי המסורה');
    click('[data-ng="version-row-translation"]');
    expect($('[data-ng="version-group"] h3').textContent).toBe('אנגלית');
    expect(realErrors()).toEqual([]);
  });
});
