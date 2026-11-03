import { tokenize, normalizeToken, diffTokens, diffSummary, splitSides } from '../diff';
import { formatCitation, bibKey, selectionRows, rowsToCSV, rowsToJSON, fileStem } from '../cite';
import { graphModel, labelPosition } from '../linkGraph';
import { cleanWord, consonants, wordsOf, normalizeEntries } from '../../lexiconApi';
import { allVersions, versionsFor, englishTranslations, defaultPair, textLines } from '../versionText';
import { dedupePages } from '../manuscriptsApi';
import links from '../../../reader/tests/fixtures/links.json';
import genesis from '../../../reader/tests/fixtures/genesis1.json';

describe('diff', () => {
  test('tokenize strips HTML and splits on maqaf', () => {
    expect(tokenize('<b>אֶת־הַשָּׁמַ֖יִם</b> וְאֵ֥ת')).toEqual(['אֶת־', 'הַשָּׁמַ֖יִם', 'וְאֵ֥ת']);
  });
  test('normalizeToken drops marks and punctuation', () => {
    expect(normalizeToken('בְּרֵאשִׁ֖ית,')).toBe('בראשית');
    expect(normalizeToken('בְּרֵאשִׁ֖ית', { ignoreMarks: false })).toBe('בְּרֵאשִׁ֖ית');
    expect(normalizeToken('Heaven.')).toBe('heaven');
  });
  test('diffTokens aligns with LCS and marks insertions and deletions', () => {
    const ops = diffTokens('the quick brown fox', 'the slow brown fox jumps');
    expect(ops.map(o => `${o.type}:${o.text}`)).toEqual(['same:the', 'del:quick', 'ins:slow', 'same:brown', 'same:fox', 'ins:jumps']);
    const summary = diffSummary(ops);
    expect(summary).toMatchObject({ same: 3, insertions: 2, deletions: 1 });
    expect(summary.changed).toBeCloseTo(0.5);
    const sides = splitSides(ops);
    expect(sides.a.map(t => t.text)).toEqual(['the', 'quick', 'brown', 'fox']);
    expect(sides.a.filter(t => t.changed).map(t => t.text)).toEqual(['quick']);
    expect(sides.b.filter(t => t.changed).map(t => t.text)).toEqual(['slow', 'jumps']);
  });
  test('vowel-only differences are ignored by default and seen when asked', () => {
    expect(diffSummary(diffTokens('בְּרֵאשִׁית בָּרָא', 'בראשית ברא')).changed).toBe(0);
    expect(diffSummary(diffTokens('בְּרֵאשִׁית בָּרָא', 'בראשית ברא', { ignoreMarks: false })).changed).toBe(1);
  });
  test('empty inputs', () => {
    expect(diffTokens('', '')).toEqual([]);
    expect(diffTokens('a b', '').every(o => o.type === 'del')).toBe(true);
  });
});

describe('cite', () => {
  const date = new Date(2026, 9, 1);
  const base = { ref: 'Genesis 1:1', book: 'Genesis', versionTitle: 'The Koren Jerusalem Bible', date };
  test('chicago, MLA and BibTeX carry version, URL and access date', () => {
    expect(formatCitation({ ...base, style: 'chicago' })).toBe('Genesis 1:1, The Koren Jerusalem Bible, Sefaria, accessed October 1, 2026, https://www.sefaria.org/Genesis.1.1.');
    expect(formatCitation({ ...base, style: 'mla' })).toBe('"Genesis 1:1." The Koren Jerusalem Bible. Sefaria, www.sefaria.org/Genesis.1.1. Accessed 1 Oct. 2026.');
    const bib = formatCitation({ ...base, style: 'bibtex' });
    expect(bib).toContain('@misc{Genesis_1_1,');
    expect(bib).toContain('note = {The Koren Jerusalem Bible},');
    expect(bib).toContain('urldate = {2026-10-01}');
    expect(bib).toContain('howpublished = {\\url{https://www.sefaria.org/Genesis.1.1}}');
  });
  test('Hebrew interface uses the Hebrew access word', () => {
    expect(formatCitation({ ...base, style: 'mla', lang: 'he' })).toContain('אוחזר');
  });
  test('bibKey and fileStem', () => {
    expect(bibKey('Berakhot 2a:1-3')).toBe('Berakhot_2a_1_3');
    expect(fileStem('Shulchan Arukh, Orach Chayim 1:1')).toBe('Shulchan_Arukh_Orach_Chayim_1_1');
  });
  test('selection rows export to CSV and JSON', () => {
    const selection = { ref: 'Genesis 1:1-2', segments: [
      { ref: 'Genesis 1:1', heRef: 'בראשית א׳:א׳', he: '<b>בְּרֵאשִׁ֖ית</b>', en: 'When God began, "quoted"' },
      { ref: 'Genesis 1:2', heRef: 'בראשית א׳:ב׳', he: 'וְהָאָ֗רֶץ', en: 'the earth' },
    ] };
    const rows = selectionRows(selection, { title: 'Genesis', heTitle: 'בראשית', primaryCategory: 'Tanakh', versionTitle: 'JPS', heVersionTitle: 'Miqra' }, { vowels: false });
    expect(rows).toHaveLength(2);
    expect(rows[0]).toMatchObject({ ref: 'Genesis 1:1', he: 'בראשית', en: 'When God began, "quoted"', versionTitle: 'JPS', url: 'https://www.sefaria.org/Genesis.1.1' });
    const csv = rowsToCSV(rows);
    expect(csv.split('\n')[0]).toBe('ref,heRef,he,en,book,heBook,category,versionTitle,heVersionTitle,url');
    expect(csv).toContain('"When God began, ""quoted"""');
    const json = JSON.parse(rowsToJSON(rows, { ref: selection.ref, citation: 'c' }));
    expect(json).toMatchObject({ format: 'sefaria.libnext.selection', ref: 'Genesis 1:1-2', citation: 'c' });
    expect(json.segments).toHaveLength(2);
  });
});

describe('linkGraph', () => {
  test('graphModel groups the fixture links into sized, placed nodes', () => {
    const model = graphModel(links);
    expect(model.total).toBe(links.length);
    expect(model.nodes.length).toBeLessThanOrEqual(18);
    expect(model.shown + model.hidden).toBeGreaterThanOrEqual(model.nodes.length);
    expect(model.nodes.reduce((n, node) => n + node.count, 0) + 0).toBeLessThanOrEqual(model.total);
    const commentary = model.nodes.filter(n => n.category === 'Commentary');
    expect(commentary.length).toBeGreaterThan(0);
    expect(commentary[0].targetRef).toMatch(/Genesis 1:1/);
    model.nodes.forEach(n => {
      expect(n.x).toBeGreaterThan(0); expect(n.x).toBeLessThan(model.size);
      expect(n.y).toBeGreaterThan(0); expect(n.y).toBeLessThan(model.size);
      expect(n.r).toBeGreaterThanOrEqual(6); expect(n.r).toBeLessThanOrEqual(18);
    });
    // sectors are contiguous per category
    const cats = model.nodes.map(n => n.category);
    expect(new Set(cats).size).toBe(model.categories.length);
    expect(model.categories.reduce((n, c) => n + c.books, 0)).toBe(model.nodes.length);
  });
  test('maxBooks caps the picture and counts the rest', () => {
    const model = graphModel(links, { maxBooks: 3 });
    expect(model.nodes).toHaveLength(3);
    expect(model.hidden).toBeGreaterThan(0);
    expect(model.nodes[0].count).toBeGreaterThanOrEqual(model.nodes[2].count);
  });
  test('labels anchor away from the centre', () => {
    const model = graphModel(links, { maxBooks: 4 });
    const anchors = model.nodes.map(n => labelPosition(n, model).anchor);
    expect(anchors).toEqual(['middle', 'start', 'middle', 'end']);
  });
  test('no links → empty model', () => {
    expect(graphModel([])).toMatchObject({ total: 0, shown: 0, hidden: 0, nodes: [], categories: [] });
  });
});

describe('lexiconApi', () => {
  test('cleanWord and consonants', () => {
    expect(cleanWord('בְּרֵאשִׁ֖ית,')).toBe('בְּרֵאשִׁית');
    expect(consonants('בְּרֵאשִׁ֖ית')).toBe('בראשית');
    expect(cleanWord('123')).toBe('');
  });
  test('wordsOf splits a segment into tappable words, maqaf included', () => {
    const words = wordsOf('<b>בְּרֵאשִׁ֖ית</b> בָּרָ֣א אֱלֹהִ֑ים אֵ֥ת הַשָּׁמַ֖יִם וְאֵ֥ת הָאָֽרֶץ׃');
    expect(words.map(w => w.key)).toEqual(['בראשית', 'ברא', 'אלהים', 'את', 'השמים', 'ואת', 'הארץ']);
    expect(wordsOf('אֶת־הַשָּׁמַיִם')).toHaveLength(2);
    expect(wordsOf('')).toEqual([]);
  });
  test('normalizeEntries flattens nested senses and keeps lexicon metadata', () => {
    const raw = [{ headword: 'רֵאשִׁית', parent_lexicon: 'BDB Augmented Strong', strong_number: '7225', transliteration: 'reshit',
      content: { morphology: 'n-f', senses: [{ definition: 'first, beginning', senses: [{ definition: 'beginning' }, { definition: 'first' }] }] },
      parent_lexicon_details: { source: 'Open Scriptures' } }, { headword: 'x', content: {} }, { content: { senses: [] } }];
    const out = normalizeEntries(raw);
    expect(out).toHaveLength(2);
    expect(out[0]).toMatchObject({ headword: 'רֵאשִׁית', lexicon: 'BDB Augmented Strong', morphology: 'n-f', strong: '7225', source: 'Open Scriptures' });
    expect(out[0].senses.map(s => [s.text, s.depth])).toEqual([['first, beginning', 0], ['beginning', 1], ['first', 1]]);
    expect(normalizeEntries(null)).toEqual([]);
  });
});

describe('versionText', () => {
  const book = { data: genesis, versionTitle: genesis.versionTitle, heVersionTitle: genesis.heVersionTitle };
  test('allVersions accepts a list, the book or language buckets', () => {
    expect(allVersions(book)).toBe(genesis.versions);
    expect(allVersions({ he: [{ versionTitle: 'a' }], en: [{ versionTitle: 'b' }] })).toHaveLength(2);
    expect(allVersions(null)).toEqual([]);
  });
  test('versionsFor filters by language, dedupes and sorts by priority', () => {
    const he = versionsFor(book, 'he');
    expect(he.length).toBeGreaterThan(1);
    expect(he[0].versionTitle).toBe('Miqra according to the Masorah');
    expect(new Set(he.map(v => v.versionTitle)).size).toBe(he.length);
    const dupes = versionsFor([{ language: 'en', versionTitle: 'A', priority: 1 }, { language: 'en', versionTitle: 'A' }, { language: 'en', versionTitle: 'B', priority: 5 }], 'en');
    expect(dupes.map(v => v.versionTitle)).toEqual(['B', 'A']);
  });
  test('englishTranslations drops translations into other languages', () => {
    const list = englishTranslations([{ language: 'en', versionTitle: 'JPS' }, { language: 'en', versionTitle: 'Torah, Slivniak [ru]' }, { language: 'en', actualLanguage: 'de', versionTitle: 'Goldschmidt' }]);
    expect(list.map(v => v.versionTitle)).toEqual(['JPS']);
  });
  test('defaultPair prefers the version in view', () => {
    const vs = [{ versionTitle: 'A' }, { versionTitle: 'B' }, { versionTitle: 'C' }];
    expect(defaultPair(vs, 'C')).toEqual(['C', 'A']);
    expect(defaultPair(vs, 'nope')).toEqual(['A', 'B']);
    expect(defaultPair([], '')).toEqual(['', '']);
  });
  test('textLines flattens strings and nested lists to plain text', () => {
    expect(textLines('<b>one</b>')).toEqual(['one']);
    expect(textLines([['a', ''], 'b <i>c</i>'])).toEqual(['a', 'b c']);
  });
});

test('dedupePages keeps one row per image', () => {
  expect(dedupePages([{ image_url: 'x', page_id: '1' }, { image_url: 'x', page_id: '1' }, { page_id: '2' }, {}])).toHaveLength(2);
  expect(dedupePages(null)).toEqual([]);
});
