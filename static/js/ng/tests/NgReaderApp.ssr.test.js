/**
 * @jest-environment node
 *
 * NgReaderApp under Node SSR, the way node/server.js renders it: ngSetup + ngUnpackProps on
 * the real (unmocked) Sefaria singleton, then renderToString. Node has no window, document or
 * storage, so any browser global touched while rendering fails these tests.
 *
 * The headline property: the server HTML carries the text. (Classic ReaderApp's SSR ships an
 * empty `textRange loading`; its TextRange only fetches in componentDidMount.)
 */
import React from 'react';
import ReactDOMServer from 'react-dom/server';
import {NgReaderApp, ngSetup, ngUnpackProps} from '../index';
import {fixture, stripTags, SHARED_DATA} from './helpers';

function renderLikeNode(props) {
  ngSetup(SHARED_DATA, props);
  ngUnpackProps(props);
  return ReactDOMServer.renderToString(<NgReaderApp {...props} />);
}

const count = (html, needle) => html.split(needle).length - 1;
const segmentsIn = (html) => count(html, 'data-ng="segment"');

let errors;
beforeEach(() => {
  errors = jest.spyOn(console, 'error').mockImplementation(() => {});
});
afterEach(() => {
  expect(errors).not.toHaveBeenCalled();  // no React warnings (e.g. useLayoutEffect on the server)
  errors.mockRestore();
});

test('there really is no browser here', () => {
  expect(typeof window).toBe('undefined');
  expect(typeof document).toBe('undefined');
  expect(typeof localStorage).toBe('undefined');
});

describe.each([
  ['genesis-1', 'Genesis 1', 31, 'When God began to create', 'bilingual'],
  ['berakhot-2a', 'Berakhot 2a', 14, 'The beginning of tractate', 'bilingual'],
])('%s', (name, ref, segments, englishStart) => {
  // A word of plain source text (segment 2 carries no inline markup in either fixture).
  const firstHebrew = () => stripTags(fixture(name).initialPanel.text.he[1]).split(' ')[0];

  test('bilingual: every segment, with source and translation', () => {
    const html = renderLikeNode(fixture(name, {language: 'bilingual'}));
    expect(html).toContain(`data-ref="${ref}"`);
    expect(segmentsIn(html)).toBe(segments);
    expect(html).toContain(firstHebrew());
    expect(html).toContain(englishStart);
    expect(html).toContain('data-language="bilingual"');
  });

  test('source only (contentLang hebrew): the source, not the translation', () => {
    const html = renderLikeNode(fixture(name, {language: 'hebrew'}));
    expect(segmentsIn(html)).toBe(segments);
    expect(html).toContain(firstHebrew());
    expect(html).not.toContain(englishStart);
    expect(html).toContain('data-language="hebrew"');
  });

  test('translation only (contentLang english): the translation, not the source', () => {
    const html = renderLikeNode(fixture(name, {language: 'english'}));
    expect(segmentsIn(html)).toBe(segments);
    expect(html).toContain(englishStart);
    expect(html).not.toContain(firstHebrew());
    expect(html).toContain('data-language="english"');
  });
});

describe('layouts and structure', () => {
  test('Tanakh is segmented with verse numbers; Talmud source-only is continuous prose', () => {
    const gen = renderLikeNode(fixture('genesis-1', {language: 'hebrew'}));
    expect(gen).toContain('data-layout="segmented"');
    expect(count(gen, 'class="ng-segnum"')).toBe(31);
    const ber = renderLikeNode(fixture('berakhot-2a', {language: 'hebrew'}));
    expect(ber).toContain('data-layout="continuous"');
    expect(ber).toContain('class="ng-prose ng-he"');
    expect(count(ber, 'class="ng-segnum"')).toBe(0);
  });

  test('footnotes ship closed in the HTML; the book title opens the first section', () => {
    const html = renderLikeNode(fixture('genesis-1', {language: 'english'}));
    expect(html).toContain('<sup class="footnote-marker">a</sup><i class="footnote">');
    expect(html).toContain('data-ng="book-title"');
    expect(html).toContain('>Chapter</span> <span class="ng-section-address">1</span>');
  });

  test('stable test anchors are present', () => {
    const html = renderLikeNode(fixture('genesis-1'));
    for (const anchor of ['reader', 'header', 'header-ref', 'header-search', 'header-toc', 'header-browse', 'header-settings',
      'stream', 'section', 'section-title', 'segment', 'next-edge', 'overlay']) {
      expect(html).toContain(`data-ng="${anchor}"`);
    }
  });

  test('header links: search in the book, its table of contents, the library', () => {
    const html = renderLikeNode(fixture('genesis-1'));
    expect(html).toContain('href="/search?q=&amp;tab=text&amp;tvar=1&amp;tsort=relevance&amp;tpathFilters=Tanakh%2FTorah%2FGenesis"');
    expect(html).toContain('href="/Genesis"');
    expect(html).toContain('href="/texts"');
  });

  test('the header: the contents icon leads the ref in one link; the sheets render nothing until opened', () => {
    const html = renderLikeNode(fixture('genesis-1'));
    const toc = html.match(/<a class="ng-header-toc"[^>]*>(.*?)<\/a>/);
    expect(toc).not.toBeNull();
    expect(toc[0]).toContain('href="/Genesis"');           // the fallback before hydration
    expect(toc[0]).toContain('aria-haspopup="dialog"');
    expect(toc[1]).toMatch(/^<span class="ng-header-toc-icon"><svg/);
    expect(toc[1]).toContain('<span class="ng-header-book">Genesis</span>');
    expect(count(html, 'data-ng="header-toc"')).toBe(1);
    expect(html).toMatch(/<div class="ng-sheets" data-ng="sheets" data-state="none" hidden="">\s*<\/div>/);
    expect(html).not.toContain('data-ng="bottom-sheet"');
  });

  test('a Hebrew interface renders the same header, mirrored by its direction', () => {
    const html = renderLikeNode(fixture('berakhot-2a', {interfaceLang: 'hebrew'}));
    expect(html).toMatch(/<div class="ng-reader" data-ng="reader" dir="rtl"/);
    expect(html).toMatch(/<a class="ng-header-toc"[^>]*><span class="ng-header-toc-icon">.*?<span class="ng-header-book">ברכות<\/span>/);
  });

  test('the next section is a real link, so the server HTML can page through the book', () => {
    const html = renderLikeNode(fixture('genesis-1'));
    expect(html).toContain('href="/Genesis.2?lang=bi"');
  });

  test('a segment URL highlights its segment', () => {
    const html = renderLikeNode(fixture('genesis-1-3'));
    expect(count(html, 'data-highlighted="true"')).toBe(1);
    expect(html).toMatch(/data-ref="Genesis 1:3"[^>]*data-highlighted="true"/);
  });

  test('poetry markup and the bilingual side-by-side layout', () => {
    const props = fixture('psalms-23', {language: 'bilingual'});
    props.initialSettings.biLayout = 'heRight';
    const html = renderLikeNode(props);
    expect(html).toContain('class="poetry indentAll"');
    expect(html).toContain('data-bilayout="heRight"');
    expect(html).toContain('data-sbs="true"');
  });

  test('a Hebrew interface mirrors and localizes', () => {
    const html = renderLikeNode(fixture('genesis-1', {interfaceLang: 'hebrew', language: 'bilingual'}));
    expect(html).toMatch(/^<div class="ng-reader" data-ng="reader" dir="rtl" lang="he"/);
    expect(html).toContain('פרק');
    expect(html).toContain('aria-label="חיפוש בספר"');
    expect(html).toContain('<span class="ng-header-book">בראשית</span>');
  });
});

describe('the shared Node singleton', () => {
  test('renders depend on their own props only, in any order', () => {
    const english = renderLikeNode(fixture('genesis-1', {language: 'english'}));
    renderLikeNode(fixture('berakhot-2a', {interfaceLang: 'hebrew', language: 'hebrew'}));
    expect(renderLikeNode(fixture('genesis-1', {language: 'english'}))).toBe(english);
  });

  test('props without a text render an empty reader instead of throwing', () => {
    const props = fixture('genesis-1');
    props.initialPanel = null;
    expect(renderLikeNode(props)).toContain('data-ng="reader"');
  });
});

describe('the associated-texts overlay on the server', () => {
  const withFilter = (name, filter, opts) => {
    const props = fixture(name, opts);
    props.initialPanel.filter = filter;
    return props;
  };

  test('a plain page renders with the overlay closed: no panel, no badges, no pins', () => {
    const html = renderLikeNode(fixture('genesis-1'));
    expect(html).toContain('data-overlay="none"');
    expect(html).toMatch(/data-ng="overlay"[^>]*hidden=""/);
    expect(html).not.toContain('data-ng="panel-associated"');
    expect(html).not.toContain('data-ng="segment-badge"');
    expect(html).not.toContain('data-ng="pinned"');
  });

  test('?with=Rashi renders the panel open on the segment, its shell ready for the data', () => {
    const html = renderLikeNode(withFilter('genesis-1-3', ['Rashi']));
    expect(html).toMatch(/^<div class="ng-reader" data-ng="reader" dir="ltr" lang="en" data-interface="english" data-overlay="associated"/);
    expect(html).toMatch(/data-ng="overlay" data-overlay="associated" data-state="associated" data-phase="open"/);
    expect(html).toContain('data-ng="sheet" data-side="right"');
    expect(html).toContain('data-ng="panel-associated" data-ref="Genesis 1:3" data-view="filter"');
    expect(html).toContain('class="ng-assoc-loading"');
    // The text is still all there, with the anchored segment marked for the sliver.
    expect(segmentsIn(html)).toBe(31);
    expect(html).toMatch(/data-ref="Genesis 1:3"[^>]*data-anchor="true"/);
  });

  test('?with=all on a section anchors to its first segment; the breadcrumb starts from it', () => {
    const html = renderLikeNode(withFilter('genesis-1', []));
    expect(html).toContain('data-ng="panel-associated" data-ref="Genesis 1:1" data-view="home"');
    expect(html).toContain('<h2 class="ng-assoc-title" data-ng="panel-title">Genesis 1:1</h2>');
    expect(html).toContain('data-ng="panel-anchor"');
  });

  test('a Hebrew interface renders the panel mirrored, on the left', () => {
    const html = renderLikeNode(withFilter('berakhot-2a', ['Steinsaltz'], {interfaceLang: 'hebrew'}));
    expect(html).toContain('data-ng="sheet" data-side="left"');
    expect(html).toContain('aria-label="סגירה"');
  });

  test('the shared singleton: an open overlay does not leak into the next render', () => {
    const closed = renderLikeNode(fixture('genesis-1'));
    renderLikeNode(withFilter('genesis-1-3', ['Rashi']));
    expect(renderLikeNode(fixture('genesis-1'))).toBe(closed);
  });
});

describe('other corpora: where an associated text opened front and center lands', () => {
  test('a commentary (depth 3, "Rashi on Genesis 1:1:1"): its section, segment refs, header and book title', () => {
    const html = renderLikeNode(fixture('rashi-on-genesis-1-1-1'));
    expect(html).toContain('data-ng="section" data-ref="Rashi on Genesis 1:1" data-layout="segmented" data-category="Commentary"');
    expect(segmentsIn(html)).toBe(3);
    for (const n of [1, 2, 3]) { expect(html).toContain(`data-ref="Rashi on Genesis 1:1:${n}"`); }
    expect(html).toContain('data-he-ref="רש&quot;י על בראשית א׳:א׳:ב׳"');
    // The header: the book, then the most granular position; its contents link is the book's TOC.
    expect(html).toContain('<span class="ng-header-book">Rashi on Genesis</span><span class="ng-header-address">1:1:1</span>');
    expect(html).toContain('href="/Rashi_on_Genesis"');
    // The section opens the book: its title is shown, and the section is labelled by its address.
    expect(html).toMatch(/data-ng="book-title"[^]*Rashi on Genesis/);
    expect(html).toContain('<span class="ng-section-address">1:1</span>');
    // The segment URL highlights its comment; the text is there, in both languages.
    expect(html).toMatch(/data-ref="Rashi on Genesis 1:1:1"[^>]*data-highlighted="true"/);
    expect(html).toContain('IN THE BEGINNING');
    expect(html).toContain('<b>בראשית.</b>');
    expect(count(html, 'class="ng-segnum"')).toBe(3);
  });

  test('a commentary in a Hebrew interface: Hebrew header ref and numbering', () => {
    const html = renderLikeNode(fixture('rashi-on-genesis-1-1-1', {interfaceLang: 'hebrew', language: 'hebrew'}));
    expect(html).toContain('<span class="ng-header-book">רש&quot;י על בראשית</span><span class="ng-header-address">א׳:א׳:א׳</span>');
    expect(html).toContain('<span class="ng-section-address">א׳:א׳</span>');
    expect(html).not.toContain('IN THE BEGINNING');
  });

  test('Halakhah ("Shulchan Arukh, Orach Chayim 1:1"): a titled code with a comma, siman and seif', () => {
    const html = renderLikeNode(fixture('shulchan-arukh-oc-1-1'));
    expect(html).toContain('data-ng="section" data-ref="Shulchan Arukh, Orach Chayim 1" data-layout="segmented" data-category="Halakhah"');
    expect(segmentsIn(html)).toBe(9);
    expect(html).toContain('<span class="ng-header-book">Shulchan Arukh, Orach Chayim</span><span class="ng-header-address">1:1</span>');
    expect(html).toContain('href="/Shulchan_Arukh,_Orach_Chayim"');
    expect(html).toContain('<span class="ng-section-name">Siman</span> <span class="ng-section-address">1</span>');
    expect(html).toMatch(/data-ref="Shulchan Arukh, Orach Chayim 1:1"[^>]*data-highlighted="true"/);
    expect(html).toContain('One should strengthen himself like a lion');
    // The next section is a real link in the reader's URL grammar, for a reader without JS.
    expect(html).toContain('href="/Shulchan_Arukh,_Orach_Chayim.2?lang=bi"');
  });

  test('Halakhah, source only in a Hebrew interface: סימן א׳', () => {
    const html = renderLikeNode(fixture('shulchan-arukh-oc-1-1', {interfaceLang: 'hebrew', language: 'hebrew'}));
    expect(html).toContain('<span class="ng-section-name">סימן</span> <span class="ng-section-address">א׳</span>');
    expect(html).not.toContain('One should strengthen himself');
  });
});
