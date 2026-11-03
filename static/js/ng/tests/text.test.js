import {
  addPoetrySpans, bindDashes, inSameBook, isTalmud, layoutKeyFor, sectionFromApi, sectionLabel, sectionLabelParts,
  segmentRefsIn, showsSegmentNumbers, stripHebrewMarks, visibleTexts, longLang, shortLang,
} from '../text';
import {fixture} from './helpers';

describe('sectionFromApi', () => {
  test('Genesis 1: 31 segments with refs, Hebrew refs, both texts and version metadata', () => {
    const text = fixture('genesis-1').initialPanel.text;
    const s = sectionFromApi(text);
    expect(s.ref).toBe('Genesis 1');
    expect(s.next).toBe('Genesis 2');
    expect(s.prev).toBeNull();
    expect(s.segments).toHaveLength(31);
    expect(s.segments[0]).toMatchObject({ref: 'Genesis 1:1', number: 1});
    expect(s.segments[0].heRef).toBe('בראשית א׳:א׳');
    expect(s.segments[30].ref).toBe('Genesis 1:31');
    expect(s.segments[10].heRef).toBe('בראשית א׳:י״א');
    expect(s.segments[30].heRef).toBe('בראשית א׳:ל״א');
    expect(s.segments[0].he).toBe(text.he[0]);
    expect(s.segments[0].he).toContain('<big>');
    expect(s.segments[0].en).toContain('When God began to create');
    expect(s.primary).toMatchObject({direction: 'rtl', isPrimary: true, versionTitle: 'Miqra according to the Masorah'});
    expect(s.translation).toMatchObject({direction: 'ltr', lang: 'en'});
    expect(s.primaryCategory).toBe('Tanakh');
  });

  test('Berakhot 2a: Talmud addressing, 14 segments, prev is null and next is 2b', () => {
    const s = sectionFromApi(fixture('berakhot-2a').initialPanel.text);
    expect(s.ref).toBe('Berakhot 2a');
    expect(s.segments).toHaveLength(14);
    expect(s.segments[2].ref).toBe('Berakhot 2a:3');
    expect(s.next).toBe('Berakhot 2b');
    expect(s.prev).toBeNull();
    expect(isTalmud(s)).toBe(true);
    expect(layoutKeyFor(s)).toBe('layoutTalmud');
  });

  test('a segment URL still yields its whole section', () => {
    const s = sectionFromApi(fixture('genesis-1-3').initialPanel.text);
    expect(s.ref).toBe('Genesis 1');
    expect(s.segments).toHaveLength(31);
  });

  test('a single (source-only) version and empty segments', () => {
    const text = fixture('genesis-1').initialPanel.text;
    text.versions = [text.versions.find(v => v.isPrimary)];
    text.text = [];
    text.he[1] = '';
    const s = sectionFromApi(text);
    expect(s.translation).toBeNull();
    expect(s.primary.isPrimary).toBe(true);
    expect(s.segments).toHaveLength(30);           // the empty one is skipped
    expect(s.segments[1].ref).toBe('Genesis 1:3');  // numbering is not shifted
  });

  test('offsets from index_offsets_by_depth shift the numbering', () => {
    const text = fixture('genesis-1').initialPanel.text;
    text.index_offsets_by_depth = {2: 10};
    expect(sectionFromApi(text).segments[0].ref).toBe('Genesis 1:11');
  });

  test('nothing to render', () => {
    expect(sectionFromApi(null)).toBeNull();
    expect(sectionFromApi({error: 'nope'})).toBeNull();
  });
});

describe('visibleTexts', () => {
  const both = {he: 'א', en: 'a'};
  test('each mode shows its language', () => {
    expect(visibleTexts(both, 'hebrew')).toEqual({he: true, en: false});
    expect(visibleTexts(both, 'english')).toEqual({he: false, en: true});
    expect(visibleTexts(both, 'bilingual')).toEqual({he: true, en: true});
  });
  test('falls back to whichever text exists', () => {
    expect(visibleTexts({he: '', en: 'a'}, 'hebrew')).toEqual({he: false, en: true});
    expect(visibleTexts({he: 'א', en: ''}, 'english')).toEqual({he: true, en: false});
  });
});

describe('text transforms', () => {
  test('poetry: wraps <br>-separated lines unless the text already carries poetry spans', () => {
    expect(addPoetrySpans('one<br>two')).toBe('<span class="poetry indentWhenWrap">one</span><br><span class="poetry indentWhenWrap">two</span>');
    const marked = '<span class="poetry indentAll">x</span><br><span class="poetry indentAll">y</span>';
    expect(addPoetrySpans(marked)).toBe(marked);
    expect(addPoetrySpans('no breaks')).toBe('no breaks');
  });

  test('vowels and Talmud punctuation, as the classic settings', () => {
    const he = 'בְּרֵאשִׁ֖ית';
    expect(stripHebrewMarks(he, {vowels: 'all'})).toBe(he);
    expect(stripHebrewMarks(he, {vowels: 'partial'})).toBe('בְּרֵאשִׁית');
    expect(stripHebrewMarks(he, {vowels: 'none'})).toBe('בראשית');
    expect(stripHebrewMarks('אמר. לו', {punctuationTalmud: 'punctuationOff'}, true)).toBe('אמר לו');
    expect(stripHebrewMarks('אמר. לו', {punctuationTalmud: 'punctuationOff'}, false)).toBe('אמר. לו');
  });

  test('dashes stay on the line of the word before them', () => {
    expect(bindDashes('heaven and earth—')).toBe('heaven and earth⁠—');
    expect(bindDashes('a — b')).toBe('a — b');
  });
});

describe('labels', () => {
  test('section labels in both interface languages', () => {
    const gen = sectionFromApi(fixture('genesis-1').initialPanel.text);
    const ber = sectionFromApi(fixture('berakhot-2a').initialPanel.text);
    expect(sectionLabel(gen, false)).toBe('Chapter 1');
    expect(sectionLabel(gen, true)).toBe('פרק א׳');
    expect(sectionLabel(ber, false)).toBe('Daf 2a');
    expect(sectionLabel(ber, true)).toBe('דף ב.');
    expect(sectionLabelParts(ber, false)).toEqual({name: 'Daf', address: '2a'});
  });

  test('segment numbers are shown except for liturgy and reference works', () => {
    const gen = sectionFromApi(fixture('genesis-1').initialPanel.text);
    expect(showsSegmentNumbers(gen)).toBe(true);
    expect(showsSegmentNumbers({...gen, categories: ['Liturgy']})).toBe(false);
  });

  test('language codes', () => {
    expect(shortLang('bilingual')).toBe('bi');
    expect(longLang('he')).toBe('hebrew');
    expect(longLang('english')).toBe('english');
    expect(longLang('xx')).toBeNull();
  });
});

describe('other corpora (an associated text opened front and center)', () => {
  test('a commentary: depth 3, its section "Rashi on Genesis 1:1", comments numbered from 1', () => {
    const s = sectionFromApi(fixture('rashi-on-genesis-1-1-1').initialPanel.text);
    expect(s).toMatchObject({ref: 'Rashi on Genesis 1:1', indexTitle: 'Rashi on Genesis', primaryCategory: 'Commentary',
      next: 'Rashi on Genesis 1:2', prev: null, sections: ['1', '1']});
    expect(s.segments.map(g => g.ref)).toEqual(['Rashi on Genesis 1:1:1', 'Rashi on Genesis 1:1:2', 'Rashi on Genesis 1:1:3']);
    expect(s.segments[1].heRef).toBe('רש"י על בראשית א׳:א׳:ב׳');
    expect(layoutKeyFor(s)).toBe('layoutDefault');
    expect(sectionLabel(s, false)).toBe('1:1');
    expect(sectionLabel(s, true)).toBe('א׳:א׳');
  });

  test('Halakhah: "Shulchan Arukh, Orach Chayim 1", Siman 1', () => {
    const s = sectionFromApi(fixture('shulchan-arukh-oc-1-1').initialPanel.text);
    expect(s.ref).toBe('Shulchan Arukh, Orach Chayim 1');
    expect(s.segments).toHaveLength(9);
    expect(s.segments[0].ref).toBe('Shulchan Arukh, Orach Chayim 1:1');
    expect(sectionLabel(s, false)).toBe('Siman 1');
    expect(sectionLabel(s, true)).toBe('סימן א׳');
  });

  test('segmentRefsIn: the segments a segment or range ref names in a loaded section', () => {
    const rashi = sectionFromApi(fixture('rashi-on-genesis-1-1-1').initialPanel.text);
    expect(segmentRefsIn('Rashi on Genesis 1:1:2', rashi)).toEqual(['Rashi on Genesis 1:1:2']);
    expect(segmentRefsIn('Rashi on Genesis 1:1:1-2', rashi)).toEqual(['Rashi on Genesis 1:1:1', 'Rashi on Genesis 1:1:2']);
    expect(segmentRefsIn('Rashi on Genesis 1:1:2-2:4', rashi)).toEqual(['Rashi on Genesis 1:1:2', 'Rashi on Genesis 1:1:3']);
    expect(segmentRefsIn('Rashi on Genesis 1:1', rashi)).toEqual([]);
    expect(segmentRefsIn('Rashi on Genesis 1:2:1', rashi)).toEqual([]);
    const genesis = sectionFromApi(fixture('genesis-1').initialPanel.text);
    expect(segmentRefsIn('Genesis 1:29-2:3', genesis)).toEqual(['Genesis 1:29', 'Genesis 1:30', 'Genesis 1:31']);
  });

  test('inSameBook: the reader\'s versions carry over only within the book', () => {
    const genesis = sectionFromApi(fixture('genesis-1').initialPanel.text);
    expect(inSameBook('Genesis 3:4', genesis)).toBe(true);
    expect(inSameBook('Genesis 3:4-8', genesis)).toBe(true);
    expect(inSameBook('Genesis Rabbah 1:1', genesis)).toBe(false);
    expect(inSameBook('Rashi on Genesis 1:1:1', genesis)).toBe(false);
    expect(inSameBook('Shulchan Arukh, Orach Chayim 1:1', genesis)).toBe(false);
  });
});
